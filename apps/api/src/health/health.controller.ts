import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Public } from '../rbac/decorators';
import { APP_CONFIG, type AppConfig } from '../config/env';

@ApiTags('salud')
@Controller()
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Sonda de vida: responde si el proceso está en pie' })
  health() {
    return {
      status: 'ok',
      service: 'hacienda-api',
      version: this.config.version,
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Sonda de disponibilidad: comprueba la dependencia de datos' })
  async ready() {
    const dbOk = await this.prisma.ping();
    const stats = dbOk ? await this.audit.stats().catch(() => null) : null;

    const body = {
      status: dbOk ? 'ready' : 'degraded',
      checks: {
        database: dbOk ? 'ok' : 'down',
        auditoria: stats ? { eventos: stats.total, ultimo: stats.ultimo?.toISOString() ?? null } : 'no disponible',
      },
      timestamp: new Date().toISOString(),
    };

    if (!dbOk) {
      // Fastify/Nest: se devuelve 503 sin lanzar excepción para no ensuciar el log.
      const error: Error & { statusCode?: number } = new Error('Base de datos no disponible');
      error.statusCode = 503;
      throw Object.assign(error, { response: body });
    }

    return body;
  }
}
