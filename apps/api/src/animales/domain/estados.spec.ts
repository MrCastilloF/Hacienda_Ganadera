import { describe, expect, it } from 'vitest';
import {
  ESTADOS,
  admiteOperaciones,
  esTerminal,
  transicionesPosibles,
  validarTransicion,
  type EstadoAnimal,
} from './estados';

describe('máquina de estados del animal', () => {
  it('permite las transiciones documentadas desde activo', () => {
    for (const hacia of transicionesPosibles('activo')) {
      expect(validarTransicion({ desde: 'activo', hacia, motivo: 'motivo suficiente' }).valida).toBe(true);
    }
  });

  it('rechaza transiciones no previstas', () => {
    const resultado = validarTransicion({ desde: 'activo', hacia: 'trasladado', motivo: undefined });
    // trasladado es válido desde activo, pero exige motivo.
    expect(resultado.valida).toBe(false);
    if (!resultado.valida) expect(resultado.codigo).toBe('MOTIVO_REQUERIDO');

    const invalida = validarTransicion({ desde: 'enfermo', hacia: 'trasladado', motivo: 'x' });
    expect(invalida.valida).toBe(false);
    if (!invalida.valida) expect(invalida.codigo).toBe('TRANSICION_INVALIDA');
  });

  it('los estados terminales no admiten salida', () => {
    for (const terminal of ['vendido', 'fallecido', 'sacrificado'] as EstadoAnimal[]) {
      expect(esTerminal(terminal)).toBe(true);
      const resultado = validarTransicion({ desde: terminal, hacia: 'activo', motivo: 'reingreso' });
      expect(resultado.valida).toBe(false);
      if (!resultado.valida) expect(resultado.codigo).toBe('ESTADO_TERMINAL');
    }
  });

  it('rechaza transitar al mismo estado', () => {
    const resultado = validarTransicion({ desde: 'activo', hacia: 'activo' });
    expect(resultado.valida).toBe(false);
    if (!resultado.valida) expect(resultado.codigo).toBe('TRANSICION_INVALIDA');
  });

  it('exige motivo para los estados que lo requieren', () => {
    for (const hacia of ['cuarentena', 'enfermo', 'vendido', 'fallecido', 'sacrificado', 'trasladado'] as EstadoAnimal[]) {
      const sinMotivo = validarTransicion({ desde: 'activo', hacia });
      if (hacia === 'fallecido' || hacia === 'sacrificado' || hacia === 'vendido') {
        expect(sinMotivo.valida).toBe(false);
      }
      const conMotivoCorto = validarTransicion({ desde: 'activo', hacia, motivo: 'ab' });
      expect(conMotivoCorto.valida).toBe(false);
      const conMotivo = validarTransicion({ desde: 'activo', hacia, motivo: 'motivo válido de campo' });
      expect(conMotivo.valida).toBe(true);
    }
  });

  it('la recuperación a activo no exige motivo', () => {
    expect(validarTransicion({ desde: 'enfermo', hacia: 'activo' }).valida).toBe(true);
    expect(validarTransicion({ desde: 'cuarentena', hacia: 'activo' }).valida).toBe(true);
  });

  it('solo los estados operables admiten pesajes y tratamientos', () => {
    expect(admiteOperaciones('activo')).toBe(true);
    expect(admiteOperaciones('enfermo')).toBe(true);
    expect(admiteOperaciones('cuarentena')).toBe(true);
    expect(admiteOperaciones('vendido')).toBe(false);
    expect(admiteOperaciones('fallecido')).toBe(false);
  });

  it('todo estado declarado tiene entrada en la tabla de transiciones', () => {
    for (const estado of ESTADOS) {
      expect(Array.isArray(transicionesPosibles(estado))).toBe(true);
    }
  });
});
