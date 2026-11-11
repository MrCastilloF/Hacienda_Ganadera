import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, getSession } from '@/lib/api';
import { PesajeForm } from './pesaje-form';

export const metadata = { title: 'Pesaje · Hacienda Ganadera' };

interface AnimalResumen {
  id: string;
  arete: string;
  nombre: string | null;
  categoria: string;
  estado: string;
}

interface Ficha {
  id: string;
  arete: string;
  nombre: string | null;
  sexo: string;
  categoria: { codigo: string; nombre: string };
  estado: string;
  admiteOperaciones: boolean;
}

interface Historial {
  total: number;
  ultimo: { anterior: { pesoKg: number } | null };
  items: Array<{ id: string; pesoKg: number; ocurridoAt: string; origen: string; duplicado: boolean }>;
}

export default async function PesajePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; animalId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const params = await searchParams;
  const token = session.token;

  // Sin animal seleccionado: buscador para identificar el animal a pesar.
  if (!params.animalId) {
    const busqueda = params.q?.trim();
    const listado = busqueda
      ? await apiFetch<{ total: number; items: AnimalResumen[] }>(
          `/animales?q=${encodeURIComponent(busqueda)}&limit=10`,
          { token },
        )
      : null;

    const encontrados = listado?.ok ? listado.data.items : null;
    const errorBusqueda = listado && !listado.ok ? listado.error : null;

    return (
      <main id="contenido" className="mx-auto max-w-3xl px-6 py-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-campo-700">Báscula</p>
            <h1 className="mt-1 text-3xl font-bold text-campo-950">Pesaje</h1>
            <p className="mt-1 text-sm text-campo-900/70">
              Escanee o escriba el arete del animal para abrir su pesaje.
            </p>
          </div>
          <Link href="/panel" className="text-sm font-medium text-campo-700 underline">
            Panel
          </Link>
        </header>

        <form className="mb-6 flex gap-3 rounded-2xl border border-campo-500/20 bg-white p-4">
          <input
            name="q"
            autoFocus
            defaultValue={params.q ?? ''}
            placeholder="Arete o código de barras (ej. HG0000014)"
            className="flex-1 rounded-lg border border-campo-500/40 px-4 py-3 text-lg"
          />
          <button
            type="submit"
            className="rounded-lg bg-campo-900 px-5 py-3 font-semibold text-white hover:bg-campo-800"
          >
            Buscar
          </button>
        </form>

        {errorBusqueda ? (
          <p className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
            {errorBusqueda.code}: {errorBusqueda.message}
          </p>
        ) : encontrados ? (
          encontrados.length === 0 ? (
            <p className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
              Ningún animal coincide con «{busqueda}». Verifique el arete o regístrelo primero en el listado de
              animales.
            </p>
          ) : (
            <ul className="divide-y divide-campo-100 overflow-hidden rounded-2xl border border-campo-500/20 bg-white">
              {encontrados.map((animal) => (
                <li key={animal.id}>
                  <Link
                    href={`/pesaje?animalId=${animal.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-campo-100/50"
                  >
                    <span>
                      <span className="font-mono text-sm">{animal.arete}</span>{' '}
                      <span className="text-campo-900/70">{animal.nombre ?? '—'}</span>
                    </span>
                    <span className="text-xs text-campo-900/60">
                      {animal.categoria} · {animal.estado}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="text-sm text-campo-900/60">
            Busque el animal por arete. También puede usar la pistola lectora: escribe el código y presiona Enter.
          </p>
        )}
      </main>
    );
  }

  const [ficha, historial] = await Promise.all([
    apiFetch<Ficha>(`/animales/${params.animalId}`, { token }),
    apiFetch<Historial>(`/pesajes/animal/${params.animalId}`, { token }),
  ]);

  if (!ficha.ok) {
    return (
      <main id="contenido" className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">No se pudo abrir el pesaje</h1>
        <p className="mt-2 text-sm text-campo-900/70">
          {ficha.error.code}: {ficha.error.message}
        </p>
        <Link href="/pesaje" className="mt-4 inline-block text-campo-700 underline">
          Volver al buscador
        </Link>
      </main>
    );
  }

  const animal = ficha.data;
  const ultimo = historial.ok ? historial.data.ultimo.anterior?.pesoKg ?? null : null;

  return (
    <main id="contenido" className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-campo-700">Pesaje</p>
          <h1 className="mt-1 text-3xl font-bold text-campo-950">
            {animal.nombre ?? 'Sin nombre'} <span className="font-mono text-lg text-campo-900/60">{animal.arete}</span>
          </h1>
          <p className="mt-1 text-sm text-campo-900/70">
            {animal.categoria.nombre} · {animal.sexo === 'HEMBRA' ? 'Hembra' : 'Macho'} · estado{' '}
            <strong>{animal.estado}</strong>
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href={`/animales/${animal.id}`} className="text-campo-700 underline">
            Ficha
          </Link>
          <Link href="/pesaje" className="text-campo-700 underline">
            Otro animal
          </Link>
        </div>
      </header>

      {!animal.admiteOperaciones ? (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Este animal está en estado «{animal.estado}» y no admite pesajes. La transición de estado se gestiona
          desde la ficha.
        </p>
      ) : null}

      <PesajeForm animalId={animal.id} arete={animal.arete} ultimoPesoKg={ultimo} />

      {historial.ok && historial.data.items.length > 0 ? (
        <section className="mt-8 rounded-2xl border border-campo-500/20 bg-white p-6">
          <h2 className="text-lg font-semibold">Últimos pesajes</h2>
          <ul className="mt-3 divide-y divide-campo-100 text-sm">
            {historial.data.items.slice(0, 8).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-semibold tabular-nums">{p.pesoKg} kg</span>
                <span className="text-campo-900/60">{new Date(p.ocurridoAt).toLocaleString('es-CO')}</span>
                <span className={p.origen === 'SIMULATOR' ? 'text-tierra-500' : 'text-campo-900/60'}>
                  {p.origen}
                  {p.duplicado ? ' · duplicado' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
