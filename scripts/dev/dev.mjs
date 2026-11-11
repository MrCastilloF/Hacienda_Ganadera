#!/usr/bin/env node
/**
 * dev.mjs — entorno de desarrollo en un solo comando.
 *
 *   pnpm dev
 *
 * Requiere una base de datos accesible en DATABASE_URL. Sin Docker, se puede
 * levantar una base embebida con:  pnpm db:local --persist
 *
 * Arranca la API y la web, prefija sus logs y propaga Ctrl+C a ambos procesos.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

if (!process.env.DATABASE_URL) {
  const local = resolve(ROOT, '.localdb');
  if (existsSync(local)) {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@127.0.0.1:55432/hacienda?schema=app';
    console.log(`· Base local detectada. DATABASE_URL=${process.env.DATABASE_URL}`);
  } else {
    console.error(
      [
        '',
        '  Falta DATABASE_URL.',
        '',
        '  Opciones:',
        '    1) Base embebida (sin Docker):  pnpm db:local --persist   (en otra terminal)',
        '    2) Docker:                     docker compose up -d postgres',
        '',
        '  Luego exporte DATABASE_URL y vuelva a ejecutar `pnpm dev`.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
}

process.env.API_URL = process.env.API_URL ?? 'http://127.0.0.1:3100';
process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL;

const procs = [];

function run(nombre, filtro, comando, args, env) {
  const child = spawn(comando, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  const prefijo = `[${nombre}]`;
  const write = (stream) => (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) stream.write(`${prefijo} ${line}\n`);
    }
  };

  child.stdout.on('data', write(process.stdout));
  child.stderr.on('data', write(process.stderr));
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`${prefijo} terminó con código ${code}`);
    }
  });

  procs.push(child);
  return child;
}

console.log('');
console.log('  Hacienda Ganadera — entorno de desarrollo');
console.log(`  API  → http://127.0.0.1:${process.env.API_PORT ?? 3100}  (docs en /api/docs)`);
console.log('  Web  → http://127.0.0.1:3000');
console.log('');

run('api', null, 'pnpm', ['--filter', '@hacienda/api', 'run', 'dev'], {
  PORT: process.env.API_PORT ?? '3100',
});

run('web', null, 'pnpm', ['--filter', '@hacienda/web', 'run', 'dev'], {
  PORT: '3000',
});

const shutdown = () => {
  for (const child of procs) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
