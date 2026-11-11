import { describe, expect, it } from 'vitest';
import { diasEntre, proyectarPeso, RANGO_GDP_POR_CATEGORIA, resumirCrecimiento, type PuntoPeso } from './crecimiento';

const REF = new Date('2026-06-30T12:00:00Z');
const hace = (dias: number): Date => new Date(REF.getTime() - dias * 86_400_000);

describe('crecimiento del animal', () => {
  it('cuenta días completos entre fechas', () => {
    expect(diasEntre(hace(30), REF)).toBe(30);
    expect(diasEntre(REF, hace(10))).toBe(-10);
  });

  it('calcula la ganancia diaria entre dos pesajes', () => {
    const puntos: PuntoPeso[] = [
      { pesoKg: 350, ocurridoAt: hace(60), origen: 'FIELD' },
      { pesoKg: 410, ocurridoAt: REF, origen: 'FIELD' },
    ];

    const resumen = resumirCrecimiento(puntos, 'CEBA', REF);
    expect(resumen.pesajes).toBe(2);
    expect(resumen.gananciaTotalKg).toBe(60);
    expect(resumen.gdpPromedioKgDia).toBe(1);
    expect(resumen.clasificacion).toBe('NORMAL');
    expect(resumen.tramos).toHaveLength(1);
  });

  it('clasifica como BAJO cuando no alcanza el rango de la categoría', () => {
    const puntos: PuntoPeso[] = [
      { pesoKg: 380, ocurridoAt: hace(90), origen: 'FIELD' },
      { pesoKg: 395, ocurridoAt: REF, origen: 'FIELD' },
    ];
    const resumen = resumirCrecimiento(puntos, 'CEBA', REF);
    expect(resumen.gdpPromedioKgDia).toBeCloseTo(0.167, 3);
    expect(resumen.clasificacion).toBe('BAJO');
  });

  it('no calcula GDP con un solo pesaje', () => {
    const resumen = resumirCrecimiento([{ pesoKg: 400, ocurridoAt: REF, origen: 'FIELD' }], 'CEBA', REF);
    expect(resumen.clasificacion).toBe('INSUFICIENTE');
    expect(resumen.gdpPromedioKgDia).toBeNull();
    expect(resumen.motivo).toBe('SE_REQUIEREN_DOS_PESAJES');
  });

  it('no calcula GDP sin pesajes', () => {
    const resumen = resumirCrecimiento([], 'VACA', REF);
    expect(resumen.clasificacion).toBe('SIN_DATOS');
    expect(resumen.ultimoPesoKg).toBeNull();
  });

  it('marca insuficiente un intervalo menor a siete días', () => {
    const puntos: PuntoPeso[] = [
      { pesoKg: 400, ocurridoAt: hace(3), origen: 'FIELD' },
      { pesoKg: 405, ocurridoAt: REF, origen: 'FIELD' },
    ];
    const resumen = resumirCrecimiento(puntos, 'CEBA', REF);
    expect(resumen.clasificacion).toBe('INSUFICIENTE');
    expect(resumen.motivo).toBe('INTERVALO_MENOR_A_SIETE_DIAS');
  });

  it('construye los tramos intermedios y admite pérdida de peso', () => {
    const puntos: PuntoPeso[] = [
      { pesoKg: 400, ocurridoAt: hace(60), origen: 'FIELD' },
      { pesoKg: 430, ocurridoAt: hace(30), origen: 'FIELD' },
      { pesoKg: 420, ocurridoAt: REF, origen: 'FIELD' },
    ];
    const resumen = resumirCrecimiento(puntos, 'NOVILLO', REF);
    expect(resumen.tramos).toHaveLength(2);
    expect(resumen.tramos[1]!.gananciaKg).toBe(-10);
    expect(resumen.tramos[1]!.gdpKgDia).toBeCloseTo(-0.333, 3);
  });

  it('ordena los pesajes aunque lleguen desordenados', () => {
    const puntos: PuntoPeso[] = [
      { pesoKg: 410, ocurridoAt: REF, origen: 'FIELD' },
      { pesoKg: 350, ocurridoAt: hace(60), origen: 'FIELD' },
    ];
    expect(resumirCrecimiento(puntos, 'CEBA', REF).gananciaTotalKg).toBe(60);
  });

  it('proyecta el peso con advertencia explícita', () => {
    const puntos: PuntoPeso[] = [
      { pesoKg: 300, ocurridoAt: hace(60), origen: 'FIELD' },
      { pesoKg: 360, ocurridoAt: REF, origen: 'FIELD' },
    ];
    const resumen = resumirCrecimiento(puntos, 'CEBA', REF);
    const proyeccion = proyectarPeso(resumen, 30);

    expect(proyeccion.pesoEstimadoKg).toBe(390);
    expect(proyeccion.advertencia).toMatch(/no es un pronóstico validado/i);
  });

  it('no proyecta sin datos suficientes', () => {
    const proyeccion = proyectarPeso(resumirCrecimiento([], 'CEBA', REF), 30);
    expect(proyeccion.pesoEstimadoKg).toBeNull();
    expect(proyeccion.advertencia).toMatch(/Sin datos/i);
  });

  it('los rangos declarados cubren todas las categorías del sistema', () => {
    for (const categoria of ['TERNERO', 'TERNERA', 'NOVILLO', 'NOVILLA', 'CEBA', 'VACA', 'TORO', 'SIN_CATEGORIA']) {
      const rango = RANGO_GDP_POR_CATEGORIA[categoria];
      expect(rango).toBeDefined();
      expect(rango!.maxKgDia).toBeGreaterThan(rango!.minKgDia);
    }
  });
});
