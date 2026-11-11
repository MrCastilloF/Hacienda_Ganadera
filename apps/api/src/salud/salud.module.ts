import { Body, Controller, Get, Inject, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditModule } from '../audit/audit.module';
import { parseBody, parseParams, parseQuery } from '../common/validation';
import { CurrentUser, Require } from '../rbac/decorators';
import type { AccessTokenPayload } from '../auth/token.service';
import { calcularRetiro, evaluarRetiro } from './domain/retiro';
import {
  AVISO_CATALOGO,
  CATALOGO_MEDICAMENTOS,
  diasHastaRetiro,
} from './domain/medicamentos';
import { admiteOperaciones, type EstadoAnimal } from '../animales/domain/estados';

const CrearSchema = z.object({
  animalId: z.string().uuid(),
  medicamento: z.string().min(2).max(120),
  principioActivo: z.string().max(120).optional(),
  dosis: z.string().max(80).optional(),
  via: z.enum(['IM', 'IV', 'SC', 'ORAL', 'TOPICA', 'INTRAMAMARIA', 'OTRA']).optional(),
  diagnostico: z.string().max(200).optional(),
  motivo: z.string().max(300).optional(),
  iniciadoAt: z.string().datetime({ offset: true }),
  diasTratamiento: z.number().int().min(1).max(365).default(1),
  diasRetiro: z.number().int().min(0).max(365).default(0),
  veterinario: z.string().max(120).optional(),
  observaciones: z.string().max(500).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

const AnularSchema = z.object({ motivo: z.string().min(5).max(300) });

const AlertasQuery = z.object({
  dias: z.coerce.number().int().min(1).max(120).default(7),
});

const ListadoQuery = z.object({
  animalId: z.string().uuid().optional(),
  fincaId: z.string().uuid().optional(),
  soloVigentes: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const IdParam = z.object({ id: z.string().uuid('Identificador inválido') });

/**
 * Salud animal (Fase 5, primer corte).
 *
 * Lo esencial de este módulo no es registrar tratamientos —eso es una tabla— sino
 * **impedir que se venda un animal con retiro vigente**. Ese bloqueo vive en el
 * servicio de animales y consulta esta tabla.
 */
@Injectable()
export class SaludService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async crear(input: z.infer<typeof CrearSchema>, actorId: string) {
    const animal = await this.prisma.animal.findFirst({
      where: { id: input.animalId, deletedAt: null },
      select: { id: true, fincaId: true, arete: true, estado: true },
    });
    if (!animal) throw AppError.notFound('Animal no encontrado');

    if (!admiteOperaciones(animal.estado as EstadoAnimal)) {
      throw AppError.conflict(
        `El animal ${animal.arete} está en estado "${animal.estado}" y no admite tratamientos`,
      );
    }

    const iniciadoAt = new Date(input.iniciadoAt);
    if (Number.isNaN(iniciadoAt.getTime())) throw AppError.validation('Fecha de inicio inválida');
    if (iniciadoAt.getTime() > Date.now() + 60_000) {
      throw AppError.validation('El tratamiento no puede iniciar en el futuro');
    }

    const retiro = calcularRetiro({
      iniciadoAt,
      diasTratamiento: input.diasTratamiento,
      diasRetiro: input.diasRetiro,
      referencia: new Date(),
    });

    const idempotencyKey = input.idempotencyKey ?? randomUUID();

    const previo = await this.prisma.tratamiento.findUnique({
      where: { idempotencyKey },
      select: { id: true, finRetiro: true, finTratamiento: true },
    });
    if (previo) return this.formatear(previo, animal.arete, true);

    const creado = await this.prisma.$transaction(async (tx) => {
      const tratamiento = await tx.tratamiento.create({
        data: {
          fincaId: animal.fincaId,
          animalId: animal.id,
          medicamento: input.medicamento.trim(),
          principioActivo: input.principioActivo ?? null,
          dosis: input.dosis ?? null,
          via: input.via ?? null,
          diagnostico: input.diagnostico ?? null,
          motivo: input.motivo ?? null,
          iniciadoAt,
          diasTratamiento: input.diasTratamiento,
          diasRetiro: input.diasRetiro,
          finTratamiento: retiro.finTratamiento,
          finRetiro: retiro.finRetiro,
          veterinario: input.veterinario ?? null,
          observaciones: input.observaciones ?? null,
          registradoPor: actorId,
          idempotencyKey,
        },
        select: { id: true, finTratamiento: true, finRetiro: true },
      });

      await this.audit.record(
        {
          action: 'salud.tratamiento.crear',
          entity: 'tratamiento',
          entityId: tratamiento.id,
          actorId,
          after: {
            animalId: animal.id,
            arete: animal.arete,
            medicamento: input.medicamento,
            diasRetiro: input.diasRetiro,
            finRetiro: retiro.finRetiro,
          },
        },
        tx,
      );

      return tratamiento;
    });

    return this.formatear(creado, animal.arete, false);
  }

  /** Retiro vigente del animal, si lo tiene. Usado por el bloqueo de venta. */
  async retiroVigente(animalId: string, referencia: Date = new Date()) {
    const tratamientos = await this.prisma.tratamiento.findMany({
      where: {
        animalId,
        finRetiro: { gt: referencia },
        anulacion: null,
      },
      orderBy: { finRetiro: 'desc' },
      select: {
        id: true,
        medicamento: true,
        iniciadoAt: true,
        finTratamiento: true,
        finRetiro: true,
        diasRetiro: true,
      },
    });

    if (tratamientos.length === 0) return null;

    const ultimo = tratamientos[0]!;
    const evaluacion = evaluarRetiro(
      { finTratamiento: ultimo.finTratamiento, finRetiro: ultimo.finRetiro },
      referencia,
    );

    return {
      tratamientoId: ultimo.id,
      medicamento: ultimo.medicamento,
      finTratamiento: ultimo.finTratamiento,
      finRetiro: ultimo.finRetiro,
      diasRestantes: evaluacion.diasRestantes,
      bloquea: !evaluacion.puedeVenderse,
      motivo: evaluacion.motivo ?? null,
    };
  }

  async listar(filtros: {
    animalId?: string;
    fincaId?: string;
    soloVigentes?: boolean;
    limit: number;
    offset: number;
  }) {
    const where = {
      ...(filtros.animalId ? { animalId: filtros.animalId } : {}),
      ...(filtros.fincaId ? { fincaId: filtros.fincaId } : {}),
      ...(filtros.soloVigentes ? { finRetiro: { gt: new Date() }, anulacion: null } : {}),
    };

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.tratamiento.count({ where }),
      this.prisma.tratamiento.findMany({
        where,
        orderBy: { iniciadoAt: 'desc' },
        skip: filtros.offset,
        take: filtros.limit,
        include: {
          animal: { select: { arete: true } },
          anulacion: { select: { motivo: true } },
        },
      }),
    ]);

    const ahora = new Date();

    return {
      total,
      items: filas.map((t) => ({
        id: t.id,
        animalId: t.animalId,
        arete: t.animal.arete,
        medicamento: t.medicamento,
        via: t.via,
        iniciadoAt: t.iniciadoAt,
        diasTratamiento: t.diasTratamiento,
        diasRetiro: t.diasRetiro,
        finRetiro: t.finRetiro,
        retiroVigente: t.finRetiro > ahora,
        diasRestantes: Math.max(
          0,
          Math.ceil((t.finRetiro.getTime() - ahora.getTime()) / 86_400_000),
        ),
        anulado: t.anulacion !== null,
      })),
    };
  }

  async anular(tratamientoId: string, motivo: string, actorId: string) {
    const tratamiento = await this.prisma.tratamiento.findUnique({
      where: { id: tratamientoId },
      select: { id: true, anulacion: { select: { id: true } } },
    });
    if (!tratamiento) throw AppError.notFound('Tratamiento no encontrado');
    if (tratamiento.anulacion) throw AppError.conflict('El tratamiento ya estaba anulado');

    return this.prisma.$transaction(async (tx) => {
      const anulacion = await tx.tratamientoAnulacion.create({
        data: { tratamientoId, motivo: motivo.trim(), actorId },
        select: { id: true, occurredAt: true },
      });

      await this.audit.record(
        {
          action: 'salud.tratamiento.anular',
          entity: 'tratamiento',
          entityId: tratamientoId,
          actorId,
          after: { anulacionId: anulacion.id, motivo },
        },
        tx,
      );

      return { id: anulacion.id, anulado: true, occurredAt: anulacion.occurredAt };
    });
  }


  /**
   * Alertas de retiro: animales que podrán venderse en los próximos N días.
   *
   * Es la pregunta que el ganadero hace todos los días: "¿ya puedo vender este?".
   */
  async alertasRetiro(dias: number, fincaId?: string) {
    const ahora = new Date();
    const limite = new Date(ahora.getTime() + dias * 86_400_000);

    const tratamiento = await this.prisma.tratamiento.findMany({
      where: {
        finRetiro: { gte: ahora, lte: limite },
        anulacion: null,
        ...(fincaId ? { fincaId } : {}),
      },
      orderBy: { finRetiro: 'asc' },
      select: {
        id: true,
        animalId: true,
        medicamento: true,
        finRetiro: true,
        animal: { select: { arete: true } },
      },
    });

    return {
      ventanaDias: dias,
      total: tratamiento.length,
      items: tratamiento.map((t) => ({
        tratamientoId: t.id,
        animalId: t.animalId,
        arete: t.animal.arete,
        medicamento: t.medicamento,
        finRetiro: t.finRetiro,
        diasRestantes: diasHastaRetiro(t.finRetiro, ahora),
        venceHoy: diasHastaRetiro(t.finRetiro, ahora) === 0,
      })),
      aviso: 'Solo se listan retiros vigentes; un retiro vencido ya no bloquea la venta.',
    };
  }

  /** Catálogo de referencia, con su advertencia de procedencia. */
  catalogo() {
    return {
      total: CATALOGO_MEDICAMENTOS.length,
      aviso: AVISO_CATALOGO,
      items: CATALOGO_MEDICAMENTOS,
    };
  }

  private formatear(
    t: { id: string; finTratamiento: Date; finRetiro: Date },
    arete: string,
    idempotente: boolean,
  ) {
    const evaluacion = evaluarRetiro(t, new Date());
    return {
      id: t.id,
      arete,
      finTratamiento: t.finTratamiento,
      finRetiro: t.finRetiro,
      diasRestantes: evaluacion.diasRestantes,
      puedeVenderse: evaluacion.puedeVenderse,
      motivoBloqueo: evaluacion.motivo ?? null,
      idempotente,
    };
  }
}

@ApiTags('salud')
@ApiBearerAuth()
@Controller('tratamientos')
export class SaludController {
  constructor(@Inject(SaludService) private readonly salud: SaludService) {}

  @Get()
  @Require('salud', 'consultar')
  @ApiOperation({ summary: 'Lista tratamientos con su estado de retiro' })
  async listar(@Query() query: Record<string, unknown>, @CurrentUser() user: AccessTokenPayload) {
    const filtros = parseQuery(ListadoQuery, query);
    return this.salud.listar({
      ...filtros,
      fincaId: user.scope === 'global' ? filtros.fincaId : (filtros.fincaId ?? user.fincas[0]),
    });
  }


  @Get('catalogo')
  @Require('salud', 'consultar')
  @ApiOperation({
    summary: 'Catálogo de medicamentos de referencia',
    description:
      'Los días de retiro son valores declarados de referencia, no la ficha oficial del producto.',
  })
  catalogo() {
    return this.salud.catalogo();
  }

  @Get('alertas')
  @Require('salud', 'consultar')
  @ApiOperation({ summary: 'Retiros que vencen en los próximos días' })
  async alertas(@Query() query: Record<string, unknown>, @CurrentUser() user: AccessTokenPayload) {
    const { dias } = parseQuery(AlertasQuery, query);
    return this.salud.alertasRetiro(
      dias,
      user.scope === 'global' ? undefined : user.fincas[0],
    );
  }

  @Post()
  @Require('salud', 'crear')
  @ApiOperation({
    summary: 'Registra un tratamiento y calcula su periodo de retiro',
    description:
      'El fin de retiro se calcula desde el último día de tratamiento. Mientras esté vigente, el animal no puede pasar a vendido ni sacrificado.',
  })
  async crear(@Body() body: unknown, @CurrentUser() user: AccessTokenPayload) {
    const input = parseBody(CrearSchema, body);
    return this.salud.crear(input, user.sub);
  }

  @Post(':id/anular')
  @Require('salud', 'modificar')
  @ApiOperation({ summary: 'Anula un tratamiento con motivo (evento compensatorio)' })
  async anular(
    @Param() params: Record<string, string>,
    @Body() body: unknown,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    const { id } = parseParams(IdParam, params);
    const { motivo } = parseBody(AnularSchema, body);
    return this.salud.anular(id, motivo, user.sub);
  }
}

@Module({
  imports: [AuditModule],
  controllers: [SaludController],
  providers: [SaludService],
  exports: [SaludService],
})
export class SaludModule {}
