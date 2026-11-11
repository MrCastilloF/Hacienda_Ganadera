import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Vitest transforma con SWC y no con esbuild.
 *
 * Motivo: NestJS resuelve la inyección de dependencias con `design:paramtypes`,
 * un metadato que esbuild no emite. Con SWC (`decoratorMetadata: true`) las
 * pruebas ejecutan exactamente el mismo código que el build de producción.
 */
const swcPlugin = swc.vite({
  jsc: {
    target: 'es2022',
    parser: { syntax: 'typescript', decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
  },
});

export default defineConfig({
  plugins: [swcPlugin],
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    globals: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/openapi-export.ts'],
    },
  },
});
