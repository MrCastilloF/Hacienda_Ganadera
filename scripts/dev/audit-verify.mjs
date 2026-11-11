#!/usr/bin/env node
/**
 * audit-verify.mjs — verifica la cadena de hashes de la auditoría.
 *
 *   node scripts/dev/audit-verify.mjs
 *   node scripts/dev/audit-verify.mjs --from 2026-01-01 [--to 2026-12-31]
 *
 * Código de salida 0 si la cadena es íntegra; 1 si hay rupturas.
 * Una ruptura se trata como incidente de seguridad (docs/runbooks/incidentes.md),
 * no como un defecto más.
 */

import pg from 'pg';

const args = process.argv.slice(2);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const url = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL (o DATABASE_URL_MIGRATOR).');
  process.exit(2);
}

const from = value('--from') ?? null;
const to = value('--to') ?? null;

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const total = await client.query('SELECT count(*)::int AS n, max(occurred_at) AS ultimo FROM app.audit_log');
  const { n, ultimo } = total.rows[0];

  const { rows } = await client.query('SELECT * FROM app.audit_verify($1, $2)', [from, to]);

  console.log('');
  console.log(`  eventos de auditoría : ${n}`);
  console.log(`  último registro      : ${ultimo ? ultimo.toISOString() : '—'}`);
  console.log(`  rango verificado     : ${from ?? 'inicio'} → ${to ?? 'fin'}`);
  console.log('');

  if (rows.length === 0) {
    console.log('  ✔ cadena íntegra');
    console.log('');
    process.exit(0);
  }

  console.error(`  ✖ ${rows.length} ruptura(s) de integridad:`);
  for (const r of rows.slice(0, 20)) {
    console.error(`     id=${r.id}  ${r.occurred_at.toISOString()}  ${r.motivo}`);
  }
  console.error('');
  console.error('  Esto es un incidente de seguridad: preservar el sistema y seguir');
  console.error('  docs/runbooks/incidentes.md. NO corregir a mano.');
  console.error('');
  process.exit(1);
} finally {
  await client.end();
}
