import { describe, expect, it } from 'vitest';
import { buscarMedicamento, CATALOGO_MEDICAMENTOS, diasHastaRetiro, AVISO_CATALOGO } from './medicamentos';

const REF = new Date('2026-06-01T10:00:00Z');

describe('catálogo de medicamentos', () => {
  it('busca por código', () => {
    expect(buscarMedicamento('OXI-LA')?.principioActivo).toBe('Oxitetraciclina');
    expect(buscarMedicamento('oxi-la')?.codigo).toBe('OXI-LA');
  });

  it('busca por nombre exacto y por coincidencia parcial', () => {
    expect(buscarMedicamento(undefined, 'Ivermectina 1%')?.codigo).toBe('IVM-1');
    expect(buscarMedicamento(undefined, 'ivermectina')?.codigo).toBe('IVM-1');
  });

  it('devuelve null cuando no lo encuentra', () => {
    expect(buscarMedicamento('NO-EXISTE')).toBeNull();
    expect(buscarMedicamento('')).toBeNull();
    expect(buscarMedicamento()).toBeNull();
  });

  it('declara la procedencia de los valores de retiro', () => {
    expect(AVISO_CATALOGO).toMatch(/referencia declarados/i);
    expect(AVISO_CATALOGO).toMatch(/prospecto/i);
  });

  it('todos los medicamentos declaran código, nombre y vía válidos', () => {
    const vias = ['IM', 'IV', 'SC', 'ORAL', 'TOPICA', 'INTRAMAMARIA', 'OTRA'];
    for (const medicamento of CATALOGO_MEDICAMENTOS) {
      expect(medicamento.codigo.length).toBeGreaterThan(1);
      expect(medicamento.nombre.length).toBeGreaterThan(3);
      expect(vias).toContain(medicamento.via);
      expect(
        medicamento.diasRetiroCarne === null || medicamento.diasRetiroCarne >= 0,
      ).toBe(true);
    }
  });

  it('marca como desconocido el retiro de leche cuando no aplica', () => {
    const ivermectina = buscarMedicamento('IVM-1');
    expect(ivermectina?.diasRetiroLeche).toBeNull();
    expect(ivermectina?.notas).toMatch(/vacas en producción de leche/i);
  });
});

describe('días hasta el fin de retiro', () => {
  it('cuenta hacia arriba para no autorizar ventas anticipadas', () => {
    expect(diasHastaRetiro(new Date('2026-06-05T09:00:00Z'), REF)).toBe(4);
    expect(diasHastaRetiro(new Date('2026-06-05T11:00:00Z'), REF)).toBe(5);
  });

  it('devuelve cero cuando ya venció', () => {
    expect(diasHastaRetiro(new Date('2026-05-20T00:00:00Z'), REF)).toBe(0);
  });
});
