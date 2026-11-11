import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service';
import { parseQuery } from '../common/validation';
import { Require } from '../rbac/decorators';
import { ESTADOS, transicionesPosibles, type EstadoAnimal } from '../animales/domain/estados';

const LotesQuery = z.object({ fincaId: z.string().uuid().optional() });

/**
 * Catálogos de apoyo para la ficha del animal.
 *
 * Se separan del módulo de animales porque son datos de referencia que otros
 * módulos (pesajes, salud, reportes) también consumen.
 */
@ApiTags('catálogos')
@ApiBearerAuth()
@Controller('catalogos')
export class CatalogosController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('razas')
  @Require('animales', 'consultar')
  @ApiOperation({ summary: 'Razas activas (marcadas como sembradas hasta validación del negocio)' })
  async razas() {
    const items = await this.prisma.raza.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, codigo: true, nombre: true, especie: true, source: true },
    });
    return { total: items.length, items };
  }

  @Get('categorias')
  @Require('animales', 'consultar')
  @ApiOperation({ summary: 'Categorías del hato (la categoría del animal es derivada, no editable)' })
  async categorias() {
    const items = await this.prisma.categoriaAnimal.findMany({
      where: { activo: true },
      orderBy: { orden: 'asc' },
      select: { codigo: true, nombre: true, sexo: true, edadMinMeses: true, edadMaxMeses: true },
    });
    return { total: items.length, items };
  }

  @Get('lotes')
  @Require('animales', 'consultar')
  @ApiOperation({ summary: 'Lotes de la finca' })
  async lotes(@Query() query: Record<string, unknown>) {
    const { fincaId } = parseQuery(LotesQuery, query);
    const items = await this.prisma.lote.findMany({
      where: { activo: true, ...(fincaId ? { fincaId } : {}) },
      orderBy: { nombre: 'asc' },
      select: { id: true, codigo: true, nombre: true, fincaId: true },
    });
    return { total: items.length, items };
  }

  @Get('estados')
  @Require('animales', 'consultar')
  @ApiOperation({ summary: 'Estados del animal y sus transiciones posibles' })
  estados() {
    return {
      items: ESTADOS.map((estado) => ({
        estado,
        transiciones: transicionesPosibles(estado as EstadoAnimal),
      })),
    };
  }
}
