import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createApp } from './bootstrap';
import { buildOpenApiDocument } from './openapi';

/**
 * Exporta `docs/api/openapi.json` a partir de la aplicación real.
 * Se ejecuta en CI para detectar cambios de contrato no documentados.
 */
async function main(): Promise<void> {
  const { app } = await createApp();
  const document = buildOpenApiDocument(app);

  const target = resolve(process.cwd(), '..', '..', 'docs', 'api', 'openapi.json');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const paths = Object.keys(document.paths ?? {}).length;
  process.stdout.write(`OpenAPI exportado a ${target} (${paths} rutas)\n`);

  await app.close();
  process.exit(0);
}

main().catch((error) => {
  console.error('No se pudo exportar OpenAPI:', error);
  process.exit(1);
});
