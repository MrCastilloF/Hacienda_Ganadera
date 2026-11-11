import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AnimalesService } from './animales.service';
import { ImportadorService, PLANTILLA_CSV } from './importador.service';
import { parseBody, parseParams, parseQuery } from '../common/validation';
import { CurrentUser, Require } from '../rbac/decorators';
import type { AccessTokenPayload } from '../auth/token.service';
import { ESTADOS } from './domain/estados';

const ListadoQuery = z.object({
  fincaId: z.string().uuid().optional(),
  estado: z.enum(ESTADOS).optional(),
  sexo: z.enum(['MACHO', 'HEMBRA']).optional(),
  categoria: z.string().min(2).max(30).optional(),
  loteId: z.string().uuid().optional(),
  q: z.string().min(1).max(120).optional(),
  incluirAnulados: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const CrearSchema = z.object({
  fincaId: z.string().uuid(),
  arete: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[A-Za-z0-9-]+$/, 'El arete solo admite letras, números y guiones')
    .optional(),
  nombre: z.string().max(120).optional(),
  sexo: z.enum(['MACHO', 'HEMBRA']),
  fechaNacimiento: z.string().date('Formato esperado AAAA-MM-DD').optional(),
  pesoNacimientoKg: z.number().positive().max(200).optional(),
  razaId: z.string().uuid().optional(),
  cruceRacial: z.string().max(80).optional(),
  color: z.string().max(60).optional(),
  caracteristicas: z.string().max(500).optional(),
  procedencia: z.string().max(120).optional(),
  madreId: z.string().uuid().optional(),
  padreId: z.string().uuid().optional(),
  tipoNacimiento: z.enum(['SIMPLE', 'GEMELO', 'TRIPLE']).optional(),
  estadoProductivo: z.string().max(40).optional(),
  condicionCorporal: z.number().int().min(1).max(5).optional(),
  loteId: z.string().uuid().optional(),
  corral: z.string().max(40).optional(),
  identificacionOficial: z.string().max(60).optional(),
  observaciones: z.string().max(2000).optional(),
});

const ActualizarSchema = z
  .object({
    version: z.number().int().positive().optional(),
    nombre: z.string().max(120).nullable().optional(),
    color: z.string().max(60).nullable().optional(),
    caracteristicas: z.string().max(500).nullable().optional(),
    procedencia: z.string().max(120).nullable().optional(),
    estadoProductivo: z.string().max(40).nullable().optional(),
    condicionCorporal: z.number().int().min(1).max(5).nullable().optional(),
    corral: z.string().max(40).nullable().optional(),
    identificacionOficial: z.string().max(60).nullable().optional(),
    observaciones: z.string().max(2000).nullable().optional(),
    cruceRacial: z.string().max(80).nullable().optional(),
    tipoNacimiento: z.enum(['SIMPLE', 'GEMELO', 'TRIPLE']).nullable().optional(),
    madreId: z.string().uuid().nullable().optional(),
    padreId: z.string().uuid().nullable().optional(),
  })
  .refine((val) => Object.keys(val).filter((k) => k !== 'version').length > 0, {
    message: 'Envíe al menos un campo para modificar',
  });

const EstadoSchema = z.object({
  estado: z.enum(ESTADOS),
  motivo: z.string().min(3).max(300).optional(),
});

const ImportarSchema = z.object({
  fincaId: z.string().uuid(),
  csv: z.string().min(1, 'El CSV es obligatorio'),
  dryRun: z.boolean().default(true),
});

const IdParam = z.object({ id: z.string().uuid('Identificador inválido') });

const GenealogiaQuery = z.object({
  profundidad: z.coerce.number().int().min(1).max(8).default(4),
});

@ApiTags('animales')
@ApiBearerAuth()
@Controller('animales')
export class AnimalesController {
  constructor(
    @Inject(AnimalesService) private readonly animales: AnimalesService,
    @Inject(ImportadorService) private readonly importador: ImportadorService,
  ) {}

  @Get()
  @Require('animales', 'consultar')
  @ApiOperation({ summary: 'Lista animales con filtros y categoría derivada' })
  @ApiQuery({ name: 'q', required: false, description: 'Busca por arete, código de barras o nombre' })
  @ApiQuery({ name: 'categoria', required: false })
  async listar(@Query() query: Record<string, unknown>, @CurrentUser() user: AccessTokenPayload) {
    const filtros = parseQuery(ListadoQuery, query);
    return this.animales.listar({
      ...filtros,
      // El alcance se aplica en la consulta, no en la interfaz (RF-SEG-10).
      fincaId: user.scope === 'global' ? filtros.fincaId : (filtros.fincaId ?? user.fincas[0]),
    });
  }

  @Get(':id')
  @Require('animales', 'consultar')
  @ApiOperation({ summary: 'Ficha completa del animal con genealogía e historial' })
  async ficha(@Param() params: Record<string, string>) {
    const { id } = parseParams(IdParam, params);
    return this.animales.ficha(id);
  }

  @Get(':id/genealogia')
  @Require('animales', 'consultar')
  @ApiOperation({ summary: 'Árbol genealógico ascendente y descendente' })
  async genealogia(@Param() params: Record<string, string>, @Query() query: Record<string, unknown>) {
    const { id } = parseParams(IdParam, params);
    const { profundidad } = parseQuery(GenealogiaQuery, query);
    return this.animales.genealogia(id, profundidad);
  }

  @Post()
  @Require('animales', 'crear')
  @ApiOperation({
    summary: 'Registra un animal. Si no se envía arete, se genera con el esquema configurado',
  })
  async crear(@Body() body: unknown, @CurrentUser() user: AccessTokenPayload) {
    const input = parseBody(CrearSchema, body);
    return this.animales.crear(input, user.sub);
  }

  @Patch(':id')
  @Require('animales', 'modificar')
  @ApiOperation({ summary: 'Modifica datos descriptivos con control de versión (concurrencia optimista)' })
  async actualizar(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    const { id } = parseParams(IdParam, params);
    const { version, ...cambios } = parseBody(ActualizarSchema, body);
    return this.animales.actualizar(id, cambios, version, user.sub);
  }

  @Post(':id/estado')
  @Require('animales', 'modificar')
  @ApiOperation({
    summary: 'Transita el estado del animal (máquina de estados, con historial y auditoría)',
    description:
      'Un estado terminal (vendido, fallecido, sacrificado) no admite salida. Las transiciones a cuarentena, enfermo, vendido, fallecido, sacrificado o trasladado exigen motivo.',
  })
  async cambiarEstado(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    const { id } = parseParams(IdParam, params);
    const { estado, motivo } = parseBody(EstadoSchema, body);
    return this.animales.cambiarEstado(id, estado, motivo, user.sub);
  }

  @Get('importar/plantilla')
  @Require('animales', 'consultar')
  @ApiOperation({ summary: 'Plantilla CSV para la carga del hato existente' })
  plantilla() {
    return {
      formato: 'CSV con cabecera, separador coma o punto y coma',
      columnasObligatorias: ['sexo'],
      columnasOpcionales: [
        'arete', 'nombre', 'fechaNacimiento', 'raza', 'color',
        'pesoNacimientoKg', 'madreArete', 'padreArete', 'observaciones',
      ],
      csv: PLANTILLA_CSV,
    };
  }

  @Post('importar')
  @Require('animales', 'crear')
  @ApiOperation({
    summary: 'Importa el hato desde CSV (validación previa obligatoria)',
    description:
      'Con dryRun=true valida y muestra lo que haría sin escribir nada. La importación real es todo o nada: si alguna fila es inválida, no se crea ningún animal.',
  })
  async importar(@Body() body: unknown, @CurrentUser() user: AccessTokenPayload) {
    const input = parseBody(ImportarSchema, body);
    return this.importador.importar(input, user.sub);
  }
}
