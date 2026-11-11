import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { parseBody, parseParams, parseQuery } from '../common/validation';
import { CurrentUser, Require } from '../rbac/decorators';
import type { AccessTokenPayload } from '../auth/token.service';
import { listarAdaptadores, protocoloSoportado } from '@hacienda/scale-protocols';

const CrearBasculaSchema = z.object({
  fincaId: z.string().uuid(),
  nombre: z.string().min(2).max(80),
  marca: z.string().max(60).optional(),
  modelo: z.string().max(60).optional(),
  serie: z.string().max(60).optional(),
  protocolId: z.string().min(2).max(60).default('generic-ascii'),
  transporte: z.enum(['SERIAL', 'USB', 'TCP', 'USB_HID']).default('SERIAL'),
  configJson: z.record(z.string(), z.unknown()).default({}),
  toleranceKg: z.number().positive().max(50).default(0.5),
  windowMs: z.number().int().min(100).max(10000).default(1200),
  minSamples: z.number().int().min(2).max(100).default(5),
  minKg: z.number().min(0).default(0),
  maxKg: z.number().positive().default(2000),
  estadoIntegracion: z.enum(['declared', 'simulated', 'lab_verified', 'field_verified']).default('declared'),
});

const ActualizarBasculaSchema = z.object({
  nombre: z.string().min(2).max(80).optional(),
  protocolId: z.string().min(2).max(60).optional(),
  protocolo: z.enum(['SERIAL', 'USB', 'TCP', 'USB_HID']).optional(),
  configJson: z.record(z.string(), z.unknown()).optional(),
  toleranceKg: z.number().positive().max(50).optional(),
  windowMs: z.number().int().min(100).max(10000).optional(),
  minSamples: z.number().int().min(2).max(100).optional(),
  minKg: z.number().min(0).optional(),
  maxKg: z.number().positive().optional(),
  estadoIntegracion: z.enum(['declared', 'simulated', 'lab_verified', 'field_verified']).optional(),
  activa: z.boolean().optional(),
});

const ListadoQuery = z.object({ fincaId: z.string().uuid().optional() });
const IdParam = z.object({ id: z.string().uuid('Identificador inválido') });

@ApiTags('básculas')
@ApiBearerAuth()
@Controller('basculas')
export class BasculasController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('adaptadores')
  @Require('basculas', 'consultar')
  @ApiOperation({ summary: 'Protocolos con adaptador registrado (sin adaptador, no hay soporte)' })
  adaptadores() {
    return {
      items: listarAdaptadores().map((a) => ({
        id: a.id,
        nombre: a.name,
        version: a.version,
        capacidades: a.capabilities,
      })),
    };
  }

  @Get()
  @Require('basculas', 'consultar')
  @ApiQuery({ name: 'fincaId', required: false })
  async listar(@Query() query: Record<string, unknown>) {
    const { fincaId } = parseQuery(ListadoQuery, query);
    const filas = await this.prisma.bascula.findMany({
      where: { activa: true, ...(fincaId ? { fincaId } : {}) },
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        marca: true,
        modelo: true,
        protocolId: true,
        transporte: true,
        estadoIntegracion: true,
        toleranceKg: true,
        windowMs: true,
        minSamples: true,
        minKg: true,
        maxKg: true,
      },
    });

    return {
      total: filas.length,
      items: filas.map((f) => ({
        ...f,
        toleranceKg: Number(f.toleranceKg),
        minKg: Number(f.minKg),
        maxKg: Number(f.maxKg),
        // Se declara si el protocolo tiene adaptador: sin él la báscula no opera.
        soportada: protocoloSoportado(f.protocolId),
      })),
    };
  }

  @Post()
  @Require('basculas', 'crear')
  @ApiOperation({ summary: 'Registra una báscula y sus umbrales de estabilidad' })
  async crear(@Body() body: unknown, @CurrentUser() user: AccessTokenPayload) {
    const input = parseBody(CrearBasculaSchema, body);

    const finca = await this.prisma.finca.findFirst({ where: { id: input.fincaId, deletedAt: null } });
    if (!finca) throw AppError.validation('La finca indicada no existe');

    const creada = await this.prisma.$transaction(async (tx) => {
      const bascula = await tx.bascula.create({
        data: {
          fincaId: input.fincaId,
          nombre: input.nombre,
          marca: input.marca ?? null,
          modelo: input.modelo ?? null,
          serie: input.serie ?? null,
          protocolId: input.protocolId,
          transporte: input.transporte,
          configJson: input.configJson as object,
          toleranceKg: input.toleranceKg,
          windowMs: input.windowMs,
          minSamples: input.minSamples,
          minKg: input.minKg,
          maxKg: input.maxKg,
          estadoIntegracion: input.estadoIntegracion,
          createdBy: user.sub,
        },
        select: { id: true, nombre: true, protocolId: true, estadoIntegracion: true },
      });

      await this.audit.record(
        {
          action: 'basculas.crear',
          entity: 'bascula',
          entityId: bascula.id,
          actorId: user.sub,
          after: { nombre: bascula.nombre, protocolId: bascula.protocolId },
        },
        tx,
      );

      return bascula;
    });

    return { ...creada, soportada: protocoloSoportado(creada.protocolId) };
  }

  @Patch(':id')
  @Require('basculas', 'modificar')
  @ApiOperation({ summary: 'Actualiza configuración, umbrales o estado de integración' })
  async actualizar(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    const { id } = parseParams(IdParam, params);
    const cambios = parseBody(ActualizarBasculaSchema, body);

    const actual = await this.prisma.bascula.findFirst({ where: { id }, select: { id: true } });
    if (!actual) throw AppError.notFound('Báscula no encontrada');

    const { protocolo, ...resto } = cambios;
    const datos: Record<string, unknown> = { ...resto, updatedBy: user.sub };
    if (protocolo) datos.transporte = protocolo;

    const actualizada = await this.prisma.$transaction(async (tx) => {
      const bascula = await tx.bascula.update({
        where: { id },
        data: datos,
        select: { id: true, nombre: true, protocolId: true, estadoIntegracion: true, activa: true },
      });

      await this.audit.record(
        {
          action: 'basculas.modificar',
          entity: 'bascula',
          entityId: id,
          actorId: user.sub,
          after: bascula,
        },
        tx,
      );

      return bascula;
    });

    return { ...actualizada, soportada: protocoloSoportado(actualizada.protocolId) };
  }
}
