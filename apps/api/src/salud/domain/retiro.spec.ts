import { describe, expect, it } from 'vitest';
import { calcularRetiro, ESTADOS_QUE_EXIGEN_RETIRO_VENCIDO, evaluarRetiro } from './retiro';

const INICIO = new Date('2026-06-01T08:00:00Z');

describe('periodo de retiro', () => {
  it('calcula fin de tratamiento y fin de retiro desde el último día de tratamiento', () => {
    // 3 días de tratamiento + 10 de retiro ⇒ fin de retiro 13 días después.
    const resultado = calcularRetiro({
      iniciadoAt: INICIO,
      diasTratamiento: 3,
      diasRetiro: 10,
      referencia: INICIO,
    });

    expect(resultado.finTratamiento.toISOString().slice(0, 10)).toBe('2026-06-04');
    expect(resultado.finRetiro.toISOString().slice(0, 10)).toBe('2026-06-14');
    expect(resultado.puedeVenderse).toBe(false);
    expect(resultado.diasRestantes).toBe(13);
  });

  it('permite vender cuando el retiro ya venció', () => {
    const resultado = calcularRetiro({
      iniciadoAt: INICIO,
      diasTratamiento: 3,
      diasRetiro: 10,
      referencia: new Date('2026-06-20T00:00:00Z'),
    });

    expect(resultado.puedeVenderse).toBe(true);
    expect(resultado.diasRestantes).toBe(0);
    expect(resultado.motivo).toBeUndefined();
  });

  it('sin días de retiro el animal queda libre al terminar el tratamiento', () => {
    const resultado = calcularRetiro({
      iniciadoAt: INICIO,
      diasTratamiento: 1,
      diasRetiro: 0,
      referencia: new Date('2026-06-02T12:00:00Z'),
    });
    expect(resultado.puedeVenderse).toBe(true);
  });

  it('explica cuántos días faltan y cuándo vence', () => {
    const resultado = calcularRetiro({
      iniciadoAt: INICIO,
      diasTratamiento: 1,
      diasRetiro: 10,
      referencia: new Date('2026-06-05T00:00:00Z'),
    });

    // Faltan 7,33 días: se informan 8 para no autorizar una venta anticipada.
    expect(resultado.diasRestantes).toBe(8);
    expect(resultado.motivo).toMatch(/faltan 8 día/);
    expect(resultado.motivo).toMatch(/2026-06-12/);
  });

  it('normaliza valores inválidos sin inventar fechas imposibles', () => {
    const resultado = calcularRetiro({
      iniciadoAt: INICIO,
      diasTratamiento: 0,
      diasRetiro: -5,
      referencia: INICIO,
    });
    expect(resultado.finTratamiento.toISOString().slice(0, 10)).toBe('2026-06-02');
    expect(resultado.finRetiro.getTime()).toBe(resultado.finTratamiento.getTime());
  });

  it('evalúa un retiro ya registrado sin recalcularlo', () => {
    const finTratamiento = new Date('2026-06-04T08:00:00Z');
    const finRetiro = new Date('2026-06-14T08:00:00Z');

    expect(evaluarRetiro({ finTratamiento, finRetiro }, new Date('2026-06-10T00:00:00Z')).puedeVenderse).toBe(false);
    expect(evaluarRetiro({ finTratamiento, finRetiro }, new Date('2026-06-14T08:00:00Z')).puedeVenderse).toBe(true);
  });

  it('los estados que exigen retiro vencido son vender y sacrificar', () => {
    expect([...ESTADOS_QUE_EXIGEN_RETIRO_VENCIDO]).toEqual(['vendido', 'sacrificado']);
  });
});
