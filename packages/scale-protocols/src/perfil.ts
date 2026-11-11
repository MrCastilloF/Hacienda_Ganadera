import type { FrameConfig } from './adapter';

/**
 * Perfil de báscula por defecto · HACIENDA-GEN-01
 *
 * Supuesto declarado, no una verdad universal: mientras no se conozca la marca y
 * el modelo reales (punto C-02 de docs/07), el sistema opera con este perfil
 * genérico y lo marca como `declared`. Cambiar de báscula no requiere tocar
 * código: se ajusta la configuración de esa báscula (INV-02).
 *
 * Justificación de los valores:
 *  · **8N1 a 9600 baudios**: el ajuste más extendido en indicadores de ganado;
 *    admite las tramas ASCII típicas sin pérdida en cables cortos de manga.
 *  · **CRLF como delimitador**: separa tramas consecutivas de forma inequívoca,
 *    incluso si el equipo no respeta pausas.
 *  · **Campo 2 con separador coma**: formato habitual `ST,GS,+00450.0kg`.
 *  · **0,5 kg de tolerancia**: el movimiento natural del animal en una manga
 *    produce ±0,2–0,4 kg incluso quieto; 0,5 kg distingue quietud de forcejeo sin
 *    exigir una precisión que la báscula no tiene.
 *  · **1200 ms de ventana**: tiempo suficiente para 5–10 lecturas a 10 Hz.
 *  · **5 muestras mínimo**: evita aceptar un pico aislado como peso estable.
 *  · **0–1500 kg**: cubre desde un ternero recién nacido (~30 kg) hasta un toro
 *    adulto (~1.000 kg) con margen para el peso de la jaula.
 *  · **Resolución 0,1 kg**: la mínima útil en ganado; resoluciones menores no
 *    aportan información y sí ruido.
 */
export interface PerfilBascula {
  id: string;
  nombre: string;
  protocolId: string;
  transporte: 'SERIAL' | 'USB' | 'TCP' | 'USB_HID';
  puerto: { baudRate: number; dataBits: 7 | 8; parity: 'none' | 'even' | 'odd'; stopBits: 1 | 2 };
  trama: FrameConfig;
  estabilidad: { toleranceKg: number; windowMs: number; minSamples: number };
  rango: { minKg: number; maxKg: number };
  resolucionKg: number;
  unidad: 'kg';
  notas: string[];
}

export const PERFIL_POR_DEFECTO: PerfilBascula = {
  id: 'HACIENDA-GEN-01',
  nombre: 'Indicador de ganado ASCII (genérico)',
  protocolId: 'generic-ascii',
  transporte: 'SERIAL',
  puerto: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
  trama: {
    delimitador: '\r\n',
    campoPeso: 2,
    separadorCampos: ',',
    caracterEstable: 'ST',
    caracterInestable: 'US',
    decimales: 1,
    unidadPorDefecto: 'kg',
  },
  estabilidad: { toleranceKg: 0.5, windowMs: 1200, minSamples: 5 },
  rango: { minKg: 0, maxKg: 1500 },
  resolucionKg: 0.1,
  unidad: 'kg',
  notas: [
    'Supuesto declarado: la marca y el modelo reales aún no están confirmados (C-02).',
    'El estado de integración de una báscula con este perfil es "declared" hasta probarla con hardware.',
    'Si el equipo envía la unidad pegada al número ("+00450.0kg") el adaptador la detecta igual.',
    'Si la trama no trae separador decimal, configure "decimales" en la báscula.',
  ],
};

/** Configuración de trama lista para el adaptador genérico. */
export const FRAME_CONFIG_POR_DEFECTO: FrameConfig = PERFIL_POR_DEFECTO.trama;

/** Valores de estabilidad por defecto derivados del perfil. */
export const ESTABILIDAD_POR_DEFECTO = PERFIL_POR_DEFECTO.estabilidad;
