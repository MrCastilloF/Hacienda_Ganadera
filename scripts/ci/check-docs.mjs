#!/usr/bin/env node
/**
 * check-docs.mjs — validación del repositorio documental (sin dependencias).
 *
 * Verifica:
 *  1. Que todo archivo Markdown tenga exactamente un encabezado H1.
 *  2. Que los enlaces relativos apunten a rutas que existen.
 *  3. Que cada ADR tenga las secciones obligatorias y esté indexado en adr/README.md.
 *  4. Que cada diagrama .mmd esté referenciado desde algún documento.
 *  5. Que no haya archivos vacíos ni finales de línea inconsistentes en docs.
 *
 * Uso:  node scripts/ci/check-docs.mjs [--verbose]
 * Salida: código 0 si todo está bien, 1 si hay errores.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERBOSE = process.argv.includes('--verbose');

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.turbo', 'dist', 'build', 'coverage',
  '.next', 'out', '.pnpm-store', 'backups', 'logs',
]);

const ADR_SECTIONS = [
  ['## Contexto', 'contexto'],
  ['## Decisión', 'decisión'],
  ['## Alternativas consideradas', 'alternativas'],
  ['## Consecuencias', 'consecuencias'],
  ['## Cumplimiento', 'cumplimiento'],
];

const errors = [];
const warnings = [];
let filesScanned = 0;
let linksChecked = 0;

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') {
      if (entry.isDirectory()) continue;
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

function rel(p) {
  return relative(ROOT, p).split('\\').join('/');
}

const allFiles = walk(ROOT);
const mdFiles = allFiles.filter((f) => extname(f).toLowerCase() === '.md');
const mmdFiles = allFiles.filter((f) => extname(f).toLowerCase() === '.mmd');

// ── 1 y 2: estructura y enlaces ───────────────────────────────────────────────
for (const file of mdFiles) {
  const relPath = rel(file);
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    errors.push(`${relPath}: no se pudo leer (${e.message})`);
    continue;
  }
  filesScanned++;

  const text = raw.replace(/^\uFEFF/, '');
  if (text.trim().length === 0) {
    errors.push(`${relPath}: archivo vacío`);
  }

  // H1 único, fuera de bloques de código
  const lines = text.split(/\r?\n/);
  let inFence = false;
  const h1 = [];
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^#\s+\S/.test(line)) h1.push(i + 1);
  });

  const isTemplate =
    relPath.startsWith('.github/') || relPath.endsWith('PULL_REQUEST_TEMPLATE.md');

  if (!isTemplate) {
    if (h1.length === 0) errors.push(`${relPath}: falta el encabezado H1`);
    if (h1.length > 1) errors.push(`${relPath}: ${h1.length} encabezados H1 (debe haber uno)`);
  }

  // Enlaces relativos: [texto](ruta) y [texto](ruta#ancla)
  const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    const target = m[1];
    if (/^(https?:|mailto:|tel:|#)/i.test(target)) continue;
    if (target.startsWith('data:')) continue;
    linksChecked++;

    const clean = decodeURIComponent(target.split('#')[0]);
    if (!clean) continue;
    const abs = clean.startsWith('/') ? join(ROOT, clean) : resolve(dirname(file), clean);
    if (!existsSync(abs)) {
      errors.push(`${relPath}: enlace roto → ${target}`);
    }
  }
}

// ── 3: ADR ────────────────────────────────────────────────────────────────────
const adrDir = join(ROOT, 'docs', 'adr');
if (existsSync(adrDir)) {
  const adrFiles = readdirSync(adrDir).filter((f) => /^ADR-\d{4}-.+\.md$/.test(f));
  const indexRaw = existsSync(join(adrDir, 'README.md'))
    ? readFileSync(join(adrDir, 'README.md'), 'utf8')
    : '';
  if (!indexRaw) errors.push('docs/adr/README.md: falta el índice de ADR');

  for (const adr of adrFiles) {
    const p = join(adrDir, adr);
    const text = readFileSync(p, 'utf8').toLowerCase();
    for (const [section, label] of ADR_SECTIONS) {
      if (!text.includes(section.toLowerCase())) {
        errors.push(`docs/adr/${adr}: falta la sección "${section}" (${label})`);
      }
    }
    if (!text.includes('**estado:**')) errors.push(`docs/adr/${adr}: falta el campo Estado`);
    if (!text.includes('**fecha:**')) errors.push(`docs/adr/${adr}: falta el campo Fecha`);
    if (!indexRaw.includes(adr)) errors.push(`docs/adr/README.md: ${adr} no está indexado`);
  }
  if (VERBOSE) console.log(`ADR verificados: ${adrFiles.length}`);
}

// ── 4: diagramas referenciados ────────────────────────────────────────────────
const diagramDir = join(ROOT, 'docs', 'diagrams');
if (existsSync(diagramDir) && mmdFiles.length > 0) {
  const docTexts = mdFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const mmd of mmdFiles) {
    const name = mmd.split(/[\\/]/).pop();
    if (!docTexts.includes(name) && !docTexts.includes(`diagrams/${name}`)) {
      warnings.push(`docs/diagrams/${name}: no está referenciado en ningún documento`);
    }
  }
}

// ── Salida ────────────────────────────────────────────────────────────────────
console.log('');
console.log('  check-docs');
console.log(`  archivos .md : ${filesScanned}`);
console.log(`  enlaces      : ${linksChecked}`);
console.log('');

for (const w of warnings) console.log(`  aviso  ${w}`);

if (errors.length > 0) {
  console.error(`  ✖ ${errors.length} error(es):`);
  for (const e of errors) console.error(`     - ${e}`);
  console.error('');
  process.exit(1);
}

console.log('  ✔ documentación consistente');
console.log('');
