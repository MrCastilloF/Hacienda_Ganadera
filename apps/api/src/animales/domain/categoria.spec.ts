import { describe, expect, it } from 'vitest';
import { calcularCategoria, edadEnMeses } from './categoria';

const REFERENCIA = new Date('2026-06-15T00:00:00Z');
const haceMeses = (meses: number): Date => {
  const fecha = new Date(REFERENCIA);
  fecha.setMonth(fecha.getMonth() - meses);
  return fecha;
};

describe('categoría derivada del animal', () => {
  it('calcula la edad en meses', () => {
    expect(edadEnMeses('2025-06-15', REFERENCIA)).toBe(12);
    expect(edadEnMeses('2026-06-15', REFERENCIA)).toBe(0);
    expect(edadEnMeses(null, REFERENCIA)).toBeNull();
    expect(edadEnMeses(undefined, REFERENCIA)).toBeNull();
  });

  it('no calcula edad negativa para una fecha futura', () => {
    expect(edadEnMeses('2027-01-01', REFERENCIA)).toBeNull();
  });

  it('clasifica hembras por edad', () => {
    expect(calcularCategoria({ sexo: 'HEMBRA', fechaNacimiento: haceMeses(6), referencia: REFERENCIA }).codigo).toBe('TERNERA');
    expect(calcularCategoria({ sexo: 'HEMBRA', fechaNacimiento: haceMeses(13), referencia: REFERENCIA }).codigo).toBe('NOVILLA');
    expect(calcularCategoria({ sexo: 'HEMBRA', fechaNacimiento: haceMeses(30), referencia: REFERENCIA }).codigo).toBe('VACA');
  });

  it('clasifica machos por edad y destino productivo', () => {
    expect(calcularCategoria({ sexo: 'MACHO', fechaNacimiento: haceMeses(6), referencia: REFERENCIA }).codigo).toBe('TERNERO');
    expect(calcularCategoria({ sexo: 'MACHO', fechaNacimiento: haceMeses(13), referencia: REFERENCIA }).codigo).toBe('NOVILLO');
    expect(calcularCategoria({ sexo: 'MACHO', fechaNacimiento: haceMeses(30), referencia: REFERENCIA }).codigo).toBe('CEBA');
    expect(
      calcularCategoria({
        sexo: 'MACHO',
        fechaNacimiento: haceMeses(30),
        estadoProductivo: 'REPRODUCTOR',
        referencia: REFERENCIA,
      }).codigo,
    ).toBe('TORO');
  });

  it('sin fecha de nacimiento no inventa categoría', () => {
    const resultado = calcularCategoria({ sexo: 'MACHO', fechaNacimiento: null, referencia: REFERENCIA });
    expect(resultado.codigo).toBe('SIN_CATEGORIA');
    expect(resultado.edadMeses).toBeNull();
    expect(resultado.motivo).toBe('FALTA_FECHA_NACIMIENTO');
  });

  it('respeta los límites exactos de 12 y 24 meses', () => {
    expect(calcularCategoria({ sexo: 'HEMBRA', fechaNacimiento: haceMeses(11), referencia: REFERENCIA }).codigo).toBe('TERNERA');
    expect(calcularCategoria({ sexo: 'HEMBRA', fechaNacimiento: haceMeses(12), referencia: REFERENCIA }).codigo).toBe('NOVILLA');
    expect(calcularCategoria({ sexo: 'HEMBRA', fechaNacimiento: haceMeses(23), referencia: REFERENCIA }).codigo).toBe('NOVILLA');
    expect(calcularCategoria({ sexo: 'HEMBRA', fechaNacimiento: haceMeses(24), referencia: REFERENCIA }).codigo).toBe('VACA');
  });
});
