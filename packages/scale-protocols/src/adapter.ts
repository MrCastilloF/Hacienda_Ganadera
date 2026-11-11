/**
 * Contrato de adaptador de báscula v1 (RF-BAS-01).
 *
 * Regla del proyecto (INV-02): no se asume ningún protocolo. El ERP no conoce
 * marcas; conoce adaptadores registrados. Agregar una báscula nueva consiste en
 * escribir un adaptador y registrarlo, sin tocar la aplicación.
 *
 * Un adaptador NO decide si el pesaje es válido para el negocio: solo interpreta
 * bytes y detecta estabilidad. La decisión es del dominio.
 */

/** Lectura interpretada de una trama. */
export interface ScaleReading {
  /** Peso en kilogramos. La unidad canónica del sistema es kg. */
  pesoKg: number;
  /** Unidad tal como la reportó el equipo. */
  unidad: 'kg' | 'lb' | 'arroba' | 'desconocida';
  /** Marca de tiempo de la recepción (la pone quien lee el puerto). */
  recibidoEn: Date;
  /** Indicador de estabilidad que envía el equipo, si lo envía. */
  estableSegunEquipo: boolean | null;
  /** Trama original, sin transformar (RF-BAS-06). */
  tramaCruda: string;
}

export type Transporte = 'SERIAL' | 'USB' | 'TCP' | 'USB_HID';

/** Parámetros de trama configurables: ningún protocolo se cablea en el código. */
export interface FrameConfig {
  /** Delimitador de trama (por ejemplo '\\r\\n' o '\\x03'). */
  delimitador: string;
  /** Posición del campo de peso dentro de la trama separada por delimitador de campo. */
  campoPeso: number;
  /** Separador de campos (';', ',', ' '). */
  separadorCampos: string;
  /** Carácter que indica estabilidad; si está presente, la lectura es estable. */
  caracterEstable?: string;
  /** Carácter que indica inestabilidad (tiene prioridad sobre el anterior). */
  caracterInestable?: string;
  /** Decimales del equipo cuando la trama no trae separador decimal explícito. */
  decimales?: number;
  /** Unidad por defecto cuando la trama no la incluye. */
  unidadPorDefecto?: 'kg' | 'lb' | 'arroba';
  /** Factor de conversión a kg por unidad. */
  factores?: Partial<Record<'kg' | 'lb' | 'arroba', number>>;
}

export interface ScaleProtocolAdapter {
  /** Identificador inmutable del adaptador; es el que se guarda en la báscula. */
  readonly id: string;
  readonly name: string;
  /** Versión del contrato que implementa. */
  readonly version: 1;
  /** Capacidades declaradas: no se inventan (INV-01). */
  readonly capabilities: {
    /** El equipo envía su propia marca de estabilidad. */
    stabilityIndicator: boolean;
    /** El equipo puede recibir comandos (tara, cero). */
    bidirectional: boolean;
  };
  /** Convierte una trama en lectura. Devuelve null si la trama no es válida. */
  parse(trama: string, config: FrameConfig): ScaleReading | null;
  /** Comandos opcionales que el adaptador sabe enviar. */
  buildCommand?(comando: 'tara' | 'cero' | 'leer'): Buffer | null;
}

/** Factores de conversión a kg (unidad canónica). */
export const FACTORES_A_KG: Record<'kg' | 'lb' | 'arroba', number> = {
  kg: 1,
  lb: 0.45359237,
  arroba: 12.5,
};

/** Convierte a kg. La base de datos y la API solo entienden kg. */
export function aKilogramos(peso: number, unidad: 'kg' | 'lb' | 'arroba' | 'desconocida'): number {
  if (unidad === 'desconocida') return peso;
  return peso * FACTORES_A_KG[unidad];
}
