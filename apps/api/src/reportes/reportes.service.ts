import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { calcularCategoria } from '../animales/domain/categoria';
import {
  RANGO_GDP_POR_CATEGORIA,
  proyectarPeso,
  resumirCrecimiento,
  type PuntoPeso,
} from '../animales/domain/crecimiento';

/**
 * Reportes de crecimiento (Fase 4).
 *
 * Se calculan sobre pesajes reales, excluyendo duplicados y anulados: un peso
 * anulado no debe mover la curva de un animal.
 */
@Injectable()
export class ReportesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async crecimientoPorFinca(filtros: {
    fincaId?: string;
    categoria?: string;
    soloBajo?: boolean;
    limit: number;
    offset: number;
  }) {
    const animales = await this.prisma.animal.findMany({
      where: {
        deletedAt: null,
        ...(filtros.fincaId ? { fincaId: filtros.fincaId } : {}),
      },
      select: {
        id: true,
        arete: true,
        nombre: true,
        sexo: true,
        fechaNacimiento: true,
        estadoProductivo: true,
        estado: true,
        pesajes: {
          where: { duplicateOf: null, anulacion: null },
          select: { pesoKg: true, ocurridoAt: true, origen: true },
          orderBy: { ocurridoAt: 'asc' },
        },
      },
    });

    const filas = animales.map((animal) => {
      const categoria = calcularCategoria({
        sexo: animal.sexo as 'MACHO' | 'HEMBRA',
        fechaNacimiento: animal.fechaNacimiento,
        estadoProductivo: animal.estadoProductivo,
      }).codigo;

      const puntos: PuntoPeso[] = animal.pesajes.map((p) => ({
        pesoKg: Number(p.pesoKg),
        ocurridoAt: p.ocurridoAt,
        origen: p.origen,
      }));

      const resumen = resumirCrecimiento(puntos, categoria);

      return {
        animalId: animal.id,
        arete: animal.arete,
        nombre: animal.nombre,
        categoria,
        estado: animal.estado,
        pesajes: resumen.pesajes,
        ultimoPesoKg: resumen.ultimoPesoKg,
        gdpKgDia: resumen.gdpPromedioKgDia,
        clasificacion: resumen.clasificacion,
        rangoEsperado: resumen.rangoEsperado,
        diasTotales: resumen.diasTotales,
        motivo: resumen.motivo ?? null,
      };
    });

    const filtradas = filas
      .filter((f) => (filtros.categoria ? f.categoria === filtros.categoria : true))
      .filter((f) => (filtros.soloBajo ? f.clasificacion === 'BAJO' : true))
      .sort((a, b) => {
        // Los animales con GDP bajo primero: son los que exigen acción.
        const orden = { BAJO: 0, INSUFICIENTE: 1, NORMAL: 2, ALTO: 3, SIN_DATOS: 4 } as const;
        const diferencia = orden[a.clasificacion] - orden[b.clasificacion];
        if (diferencia !== 0) return diferencia;
        return (a.gdpKgDia ?? 0) - (b.gdpKgDia ?? 0);
      });

    return {
      total: filtradas.length,
      resumen: {
        conDatos: filas.filter((f) => f.clasificacion !== 'SIN_DATOS' && f.clasificacion !== 'INSUFICIENTE').length,
        bajos: filas.filter((f) => f.clasificacion === 'BAJO').length,
        sinDatos: filas.filter((f) => f.clasificacion === 'SIN_DATOS').length,
        gdpPromedioKgDia: promedio(
          filas.map((f) => f.gdpKgDia).filter((v): v is number => v !== null),
        ),
      },
      rangosPorCategoria: RANGO_GDP_POR_CATEGORIA,
      items: filtradas.slice(filtros.offset, filtros.offset + filtros.limit),
    };
  }

  async crecimientoDeAnimal(animalId: string, diasProyeccion = 30) {
    const animal = await this.prisma.animal.findFirst({
      where: { id: animalId, deletedAt: null },
      select: {
        id: true,
        arete: true,
        nombre: true,
        sexo: true,
        fechaNacimiento: true,
        estadoProductivo: true,
        pesoNacimientoKg: true,
        pesajes: {
          where: { duplicateOf: null, anulacion: null },
          select: { pesoKg: true, ocurridoAt: true, origen: true },
          orderBy: { ocurridoAt: 'asc' },
        },
      },
    });

    if (!animal) return null;

    const categoria = calcularCategoria({
      sexo: animal.sexo as 'MACHO' | 'HEMBRA',
      fechaNacimiento: animal.fechaNacimiento,
      estadoProductivo: animal.estadoProductivo,
    }).codigo;

    const puntos: PuntoPeso[] = animal.pesajes.map((p) => ({
      pesoKg: Number(p.pesoKg),
      ocurridoAt: p.ocurridoAt,
      origen: p.origen,
    }));

    const resumen = resumirCrecimiento(puntos, categoria);

    return {
      animal: {
        id: animal.id,
        arete: animal.arete,
        nombre: animal.nombre,
        categoria,
        pesoNacimientoKg: animal.pesoNacimientoKg ? Number(animal.pesoNacimientoKg) : null,
      },
      resumen,
      curva: puntos.map((p) => ({ fecha: p.ocurridoAt, pesoKg: p.pesoKg, origen: p.origen })),
      proyeccion: proyectarPeso(resumen, diasProyeccion),
    };
  }
}

function promedio(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const suma = valores.reduce((a, b) => a + b, 0);
  return Math.round((suma / valores.length) * 1000) / 1000;
}
