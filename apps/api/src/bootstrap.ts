import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/exception.filter';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './rbac/permissions.guard';
import { AuditInterceptor } from './audit/audit.interceptor';
import { APP_CONFIG, loadConfig, type AppConfig } from './config/env';
import { buildOpenApiDocument, DOCS_PATH } from './openapi';
import { LOGGER, type Logger } from './common/logger';

/**
 * Construcción de la aplicación.
 *
 * Se separa de `main.ts` para que las pruebas de integración levanten el mismo
 * binario (mismos guards, filtros, plugins y prefijos) sin abrir un puerto.
 */
export async function createApp(
  config: AppConfig = loadConfig(),
): Promise<{ app: NestFastifyApplication; config: AppConfig }> {
  const adapter = new FastifyAdapter({
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: ['error', 'warn'],
    bufferLogs: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  });

  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'ready', DOCS_PATH, `${DOCS_PATH}-json`],
  });

  // Pila transversal resuelta desde el contenedor: mismo orden que se documenta
  // en docs/02 (autenticación → permisos → auditoría → manejo de errores).
  app.useGlobalGuards(app.get(JwtAuthGuard), app.get(PermissionsGuard));
  app.useGlobalInterceptors(app.get(AuditInterceptor));
  app.useGlobalFilters(app.get(GlobalExceptionFilter));

  app.enableShutdownHooks();

  const document = buildOpenApiDocument(app);
  SwaggerModule.setup(DOCS_PATH, app, document, {
    jsonDocumentUrl: `${DOCS_PATH}-json`,
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
  });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return { app, config };
}

export async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const { app } = await createApp(config);

  const logger = app.get<Logger>(LOGGER);

  await app.listen({ port: config.port, host: config.host });

  logger.info(
    {
      port: config.port,
      env: config.env,
      version: config.version,
      docs: `/${DOCS_PATH}`,
      jwtEphemeral: config.jwt.ephemeral,
    },
    'API de Hacienda Ganadera en marcha',
  );

  if (config.jwt.ephemeral) {
    logger.warn(
      'Claves JWT efímeras: las sesiones se invalidan al reiniciar. Configure JWT_PRIVATE_KEY/JWT_PUBLIC_KEY.',
    );
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Cerrando la aplicación');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Se expone la configuración cargada para el exportador de OpenAPI.
export { APP_CONFIG };
