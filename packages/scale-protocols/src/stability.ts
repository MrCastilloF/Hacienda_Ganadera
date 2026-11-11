/**
 * Detección de peso estable (RF-BAS-05).
 *
 * Regla: en la ventana de tiempo configurada debe haber al menos N muestras y la
 * diferencia entre la mayor y la menor debe ser menor o igual a la tolerancia.
 * El peso aceptado es el promedio de la ventana.
 *
 * No se usa "la última lectura": un animal que se mueve produce picos y el
 * operario terminaría registrando un peso que nunca existió de forma estable.
 */
export interface StabilityConfig {
  toleranceKg: number;
  windowMs: number;
  minSamples: number;
}

export interface Sample {
  pesoKg: number;
  recibidoEn: Date;
}

export interface StabilityResult {
  estable: boolean;
  /** Peso a registrar: promedio de la ventana cuando hay estabilidad. */
  pesoKg: number | null;
  muestras: number;
  /** Dispersión observada (max − min) en la ventana. */
  dispersionKg: number | null;
  motivo?: 'POCAS_MUESTRAS' | 'FUERA_DE_TOLERANCIA' | 'VENTANA_INCOMPLETA';
}

export const STABILITY_POR_DEFECTO: StabilityConfig = {
  toleranceKg: 0.5,
  windowMs: 1200,
  minSamples: 5,
};

export function evaluarEstabilidad(
  muestras: readonly Sample[],
  config: StabilityConfig = STABILITY_POR_DEFECTO,
  ahora: Date = new Date(),
): StabilityResult {
  const enVentana = muestras.filter((m) => ahora.getTime() - m.recibidoEn.getTime() <= config.windowMs);

  if (enVentana.length < config.minSamples) {
    return {
      estable: false,
      pesoKg: null,
      muestras: enVentana.length,
      dispersionKg: null,
      motivo: 'POCAS_MUESTRAS',
    };
  }

  const pesos = enVentana.map((m) => m.pesoKg);
  const max = Math.max(...pesos);
  const min = Math.min(...pesos);
  const dispersion = redondear(max - min, 3);

  if (dispersion > config.toleranceKg) {
    return {
      estable: false,
      pesoKg: null,
      muestras: enVentana.length,
      dispersionKg: dispersion,
      motivo: 'FUERA_DE_TOLERANCIA',
    };
  }

  const primera = enVentana[0]!.recibidoEn.getTime();
  const ultima = enVentana[enVentana.length - 1]!.recibidoEn.getTime();
  if (ultima - primera < config.windowMs * 0.5) {
    // Muestras suficientes pero en un intervalo demasiado corto: puede ser un
    // pico de ruido, no una lectura sostenida.
    return {
      estable: false,
      pesoKg: null,
      muestras: enVentana.length,
      dispersionKg: dispersion,
      motivo: 'VENTANA_INCOMPLETA',
    };
  }

  const promedio = pesos.reduce((a, b) => a + b, 0) / pesos.length;

  return {
    estable: true,
    pesoKg: redondear(promedio, 2),
    muestras: enVentana.length,
    dispersionKg: dispersion,
  };
}

/** Ventana deslizante acotada: nunca crece sin control en memoria. */
export class SampleBuffer {
  private muestras: Sample[] = [];

  constructor(private readonly maxMuestras = 120) {}

  push(pesoKg: number, recibidoEn: Date = new Date()): void {
    this.muestras.push({ pesoKg, recibidoEn });
    if (this.muestras.length > this.maxMuestras) {
      this.muestras.splice(0, this.muestras.length - this.maxMuestras);
    }
  }

  clear(): void {
    this.muestras = [];
  }

  all(): readonly Sample[] {
    return this.muestras;
  }

  evaluate(config: StabilityConfig = STABILITY_POR_DEFECTO, ahora: Date = new Date()): StabilityResult {
    return evaluarEstabilidad(this.muestras, config, ahora);
  }
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}
