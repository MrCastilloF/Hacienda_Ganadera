/**
 * Crecimiento del animal (Fase 4, RF-PES-10…14).
 *
 * La ganancia diaria de peso (GDP) es el indicador que decide venta, destete,
 * suplementación y descarte. Se calcula **entre pesajes reales**, nunca
 * interpolando ni promediando a ojo: si faltan datos, no hay número.
 */

export interface PuntoPeso {
  pesoKg: number;
  ocurridoAt: Date;
  origen: string;
}

export interface Tramo {
  desde: Date;
  hasta: Date;
  dias: number;
  pesoInicialKg: number;
  pesoFinalKg: number;
  gananciaKg: number;
  /** kg por día en el tramo. Puede ser negativa (pérdida). */
  gdpKgDia: number;
}

export interface ResumenCrecimiento {
  pesajes: number;
  primerPesoKg: number | null;
  ultimoPesoKg: number | null;
  ultimoPesajeEn: Date | null;
  diasTotales: number | null;
  gananciaTotalKg: number | null;
  gdpPromedioKgDia: number | null;
  tramos: Tramo[];
  /** Clasificación frente al rango esperado de la categoría. */
  clasificacion: 'SIN_DATOS' | 'INSUFICIENTE' | 'BAJO' | 'NORMAL' | 'ALTO';
  rangoEsperado: { minKgDia: number; maxKgDia: number } | null;
  motivo?: string;
}

/**
 * Rango esperado de GDP por categoría (kg/día).
 *
 * Supuesto declarado, no una verdad zootécnica universal: depende de raza,
 * pastura, suplementación y clima. Se documenta para que el ganadero pueda
 * cuestionarlo, y la clasificación se muestra siempre junto al número medido.
 */
export const RANGO_GDP_POR_CATEGORIA: Record<string, { minKgDia: number; maxKgDia: number }> = {
  TERNERO: { minKgDia: 0.4, maxKgDia: 0.8 },
  TERNERA: { minKgDia: 0.4, maxKgDia: 0.8 },
  NOVILLO: { minKgDia: 0.5, maxKgDia: 0.9 },
  NOVILLA: { minKgDia: 0.4, maxKgDia: 0.7 },
  CEBA: { minKgDia: 0.8, maxKgDia: 1.4 },
  VACA: { minKgDia: 0.0, maxKgDia: 0.3 },
  TORO: { minKgDia: 0.0, maxKgDia: 0.3 },
  SIN_CATEGORIA: { minKgDia: 0.3, maxKgDia: 0.9 },
};

/** Días entre dos fechas, redondeado a la baja (no se inventan fracciones). */
export function diasEntre(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000);
}

/**
 * Calcula el resumen de crecimiento a partir de pesajes ya ordenados.
 *
 * Reglas:
 *  · menos de dos pesajes válidos ⇒ sin GDP (no se extrapola);
 *  · dos pesajes con menos de 7 días de separación ⇒ clasificación
 *    `INSUFICIENTE`: el error de la báscula pesa más que la ganancia real;
 *  · un pesaje con fecha anterior al previo se ignora (dato inconsistente).
 */
export function resumirCrecimiento(
  puntos: readonly PuntoPeso[],
  categoria: string,
  referencia: Date = new Date(),
): ResumenCrecimiento {
  const rango = RANGO_GDP_POR_CATEGORIA[categoria] ?? null;
  const validos = [...puntos].sort((a, b) => a.ocurridoAt.getTime() - b.ocurridoAt.getTime());

  if (validos.length === 0) {
    return {
      pesajes: 0,
      primerPesoKg: null,
      ultimoPesoKg: null,
      ultimoPesajeEn: null,
      diasTotales: null,
      gananciaTotalKg: null,
      gdpPromedioKgDia: null,
      tramos: [],
      clasificacion: 'SIN_DATOS',
      rangoEsperado: rango,
      motivo: 'NO_HAY_PESAJES',
    };
  }

  const primero = validos[0]!;
  const ultimo = validos[validos.length - 1]!;
  const diasTotales = diasEntre(primero.ocurridoAt, ultimo.ocurridoAt);

  const tramos: Tramo[] = [];
  for (let i = 1; i < validos.length; i++) {
    const anterior = validos[i - 1]!;
    const actual = validos[i]!;
    const dias = diasEntre(anterior.ocurridoAt, actual.ocurridoAt);
    if (dias <= 0) continue;

    const ganancia = actual.pesoKg - anterior.pesoKg;
    tramos.push({
      desde: anterior.ocurridoAt,
      hasta: actual.ocurridoAt,
      dias,
      pesoInicialKg: anterior.pesoKg,
      pesoFinalKg: actual.pesoKg,
      gananciaKg: redondear(ganancia, 2),
      gdpKgDia: redondear(ganancia / dias, 3),
    });
  }

  if (validos.length < 2) {
    return {
      pesajes: validos.length,
      primerPesoKg: primero.pesoKg,
      ultimoPesoKg: ultimo.pesoKg,
      ultimoPesajeEn: ultimo.ocurridoAt,
      diasTotales: diasEntre(ultimo.ocurridoAt, referencia),
      gananciaTotalKg: null,
      gdpPromedioKgDia: null,
      tramos,
      clasificacion: 'INSUFICIENTE',
      rangoEsperado: rango,
      motivo: 'SE_REQUIEREN_DOS_PESAJES',
    };
  }

  const gananciaTotal = ultimo.pesoKg - primero.pesoKg;
  const gdpPromedio = diasTotales > 0 ? gananciaTotal / diasTotales : null;

  let clasificacion: ResumenCrecimiento['clasificacion'] = 'NORMAL';
  let motivo: string | undefined;

  if (diasTotales < 7 || gdpPromedio === null) {
    clasificacion = 'INSUFICIENTE';
    motivo = 'INTERVALO_MENOR_A_SIETE_DIAS';
  } else if (rango) {
    if (gdpPromedio < rango.minKgDia) clasificacion = 'BAJO';
    else if (gdpPromedio > rango.maxKgDia) clasificacion = 'ALTO';
  }

  return {
    pesajes: validos.length,
    primerPesoKg: redondear(primero.pesoKg, 2),
    ultimoPesoKg: redondear(ultimo.pesoKg, 2),
    ultimoPesajeEn: ultimo.ocurridoAt,
    diasTotales,
    gananciaTotalKg: redondear(gananciaTotal, 2),
    gdpPromedioKgDia: gdpPromedio === null ? null : redondear(gdpPromedio, 3),
    tramos,
    clasificacion,
    rangoEsperado: rango,
    ...(motivo ? { motivo } : {}),
  };
}

/**
 * Proyección lineal de peso a una fecha futura.
 *
 * Se devuelve siempre con `advertencia`: es una extrapolación, no un pronóstico
 * validado. La interfaz debe mostrarla como estimación, nunca como dato.
 */
export function proyectarPeso(
  resumen: ResumenCrecimiento,
  diasAdelante: number,
): { pesoEstimadoKg: number | null; advertencia: string | null } {
  if (resumen.gdpPromedioKgDia === null || resumen.ultimoPesoKg === null) {
    return { pesoEstimadoKg: null, advertencia: 'Sin datos suficientes para proyectar.' };
  }
  if (diasAdelante <= 0) {
    return { pesoEstimadoKg: resumen.ultimoPesoKg, advertencia: null };
  }

  const estimado = resumen.ultimoPesoKg + resumen.gdpPromedioKgDia * diasAdelante;
  return {
    pesoEstimadoKg: redondear(Math.max(0, estimado), 2),
    advertencia:
      'Proyección lineal basada en el crecimiento observado; no es un pronóstico validado.',
  };
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}
