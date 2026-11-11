import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AnimalesService } from './animales.service';

/** Columnas admitidas en la plantilla (se aceptan con o sin tildes y mayúsculas). */
const COLUMNAS = [
  'arete',
  'nombre',
  'sexo',
  'fechanacimiento',
  'raza',
  'color',
  'pesonacimientokg',
  'madrearete',
  'padrearete',
  'observaciones',
] as const;

export interface FilaImportacion {
  linea: number;
  valores: Record<string, string>;
}

export interface ErrorImportacion {
  linea: number;
  campo: string;
  mensaje: string;
  valor?: string;
}

export interface ResultadoImportacion {
  dryRun: boolean;
  resumen: {
    filas: number;
    validas: number;
    invalidas: number;
    creadas: number;
  };
  errores: ErrorImportacion[];
  previsualizacion: Array<Record<string, string | number | null>>;
  creados?: Array<{ linea: number; id: string; arete: string }>;
}

/**
 * Importador de hato (RF-IMP-01…05).
 *
 * Reglas:
 *  · `dryRun` por defecto: valida y muestra lo que haría, sin escribir nada.
 *  · La importación real es **todo o nada**: media hacienda cargada es peor que
 *    ninguna, porque nadie sabría dónde se quedó.
 *  · Cada fila creada deja su evento de auditoría dentro de la misma transacción.
 *  · Los errores se informan por línea y por campo: el operario debe poder
 *    corregir el archivo sin adivinar.
 */
@Injectable()
export class ImportadorService {
  private readonly logger = new Logger(ImportadorService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AnimalesService) private readonly animales: AnimalesService,
  ) {}

  async importar(
    input: { fincaId: string; csv: string; dryRun: boolean },
    actorId: string,
  ): Promise<ResultadoImportacion> {
    if (!input.csv || input.csv.trim().length === 0) {
      throw AppError.validation('El archivo está vacío');
    }
    if (input.csv.length > 5_000_000) {
      throw AppError.validation('El archivo supera el límite de 5 MB; divídalo en partes');
    }

    const finca = await this.prisma.finca.findFirst({
      where: { id: input.fincaId, deletedAt: null },
      select: { id: true, codigo: true },
    });
    if (!finca) throw AppError.validation('La finca indicada no existe');

    const { filas, errores: erroresEstructura } = parsearCsv(input.csv);
    if (filas.length === 0) {
      throw AppError.validation('No se encontraron filas de datos', erroresEstructura);
    }
    if (filas.length > 5_000) {
      throw AppError.validation('Máximo 5.000 filas por importación');
    }

    const errores: ErrorImportacion[] = [...erroresEstructura];
    const validas: Array<{
      linea: number;
      datos: {
        arete?: string;
        nombre?: string;
        sexo: 'MACHO' | 'HEMBRA';
        fechaNacimiento?: string;
        razaId?: string;
        color?: string;
        pesoNacimientoKg?: number;
        madreArete?: string;
        padreArete?: string;
        observaciones?: string;
      };
    }> = [];

    // ── Validación ───────────────────────────────────────────────────────────
    const razas = await this.prisma.raza.findMany({ select: { id: true, codigo: true } });
    const razasPorCodigo = new Map(razas.map((r) => [r.codigo.toUpperCase(), r.id]));

    const aretesEnArchivo = new Set<string>();
    const aretesEnBase = new Set(
      (
        await this.prisma.animal.findMany({
          where: { fincaId: finca.id },
          select: { arete: true },
        })
      ).map((a) => a.arete.toUpperCase()),
    );

    for (const fila of filas) {
      const v = fila.valores;
      const erroresFila: ErrorImportacion[] = [];

      const sexo = (v.sexo ?? '').trim().toUpperCase();
      if (!['MACHO', 'HEMBRA'].includes(sexo)) {
        erroresFila.push({
          linea: fila.linea,
          campo: 'sexo',
          mensaje: 'Debe ser MACHO o HEMBRA',
          valor: v.sexo,
        });
      }

      const fecha = (v.fechanacimiento ?? '').trim();
      if (fecha) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
          erroresFila.push({
            linea: fila.linea,
            campo: 'fechaNacimiento',
            mensaje: 'Formato esperado AAAA-MM-DD',
            valor: fecha,
          });
        } else if (new Date(fecha) > new Date()) {
          erroresFila.push({
            linea: fila.linea,
            campo: 'fechaNacimiento',
            mensaje: 'La fecha no puede ser futura',
            valor: fecha,
          });
        }
      }

      let razaId: string | undefined;
      const razaCodigo = (v.raza ?? '').trim().toUpperCase();
      if (razaCodigo) {
        razaId = razasPorCodigo.get(razaCodigo);
        if (!razaId) {
          erroresFila.push({
            linea: fila.linea,
            campo: 'raza',
            mensaje: `Raza desconocida: ${razaCodigo}`,
            valor: razaCodigo,
          });
        }
      }

      let peso: number | undefined;
      const pesoTexto = (v.pesonacimientokg ?? '').trim();
      if (pesoTexto) {
        const numero = Number(pesoTexto.replace(',', '.'));
        if (!Number.isFinite(numero) || numero <= 0 || numero > 200) {
          erroresFila.push({
            linea: fila.linea,
            campo: 'pesoNacimientoKg',
            mensaje: 'Peso inválido (0 < peso ≤ 200 kg)',
            valor: pesoTexto,
          });
        } else {
          peso = numero;
        }
      }

      const arete = (v.arete ?? '').trim().toUpperCase();
      if (arete) {
        if (!/^[A-Z0-9-]{3,24}$/.test(arete)) {
          erroresFila.push({
            linea: fila.linea,
            campo: 'arete',
            mensaje: 'El arete admite letras, números y guiones (3 a 24)',
            valor: arete,
          });
        } else if (aretesEnArchivo.has(arete)) {
          erroresFila.push({
            linea: fila.linea,
            campo: 'arete',
            mensaje: 'Arete repetido dentro del archivo',
            valor: arete,
          });
        } else if (aretesEnBase.has(arete)) {
          erroresFila.push({
            linea: fila.linea,
            campo: 'arete',
            mensaje: 'El arete ya existe en la hacienda',
            valor: arete,
          });
        } else {
          aretesEnArchivo.add(arete);
        }
      }

      for (const [campo, etiqueta] of [
        ['madrearete', 'madreArete'],
        ['padrearete', 'padreArete'],
      ] as const) {
        const valor = (v[campo] ?? '').trim().toUpperCase();
        if (!valor) continue;
        if (valor === arete) {
          erroresFila.push({
            linea: fila.linea,
            campo: etiqueta,
            mensaje: 'Un animal no puede ser su propio padre o madre',
            valor,
          });
        }
      }

      if (erroresFila.length > 0) {
        errores.push(...erroresFila);
        continue;
      }

      validas.push({
        linea: fila.linea,
        datos: {
          ...(arete ? { arete } : {}),
          ...(v.nombre?.trim() ? { nombre: v.nombre.trim() } : {}),
          sexo: sexo as 'MACHO' | 'HEMBRA',
          ...(fecha ? { fechaNacimiento: fecha } : {}),
          ...(razaId ? { razaId } : {}),
          ...(v.color?.trim() ? { color: v.color.trim() } : {}),
          ...(peso ? { pesoNacimientoKg: peso } : {}),
          ...(v.madrearete?.trim() ? { madreArete: v.madrearete.trim().toUpperCase() } : {}),
          ...(v.padrearete?.trim() ? { padreArete: v.padrearete.trim().toUpperCase() } : {}),
          ...(v.observaciones?.trim() ? { observaciones: v.observaciones.trim() } : {}),
        },
      });
    }

    const previsualizacion = validas.slice(0, 10).map((fila) => ({
      linea: fila.linea,
      arete: fila.datos.arete ?? '(se genera)',
      nombre: fila.datos.nombre ?? null,
      sexo: fila.datos.sexo,
      fechaNacimiento: fila.datos.fechaNacimiento ?? null,
      categoria: null,
    }));

    // Validación de referencias entre filas: madre/padre deben existir en la base
    // o en el mismo archivo, y tener el sexo correcto.
    if (validas.length > 0) {
      const aretesReferenciados = new Set<string>();
      for (const fila of validas) {
        if (fila.datos.madreArete) aretesReferenciados.add(fila.datos.madreArete);
        if (fila.datos.padreArete) aretesReferenciados.add(fila.datos.padreArete);
      }

      const existentes = await this.prisma.animal.findMany({
        where: { fincaId: finca.id, arete: { in: [...aretesReferenciados] } },
        select: { arete: true, sexo: true },
      });
      const mapaExistentes = new Map(existentes.map((a) => [a.arete.toUpperCase(), a.sexo]));
      const mapaArchivo = new Map(validas.filter((f) => f.datos.arete).map((f) => [f.datos.arete!, f.datos.sexo]));

      for (const fila of validas) {
        for (const [campo, areteRef, esperado] of [
          ['madreArete', fila.datos.madreArete, 'HEMBRA'],
          ['padreArete', fila.datos.padreArete, 'MACHO'],
        ] as const) {
          if (!areteRef) continue;
          const sexoRef = mapaExistentes.get(areteRef) ?? mapaArchivo.get(areteRef);
          if (!sexoRef) {
            errores.push({
              linea: fila.linea,
              campo,
              mensaje: `El arete ${areteRef} no existe en la hacienda ni en el archivo`,
              valor: areteRef,
            });
          } else if (sexoRef !== esperado) {
            errores.push({
              linea: fila.linea,
              campo,
              mensaje: `El arete ${areteRef} es ${sexoRef} y debería ser ${esperado}`,
              valor: areteRef,
            });
          }
        }
      }
    }

    const invalidas = new Set(errores.map((e) => e.linea)).size;
    const resumen = {
      filas: filas.length,
      validas: validas.length,
      invalidas,
      creadas: 0,
    };

    if (input.dryRun || validas.length === 0) {
      return {
        dryRun: input.dryRun,
        resumen,
        errores: errores.slice(0, 200),
        previsualizacion,
      };
    }

    if (errores.length > 0) {
      // Todo o nada: si hay filas inválidas no se escribe nada. El operario
      // corrige el archivo y vuelve a intentarlo.
      return { dryRun: true, resumen, errores: errores.slice(0, 200), previsualizacion };
    }

    // ── Escritura ────────────────────────────────────────────────────────────
    const creados = await this.prisma.$transaction(async (tx) => {
      const resultado: Array<{ linea: number; id: string; arete: string }> = [];
      const idPorArete = new Map<string, string>();

      for (const fila of validas) {
        const { madreArete: _madre, padreArete: _padre, ...resto } = fila.datos;

        const creado = await this.animales.crearEnTransaccion(tx, finca.id, resto, actorId);

        resultado.push({ linea: fila.linea, id: creado.id, arete: creado.arete });
        idPorArete.set(creado.arete.toUpperCase(), creado.id);
      }

      // Segunda pasada: enlazar genealogía ya con todos los animales creados.
      for (const fila of validas) {
        if (!fila.datos.madreArete && !fila.datos.padreArete) continue;

        const id = idPorArete.get((fila.datos.arete ?? '').toUpperCase());
        if (!id) continue;

        const madreId = fila.datos.madreArete
          ? await this.resolverIdPorArete(tx, finca.id, fila.datos.madreArete, idPorArete)
          : null;
        const padreId = fila.datos.padreArete
          ? await this.resolverIdPorArete(tx, finca.id, fila.datos.padreArete, idPorArete)
          : null;

        if (!madreId && !padreId) continue;

        await tx.animal.update({
          where: { id },
          data: {
            madreId: madreId ?? null,
            padreId: padreId ?? null,
            version: { increment: 1 },
            updatedBy: actorId,
          },
        });

        await this.audit.record(
          {
            action: 'animales.importar.genealogia',
            entity: 'animal',
            entityId: id,
            actorId,
            after: { madreId, padreId },
          },
          tx,
        );
      }

      return resultado;
    });

    this.logger.log({ fincaId: finca.id, creados: creados.length }, 'Importación de hato completada');

    return {
      dryRun: false,
      resumen: { ...resumen, creadas: creados.length },
      errores: [],
      previsualizacion,
      creados,
    };
  }

  private async resolverIdPorArete(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    fincaId: string,
    arete: string,
    idPorArete: Map<string, string>,
  ): Promise<string | null> {
    const desdeArchivo = idPorArete.get(arete.toUpperCase());
    if (desdeArchivo) return desdeArchivo;

    const fila = await tx.animal.findFirst({
      where: { fincaId, arete: { equals: arete, mode: 'insensitive' } },
      select: { id: true },
    });
    return fila?.id ?? null;
  }
}

// ── Parseo de CSV ────────────────────────────────────────────────────────────

const DIACRITICOS = /[\u0300-\u036f]/g;

function normalizarCabecera(texto: string): string {
  return texto
    .trim()
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Detecta coma o punto y coma según la cabecera. */
function detectarDelimitador(cabecera: string): string {
  const comas = (cabecera.match(/,/g) ?? []).length;
  const puntosYComa = (cabecera.match(/;/g) ?? []).length;
  return puntosYComa > comas ? ';' : ',';
}

/** Divide una línea respetando comillas dobles ("" como escape). */
function dividirLinea(linea: string, delimitador: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let entreComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]!;

    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
      continue;
    }

    if (c === delimitador && !entreComillas) {
      campos.push(actual);
      actual = '';
      continue;
    }

    actual += c;
  }

  campos.push(actual);
  return campos.map((c) => c.trim());
}

export function parsearCsv(csv: string): { filas: FilaImportacion[]; errores: ErrorImportacion[] } {
  const errores: ErrorImportacion[] = [];
  const lineas = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lineas.length < 2) {
    return {
      filas: [],
      errores: [{ linea: 1, campo: 'archivo', mensaje: 'El archivo debe tener cabecera y al menos una fila' }],
    };
  }

  const delimitador = detectarDelimitador(lineas[0]!);
  const cabeceras = dividirLinea(lineas[0]!, delimitador).map(normalizarCabecera);

  const faltantes = ['sexo'].filter((c) => !cabeceras.includes(c));
  if (faltantes.length > 0) {
    errores.push({
      linea: 1,
      campo: 'cabecera',
      mensaje: `Falta la columna obligatoria: ${faltantes.join(', ')}`,
    });
    return { filas: [], errores };
  }

  const desconocidas = cabeceras.filter((c) => c && !COLUMNAS.includes(c as (typeof COLUMNAS)[number]));
  for (const columna of desconocidas) {
    errores.push({
      linea: 1,
      campo: 'cabecera',
      mensaje: `Columna desconocida: ${columna} (se ignorará)`,
    });
  }

  const filas: FilaImportacion[] = [];

  for (let i = 1; i < lineas.length; i++) {
    const valoresCrudos = dividirLinea(lineas[i]!, delimitador);
    if (valoresCrudos.every((v) => v.length === 0)) continue;

    const valores: Record<string, string> = {};
    cabeceras.forEach((cabecera, indice) => {
      if (cabecera) valores[cabecera] = valoresCrudos[indice] ?? '';
    });

    filas.push({ linea: i + 1, valores });
  }

  return { filas, errores };
}

export const PLANTILLA_CSV = `arete,nombre,sexo,fechaNacimiento,raza,color,pesoNacimientoKg,madreArete,padreArete,observaciones
HG0000014,Lucero,HEMBRA,2024-03-15,BRAHMAN,Colorado,34.5,,
HG0000021,Relámpago,MACHO,2024-04-02,NELORE,Negro,38,,HG0000014,Ingreso por compra
`;
