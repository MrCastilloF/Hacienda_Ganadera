import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { admiteOperaciones, type EstadoAnimal } from '../animales/domain/estados';
import {
  FRAME_CONFIG_POR_DEFECTO,
  SampleBuffer,
  crearSimulador,
  evaluarEstabilidad,
  obtenerAdaptador,
  ESTABILIDAD_POR_DEFECTO,
  type ModoSimulacion,
  type StabilityConfig,
} from '@hacienda/scale-protocols';

export type OrigenPesaje = 'FIELD' | 'SIMULATOR' | 'IMPORT' | 'MANUAL';

export interface CrearPesajeInput {
  animalId: string;
  basculaId?: string;
  bridgeId?: string;
  pesoKg: number;
  tipo?: 'NACIMIENTO' | 'DESTETE' | 'CONTROL' | 'ENTRADA' | 'SALIDA' | 'OTRO';
  ocurridoAt?: string;
  observaciones?: string;
  origen: OrigenPesaje;
  tramaCruda?: string;
  idempotencyKey: string;
}

export interface PesajeCreado {
  id: string;
  animalId: string;
  arete: string;
  pesoKg: number;
  ocurridoAt: Date;
  origen: OrigenPesaje;
  duplicado: boolean;
  duplicateOf: string | null;
  idempotente: boolean;
  edadDias: number | null;
}

/** Ventana de deduplicación (HAL-23): mismo animal, misma báscula. */
const VENTANA_DEDUPE_MS = 60_000;

/**
 * Registro de pesajes (RF-PES-01…09).
 *
 * Reglas que garantiza este servicio:
 *  · **Inmutabilidad**: un pesaje no se actualiza ni se borra; la base lo impide.
 *  · **Idempotencia**: el mismo `idempotencyKey` devuelve el mismo pesaje, no uno nuevo.
 *  · **Deduplicación**: un doble escaneo dentro de la ventana se marca como
 *    `duplicate_of` en lugar de crear un segundo registro.
 *  · **Estado del animal**: no se pesa un animal vendido, fallecido o sacrificado.
 *  · **Origen explícito**: FIELD, SIMULATOR, IMPORT o MANUAL, siempre declarado.
 */
@Injectable()
export class PesajesService {
  private readonly logger = new Logger(PesajesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async crear(input: CrearPesajeInput, actorId: string): Promise<PesajeCreado> {
    // Idempotencia: un reintento de red no puede duplicar un pesaje.
    const previo = await this.prisma.pesaje.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { animal: { select: { arete: true } } },
    });

    if (previo) {
      return {
        id: previo.id,
        animalId: previo.animalId,
        arete: previo.animal.arete,
        pesoKg: Number(previo.pesoKg),
        ocurridoAt: previo.ocurridoAt,
        origen: previo.origen as OrigenPesaje,
        duplicado: Boolean(previo.duplicateOf),
        duplicateOf: previo.duplicateOf,
        idempotente: true,
        edadDias: previo.edadDias,
      };
    }

    const animal = await this.prisma.animal.findFirst({
      where: { id: input.animalId, deletedAt: null },
      select: { id: true, fincaId: true, arete: true, estado: true, fechaNacimiento: true },
    });
    if (!animal) throw AppError.notFound('Animal no encontrado');

    if (!admiteOperaciones(animal.estado as EstadoAnimal)) {
      throw AppError.conflict(
        `El animal ${animal.arete} está en estado "${animal.estado}" y no admite pesajes`,
      );
    }

    let bascula: { id: string; minKg: number; maxKg: number } | null = null;
    if (input.basculaId) {
      const fila = await this.prisma.bascula.findFirst({
        where: { id: input.basculaId, fincaId: animal.fincaId, activa: true },
        select: { id: true, minKg: true, maxKg: true },
      });
      if (!fila) throw AppError.validation('La báscula indicada no existe o no está activa en esta finca');
      bascula = { id: fila.id, minKg: Number(fila.minKg), maxKg: Number(fila.maxKg) };
    }

    if (input.pesoKg <= 0) throw AppError.validation('El peso debe ser mayor que cero');
    if (bascula && (input.pesoKg < bascula.minKg || input.pesoKg > bascula.maxKg)) {
      throw AppError.validation(
        `El peso ${input.pesoKg} kg está fuera del rango de la báscula (${bascula.minKg}–${bascula.maxKg} kg)`,
      );
    }

    const ocurridoAt = input.ocurridoAt ? new Date(input.ocurridoAt) : new Date();
    if (Number.isNaN(ocurridoAt.getTime())) throw AppError.validation('Fecha de pesaje inválida');
    if (ocurridoAt.getTime() > Date.now() + 60_000) {
      throw AppError.validation('El pesaje no puede tener fecha futura');
    }

    // Deduplicación por ventana: mismo animal y misma báscula.
    let duplicateOf: string | null = null;
    if (bascula) {
      const vecino = await this.prisma.pesaje.findFirst({
        where: {
          animalId: animal.id,
          basculaId: bascula.id,
          duplicateOf: null,
          ocurridoAt: {
            gte: new Date(ocurridoAt.getTime() - VENTANA_DEDUPE_MS),
            lte: new Date(ocurridoAt.getTime() + VENTANA_DEDUPE_MS),
          },
        },
        select: { id: true },
        orderBy: { ocurridoAt: 'desc' },
      });
      duplicateOf = vecino?.id ?? null;
    }

    const edadDias = calcularEdadDias(animal.fechaNacimiento, ocurridoAt);

    const creado = await this.prisma.$transaction(async (tx) => {
      const pesaje = await tx.pesaje.create({
        data: {
          fincaId: animal.fincaId,
          animalId: animal.id,
          basculaId: bascula?.id ?? null,
          bridgeId: input.bridgeId ?? null,
          pesoKg: input.pesoKg,
          tipo: input.tipo ?? 'CONTROL',
          ocurridoAt,
          registradoPor: actorId,
          edadDias,
          observaciones: input.observaciones ?? null,
          origen: input.origen,
          duplicateOf,
          tramaCruda: input.tramaCruda ?? null,
          idempotencyKey: input.idempotencyKey,
        },
        select: { id: true, pesoKg: true, ocurridoAt: true, origen: true },
      });

      await this.audit.record(
        {
          action: duplicateOf ? 'pesajes.crear.duplicado' : 'pesajes.crear',
          entity: 'pesaje',
          entityId: pesaje.id,
          actorId,
          after: {
            animalId: animal.id,
            arete: animal.arete,
            pesoKg: input.pesoKg,
            origen: input.origen,
            basculaId: bascula?.id ?? null,
            duplicateOf,
            ...(input.origen === 'SIMULATOR' ? { simulado: true } : {}),
          },
        },
        tx,
      );

      return pesaje;
    });

    if (input.origen === 'SIMULATOR') {
      this.logger.warn({ pesajeId: creado.id }, 'Pesaje registrado con datos SIMULADOS (origen=SIMULATOR)');
    }

    return {
      id: creado.id,
      animalId: animal.id,
      arete: animal.arete,
      pesoKg: Number(creado.pesoKg),
      ocurridoAt: creado.ocurridoAt,
      origen: creado.origen as OrigenPesaje,
      duplicado: Boolean(duplicateOf),
      duplicateOf,
      idempotente: false,
      edadDias,
    };
  }


  /**
   * Anula un pesaje con motivo (evento compensatorio).
   *
   * El pesaje original permanece visible: no se borra ni se modifica. Solo deja
   * de contar en los cálculos de crecimiento, y la anulación queda auditada con
   * su responsable y su razón.
   */
  async anular(pesajeId: string, motivo: string, actorId: string): Promise<{
    id: string;
    anulado: true;
    motivo: string;
    occurredAt: Date;
  }> {
    const pesaje = await this.prisma.pesaje.findUnique({
      where: { id: pesajeId },
      select: { id: true, animalId: true, pesoKg: true, anulacion: { select: { id: true } } },
    });
    if (!pesaje) throw AppError.notFound('Pesaje no encontrado');

    if (pesaje.anulacion) {
      throw AppError.conflict('El pesaje ya estaba anulado');
    }

    const anulacion = await this.prisma.$transaction(async (tx) => {
      const creada = await tx.pesajeAnulacion.create({
        data: { pesajeId, motivo: motivo.trim(), actorId },
        select: { id: true, motivo: true, occurredAt: true },
      });

      await this.audit.record(
        {
          action: 'pesajes.anular',
          entity: 'pesaje',
          entityId: pesajeId,
          actorId,
          before: { pesoKg: Number(pesaje.pesoKg) },
          after: { anulacionId: creada.id, motivo: creada.motivo },
        },
        tx,
      );

      return creada;
    });

    return { id: anulacion.id, anulado: true, motivo: anulacion.motivo, occurredAt: anulacion.occurredAt };
  }

  async listar(filtros: {
    animalId?: string;
    fincaId?: string;
    desde?: Date;
    hasta?: Date;
    limit: number;
    offset: number;
  }) {
    const where = {
      ...(filtros.animalId ? { animalId: filtros.animalId } : {}),
      ...(filtros.fincaId ? { fincaId: filtros.fincaId } : {}),
      ...(filtros.desde || filtros.hasta
        ? {
            ocurridoAt: {
              ...(filtros.desde ? { gte: filtros.desde } : {}),
              ...(filtros.hasta ? { lte: filtros.hasta } : {}),
            },
          }
        : {}),
    };

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.pesaje.count({ where }),
      this.prisma.pesaje.findMany({
        where,
        orderBy: { ocurridoAt: 'desc' },
        skip: filtros.offset,
        take: filtros.limit,
        include: {
          animal: { select: { arete: true } },
          bascula: { select: { nombre: true } },
          anulacion: { select: { motivo: true, occurredAt: true } },
        },
      }),
    ]);

    return {
      total,
      items: filas.map((p) => ({
        id: p.id,
        animalId: p.animalId,
        arete: p.animal.arete,
        pesoKg: Number(p.pesoKg),
        tipo: p.tipo,
        ocurridoAt: p.ocurridoAt,
        origen: p.origen,
        bascula: p.bascula?.nombre ?? null,
        duplicado: Boolean(p.duplicateOf),
        anulado: p.anulacion !== null,
        motivoAnulacion: p.anulacion?.motivo ?? null,
        edadDias: p.edadDias,
      })),
    };
  }

  /** Último peso registrado del animal, para mostrar la variación al pesar. */
  async ultimoPeso(animalId: string) {
    const ultimo = await this.prisma.pesaje.findFirst({
      where: { animalId, duplicateOf: null },
      orderBy: { ocurridoAt: 'desc' },
      select: { id: true, pesoKg: true, ocurridoAt: true, origen: true },
    });

    if (!ultimo) return { anterior: null, dias: null, diferenciaKg: null };

    return {
      anterior: {
        id: ultimo.id,
        pesoKg: Number(ultimo.pesoKg),
        ocurridoAt: ultimo.ocurridoAt,
        origen: ultimo.origen,
      },
      dias: null,
      diferenciaKg: null,
    };
  }

  /**
   * Pesaje simulado de punta a punta.
   *
   * Ejecuta el mismo camino que un pesaje real —adaptador → estabilidad →
   * registro— pero con tramas generadas. El resultado se guarda con
   * `origen = SIMULATOR` y la interfaz lo muestra como simulado (INV-08):
   * es la forma de probar la cadena sin hardware, sin mentir sobre el origen.
   */
  async simular(
    input: {
      animalId: string;
      basculaId?: string;
      pesoBaseKg: number;
      modo: ModoSimulacion;
      tipo?: CrearPesajeInput['tipo'];
    },
    actorId: string,
  ) {
    const adaptador = obtenerAdaptador('generic-ascii');
    if (!adaptador) throw AppError.internal('El adaptador ASCII no está registrado');

    const simulador = crearSimulador({ pesoBaseKg: input.pesoBaseKg, modo: input.modo, semilla: 2026 });
    const buffer = new SampleBuffer(200);
    const tramas: string[] = [];
    const pesos: number[] = [];

    // Se emulan 15 lecturas seguidas, como un puerto serie durante ~1,2 s.
    for (let i = 0; i < 15; i++) {
      const trama = simulador.siguienteTrama();
      if (trama === null) continue;
      tramas.push(trama);

      const lectura = adaptador.parse(trama, FRAME_CONFIG_POR_DEFECTO);
      if (lectura) {
        pesos.push(lectura.pesoKg);
        buffer.push(lectura.pesoKg, new Date(Date.now() - (15 - i) * 90));
      }
    }

    const config: StabilityConfig = ESTABILIDAD_POR_DEFECTO;
    const estabilidad = evaluarEstabilidad(buffer.all(), config, new Date());

    if (!estabilidad.estable || estabilidad.pesoKg === null) {
      return {
        creado: false,
        motivo: estabilidad.motivo ?? 'SIN_LECTURA_ESTABLE',
        diagnostico: {
          tramas: tramas.length,
          muestras: estabilidad.muestras,
          dispersionKg: estabilidad.dispersionKg,
          pesoPromedioKg: null,
        },
        aviso: 'Datos SIMULADOS: no se registró ningún pesaje porque el peso no fue estable.',
      };
    }

    const pesaje = await this.crear(
      {
        animalId: input.animalId,
        ...(input.basculaId ? { basculaId: input.basculaId } : {}),
        pesoKg: estabilidad.pesoKg,
        ...(input.tipo ? { tipo: input.tipo } : {}),
        origen: 'SIMULATOR',
        tramaCruda: tramas[tramas.length - 1] ?? '',
        idempotencyKey: crypto.randomUUID(),
      },
      actorId,
    );

    return {
      creado: true,
      pesaje,
      diagnostico: {
        tramas: tramas.length,
        muestras: estabilidad.muestras,
        dispersionKg: estabilidad.dispersionKg,
        pesoPromedioKg: estabilidad.pesoKg,
      },
      aviso: 'Datos SIMULADOS: este pesaje no proviene de una báscula física.',
    };
  }
}

function calcularEdadDias(fechaNacimiento: Date | null, referencia: Date): number | null {
  if (!fechaNacimiento) return null;
  const dias = Math.floor((referencia.getTime() - fechaNacimiento.getTime()) / 86_400_000);
  return dias >= 0 ? dias : null;
}
