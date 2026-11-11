'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE, apiFetch } from '@/lib/api';

export interface SaludState {
  ok?: boolean;
  error?: string;
  mensaje?: string;
}

interface TratamientoCreado {
  id: string;
  arete: string;
  finRetiro: string;
  diasRestantes: number;
  puedeVenderse: boolean;
  motivoBloqueo: string | null;
}

interface Catalogo {
  items: Array<{ codigo: string; nombre: string; diasRetiroCarne: number | null }>;
}

/**
 * Registra un tratamiento.
 *
 * Si el operario no indica los días de retiro, se toma el valor de referencia del
 * catálogo —siempre como sugerencia editable, nunca como verdad oficial—. El
 * cálculo del fin de retiro y el bloqueo de venta los hace el servidor.
 */
export async function registrarTratamientoAction(_prev: SaludState, formData: FormData): Promise<SaludState> {
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  if (!access) return { error: 'La sesión expiró. Vuelva a ingresar.' };

  const animalId = String(formData.get('animalId') ?? '');
  const medicamento = String(formData.get('medicamento') ?? '').trim();
  const diasTratamiento = Number(formData.get('diasTratamiento') ?? 1);
  const diasRetiroIngresado = String(formData.get('diasRetiro') ?? '').trim();
  const via = String(formData.get('via') ?? '');
  const diagnostico = String(formData.get('diagnostico') ?? '').trim();
  const veterinario = String(formData.get('veterinario') ?? '').trim();

  if (!animalId) return { error: 'Seleccione un animal' };
  if (medicamento.length < 2) return { error: 'Indique el medicamento' };

  // Si no se indicó retiro, se consulta el catálogo de referencia.
  let diasRetiro = diasRetiroIngresado === '' ? null : Number(diasRetiroIngresado);
  if (diasRetiro === null || Number.isNaN(diasRetiro)) {
    const catalogo = await apiFetch<Catalogo>('/tratamientos/catalogo', { token: access });
    if (catalogo.ok) {
      const coincidencia = catalogo.data.items.find(
        (m) => m.codigo.toUpperCase() === medicamento.toUpperCase(),
      );
      diasRetiro = coincidencia?.diasRetiroCarne ?? 0;
    } else {
      diasRetiro = 0;
    }
  }

  const resultado = await apiFetch<TratamientoCreado>('/tratamientos', {
    method: 'POST',
    token: access,
    body: {
      animalId,
      medicamento,
      iniciadoAt: new Date().toISOString(),
      diasTratamiento: Number.isFinite(diasTratamiento) && diasTratamiento > 0 ? diasTratamiento : 1,
      diasRetiro,
      ...(via ? { via } : {}),
      ...(diagnostico ? { diagnostico } : {}),
      ...(veterinario ? { veterinario } : {}),
    },
  });

  if (!resultado.ok) return { error: `${resultado.error.code}: ${resultado.error.message}` };

  revalidatePath('/salud');

  return {
    ok: true,
    mensaje: `Tratamiento registrado para ${resultado.data.arete}. ${
      resultado.data.puedeVenderse
        ? 'Sin retiro pendiente: el animal puede venderse.'
        : `No podrá venderse ni sacrificarse por ${resultado.data.diasRestantes} día(s), hasta ${resultado.data.finRetiro.slice(0, 10)}.`
    }`,
  };
}
