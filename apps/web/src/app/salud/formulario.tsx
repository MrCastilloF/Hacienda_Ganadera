'use client';

import { useActionState, useState } from 'react';
import type { SaludState } from './actions';

const inicial: SaludState = {};

/**
 * Formulario de tratamiento.
 *
 * El retiro se propone desde el catálogo pero queda **editable**: el veterinario
 * manda sobre la referencia. Si se deja vacío, el servidor usa el valor del
 * catálogo.
 */
export function FormularioTratamiento({
  animalId,
  catalogo,
  aviso,
  accion,
}: {
  animalId: string;
  catalogo: Array<{ codigo: string; nombre: string; diasRetiroCarne: number | null }>;
  aviso: string | null;
  accion: (prev: SaludState, formData: FormData) => Promise<SaludState>;
}) {
  const [estado, enviar, enviando] = useActionState(accion, inicial);
  const [codigo, setCodigo] = useState('');

  const seleccionado = catalogo.find((m) => m.codigo === codigo);

  return (
    <form action={enviar} className="space-y-4 rounded-2xl border border-campo-500/20 bg-white p-6">
      <input type="hidden" name="animalId" value={animalId} />

      <div>
        <label htmlFor="medicamento" className="mb-1 block text-sm font-medium">
          Medicamento
        </label>
        <select
          id="medicamento"
          name="medicamento"
          required
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value)}
          className="w-full rounded-lg border border-campo-500/40 px-3 py-3 text-base"
        >
          <option value="">Seleccione…</option>
          {catalogo.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.nombre}
              {m.diasRetiroCarne !== null ? ` (retiro ${m.diasRetiroCarne} d)` : ''}
            </option>
          ))}
          <option value="OTRO">Otro (escribir abajo)</option>
        </select>
      </div>

      {codigo === 'OTRO' ? (
        <div>
          <label htmlFor="medicamentoLibre" className="mb-1 block text-sm font-medium">
            Nombre del medicamento
          </label>
          <input
            id="medicamentoLibre"
            name="medicamento"
            required
            maxLength={120}
            className="w-full rounded-lg border border-campo-500/40 px-3 py-2.5"
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="diasTratamiento" className="mb-1 block text-sm font-medium">
            Días de tratamiento
          </label>
          <input
            id="diasTratamiento"
            name="diasTratamiento"
            type="number"
            min={1}
            max={365}
            defaultValue={1}
            className="w-full rounded-lg border border-campo-500/40 px-3 py-2.5"
          />
        </div>
        <div>
          <label htmlFor="diasRetiro" className="mb-1 block text-sm font-medium">
            Días de retiro
          </label>
          <input
            id="diasRetiro"
            name="diasRetiro"
            type="number"
            min={0}
            max={365}
            placeholder={
              seleccionado?.diasRetiroCarne !== null && seleccionado?.diasRetiroCarne !== undefined
                ? String(seleccionado.diasRetiroCarne)
                : 'según catálogo'
            }
            className="w-full rounded-lg border border-campo-500/40 px-3 py-2.5"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="via" className="mb-1 block text-sm font-medium">
            Vía
          </label>
          <select id="via" name="via" className="w-full rounded-lg border border-campo-500/40 px-3 py-2.5">
            <option value="">—</option>
            {['IM', 'IV', 'SC', 'ORAL', 'TOPICA', 'INTRAMAMARIA', 'OTRA'].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="veterinario" className="mb-1 block text-sm font-medium">
            Veterinario
          </label>
          <input
            id="veterinario"
            name="veterinario"
            maxLength={120}
            className="w-full rounded-lg border border-campo-500/40 px-3 py-2.5"
          />
        </div>
      </div>

      <div>
        <label htmlFor="diagnostico" className="mb-1 block text-sm font-medium">
          Diagnóstico
        </label>
        <input
          id="diagnostico"
          name="diagnostico"
          maxLength={200}
          placeholder="Opcional"
          className="w-full rounded-lg border border-campo-500/40 px-3 py-2.5"
        />
      </div>

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-xl bg-campo-900 px-4 py-3.5 text-lg font-semibold text-white hover:bg-campo-800 disabled:opacity-60"
      >
        {enviando ? 'Registrando…' : 'Registrar tratamiento'}
      </button>

      {aviso ? <p className="text-xs text-campo-900/50">{aviso}</p> : null}

      {estado.error ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {estado.error}
        </p>
      ) : null}

      {estado.mensaje ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{estado.mensaje}</p>
      ) : null}
    </form>
  );
}
