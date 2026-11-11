import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuditService } from './audit.service';
import { Require } from '../rbac/decorators';
import { parseQuery } from '../common/validation';

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  entity: z.string().min(1).max(64).optional(),
  action: z.string().min(1).max(120).optional(),
  actorId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const VerifyQuery = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

@ApiTags('auditoría')
@ApiBearerAuth()
@Controller('auditoria')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @Require('auditoria', 'consultar')
  @ApiOperation({ summary: 'Lista los eventos de auditoría (más recientes primero)' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async list(@Query() query: Record<string, unknown>) {
    const params = parseQuery(ListQuery, query);
    return this.audit.list(params);
  }

  @Get('estadisticas')
  @Require('auditoria', 'consultar')
  @ApiOperation({ summary: 'Total de eventos y fecha del último registro' })
  async stats() {
    return this.audit.stats();
  }

  @Get('verificar')
  @Require('auditoria', 'consultar')
  @ApiOperation({
    summary: 'Verifica la cadena de hashes. Sin rupturas ⇒ respuesta íntegra',
    description:
      'Recalcula el hash de cada evento y comprueba el encadenamiento. Una ruptura es un incidente de seguridad, no un defecto funcional.',
  })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  async verify(@Query() query: Record<string, unknown>) {
    const { desde, hasta } = parseQuery(VerifyQuery, query);
    const rupturas = await this.audit.verify(desde, hasta);
    return {
      integra: rupturas.length === 0,
      rupturas,
      verificadoEn: new Date().toISOString(),
      rango: { desde: desde?.toISOString() ?? null, hasta: hasta?.toISOString() ?? null },
    };
  }
}
