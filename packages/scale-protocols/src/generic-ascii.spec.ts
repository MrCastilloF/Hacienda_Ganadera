import { describe, expect, it } from 'vitest';
import { genericAsciiAdapter } from './generic-ascii';
import { FRAME_CONFIG_SIMULADOR } from './simulator';
import type { FrameConfig } from './adapter';

const CONFIG: FrameConfig = {
  delimitador: '\r\n',
  campoPeso: 2,
  separadorCampos: ',',
  caracterEstable: 'ST',
  caracterInestable: 'US',
  unidadPorDefecto: 'kg',
};

describe('adaptador ASCII genérico', () => {
  it('interpreta una trama típica de indicador', () => {
    const lectura = genericAsciiAdapter.parse('ST,GS,+00450.0kg\r\n', CONFIG);
    expect(lectura).not.toBeNull();
    expect(lectura!.pesoKg).toBe(450);
    expect(lectura!.unidad).toBe('kg');
    expect(lectura!.estableSegunEquipo).toBe(true);
    expect(lectura!.tramaCruda).toBe('ST,GS,+00450.0kg\r\n');
  });

  it('detecta inestabilidad cuando el equipo lo indica', () => {
    const lectura = genericAsciiAdapter.parse('US,GS,+00430.5kg\r\n', CONFIG);
    expect(lectura!.estableSegunEquipo).toBe(false);
    expect(lectura!.pesoKg).toBe(430.5);
  });

  it('devuelve null cuando no hay estabilidad declarada en la trama', () => {
    // La trama tiene dos campos: el peso está en el índice 1.
    const lectura = genericAsciiAdapter.parse('GS,+00450.0kg\r\n', { ...CONFIG, campoPeso: 1 });
    expect(lectura).not.toBeNull();
    expect(lectura!.estableSegunEquipo).toBeNull();
  });

  it('convierte libras y arrobas a kilogramos', () => {
    const libras = genericAsciiAdapter.parse('ST,GS,+01000.0lb\r\n', CONFIG);
    expect(libras!.unidad).toBe('lb');
    expect(libras!.pesoKg).toBeCloseTo(453.59, 1);

    const arrobas = genericAsciiAdapter.parse('ST,GS,+0010.0@\r\n', CONFIG);
    expect(arrobas!.unidad).toBe('arroba');
    expect(arrobas!.pesoKg).toBeCloseTo(125, 2);
  });

  it('interpreta coma decimal y punto de miles', () => {
    // Con coma como separador de campo, 450 y 5 son dos campos distintos: el
    // peso es "450" y no se inventa un decimal que la trama no declara.
    const sinDecimal = genericAsciiAdapter.parse('ST,GS,450,5kg\r\n', CONFIG);
    expect(sinDecimal!.pesoKg).toBe(450);

    // Con punto y coma como separador, la coma sí es decimal.
    const conComa = genericAsciiAdapter.parse('ST;GS;450,5kg\r\n', { ...CONFIG, separadorCampos: ';' });
    expect(conComa!.pesoKg).toBe(450.5);

    // Las comillas no forman parte del protocolo configurado: no se adivina.
    expect(genericAsciiAdapter.parse('ST,GS,"1.450,5"kg\r\n', CONFIG)).toBeNull();
  });

  it('aplica decimales cuando el equipo no envía separador', () => {
    const lectura = genericAsciiAdapter.parse('ST,GS,+04505kg\r\n', { ...CONFIG, decimales: 1 });
    expect(lectura!.pesoKg).toBe(450.5);
  });

  it('rechaza tramas corruptas o vacías', () => {
    expect(genericAsciiAdapter.parse('', CONFIG)).toBeNull();
    expect(genericAsciiAdapter.parse('ERR###,??,+++kg\r\n', CONFIG)).toBeNull();
    expect(genericAsciiAdapter.parse('ST,GS,kg\r\n', CONFIG)).toBeNull();
  });

  it('declara sus capacidades sin inventar', () => {
    expect(genericAsciiAdapter.capabilities.stabilityIndicator).toBe(true);
    expect(genericAsciiAdapter.capabilities.bidirectional).toBe(false);
    expect(genericAsciiAdapter.version).toBe(1);
  });

  it('acepta un delimitador de campo distinto', () => {
    const config: FrameConfig = { ...CONFIG, separadorCampos: ';', campoPeso: 1 };
    const lectura = genericAsciiAdapter.parse('ST;+00320.4kg\r\n', config);
    expect(lectura!.pesoKg).toBe(320.4);
  });

  it('interpreta la salida del simulador con su configuración', () => {
    const lectura = genericAsciiAdapter.parse('ST,GS,+ 0450.0kg\r\n', FRAME_CONFIG_SIMULADOR);
    expect(lectura!.pesoKg).toBe(450);
    expect(lectura!.estableSegunEquipo).toBe(true);
  });
});
