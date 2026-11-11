import type { FrameConfig } from './adapter';
import { SampleBuffer, STABILITY_POR_DEFECTO, type StabilityConfig } from './stability';

/**
 * Simulador de báscula.
 *
 * Genera tramas ASCII como las de un indicador real, con modos que reproducen lo
 * que ocurre en campo: animal quieto, animal que se mueve, sobrecarga, trama
 * corrupta o equipo desconectado.
 *
 * Todo lo que produce este simulador se registra con origen `SIMULATOR`: el
 * sistema nunca presenta un dato simulado como real (INV-08).
 */

export type ModoSimulacion = 'estable' | 'inestable' | 'sobrecarga' | 'corrupta' | 'desconectada';

export interface SimuladorConfig {
  /** Peso base en kg sobre el que se simula. */
  pesoBaseKg: number;
  modo: ModoSimulacion;
  /** Amplitud del ruido en kg (±). */
  ruidoKg?: number;
  /** Semilla para reproducibilidad en pruebas. */
  semilla?: number;
}

export interface Simulador {
  /** Próxima trama que emitiría el equipo, o null si está desconectado. */
  siguienteTrama(): string | null;
  /** Reinicia la secuencia con un nuevo modo o peso. */
  configurar(config: Partial<SimuladorConfig>): void;
  /** Muestras generadas hasta ahora (para alimentar el detector de estabilidad). */
  readonly buffer: SampleBuffer;
}

/** Generador pseudoaleatorio determinista (sin dependencias, reproducible). */
export function crearAleatorio(semilla = 42): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 0xffffffff;
  };
}

export function crearSimulador(config: SimuladorConfig): Simulador {
  let actual: Required<SimuladorConfig> = {
    ruidoKg: config.ruidoKg ?? 0.15,
    semilla: config.semilla ?? 42,
    pesoBaseKg: config.pesoBaseKg,
    modo: config.modo,
  };

  const aleatorio = crearAleatorio(actual.semilla);
  const buffer = new SampleBuffer(200);

  const siguientePeso = (): number => {
    switch (actual.modo) {
      case 'estable':
        return actual.pesoBaseKg + (aleatorio() - 0.5) * 2 * (actual.ruidoKg / 3);
      case 'inestable':
        // Animal que se mueve: oscilación grande y variable.
        return actual.pesoBaseKg + (aleatorio() - 0.5) * 2 * (actual.ruidoKg * 12);
      case 'sobrecarga':
        return actual.pesoBaseKg + 500;
      default:
        return actual.pesoBaseKg;
    }
  };

  const formatear = (peso: number, estable: boolean): string => {
    const marca = estable ? 'ST' : 'US';
    return `${marca},GS,+${peso.toFixed(1).padStart(8, ' ')}kg\r\n`;
  };

  return {
    buffer,

    siguienteTrama(): string | null {
      if (actual.modo === 'desconectada') return null;

      if (actual.modo === 'corrupta') {
        return 'ERR###,??,+++kg\r\n';
      }

      const peso = siguientePeso();
      const estable = actual.modo === 'estable';
      const trama = formatear(peso, estable);

      // Solo las lecturas con formato válido alimentan el detector.
      buffer.push(redondear(peso, 2), new Date());

      return trama;
    },

    configurar(parcial: Partial<SimuladorConfig>): void {
      actual = { ...actual, ...parcial, ruidoKg: parcial.ruidoKg ?? actual.ruidoKg, semilla: parcial.semilla ?? actual.semilla };
      buffer.clear();
    },
  };
}

/** Configuración de trama que corresponde a la salida del simulador. */
export const FRAME_CONFIG_SIMULADOR: FrameConfig = {
  delimitador: '\r\n',
  campoPeso: 2,
  separadorCampos: ',',
  caracterEstable: 'ST',
  caracterInestable: 'US',
  unidadPorDefecto: 'kg',
};

export const STABILITY_SIMULADOR: StabilityConfig = STABILITY_POR_DEFECTO;

/** Genera una tanda de tramas como haría un puerto serie en un segundo. */
export function generarTandas(veces: number, config: SimuladorConfig): string[] {
  const simulador = crearSimulador(config);
  const tramas: string[] = [];
  for (let i = 0; i < veces; i++) {
    const trama = simulador.siguienteTrama();
    if (trama !== null) tramas.push(trama);
  }
  return tramas;
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}
