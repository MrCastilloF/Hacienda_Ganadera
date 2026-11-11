'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE, apiFetch } from '@/lib/api';

interface PesajeCreado {
  id: string;
  arete: string;
  pesoKg: number;
  duplicado: boolean;
  duplicateOf: string | null;
  origen: string;
  edadDias: number | null;
}

interface Simulacion {
  creado: boolean;
  motivo?: string;
  pesaje?: PesajeCreado;
  diagnostico: { tramas: number; muestras: number; dispersionKg: number | null; pesoPromedioKg: number | null };
  aviso: string;
}

export interface PesajeState {
  ok?: boolean;
  error?: string;
  aviso?: string;
  resultado?: {
    pesoKg: number;
    arete: string;
    origen: string;
    duplicado: boolean;
    edadDias: number | null;
  };
  diagnostico?: { tramas: number; muestras: number; dispersionKg: number | null };
}

async function token(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}

/**
 * Registra un pesaje.
 *
 * El navegador no calcula nada: envía el peso y el servidor decide (INV: los
 * invariantes viven en el backend). El `idempotencyKey` lo genera el cliente
 * para que un doble envío del formulario no cree dos pesajes.
 */
export async function registrarPesajeAction(_prev: PesajeState, formData: FormData): Promise<PesajeState> {
  const access = await token();
  if (!access) return { error: 'La sesión expiró. Vuelva a ingresar.' };

  const animalId = String(formData.get('animalId') ?? '');
  const peso = Number(formData.get('pesoKg') ?? 0);
  const tipo = String(formData.get('tipo') ?? 'CONTROL');
  const observaciones = String(formData.get('observaciones') ?? '').trim();
  const idempotencyKey = String(formData.get('idempotencyKey') ?? '');

  if (!animalId) return { error: 'Seleccione un animal' };
  if (!Number.isFinite(peso) || peso <= 0) return { error: 'El peso debe ser mayor que cero' };

  const resultado = await apiFetch<PesajeCreado>('/pesajes', {
    method: 'POST',
    token: access,
    body: {
      animalId,
      pesoKg: peso,
      tipo,
      origen: 'MANUAL',
      ...(observaciones ? { observaciones } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    },
  });

  if (!resultado.ok) {
    return { error: `${resultado.error.code}: ${resultado.error.message}` };
  }

  revalidatePath('/pesaje');

  return {
    ok: true,
    aviso: resultado.data.duplicado
      ? 'Registrado, pero se detectó como posible duplicado de un pesaje reciente en la misma báscula.'
      : undefined,
    resultado: {
      pesoKg: resultado.data.pesoKg,
      arete: resultado.data.arete,
      origen: resultado.data.origen,
      duplicado: resultado.data.duplicado,
      edadDias: resultado.data.edadDias,
    },
  };
}

/** Ejecuta la cadena completa con tramas generadas: queda marcado SIMULATOR. */
export async function simularPesajeAction(_prev: PesajeState, formData: FormData): Promise<PesajeState> {
  const access = await token();
  if (!access) return { error: 'La sesión expiró. Vuelva a ingresar.' };

  const animalId = String(formData.get('animalId') ?? '');
  const pesoBaseKg = Number(formData.get('pesoBaseKg') ?? 0);
  const modo = String(formData.get('modo') ?? 'estable');

  if (!animalId) return { error: 'Seleccione un animal' };
  if (!Number.isFinite(pesoBaseKg) || pesoBaseKg <= 0) return { error: 'Indique el peso a simular' };

  const resultado = await apiFetch<Simulacion>('/pesajes/simulado', {
    method: 'POST',
    token: access,
    body: { animalId, pesoBaseKg, modo },
  });

  if (!resultado.ok) return { error: `${resultado.error.code}: ${resultado.error.message}` };

  revalidatePath('/pesaje');

  if (!resultado.data.creado) {
    return {
      error: `El simulador no produjo un peso estable (${resultado.data.motivo ?? 'sin lectura'}). No se registró nada.`,
      diagnostico: resultado.data.diagnostico as PesajeState['diagnostico'],
    };
  }

  return {
    ok: true,
    aviso: resultado.data.aviso,
    resultado: {
      pesoKg: resultado.data.pesaje!.pesoKg,
      arete: resultado.data.pesaje!.arete,
      origen: 'SIMULATOR',
      duplicado: resultado.data.pesaje!.duplicado,
      edadDias: resultado.data.pesaje!.edadDias,
    },
    diagnostico: resultado.data.diagnostico as PesajeState['diagnostico'],
  };
}
