/**
 * Numeración de aretes (RF-ANI-10).
 *
 * Esquema configurable: prefijo + consecutivo con relleno + dígito de
 * verificación. El código resultante se usa también como código de barras, por
 * eso no lleva separadores (compatibilidad con Code 128 impreso en campo).
 */
export interface ConfigNumeracion {
  prefijo: string;
  longitud: number;
  siguiente: number;
  digitoVerificacion: boolean;
}

export const CONFIG_POR_DEFECTO: ConfigNumeracion = {
  prefijo: 'HG',
  longitud: 6,
  siguiente: 1,
  digitoVerificacion: true,
};

/** Prefijo utilizable: solo A-Z y 0-9, máximo 4 caracteres. */
export function normalizarPrefijo(prefijo: string): string {
  const limpio = (prefijo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (limpio || 'HG').slice(0, 4);
}

/**
 * Dígito de verificación módulo 11 con pesos 2..7 sobre una base alfanumérica.
 *
 * Las letras se mapean a 10..35 (A=10). La primera versión solo contemplaba
 * dígitos y devolvía `NaN` con prefijos como "HG": lo detectó una prueba.
 */
export function digitoVerificacion(base: string): string {
  let suma = 0;
  let peso = 2;

  for (let i = base.length - 1; i >= 0; i--) {
    const caracter = base[i] ?? '';
    const valor = /[0-9]/.test(caracter)
      ? Number(caracter)
      : caracter.charCodeAt(0) - 55; // A=10 … Z=35
    suma += valor * peso;
    peso = peso === 7 ? 2 : peso + 1;
  }

  const resto = suma % 11;
  const dv = 11 - resto;
  if (dv === 11) return '0';
  if (dv === 10) return '1';
  return String(dv);
}

export interface AreteGenerado {
  arete: string;
  consecutivo: number;
  siguiente: number;
}

/** Construye el arete y devuelve el siguiente consecutivo a persistir. */
export function generarArete(config: ConfigNumeracion, consecutivo: number): AreteGenerado {
  const prefijo = normalizarPrefijo(config.prefijo);
  const longitud = Math.min(Math.max(config.longitud || 6, 3), 10);
  const numero = String(consecutivo).padStart(longitud, '0');
  const base = `${prefijo}${numero}`;
  const arete = config.digitoVerificacion ? `${base}${digitoVerificacion(base)}` : base;

  return { arete, consecutivo, siguiente: consecutivo + 1 };
}

/** Verifica que un arete respete el esquema (útil al importar). */
export function validarArete(arete: string, config: ConfigNumeracion): boolean {
  const esperado = /^[A-Z0-9]{5,20}$/;
  if (!esperado.test(arete)) return false;

  const prefijo = normalizarPrefijo(config.prefijo);
  if (!arete.startsWith(prefijo)) return false;
  if (!config.digitoVerificacion) return true;

  const base = arete.slice(0, -1);
  return arete.endsWith(digitoVerificacion(base));
}

/**
 * Código de barras a partir del arete: mismo valor normalizado. Se mantiene la
 * función separada porque en el futuro podría requerir otro esquema (EAN-13).
 */
export function codigoBarrasDesdeArete(arete: string): string {
  return arete.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
