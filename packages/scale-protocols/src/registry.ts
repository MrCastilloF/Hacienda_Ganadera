import type { ScaleProtocolAdapter } from './adapter';
import { genericAsciiAdapter } from './generic-ascii';

/**
 * Registro de adaptadores.
 *
 * El ERP consulta por `protocol_id` guardado en la báscula. Un protocolo sin
 * adaptador registrado se reporta como no soportado: no se inventa soporte
 * (INV-02). Para añadir una marca se importa su adaptador y se registra aquí.
 */
const ADAPTADORES = new Map<string, ScaleProtocolAdapter>();

export function registrarAdaptador(adaptador: ScaleProtocolAdapter): void {
  ADAPTADORES.set(adaptador.id, adaptador);
}

export function obtenerAdaptador(protocolId: string): ScaleProtocolAdapter | null {
  return ADAPTADORES.get(protocolId) ?? null;
}

export function listarAdaptadores(): ScaleProtocolAdapter[] {
  return [...ADAPTADORES.values()];
}

export function protocoloSoportado(protocolId: string): boolean {
  return ADAPTADORES.has(protocolId);
}

// Adaptadores disponibles en esta versión. Los propietarios se agregan aquí.
registrarAdaptador(genericAsciiAdapter);
