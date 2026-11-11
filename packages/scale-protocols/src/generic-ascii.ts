import { aKilogramos, type FrameConfig, type ScaleProtocolAdapter, type ScaleReading } from './adapter';

/**
 * Adaptador ASCII genérico.
 *
 * Cubre la mayoría de indicadores de báscula que envían una trama de texto con el
 * peso en un campo. Todo lo variable —delimitador, posición, separador, caracteres
 * de estabilidad, decimales y unidad— se configura por equipo, de modo que una
 * marca nueva no obliga a tocar código (RF-BAS-02, RF-BAS-04).
 *
 * Ejemplos de tramas que interpreta con la configuración adecuada:
 *   "ST,GS,+00450.0kg\r\n"      → delimitador \r\n, separador ',', campo 2
 *   "S 450.5 kg\r"              → caracterEstable 'S', campo 1
 *   "US,     452,kg\r\n"        → caracterInestable 'US'
 */
export const genericAsciiAdapter: ScaleProtocolAdapter = {
  id: 'generic-ascii',
  name: 'ASCII genérico configurable',
  version: 1,
  capabilities: { stabilityIndicator: true, bidirectional: false },

  parse(trama: string, config: FrameConfig): ScaleReading | null {
    if (!trama || trama.trim().length === 0) return null;

    // Se eliminan nulos de relleno sin usar una expresión regular con caracteres
    // de control (los equipos suelen rellenar la trama con \0).
    const limpia = trama.split('\u0000').join('').trim();
    const campos = limpia.split(config.separadorCampos || ',');
    const crudo = campos[config.campoPeso ?? 0];
    if (crudo === undefined) return null;

    // Comillas dentro del campo indican que la trama usa un formato que este
    // adaptador no declara soportar (campos entrecomillados con separadores
    // internos). Se rechaza en vez de truncar el valor silenciosamente.
    if (crudo.includes('"')) return null;

    // Se aísla el número permitiendo signo, separadores y dígitos.
    const numero = extraerNumero(crudo, config.decimales);
    if (numero === null) return null;

    const unidad = detectarUnidad(limpia, config.unidadPorDefecto ?? 'kg');
    const estable = detectarEstabilidad(limpia, config);

    return {
      pesoKg: redondear(aKilogramos(numero, unidad), 2),
      unidad,
      recibidoEn: new Date(),
      estableSegunEquipo: estable,
      tramaCruda: trama,
    };
  },
};

export function extraerNumero(texto: string, decimales?: number): number | null {
  const limpio = texto.replace(/[^0-9+\-.,]/g, '').trim();
  if (limpio.length === 0) return null;

  // Si hay coma y punto, el último separador es el decimal.
  const tieneComa = limpio.includes(',');
  const tienePunto = limpio.includes('.');

  let normalizado = limpio;
  if (tieneComa && tienePunto) {
    const ultimoPunto = limpio.lastIndexOf('.');
    const ultimaComa = limpio.lastIndexOf(',');
    normalizado =
      ultimaComa > ultimoPunto
        ? limpio.replace(/\./g, '').replace(',', '.')
        : limpio.replace(/,/g, '');
  } else if (tieneComa) {
    // "450,5" → decimal; "1,450" (3 dígitos) → miles.
    const partes = limpio.split(',');
    normalizado = partes.length === 2 && partes[1]!.length <= 2 ? limpio.replace(',', '.') : limpio.replace(/,/g, '');
  } else if (decimales !== undefined && decimales > 0 && !tienePunto) {
    // Equipo que no envía separador decimal: "4505" con decimales=1 → 450.5
    const digitos = limpio.replace(/[^0-9]/g, '');
    if (digitos.length > decimales) {
      normalizado = `${digitos.slice(0, -decimales)}.${digitos.slice(-decimales)}`;
    }
  }

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

function detectarUnidad(trama: string, porDefecto: 'kg' | 'lb' | 'arroba'): 'kg' | 'lb' | 'arroba' {
  const texto = trama.toLowerCase();
  // La unidad aparece pegada al número ("+01000.0lb"), así que no se puede exigir
  // un límite de palabra al inicio: entre un dígito y una letra no existe.
  if (/lb[s]?\b/.test(texto)) return 'lb';
  if (/kg\b/.test(texto)) return 'kg';
  if (texto.includes('@') || /arroba/.test(texto)) return 'arroba';
  return porDefecto;
}

function detectarEstabilidad(trama: string, config: FrameConfig): boolean | null {
  if (config.caracterInestable && trama.includes(config.caracterInestable)) return false;
  if (config.caracterEstable && trama.includes(config.caracterEstable)) return true;
  return null;
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}
