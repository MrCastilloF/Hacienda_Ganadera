#!/usr/bin/env node
/**
 * generate-keys.mjs — genera el par de claves RS256 para firmar los tokens.
 *
 *   node scripts/dev/generate-keys.mjs
 *
 * Salida: secrets/jwt_private.pem y secrets/jwt_public.pem (ignorados por Git).
 * En producción la API se niega a arrancar sin estas claves: no se generan
 * claves efímeras porque invalidarían todas las sesiones en cada reinicio.
 */

import { generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = resolve(ROOT, 'secrets');

const PRIVADA = resolve(DIR, 'jwt_private.pem');
const PUBLICA = resolve(DIR, 'jwt_public.pem');

if (existsSync(PRIVADA) && !process.argv.includes('--force')) {
  console.log(`\n  Ya existen claves en ${DIR}`);
  console.log('  Use --force para regenerarlas (esto invalida todas las sesiones activas).\n');
  process.exit(0);
}

mkdirSync(DIR, { recursive: true });

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

writeFileSync(PRIVADA, privateKey, { mode: 0o600 });
writeFileSync(PUBLICA, publicKey, { mode: 0o644 });

try {
  chmodSync(PRIVADA, 0o600);
} catch {
  /* en Windows los permisos POSIX no aplican */
}

const privadaBits = privateKey.length * 8;
const publicaBits = publicKey.length * 8;

console.log('');
console.log('  Claves RS256 generadas');
console.log(`  ${PRIVADA}  (${privadaBits} bytes)`);
console.log(`  ${PUBLICA}  (${publicaBits} bytes)`);
console.log('');
console.log('  Docker Compose las monta en /run/secrets y la API las lee de las');
console.log('  variables JWT_PRIVATE_KEY_PATH / JWT_PUBLIC_KEY_PATH.');
console.log('');
console.log('  Sin Docker:');
console.log('    JWT_PRIVATE_KEY="$(cat secrets/jwt_private.pem)" \\');
console.log('    JWT_PUBLIC_KEY="$(cat secrets/jwt_public.pem)" pnpm dev');
console.log('');
console.log('  Respalde estas claves junto con la base de datos: sin ellas no se');
console.log('  pueden validar los tokens emitidos (documentación: docs/runbooks/respaldo.md).');
console.log('');
