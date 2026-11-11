#!/usr/bin/env node
/**
 * db-local.mjs — PostgreSQL embebido para desarrollo y pruebas sin Docker.
 *
 * Arranca un clúster temporal (o persistente con --persist), aplica las
 * migraciones y deja la base lista. Útil en una máquina sin Docker; en la
 * hacienda se usa `docker compose` con la imagen PostGIS.
 *
 *   node scripts/dev/db-local.mjs                 # efímero (para pruebas)
 *   node scripts/dev/db-local.mjs --persist       # datos en .localdb
 *   node scripts/dev/db-local.mjs --persist --keep-running
 *
 * Variables: LOCAL_DB_PORT (55432), LOCAL_DB_USER (postgres), LOCAL_DB_PASSWORD
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { runMigrations } from './lib/migrations.mjs';
import { runSeed } from './lib/seed.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = new Set(process.argv.slice(2));

export const LOCAL = {
  port: Number(process.env.LOCAL_DB_PORT ?? 55432),
  user: process.env.LOCAL_DB_USER ?? 'postgres',
  password: process.env.LOCAL_DB_PASSWORD ?? 'postgres',
  database: process.env.LOCAL_DB_NAME ?? 'hacienda',
  dir: process.env.LOCAL_DB_DIR ?? resolve(ROOT, '.localdb'),
};

export function localDatabaseUrl() {
  return `postgresql://${LOCAL.user}:${LOCAL.password}@127.0.0.1:${LOCAL.port}/${LOCAL.database}?schema=app`;
}

export async function startLocalDatabase({ persistent = false, fresh = false } = {}) {
  const dir = persistent ? LOCAL.dir : resolve(ROOT, '.localdb', `tmp-${process.pid}`);
  if (fresh && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: LOCAL.user,
    password: LOCAL.password,
    port: LOCAL.port,
    persistent,
    // UTF-8 explícito: en Windows el clúster hereda WIN1252 y las migraciones
    // (que llevan acentos) fallan al aplicarse.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  });

  await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(LOCAL.database);
  } catch (err) {
    // La base ya existía: es el caso normal en modo persistente.
    if (!String(err?.message ?? '').includes('already exists')) throw err;
  }

  return { pg, dir, url: localDatabaseUrl() };
}

export async function stopLocalDatabase({ pg, dir }, { persistent = false } = {}) {
  try {
    await pg.stop();
  } catch {
    /* el clúster pudo detenerse antes */
  }
  if (!persistent && dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const persistent = args.has('--persist');
  const keepRunning = args.has('--keep-running') || persistent;

  console.log(`\n  PostgreSQL embebido · puerto ${LOCAL.port} · ${persistent ? 'persistente' : 'efímero'}\n`);

  const handle = await startLocalDatabase({ persistent, fresh: args.has('--fresh') });
  console.log(`  clúster listo en ${handle.dir}`);

  await runMigrations({ databaseUrl: handle.url, silent: false });
  if (!args.has('--no-seed')) {
    await runSeed({ databaseUrl: handle.url, silent: false });
  }

  console.log(`\n  DATABASE_URL=${handle.url}\n`);

  if (keepRunning) {
    console.log('  Ctrl+C para detener.\n');
    const stop = async () => {
      await stopLocalDatabase(handle, { persistent });
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    await new Promise(() => {});
  } else {
    await stopLocalDatabase(handle, { persistent });
  }
}
