import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ReportesService } from './reportes.service';
import { AppError } from '../common/app-error';
import { parseParams, parseQuery } from '../common/validation';
import { CurrentUser, Require } from '../rbac/decorators';
import type { AccessTokenPayload } from '../auth/token.service';

const ListadoQuery = z.object({
  fincaId: z.string().uuid().optional(),
  categoria: z.string().min(2).max(30).optional(),
  soloBajo: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const AnimalQuery = z.object({
  diasProyeccion: z.coerce.number().int().min(1).max(365).default(30),
});

const IdParam = z.object({ id: z.string().uuid('Identificador inválido') });

@ApiTags('reportes')
@ApiBearerAuth()
@Controller('reportes')
export class ReportesController {
  constructor(@Inject(ReportesService) private readonly reportes: ReportesService) {}

  @Get('crecimiento')
  @Require('reportes', 'consultar')
  @ApiOperation({
    summary: 'Ganancia diaria de peso por animal, con clasificación frente al rango esperado',
    description:
      'Solo cuenta pesajes válidos: excluye duplicados y anulados. Los animales con crecimiento bajo aparecen primero porque son los que exigen acción.',
  })
  @ApiQuery({ name: 'soloBajo', required: false, description: 'Filtra los animales con GDP bajo' })
  async crecimiento(@Query() query: Record<string, unknown>, @CurrentUser() user: AccessTokenPayload) {
    const filtros = parseQuery(ListadoQuery, query);
    return this.reportes.crecimientoPorFinca({
      ...filtros,
      fincaId: user.scope === 'global' ? filtros.fincaId : (filtros.fincaId ?? user.fincas[0]),
    });
  }

  @Get('crecimiento/:id')
  @Require('reportes', 'consultar')
  @ApiOperation({
    summary: 'Curva de peso, tramos y proyección de un animal',
    description:
      'La proyección es una extrapolación lineal y se devuelve siempre con advertencia: no es un pronóstico validado.',
  })
  async animal(@Param() params: Record<string, string>, @Query() query: Record<string, unknown>) {
    const { id } = parseParams(IdParam, params);
    const { diasProyeccion } = parseQuery(AnimalQuery, query);

    const resultado = await this.reportes.crecimientoDeAnimal(id, diasProyeccion);
    if (!resultado) throw AppError.notFound('Animal no encontrado');
    return resultado;
  }
}
