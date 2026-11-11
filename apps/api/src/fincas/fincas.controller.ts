import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { CurrentUser, Require } from '../rbac/decorators';
import type { AccessTokenPayload } from '../auth/token.service';

/**
 * Fincas visibles para el usuario.
 *
 * El alcance se aplica en la consulta, no en el menú (RF-SEG-10): un usuario de
 * una sola finca no puede leer otra ni cambiando el identificador en la URL.
 */
@ApiTags('fincas')
@ApiBearerAuth()
@Controller('fincas')
export class FincasController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @Require('fincas', 'consultar')
  @ApiOperation({ summary: 'Fincas a las que el usuario tiene acceso' })
  async list(@CurrentUser() user: AccessTokenPayload) {
    const fincas = await this.prisma.finca.findMany({
      where: {
        deletedAt: null,
        ...(user.scope === 'global' ? {} : { id: { in: user.fincas } }),
      },
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        zonaHoraria: true,
        moneda: true,
        unidadPeso: true,
        activa: true,
      },
    });

    return { total: fincas.length, items: fincas };
  }

  @Get(':id')
  @Require('fincas', 'consultar')
  @ApiOperation({ summary: 'Detalle de una finca dentro del alcance del usuario' })
  async get(@Param() params: Record<string, string>, @CurrentUser() user: AccessTokenPayload) {
    const { id } = z.object({ id: z.string().uuid('Identificador inválido') }).parse(params);

    if (user.scope !== 'global' && !user.fincas.includes(id)) {
      throw AppError.notFound('Finca no encontrada');
    }

    const finca = await this.prisma.finca.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        propietario: true,
        identificacionTributaria: true,
        direccion: true,
        zonaHoraria: true,
        moneda: true,
        unidadPeso: true,
        activa: true,
        createdAt: true,
      },
    });

    if (!finca) throw AppError.notFound('Finca no encontrada');
    return finca;
  }
}
