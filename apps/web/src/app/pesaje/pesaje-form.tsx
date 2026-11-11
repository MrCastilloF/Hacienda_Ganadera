'use client';

import { useActionState, useState } from 'react';
import { registrarPesajeAction, simularPesajeAction, type PesajeState } from './actions';

const inicial: PesajeState = {};

/**
 * Formulario de pesaje.
 *
 * Diseño para campo (RNF-USA-01…03): peso grande, botón amplio, confirmación en
 * dos toques y aviso visible cuando el dato es simulado.
 */
export function PesajeForm({
  animalId,
  arete,
  ultimoPesoKg,
}: {
  animalId: string;
  arete: string;
  ultimoPesoKg: number | null;
}) {
  const [registrar, registrarAccion, registrando] = useActionState(registrarPesajeAction, inicial);
  const [simular, simularAccion, simulando] = useActionState(simularPesajeAction, inicial);
  const [peso, setPeso] = useState('');
  const [clave] = useState(() => crypto.randomUUID());

  const estado = registrar.resultado ? registrar : simular;
  const valor = Number(peso);
  const diferencia =
    ultimoPesoKg !== null && Number.isFinite(valor) && valor > 0
      ? Math.round((valor - ultimoPesoKg) * 10) / 10
      : null;

  return (
    <div className="space-y-6">
      <form action={registrarAccion} className="space-y-5 rounded-2xl border border-campo-500/20 bg-white p-6">
        <input type="hidden" name="animalId" value={animalId} />
        <input type="hidden" name="idempotencyKey" value={clave} />

        <div className="text-center">
          <label htmlFor="pesoKg" className="block text-sm font-medium text-campo-900/70">
            Peso (kg) · animal <span className="font-mono">{arete}</span>
          </label>
          <input
            id="pesoKg"
            name="pesoKg"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            required
            value={peso}
            onChange={(event) => setPeso(event.target.value)}
            className="mt-2 w-full rounded-xl border border-campo-500/40 px-4 py-4 text-center text-5xl font-bold tabular-nums focus:border-campo-700"
            placeholder="0.0"
          />
          <p className="mt-2 text-sm text-campo-900/60">
            {ultimoPesoKg === null
              ? 'Sin pesajes previos'
              : `Último peso: ${ultimoPesoKg} kg${
                  diferencia === null ? '' : ` · diferencia ${diferencia > 0 ? '+' : ''}${diferencia} kg`
                }`}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tipo" className="mb-1 block text-sm font-medium">
              Tipo de pesaje
            </label>
            <select
              id="tipo"
              name="tipo"
              className="w-full rounded-lg border border-campo-500/40 px-3 py-2.5"
              defaultValue="CONTROL"
            >
              {['CONTROL', 'NACIMIENTO', 'DESTETE', 'ENTRADA', 'SALIDA', 'OTRO'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="observaciones" className="mb-1 block text-sm font-medium">
              Observaciones
            </label>
            <input
              id="observaciones"
              name="observaciones"
              maxLength={500}
              className="w-full rounded-lg border border-campo-500/40 px-3 py-2.5"
              placeholder="Opcional"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={registrando}
          className="w-full rounded-xl bg-campo-900 px-4 py-4 text-lg font-semibold text-white transition hover:bg-campo-800 disabled:opacity-60"
        >
          {registrando ? 'Registrando…' : 'Confirmar pesaje'}
        </button>
      </form>

      <form action={simularAccion} className="space-y-3 rounded-2xl border border-dashed border-tierra-500/50 bg-tierra-100/60 p-5">
        <input type="hidden" name="animalId" value={animalId} />
        <p className="text-sm font-semibold text-tierra-500">Báscula simulada (sin hardware)</p>
        <p className="text-xs text-campo-900/70">
          Ejecuta la misma cadena que un pesaje real: adaptador → detección de estabilidad → registro. El
          resultado queda marcado como <strong>SIMULATOR</strong> y no se presenta como dato de campo.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="pesoBaseKg" className="mb-1 block text-xs font-medium">
              Peso a simular (kg)
            </label>
            <input
              id="pesoBaseKg"
              name="pesoBaseKg"
              type="number"
              step="0.1"
              min="0"
              defaultValue="450"
              className="w-32 rounded-lg border border-campo-500/40 px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="modo" className="mb-1 block text-xs font-medium">
              Modo
            </label>
            <select
              id="modo"
              name="modo"
              defaultValue="estable"
              className="rounded-lg border border-campo-500/40 px-3 py-2"
            >
              <option value="estable">Animal quieto</option>
              <option value="inestable">Animal que se mueve</option>
              <option value="sobrecarga">Sobrecarga</option>
              <option value="corrupta">Trama corrupta</option>
              <option value="desconectada">Equipo desconectado</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={simulando}
            className="rounded-lg border border-tierra-500 px-4 py-2 text-sm font-semibold text-tierra-500 hover:bg-tierra-100 disabled:opacity-60"
          >
            {simulando ? 'Simulando…' : 'Simular pesaje'}
          </button>
        </div>
      </form>

      {estado.error ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {estado.error}
        </p>
      ) : null}

      {estado.resultado ? (
        <div
          className={`rounded-xl px-5 py-4 ${
            estado.resultado.origen === 'SIMULATOR' ? 'bg-tierra-100 text-tierra-500' : 'bg-emerald-50 text-emerald-900'
          }`}
        >
          <p className="text-sm font-semibold">
            {estado.resultado.origen === 'SIMULATOR' ? 'Dato SIMULADO registrado' : 'Pesaje registrado'} ·{' '}
            {estado.resultado.pesoKg} kg
          </p>
          <p className="mt-1 text-xs">
            Animal {estado.resultado.arete}
            {estado.resultado.edadDias !== null ? ` · ${estado.resultado.edadDias} días de edad` : ''}
            {estado.resultado.duplicado ? ' · marcado como posible duplicado' : ''}
          </p>
          {estado.diagnostico ? (
            <p className="mt-1 text-xs opacity-80">
              {estado.diagnostico.tramas} tramas · {estado.diagnostico.muestras} muestras · dispersión{' '}
              {estado.diagnostico.dispersionKg ?? '—'} kg
            </p>
          ) : null}
        </div>
      ) : null}

      {estado.aviso ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">{estado.aviso}</p>
      ) : null}
    </div>
  );
}
