import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PesajesService } from './pesajes.service';
import { parseBody, parseParams, parseQuery } from '../common/validation';
import { CurrentUser, Require } from '../rbac/decorators';
import type { AccessTokenPayload } from '../auth/token.service';

const CrearSchema = z.object({
  animalId: z.string().uuid(),
  basculaId: z.string().uuid().optional(),
  bridgeId: z.string().uuid().optional(),
  pesoKg: z.number().positive().max(3000),
  tipo: z.enum(['NACIMIENTO', 'DESTETE', 'CONTROL', 'ENTRADA', 'SALIDA', 'OTRO']).optional(),
  ocurridoAt: z.string().datetime({ offset: true }).optional(),
  observaciones: z.string().max(500).optional(),
  origen: z.enum(['FIELD', 'SIMULATOR', 'IMPORT', 'MANUAL']).default('FIELD'),
  tramaCruda: z.string().max(500).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

const SimularSchema = z.object({
  animalId: z.string().uuid(),
  basculaId: z.string().uuid().optional(),
  pesoBaseKg: z.number().positive().max(3000),
  modo: z.enum(['estable', 'inestable', 'sobrecarga', 'corrupta', 'desconectada']).default('estable'),
  tipo: z.enum(['NACIMIENTO', 'DESTETE', 'CONTROL', 'ENTRADA', 'SALIDA', 'OTRO']).optional(),
});

const ListadoQuery = z.object({
  animalId: z.string().uuid().optional(),
  fincaId: z.string().uuid().optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const IdParam = z.object({ id: z.string().uuid('Identificador inválido') });

@ApiTags('pesajes')
@ApiBearerAuth()
@Controller('pesajes')
export class PesajesController {
  constructor(@Inject(PesajesService) private readonly pesajes: PesajesService) {}

  @Get()
  @Require('pesajes', 'consultar')
  @ApiOperation({ summary: 'Lista pesajes con filtros por animal, finca y fechas' })
  @ApiQuery({ name: 'animalId', required: false })
  async listar(@Query() query: Record<string, unknown>, @CurrentUser() user: AccessTokenPayload) {
    const filtros = parseQuery(ListadoQuery, query);
    return this.pesajes.listar({
      ...filtros,
      fincaId: user.scope === 'global' ? filtros.fincaId : (filtros.fincaId ?? user.fincas[0]),
    });
  }

  @Get('animal/:id')
  @Require('pesajes', 'consultar')
  @ApiOperation({ summary: 'Historial de pesajes de un animal' })
  async porAnimal(@Param() params: Record<string, string>) {
    const { id } = parseParams(IdParam, params);
    const [historial, ultimo] = await Promise.all([
      this.pesajes.listar({ animalId: id, limit: 100, offset: 0 }),
      this.pesajes.ultimoPeso(id),
    ]);
    return { ...historial, ultimo };
  }

  @Post()
  @Require('pesajes', 'crear')
  @ApiOperation({
    summary: 'Registra un pesaje (inmutable, idempotente y deduplicado)',
    description:
      'Enviar el mismo `idempotencyKey` devuelve el pesaje existente en lugar de crear otro. Un segundo pesaje del mismo animal en la misma báscula dentro de 60 s se marca como duplicado.',
  })
  async crear(@Body() body: unknown, @CurrentUser() user: AccessTokenPayload) {
    const input = parseBody(CrearSchema, body);
    return this.pesajes.crear(
      { ...input, idempotencyKey: input.idempotencyKey ?? randomUUID() },
      user.sub,
    );
  }

  @Post('simulado')
  @Require('pesajes', 'crear')
  @ApiOperation({
    summary: 'Pesaje simulado: adaptador → estabilidad → registro, con origen SIMULATOR',
    description:
      'Ejecuta la misma cadena que un pesaje real con tramas generadas. El resultado queda marcado como SIMULATOR y la API lo advierte en el campo `aviso`.',
  })
  async simular(@Body() body: unknown, @CurrentUser() user: AccessTokenPayload) {
    const input = parseBody(SimularSchema, body);
    return this.pesajes.simular(input, user.sub);
  }
}
