/**
 * lib/migrations.mjs — aplicador de migraciones SQL.
 *
 * · La carpeta `infra/postgres/migrations` es la fuente de verdad (ADR-0002).
 * · Cada archivo se aplica una vez, en orden alfabético, en su transacción.
 * · Se guarda el checksum: si un archivo ya aplicado cambia, la ejecución falla.
 * · `--status` muestra el estado sin aplicar nada.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIGRATIONS_DIR = resolve(ROOT, 'infra', 'postgres', 'migrations');

const BOOTSTRAP = `
  CREATE SCHEMA IF NOT EXISTS app;
  CREATE TABLE IF NOT EXISTS app.schema_migrations (
    filename    text PRIMARY KEY,
    checksum    text NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now(),
    duration_ms integer NOT NULL DEFAULT 0
  );
`;

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

export async function runMigrations({ databaseUrl, silent = false, statusOnly = false } = {}) {
  const url = databaseUrl ?? process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL (o DATABASE_URL_MIGRATOR) para migrar');

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const applied = new Map();
  let bootstrapError = null;

  try {
    await client.query(BOOTSTRAP);
    const { rows } = await client.query('SELECT filename, checksum FROM app.schema_migrations');
    for (const row of rows) applied.set(row.filename, row.checksum);
  } catch (err) {
    bootstrapError = err;
  }

  if (bootstrapError && !statusOnly) throw bootstrapError;

  const files = listMigrationFiles();
  const pending = [];
  const changed = [];

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const checksum = sha256(sql);
    if (!applied.has(file)) {
      pending.push({ file, sql, checksum });
    } else if (applied.get(file) !== checksum) {
      changed.push(file);
    }
  }

  if (statusOnly) {
    if (!silent) {
      console.log('\n  Estado de migraciones\n');
      for (const file of files) {
        const state = applied.has(file) ? (changed.includes(file) ? 'CAMBIADA' : 'aplicada') : 'pendiente';
        console.log(`   ${state.padEnd(10)} ${file}`);
      }
      console.log(`\n   aplicadas: ${applied.size} · pendientes: ${pending.length}\n`);
    }
    await client.end();
    return { applied: applied.size, pending: pending.length, changed };
  }

  if (changed.length > 0) {
    await client.end();
    throw new Error(
      `Migraciones ya aplicadas que fueron modificadas: ${changed.join(', ')}. ` +
        'Nunca se edita una migración aplicada: se agrega una nueva (ADR-0002).',
    );
  }

  for (const { file, sql, checksum } of pending) {
    const startedAt = Date.now();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      const duration = Date.now() - startedAt;
      await client.query(
        'INSERT INTO app.schema_migrations (filename, checksum, duration_ms) VALUES ($1, $2, $3)',
        [file, checksum, duration],
      );
      await client.query('COMMIT');
      if (!silent) console.log(`   aplicada  ${file}  (${duration} ms)`);
    } catch (err) {
      await client.query('ROLLBACK');
      await client.end();
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Falló la migración ${file}: ${message}`, { cause: err });
    }
  }

  await client.end();
  return { applied: applied.size + pending.length, pending: 0, changed: [] };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const statusOnly = process.argv.includes('--status');
  try {
    await runMigrations({ statusOnly });
    if (!statusOnly) console.log('\n   migraciones al día\n');
  } catch (err) {
    console.error(`\n   ${err.message}\n`);
    process.exit(1);
  }
}
