import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig, type AppConfig } from './env';
import { LOGGER, createLogger } from '../common/logger';

/**
 * Configuración y logger, disponibles en toda la aplicación.
 *
 * Se declara como módulo global para que cualquier módulo (incluido el de JWT)
 * pueda inyectarlos sin repetir la importación.
 */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    {
      provide: LOGGER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createLogger(config),
    },
  ],
  exports: [APP_CONFIG, LOGGER],
})
export class ConfigModule {}
