#!/usr/bin/env node
/**
 * check-secrets.mjs — detecta credenciales filtradas en el árbol de trabajo.
 *
 * Estrategia:
 *  1. Patrones de alto valor probatorio (tokens y claves privadas): bloquean siempre.
 *  2. Asignaciones de credenciales (password=, secret=, token=…): bloquean si el valor
 *     no es un marcador de posición conocido (CAMBIAR_*, CHANGE_ME, ${VAR}, etc.).
 *
 * Uso:  node scripts/ci/check-secrets.mjs
 * Salida: código 0 si no hay hallazgos, 1 si hay alguno.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.turbo', 'dist', 'build', 'coverage',
  '.next', 'out', '.pnpm-store', 'backups', 'logs', '.vscode',
]);

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.yml', '.yaml',
  '.env', '.md', '.sql', '.sh', '.ps1', '.toml', '.conf', '.txt', '.example',
  '.ini', '.properties', '.prisma', '.mmd', '.xml', '.html', '.css',
]);

// Archivos que son plantillas por diseño: se revisan con reglas más laxas
const TEMPLATE_FILES = new Set(['.env.example', '.env.test.example', 'docker-compose.override.example.yml']);

// Patrones que nunca deben aparecer, en ningún archivo
const HARD_PATTERNS = [
  { name: 'GitHub PAT (fine-grained)', re: /github_pat_[A-Za-z0-9_]{20,}/ },
  { name: 'GitHub token clásico', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'AWS Access Key ID', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'Clave privada PEM', re: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'Token Slack', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Clave OpenAI/Anthropic', re: /\b(sk|sk-ant)-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Token Stripe', re: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: 'Connection string con contraseña', re: /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis):\/\/[^\s:@/]+:[^\s:@/]{6,}@/ },
  { name: 'JWT completo', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

// Asignaciones sospechosas
const ASSIGN_RE = /(password|passwd|secret|api[_-]?key|apikey|token|private[_-]?key|appkey|nwkkey)\s*[:=]\s*["']?([^\s"'#]{6,})["']?/i;

// Valores aceptables (marcadores de posición, interpolaciones, rutas, booleanos)
const PLACEHOLDER_RE = /^(CAMBIAR|cambiar|CHANGE|change|TODO|todo|xxx|XXX|<|\$\{|%\{|process\.env|os\.environ|\*{3,}|-{3,})/;
const SAFE_VALUES = new Set([
  'true', 'false', 'null', 'undefined', 'none', 'None', 'required', 'string',
  'minioadmin', 'test', 'example', 'placeholder', 'changeme', 'CHANGE_ME',
]);

// Un valor es "de plantilla" si contiene marcadores evidentes. Se usa para no
// bloquear plantillas legítimas (.env.example, compose, toml) sin bajar la guardia.
const PLACEHOLDER_INLINE = /(CAMBIAR|cambiar|CHANGE[_-]?ME|change[_-]?me|\$\{[^}]+\}|<[^>]{2,}>|xxxx+|placeholder|example|minioadmin|:test@|:password@|:pass@|:secret@)/i;

const findings = [];
let filesScanned = 0;

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github' && entry.name !== '.env.example') {
      // seguimos entrando en .github; el resto de carpetas ocultas se ignora
      if (entry.isDirectory() && entry.name !== '.github') continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

function isTextFile(file) {
  const base = file.split(/[\\/]/).pop();
  if (base === '.env.example') return true;
  const ext = extname(file).toLowerCase();
  return TEXT_EXT.has(ext);
}

const files = walk(ROOT).filter(isTextFile);

for (const file of files) {
  const relPath = relative(ROOT, file).split('\\').join('/');
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  filesScanned++;
  const lines = text.split(/\r?\n/);
  const isTemplate = TEMPLATE_FILES.has(relPath.split('/').pop());

  lines.forEach((line, idx) => {
    if (line.length > 500) return; // minified / datasheet

    for (const { name, re } of HARD_PATTERNS) {
      const hit = re.exec(line);
      if (!hit) continue;
      // Plantillas y variables de entorno no son fugas: se descartan.
      if (PLACEHOLDER_INLINE.test(hit[0])) continue;
      findings.push({ file: relPath, line: idx + 1, rule: name, snippet: redact(line) });
    }

    const m = ASSIGN_RE.exec(line);
    if (m) {
      const value = m[2].replace(/["',;].*$/, '');
      const looksPlaceholder =
        PLACEHOLDER_RE.test(value) ||
        SAFE_VALUES.has(value.toLowerCase()) ||
        /^\d+$/.test(value) ||
        value.length < 8;
      if (!looksPlaceholder && !isTemplate) {
        findings.push({
          file: relPath,
          line: idx + 1,
          rule: `asignación de credencial (${m[1]})`,
          snippet: redact(line),
        });
      }
    }
  });
}

function redact(line) {
  return line.trim().slice(0, 120).replace(/([:=]\s*["']?)([^\s"']{4})[^\s"']*/g, '$1$2***');
}

console.log('');
console.log('  check-secrets');
console.log(`  archivos : ${filesScanned}`);
console.log('');

if (findings.length > 0) {
  console.error(`  ✖ ${findings.length} posible(s) secreto(s) detectado(s):`);
  for (const f of findings) {
    console.error(`     - ${f.file}:${f.line}  [${f.rule}]`);
    console.error(`       ${f.snippet}`);
  }
  console.error('');
  console.error('  Si es una plantilla, use un marcador: CAMBIAR_ESTA_CLAVE / ${VAR}');
  console.error('');
  process.exit(1);
}

console.log('  ✔ sin secretos detectados');
console.log('');
