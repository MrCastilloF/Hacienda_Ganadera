import { describe, expect, it } from 'vitest';
import {
  CONFIG_POR_DEFECTO,
  codigoBarrasDesdeArete,
  digitoVerificacion,
  generarArete,
  normalizarPrefijo,
  validarArete,
} from './numeracion';

describe('numeración de aretes', () => {
  it('normaliza prefijos a letras y números, máximo 4 caracteres', () => {
    expect(normalizarPrefijo('hacienda-01')).toBe('HACI');
    expect(normalizarPrefijo('  hg ')).toBe('HG');
    expect(normalizarPrefijo('')).toBe('HG');
    expect(normalizarPrefijo('!!!')).toBe('HG');
  });

  it('calcula un dígito de verificación estable', () => {
    expect(digitoVerificacion('HG000001')).toBe(digitoVerificacion('HG000001'));
    expect(digitoVerificacion('HG000001')).toMatch(/^\d$/);
    expect(digitoVerificacion('HG000001')).not.toBe(digitoVerificacion('HG000002'));
  });

  it('genera aretes consecutivos con relleno y dígito de verificación', () => {
    const primero = generarArete({ ...CONFIG_POR_DEFECTO, prefijo: 'HG', longitud: 6 }, 1);
    expect(primero.arete).toMatch(/^HG000001\d$/);
    expect(primero.siguiente).toBe(2);
    expect(validarArete(primero.arete, { ...CONFIG_POR_DEFECTO, prefijo: 'HG', longitud: 6 })).toBe(true);

    const segundo = generarArete({ ...CONFIG_POR_DEFECTO, prefijo: 'HG', longitud: 6 }, 2);
    expect(segundo.arete).not.toBe(primero.arete);
  });

  it('acepta configuraciones sin dígito de verificación', () => {
    const config = { ...CONFIG_POR_DEFECTO, prefijo: 'F1', longitud: 4, digitoVerificacion: false };
    const { arete } = generarArete(config, 7);
    expect(arete).toBe('F10007');
    expect(validarArete(arete, config)).toBe(true);
  });

  it('rechaza aretes de otro prefijo o con dígito incorrecto', () => {
    const config = { ...CONFIG_POR_DEFECTO, prefijo: 'HG', longitud: 6 };
    expect(validarArete('XX0000011', config)).toBe(false);
    expect(validarArete('HG0000019', config)).toBe(false);
    expect(validarArete('hg000001', config)).toBe(false);
  });

  it('el código de barras elimina caracteres no alfanuméricos', () => {
    expect(codigoBarrasDesdeArete('hg-000123')).toBe('HG000123');
    expect(codigoBarrasDesdeArete('HG 000 123')).toBe('HG000123');
  });

  it('mantiene el consecutivo dentro de la longitud configurada', () => {
    const config = { ...CONFIG_POR_DEFECTO, prefijo: 'HG', longitud: 3 };
    const { arete } = generarArete(config, 5);
    expect(arete.startsWith('HG005')).toBe(true);
  });
});
