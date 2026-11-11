import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { calcularCategoria, type CategoriaCalculada } from './domain/categoria';
import {
  ESTADOS,
  admiteOperaciones,
  esTerminal,
  transicionesPosibles,
  validarTransicion,
  type EstadoAnimal,
} from './domain/estados';
import {
  CONFIG_POR_DEFECTO,
  codigoBarrasDesdeArete,
  generarArete,
  normalizarPrefijo,
  type ConfigNumeracion,
} from './domain/numeracion';

export interface FiltrosListado {
  fincaId?: string;
  estado?: EstadoAnimal;
  sexo?: 'MACHO' | 'HEMBRA';
  categoria?: string;
  loteId?: string;
  q?: string;
  incluirAnulados?: boolean;
  limit: number;
  offset: number;
}

export interface CrearAnimalInput {
  fincaId: string;
  arete?: string;
  nombre?: string;
  sexo: 'MACHO' | 'HEMBRA';
  fechaNacimiento?: string;
  pesoNacimientoKg?: number;
  razaId?: string;
  cruceRacial?: string;
  color?: string;
  caracteristicas?: string;
  procedencia?: string;
  madreId?: string;
  padreId?: string;
  tipoNacimiento?: 'SIMPLE' | 'GEMELO' | 'TRIPLE';
  estadoProductivo?: string;
  condicionCorporal?: number;
  loteId?: string;
  corral?: string;
  identificacionOficial?: string;
  observaciones?: string;
}

const CAMPOS_EDITABLES = [
  'nombre',
  'color',
  'caracteristicas',
  'procedencia',
  'estadoProductivo',
  'condicionCorporal',
  'corral',
  'identificacionOficial',
  'observaciones',
  'cruceRacial',
  'tipoNacimiento',
] as const;

/**
 * Dominio de animales (Fase 2).
 *
 * Reglas que este servicio garantiza, además de las restricciones de la base:
 *  · el arete se genera con el esquema configurado si no se envía;
 *  · cada identificador queda registrado en el historial y no se reutiliza;
 *  · el estado solo cambia por transición válida, con historial y auditoría;
 *  · la genealogía no admite ciclos ni padres incoherentes (la base refuerza
 *    sexo y fechas; aquí se impide que un animal sea ancestro de sí mismo).
 */
@Injectable()
export class AnimalesService {
  private readonly logger = new Logger(AnimalesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // ── Listado ────────────────────────────────────────────────────────────────
  async listar(filtros: FiltrosListado) {
    const condiciones: Prisma.Sql[] = [];

    if (filtros.fincaId) condiciones.push(Prisma.sql`finca_id = ${filtros.fincaId}::uuid`);
    if (filtros.estado) condiciones.push(Prisma.sql`estado = ${filtros.estado}`);
    if (filtros.sexo) condiciones.push(Prisma.sql`sexo = ${filtros.sexo}`);
    if (filtros.categoria) condiciones.push(Prisma.sql`categoria_codigo = ${filtros.categoria}`);
    if (filtros.loteId) condiciones.push(Prisma.sql`lote_id = ${filtros.loteId}::uuid`);
    if (!filtros.incluirAnulados) condiciones.push(Prisma.sql`deleted_at IS NULL`);

    if (filtros.q) {
      const patron = `%${filtros.q.trim()}%`;
      condiciones.push(
        Prisma.sql`(arete ILIKE ${patron} OR codigo_barras ILIKE ${patron} OR coalesce(nombre,'') ILIKE ${patron})`,
      );
    }

    const where =
      condiciones.length > 0 ? Prisma.sql`WHERE ${Prisma.join(condiciones, ' AND ')}` : Prisma.empty;

    const filas = await this.prisma.$queryRaw<
      Array<{
        id: string;
        arete: string;
        codigo_barras: string;
        nombre: string | null;
        sexo: string;
        fecha_nacimiento: Date | null;
        edad_meses: number | null;
        categoria_codigo: string;
        estado: string;
        lote_nombre: string | null;
        raza_nombre: string | null;
      }>
    >`
      SELECT id, arete, codigo_barras, nombre, sexo, fecha_nacimiento, edad_meses,
             categoria_codigo, estado, lote_nombre, raza_nombre
      FROM app.v_animal_resumen
      ${where}
      ORDER BY arete ASC
      LIMIT ${filtros.limit} OFFSET ${filtros.offset}
    `;

    const total = await this.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT count(*) AS total FROM app.v_animal_resumen ${where}
    `;

    return {
      total: Number(total[0]?.total ?? 0),
      limit: filtros.limit,
      offset: filtros.offset,
      items: filas.map((f) => ({
        id: f.id,
        arete: f.arete,
        codigoBarras: f.codigo_barras,
        nombre: f.nombre,
        sexo: f.sexo,
        fechaNacimiento: f.fecha_nacimiento,
        edadMeses: f.edad_meses,
        categoria: f.categoria_codigo,
        estado: f.estado,
        lote: f.lote_nombre,
        raza: f.raza_nombre,
      })),
    };
  }

  // ── Ficha ──────────────────────────────────────────────────────────────────
  async ficha(id: string) {
    const animal = await this.prisma.animal.findFirst({
      where: { id, deletedAt: null },
      include: {
        raza: { select: { id: true, codigo: true, nombre: true } },
        lote: { select: { id: true, codigo: true, nombre: true } },
        madre: { select: { id: true, arete: true, nombre: true } },
        padre: { select: { id: true, arete: true, nombre: true } },
        identificaciones: { orderBy: { vigenteDesde: 'desc' } },
        estados: { orderBy: { occurredAt: 'desc' }, take: 20 },
      },
    });

    if (!animal) throw AppError.notFound('Animal no encontrado');

    const categoria: CategoriaCalculada = calcularCategoria({
      sexo: animal.sexo as 'MACHO' | 'HEMBRA',
      fechaNacimiento: animal.fechaNacimiento,
      estadoProductivo: animal.estadoProductivo,
    });

    const crias = await this.prisma.animal.findMany({
      where: { OR: [{ madreId: id }, { padreId: id }], deletedAt: null },
      select: { id: true, arete: true, nombre: true, sexo: true, fechaNacimiento: true },
      orderBy: { fechaNacimiento: 'asc' },
    });

    return {
      id: animal.id,
      fincaId: animal.fincaId,
      arete: animal.arete,
      codigoBarras: animal.codigoBarras,
      rfid: animal.rfid,
      nombre: animal.nombre,
      sexo: animal.sexo,
      fechaNacimiento: animal.fechaNacimiento,
      edadMeses: categoria.edadMeses,
      categoria,
      pesoNacimientoKg: animal.pesoNacimientoKg ? Number(animal.pesoNacimientoKg) : null,
      raza: animal.raza,
      cruceRacial: animal.cruceRacial,
      color: animal.color,
      caracteristicas: animal.caracteristicas,
      procedencia: animal.procedencia,
      tipoNacimiento: animal.tipoNacimiento,
      estado: animal.estado,
      estadoProductivo: animal.estadoProductivo,
      condicionCorporal: animal.condicionCorporal,
      lote: animal.lote,
      corral: animal.corral,
      identificacionOficial: animal.identificacionOficial,
      observaciones: animal.observaciones,
      version: animal.version,
      createdAt: animal.createdAt,
      updatedAt: animal.updatedAt,
      genealogia: {
        madre: animal.madre,
        padre: animal.padre,
        crias,
      },
      identificaciones: animal.identificaciones.map((i) => ({
        id: i.id,
        tipo: i.tipo,
        valor: i.valor,
        vigenteDesde: i.vigenteDesde,
        vigenteHasta: i.vigenteHasta,
        estado: i.estado,
        motivo: i.motivo,
      })),
      historialEstados: animal.estados.map((e) => ({
        id: e.id,
        estadoAnterior: e.estadoAnterior,
        estadoNuevo: e.estadoNuevo,
        motivo: e.motivo,
        occurredAt: e.occurredAt,
      })),
      transicionesPosibles: transicionesPosibles(animal.estado as EstadoAnimal),
      admiteOperaciones: admiteOperaciones(animal.estado as EstadoAnimal),
    };
  }

  // ── Creación ───────────────────────────────────────────────────────────────
  async crear(input: CrearAnimalInput, actorId: string) {
    const finca = await this.prisma.finca.findFirst({
      where: { id: input.fincaId, deletedAt: null },
      select: { id: true },
    });
    if (!finca) throw AppError.validation('La finca indicada no existe');

    await this.validarReferencias({ ...input, fechaNacimiento: input.fechaNacimiento ?? null });

    if (input.fechaNacimiento && new Date(input.fechaNacimiento) > new Date()) {
      throw AppError.validation('La fecha de nacimiento no puede ser futura');
    }

    return this.prisma.$transaction((tx) => this.crearEnTransaccion(tx, finca.id, input, actorId));
  }

  /**
   * Creación dentro de una transacción existente.
   *
   * Se expone para el importador: cargar 300 animales no puede abrir 300
   * transacciones ni dejar media hacienda creada si una fila falla.
   */
  async crearEnTransaccion(
    tx: Prisma.TransactionClient,
    fincaId: string,
    input: Omit<CrearAnimalInput, 'fincaId'>,
    actorId: string,
  ): Promise<{ id: string; arete: string; codigoBarras: string; estado: string }> {
    const { arete, codigoBarras } = await this.resolverIdentificador(tx, fincaId, input.arete);

    const existente = await tx.animal.findFirst({
      where: { OR: [{ codigoBarras }, { fincaId, arete }] },
      select: { id: true, arete: true, deletedAt: true },
    });
    if (existente) {
      throw AppError.conflict(
        existente.deletedAt
          ? `El identificador ${arete} pertenece a un animal anulado: no se reutiliza (RF-ANI-11)`
          : `Ya existe un animal con el identificador ${arete}`,
      );
    }

    const animal = await tx.animal.create({
      data: {
        fincaId,
        arete,
        codigoBarras,
        nombre: input.nombre ?? null,
        sexo: input.sexo,
        fechaNacimiento: input.fechaNacimiento ? new Date(input.fechaNacimiento) : null,
        pesoNacimientoKg: input.pesoNacimientoKg ?? null,
        razaId: input.razaId ?? null,
        cruceRacial: input.cruceRacial ?? null,
        color: input.color ?? null,
        caracteristicas: input.caracteristicas ?? null,
        procedencia: input.procedencia ?? null,
        madreId: input.madreId ?? null,
        padreId: input.padreId ?? null,
        tipoNacimiento: input.tipoNacimiento ?? null,
        estadoProductivo: input.estadoProductivo ?? null,
        condicionCorporal: input.condicionCorporal ?? null,
        loteId: input.loteId ?? null,
        corral: input.corral ?? null,
        identificacionOficial: input.identificacionOficial ?? null,
        observaciones: input.observaciones ?? null,
        createdBy: actorId,
      },
      select: { id: true, arete: true, codigoBarras: true, estado: true, sexo: true },
    });

    // Historial de identificadores: son la fuente de la no reutilización.
    await tx.animalIdentificacion.createMany({
      data: [
        { animalId: animal.id, tipo: 'ARETE', valor: arete, createdBy: actorId },
        { animalId: animal.id, tipo: 'CODIGO_BARRAS', valor: codigoBarras, createdBy: actorId },
        ...(input.identificacionOficial
          ? [
              {
                animalId: animal.id,
                tipo: 'OFICIAL' as const,
                valor: input.identificacionOficial,
                createdBy: actorId,
              },
            ]
          : []),
      ],
    });

    await tx.animalEstadoHistorial.create({
      data: {
        animalId: animal.id,
        estadoAnterior: null,
        estadoNuevo: 'activo',
        motivo: 'Alta del animal',
        actorId,
      },
    });

    await this.audit.record(
      {
        action: 'animales.crear',
        entity: 'animal',
        entityId: animal.id,
        actorId,
        after: {
          arete: animal.arete,
          sexo: animal.sexo,
          fechaNacimiento: input.fechaNacimiento ?? null,
          madreId: input.madreId ?? null,
          padreId: input.padreId ?? null,
        },
      },
      tx,
    );

    return { id: animal.id, arete: animal.arete, codigoBarras: animal.codigoBarras, estado: animal.estado };
  }

  // ── Actualización ──────────────────────────────────────────────────────────
  async actualizar(id: string, cambios: Record<string, unknown>, versionEsperada: number | undefined, actorId: string) {
    const actual = await this.prisma.animal.findFirst({ where: { id, deletedAt: null } });
    if (!actual) throw AppError.notFound('Animal no encontrado');

    if (versionEsperada !== undefined && versionEsperada !== actual.version) {
      throw AppError.conflict(
        `El animal fue modificado por otra persona (versión ${actual.version}). Recargue y vuelva a intentar.`,
      );
    }

    if (esTerminal(actual.estado as EstadoAnimal)) {
      throw AppError.conflict(`El animal está en estado "${actual.estado}" y no admite modificaciones`);
    }

    const datos: Record<string, unknown> = {};
    for (const campo of CAMPOS_EDITABLES) {
      if (campo in cambios) datos[campo] = cambios[campo];
    }

    if ('madreId' in cambios || 'padreId' in cambios) {
      await this.validarReferencias({
        fincaId: actual.fincaId,
        sexo: actual.sexo as 'MACHO' | 'HEMBRA',
        madreId: (cambios.madreId as string | null) ?? undefined,
        padreId: (cambios.padreId as string | null) ?? undefined,
        fechaNacimiento: actual.fechaNacimiento,
      });
      await this.validarCiclo(id, {
        madreId: cambios.madreId as string | null | undefined,
        padreId: cambios.padreId as string | null | undefined,
      });
      if ('madreId' in cambios) datos.madreId = cambios.madreId;
      if ('padreId' in cambios) datos.padreId = cambios.padreId;
    }

    if (Object.keys(datos).length === 0) {
      throw AppError.validation('No se envió ningún campo modificable');
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.animal.update({
        where: { id },
        data: { ...datos, version: { increment: 1 }, updatedBy: actorId },
        select: { id: true, version: true },
      });

      await this.audit.record(
        {
          action: 'animales.modificar',
          entity: 'animal',
          entityId: id,
          actorId,
          before: pick(actual, Object.keys(datos)),
          after: datos,
        },
        tx,
      );

      return { id: actualizado.id, version: actualizado.version };
    });
  }

  // ── Transición de estado ───────────────────────────────────────────────────
  async cambiarEstado(id: string, hacia: EstadoAnimal, motivo: string | undefined, actorId: string) {
    const actual = await this.prisma.animal.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, estado: true, arete: true },
    });
    if (!actual) throw AppError.notFound('Animal no encontrado');

    if (!ESTADOS.includes(hacia)) throw AppError.validation(`Estado desconocido: ${hacia}`);

    const resultado = validarTransicion({
      desde: actual.estado as EstadoAnimal,
      hacia,
      motivo,
    });

    if (!resultado.valida) {
      throw resultado.codigo === 'MOTIVO_REQUERIDO'
        ? AppError.validation(resultado.mensaje)
        : AppError.conflict(resultado.mensaje);
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.animal.update({
        where: { id },
        data: { estado: hacia, version: { increment: 1 }, updatedBy: actorId },
        select: { id: true, estado: true, version: true },
      });

      await tx.animalEstadoHistorial.create({
        data: {
          animalId: id,
          estadoAnterior: actual.estado,
          estadoNuevo: hacia,
          motivo: motivo ?? null,
          actorId,
        },
      });

      await this.audit.record(
        {
          action: 'animales.estado',
          entity: 'animal',
          entityId: id,
          actorId,
          before: { estado: actual.estado },
          after: { estado: hacia, motivo: motivo ?? null },
        },
        tx,
      );

      return { id: actualizado.id, estado: actualizado.estado, version: actualizado.version };
    });
  }

  // ── Genealogía ─────────────────────────────────────────────────────────────
  async genealogia(id: string, profundidad = 4) {
    const animal = await this.prisma.animal.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, arete: true, nombre: true, sexo: true, fechaNacimiento: true, madreId: true, padreId: true },
    });
    if (!animal) throw AppError.notFound('Animal no encontrado');

    const ascendientes = await this.ascendientes(animal, profundidad);
    const descendientes = await this.descendientes(id, profundidad);

    return { animal, ascendientes, descendientes };
  }

  private async ascendientes(
    animal: { id: string; madreId: string | null; padreId: string | null },
    profundidad: number,
    nivel = 1,
  ): Promise<Array<Record<string, unknown>>> {
    if (nivel > profundidad) return [];

    const ids = [animal.madreId, animal.padreId].filter((v): v is string => Boolean(v));
    if (ids.length === 0) return [];

    const padres = await this.prisma.animal.findMany({
      where: { id: { in: ids } },
      select: { id: true, arete: true, nombre: true, sexo: true, madreId: true, padreId: true, fechaNacimiento: true },
    });

    const resultado: Array<Record<string, unknown>> = [];
    for (const padre of padres) {
      resultado.push({
        nivel,
        id: padre.id,
        arete: padre.arete,
        nombre: padre.nombre,
        sexo: padre.sexo,
        rol: padre.id === animal.madreId ? 'MADRE' : 'PADRE',
        ascendientes: await this.ascendientes(padre, profundidad, nivel + 1),
      });
    }
    return resultado;
  }

  private async descendientes(id: string, profundidad: number, nivel = 1): Promise<Array<Record<string, unknown>>> {
    if (nivel > profundidad) return [];

    const crias = await this.prisma.animal.findMany({
      where: { OR: [{ madreId: id }, { padreId: id }], deletedAt: null },
      select: { id: true, arete: true, nombre: true, sexo: true, fechaNacimiento: true },
      orderBy: { fechaNacimiento: 'asc' },
    });

    return Promise.all(
      crias.map(async (cria) => ({
        nivel,
        id: cria.id,
        arete: cria.arete,
        nombre: cria.nombre,
        sexo: cria.sexo,
        fechaNacimiento: cria.fechaNacimiento,
        descendientes: await this.descendientes(cria.id, profundidad, nivel + 1),
      })),
    );
  }

  /** Impide ciclos: el animal no puede ser ancestro de su propio padre o madre. */
  async validarCiclo(
    animalId: string,
    candidatos: { madreId?: string | null; padreId?: string | null },
  ): Promise<void> {
    const padres = [candidatos.madreId, candidatos.padreId].filter((v): v is string => Boolean(v));

    for (const padreId of padres) {
      if (padreId === animalId) {
        throw AppError.validation('Un animal no puede ser su propio padre o madre');
      }

      let actual: string | null = padreId;
      const visitados = new Set<string>();

      while (actual) {
        if (visitados.has(actual)) break; // datos previos inconsistentes: no se bloquea por eso
        visitados.add(actual);

        const fila: { madreId: string | null; padreId: string | null } | null = await this.prisma.animal.findUnique({
          where: { id: actual },
          select: { madreId: true, padreId: true },
        });
        if (!fila) break;

        for (const ancestro of [fila.madreId, fila.padreId]) {
          if (ancestro === animalId) {
            throw AppError.validation(
              'La relación crearía un ciclo genealógico: el animal sería ancestro de sí mismo (RF-REP-06)',
            );
          }
        }

        actual = fila.madreId ?? fila.padreId ?? null;
      }
    }
  }

  // ── Internos ───────────────────────────────────────────────────────────────
  private async validarReferencias(input: {
    fincaId: string;
    sexo: 'MACHO' | 'HEMBRA';
    razaId?: string;
    loteId?: string;
    madreId?: string;
    padreId?: string;
    fechaNacimiento?: string | Date | null;
  }): Promise<void> {
    if (input.razaId) {
      const raza = await this.prisma.raza.findFirst({ where: { id: input.razaId, activo: true } });
      if (!raza) throw AppError.validation('La raza indicada no existe o está inactiva');
    }

    if (input.loteId) {
      const lote = await this.prisma.lote.findFirst({ where: { id: input.loteId, fincaId: input.fincaId } });
      if (!lote) throw AppError.validation('El lote indicado no pertenece a la finca');
    }

    for (const [rol, id] of [
      ['madre', input.madreId],
      ['padre', input.padreId],
    ] as const) {
      if (!id) continue;

      const pariente = await this.prisma.animal.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, sexo: true, fincaId: true, arete: true, fechaNacimiento: true },
      });
      if (!pariente) throw AppError.validation(`El ${rol} indicado no existe`);

      const esperado = rol === 'madre' ? 'HEMBRA' : 'MACHO';
      if (pariente.sexo !== esperado) {
        throw AppError.validation(`El ${rol} debe ser ${esperado === 'HEMBRA' ? 'hembra' : 'macho'} (${pariente.arete})`);
      }
      if (pariente.fincaId !== input.fincaId) {
        throw AppError.validation(`El ${rol} pertenece a otra finca`);
      }

      // La coherencia temporal se valida aquí con un error de negocio (400) y no
      // solo en el trigger: un padre nacido después del hijo es un dato imposible.
      const nacimientoCria = input.fechaNacimiento ? new Date(input.fechaNacimiento) : null;
      if (nacimientoCria && pariente.fechaNacimiento && pariente.fechaNacimiento >= nacimientoCria) {
        throw AppError.validation(
          `El ${rol} (${pariente.arete}) nació después o el mismo día que la cría`,
        );
      }
    }
  }

  private async resolverIdentificador(
    tx: Prisma.TransactionClient,
    fincaId: string,
    areteSolicitado: string | undefined,
  ): Promise<{ arete: string; codigoBarras: string }> {
    if (areteSolicitado && areteSolicitado.trim().length > 0) {
      const arete = areteSolicitado.trim().toUpperCase();
      return { arete, codigoBarras: codigoBarrasDesdeArete(arete) };
    }

    const config = await this.leerConfigNumeracion(tx, fincaId);
    const { arete, siguiente } = generarArete(config, config.siguiente);

    await tx.configuracion.updateMany({
      where: { fincaId, clave: 'numeracion_arete', vigenteHasta: null },
      data: { valorJson: { ...config, siguiente } },
    });

    return { arete, codigoBarras: codigoBarrasDesdeArete(arete) };
  }

  private async leerConfigNumeracion(tx: Prisma.TransactionClient, fincaId: string): Promise<ConfigNumeracion> {
    const filas = await tx.$queryRaw<Array<{ valor_json: ConfigNumeracion }>>`
      SELECT valor_json FROM app.configuracion
      WHERE finca_id = ${fincaId}::uuid AND clave = 'numeracion_arete' AND vigente_hasta IS NULL
      ORDER BY version DESC
      LIMIT 1
      FOR UPDATE
    `;

    const valor = filas[0]?.valor_json;
    if (!valor) return { ...CONFIG_POR_DEFECTO, prefijo: 'HG' };

    return {
      prefijo: normalizarPrefijo(valor.prefijo ?? CONFIG_POR_DEFECTO.prefijo),
      longitud: valor.longitud ?? CONFIG_POR_DEFECTO.longitud,
      siguiente: valor.siguiente ?? 1,
      digitoVerificacion: valor.digitoVerificacion ?? true,
    };
  }
}

/** Extrae solo los campos indicados (para el "antes" de la auditoría). */
function pick<T extends object>(origen: T, campos: string[]): Record<string, unknown> {
  const resultado: Record<string, unknown> = {};
  for (const campo of campos) {
    if (campo in origen) resultado[campo] = (origen as Record<string, unknown>)[campo];
  }
  return resultado;
}
