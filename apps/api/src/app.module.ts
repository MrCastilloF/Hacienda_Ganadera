import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './audit/audit.module';
import { RbacModule } from './rbac/rbac.module';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { FincasModule } from './fincas/fincas.module';
import { AnimalesModule } from './animales/animales.module';
import { PesajesModule } from './pesajes/pesajes.module';
import { ReportesModule } from './reportes/reportes.module';
import { SaludModule } from './salud/salud.module';
import { HealthController } from './health/health.controller';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { GlobalExceptionFilter } from './common/exception.filter';
import { AuditInterceptor } from './audit/audit.interceptor';

/**
 * Módulo raíz.
 *
 * Los guards, el filtro y el interceptor se registran en `bootstrap.ts` desde el
 * contenedor de dependencias y no con APP_GUARD/APP_FILTER: así su resolución no
 * depende del módulo que los declara y las pruebas pueden construir exactamente
 * la misma pila que producción.
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuditModule,
    RbacModule,
    AuthModule,
    UsuariosModule,
    FincasModule,
    AnimalesModule,
    PesajesModule,
    ReportesModule,
    SaludModule,
  ],
  controllers: [HealthController],
  providers: [GlobalExceptionFilter, AuditInterceptor],
  exports: [GlobalExceptionFilter, AuditInterceptor],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
