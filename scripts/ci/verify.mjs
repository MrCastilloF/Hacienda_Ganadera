#!/usr/bin/env node
/**
 * verify.mjs — verificación completa del repositorio (`pnpm verify`).
 *
 * Ejecuta, en orden y sin ocultar fallos:
 *   1. documentación (enlaces, ADR, estructura)
 *   2. secretos
 *   3. formato del compose (si hay Docker)
 *   4. lint
 *   5. tipos (API y web)
 *   6. pruebas unitarias
 *   7. pruebas de integración (si hay base de datos)
 *   8. exportación de OpenAPI (si hay base de datos)
 *
 * No todos los pasos están disponibles en cualquier entorno: los que dependen de
 * Docker o de una base de datos se marcan como OMITIDOS con el motivo, nunca
 * como aprobados. Un paso omitido no es un paso verde.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const resultados = [];

function ejecutar(nombre, comando, args, opciones = {}) {
  process.stdout.write(`\n▸ ${nombre}\n`);
  const resultado = spawnSync(comando, args, {
    cwd: opciones.cwd ?? ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...(opciones.env ?? {}) },
  });

  const ok = resultado.status === 0;
  resultados.push({ nombre, ok, omitido: Boolean(opciones.omitido) });
  return ok;
}

function omitir(nombre, motivo) {
  process.stdout.write(`\n▸ ${nombre}\n  OMITIDO — ${motivo}\n`);
  resultados.push({ nombre, ok: true, omitido: true });
}

const tieneDocker = spawnSync('docker', ['--version'], { stdio: 'ignore', shell: true }).status === 0;
const tieneDb = Boolean(process.env.DATABASE_URL);

ejecutar('Documentación', 'node', ['scripts/ci/check-docs.mjs']);
ejecutar('Secretos', 'node', ['scripts/ci/check-secrets.mjs']);

if (tieneDocker) {
  ejecutar('Docker Compose', 'docker', ['compose', 'config', '-q']);
} else {
  omitir('Docker Compose', 'Docker no está instalado en este entorno');
}

ejecutar('Lint', 'pnpm', ['run', 'lint']);
ejecutar('Tipos', 'pnpm', ['run', 'typecheck']);
ejecutar('Pruebas unitarias', 'pnpm', ['--filter', '@hacienda/api', 'run', 'test']);

if (tieneDb) {
  ejecutar('Pruebas de integración', 'pnpm', ['--filter', '@hacienda/api', 'run', 'test:integration'], {
    env: { NODE_ENV: 'test' },
  });
  ejecutar('Exportar OpenAPI', 'pnpm', ['--filter', '@hacienda/api', 'run', 'openapi:export']);
} else {
  omitir('Pruebas de integración', 'DATABASE_URL no está definida');
  omitir('Exportar OpenAPI', 'DATABASE_URL no está definida');
}

// ── Resumen ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(62));
for (const r of resultados) {
  const estado = r.omitido ? 'OMITIDO' : r.ok ? 'OK' : 'FALLO';
  console.log(`  ${estado.padEnd(8)} ${r.nombre}`);
}
console.log('─'.repeat(62));

const fallos = resultados.filter((r) => !r.ok && !r.omitido).length;
const omitidos = resultados.filter((r) => r.omitido).length;

if (fallos > 0) {
  console.error(`\n  ${fallos} paso(s) fallaron${omitidos ? ` · ${omitidos} omitido(s)` : ''}\n`);
  process.exit(1);
}

console.log(`\n  Todo en verde${omitidos ? ` (${omitidos} paso(s) omitido(s): no cuentan como verificación)` : ''}\n`);
