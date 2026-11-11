import { describe, expect, it } from 'vitest';
import { SampleBuffer, evaluarEstabilidad, STABILITY_POR_DEFECTO, type Sample } from './stability';
import { crearSimulador, FRAME_CONFIG_SIMULADOR, generarTandas } from './simulator';
import { genericAsciiAdapter } from './generic-ascii';
import { listarAdaptadores, obtenerAdaptador, protocoloSoportado } from './registry';

const CONFIG = { toleranceKg: 0.5, windowMs: 1200, minSamples: 5 };

function muestras(pesos: number[], intervaloMs = 150, base = new Date('2026-06-01T10:00:00Z')): Sample[] {
  return pesos.map((pesoKg, i) => ({ pesoKg, recibidoEn: new Date(base.getTime() + i * intervaloMs) }));
}

describe('detección de peso estable', () => {
  it('acepta una ventana estable y promedia el peso', () => {
    const resultado = evaluarEstabilidad(
      muestras([450.0, 450.1, 450.2, 450.0, 450.1]),
      CONFIG,
      new Date('2026-06-01T10:00:01Z'),
    );

    expect(resultado.estable).toBe(true);
    expect(resultado.pesoKg).toBeCloseTo(450.08, 2);
    expect(resultado.muestras).toBe(5);
  });

  it('rechaza por pocas muestras', () => {
    const resultado = evaluarEstabilidad(
      muestras([450, 450.1]),
      CONFIG,
      new Date('2026-06-01T10:00:01Z'),
    );
    expect(resultado.estable).toBe(false);
    expect(resultado.motivo).toBe('POCAS_MUESTRAS');
  });

  it('rechaza cuando la dispersión supera la tolerancia', () => {
    const resultado = evaluarEstabilidad(
      muestras([430, 460, 450, 470, 440]),
      CONFIG,
      new Date('2026-06-01T10:00:01Z'),
    );
    expect(resultado.estable).toBe(false);
    expect(resultado.motivo).toBe('FUERA_DE_TOLERANCIA');
    expect(resultado.dispersionKg).toBe(40);
  });

  it('rechaza una ventana demasiado corta en tiempo', () => {
    const resultado = evaluarEstabilidad(
      muestras([450, 450, 450, 450, 450], 10),
      CONFIG,
      new Date('2026-06-01T10:00:00.100Z'),
    );
    expect(resultado.estable).toBe(false);
    expect(resultado.motivo).toBe('VENTANA_INCOMPLETA');
  });

  it('ignora las muestras fuera de la ventana temporal', () => {
    const viejas = muestras([100, 100, 100], 100, new Date('2026-06-01T09:00:00Z'));
    const nuevas = muestras([450, 450.1, 450, 450.1, 450], 150, new Date('2026-06-01T10:00:00Z'));
    const resultado = evaluarEstabilidad([...viejas, ...nuevas], CONFIG, new Date('2026-06-01T10:00:01Z'));
    expect(resultado.estable).toBe(true);
    expect(resultado.muestras).toBe(5);
  });

  it('el buffer acota su tamaño y se puede reiniciar', () => {
    const buffer = new SampleBuffer(10);
    for (let i = 0; i < 25; i++) buffer.push(450 + (i % 3) * 0.01, new Date(Date.now() - 1000 + i * 40));
    expect(buffer.all().length).toBe(10);
    buffer.clear();
    expect(buffer.all().length).toBe(0);
  });

  it('los valores por defecto son los documentados', () => {
    expect(STABILITY_POR_DEFECTO).toEqual({ toleranceKg: 0.5, windowMs: 1200, minSamples: 5 });
  });
});

describe('simulador de báscula', () => {
  it('en modo estable produce tramas que el adaptador interpreta', () => {
    const simulador = crearSimulador({ pesoBaseKg: 450, modo: 'estable' });
    const tramas = generarTandas(8, { pesoBaseKg: 450, modo: 'estable' });

    expect(tramas).toHaveLength(8);
    for (const trama of tramas) {
      const lectura = genericAsciiAdapter.parse(trama, FRAME_CONFIG_SIMULADOR);
      expect(lectura).not.toBeNull();
      expect(lectura!.estableSegunEquipo).toBe(true);
      expect(Math.abs(lectura!.pesoKg - 450)).toBeLessThan(1);
    }
    expect(simulador.siguienteTrama()).toContain('ST');
  });

  it('en modo inestable oscila y no marca estabilidad', () => {
    const tramas = generarTandas(10, { pesoBaseKg: 450, modo: 'inestable' });
    expect(tramas.every((t) => t.startsWith('US'))).toBe(true);
  });

  it('en modo sobrecarga supera el rango del equipo', () => {
    const [trama] = generarTandas(1, { pesoBaseKg: 450, modo: 'sobrecarga' });
    const lectura = genericAsciiAdapter.parse(trama!, FRAME_CONFIG_SIMULADOR);
    expect(lectura!.pesoKg).toBeGreaterThan(900);
  });

  it('emite tramas corruptas en el modo correspondiente', () => {
    const [trama] = generarTandas(1, { pesoBaseKg: 450, modo: 'corrupta' });
    expect(trama).toContain('ERR');
    expect(genericAsciiAdapter.parse(trama!, FRAME_CONFIG_SIMULADOR)).toBeNull();
  });

  it('no emite nada cuando está desconectada', () => {
    expect(generarTandas(3, { pesoBaseKg: 450, modo: 'desconectada' })).toHaveLength(0);
  });

  it('es determinista con la misma semilla', () => {
    const a = generarTandas(5, { pesoBaseKg: 300, modo: 'inestable', semilla: 7 });
    const b = generarTandas(5, { pesoBaseKg: 300, modo: 'inestable', semilla: 7 });
    expect(a).toEqual(b);
  });
});

describe('registro de adaptadores', () => {
  it('encuentra el adaptador genérico y reporta los desconocidos', () => {
    expect(protocoloSoportado('generic-ascii')).toBe(true);
    expect(protocoloSoportado('marca-inexistente')).toBe(false);
    expect(obtenerAdaptador('marca-inexistente')).toBeNull();
    expect(listarAdaptadores().map((a) => a.id)).toContain('generic-ascii');
  });
});
