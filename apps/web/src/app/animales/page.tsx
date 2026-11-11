import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, getSession } from '@/lib/api';

export const metadata = { title: 'Animales · Hacienda Ganadera' };

interface AnimalResumen {
  id: string;
  arete: string;
  codigoBarras: string;
  nombre: string | null;
  sexo: string;
  edadMeses: number | null;
  categoria: string;
  estado: string;
  lote: string | null;
  raza: string | null;
}

interface Listado {
  total: number;
  limit: number;
  offset: number;
  items: AnimalResumen[];
}

export default async function AnimalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; categoria?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? '1') || 1);
  const limit = 25;
  const offset = (page - 1) * limit;

  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (params.q) query.set('q', params.q);
  if (params.estado) query.set('estado', params.estado);
  if (params.categoria) query.set('categoria', params.categoria);

  const listado = await apiFetch<Listado>(`/animales?${query.toString()}`, { token: session.token });

  const totalPaginas = listado.ok ? Math.max(1, Math.ceil(listado.data.total / limit)) : 1;

  return (
    <main id="contenido" className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-campo-700">Hato</p>
          <h1 className="mt-1 text-3xl font-bold text-campo-950">Animales</h1>
          <p className="mt-1 text-sm text-campo-900/70">
            {listado.ok ? `${listado.data.total} animales registrados` : 'No fue posible cargar el listado'}
          </p>
        </div>
        <Link href="/panel" className="text-sm font-medium text-campo-700 underline">
          Volver al panel
        </Link>
      </header>

      <form className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-campo-500/20 bg-white p-4">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-campo-900/70">
            Buscar por arete, código de barras o nombre
          </label>
          <input
            id="q"
            name="q"
            defaultValue={params.q ?? ''}
            className="w-full rounded-lg border border-campo-500/40 px-3 py-2"
            placeholder="HG0000011"
          />
        </div>

        <div>
          <label htmlFor="estado" className="mb-1 block text-xs font-medium text-campo-900/70">
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={params.estado ?? ''}
            className="rounded-lg border border-campo-500/40 px-3 py-2"
          >
            <option value="">Todos</option>
            {['activo', 'cuarentena', 'enfermo', 'vendido', 'fallecido', 'sacrificado', 'trasladado'].map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="categoria" className="mb-1 block text-xs font-medium text-campo-900/70">
            Categoría
          </label>
          <select
            id="categoria"
            name="categoria"
            defaultValue={params.categoria ?? ''}
            className="rounded-lg border border-campo-500/40 px-3 py-2"
          >
            <option value="">Todas</option>
            {['TERNERO', 'TERNERA', 'NOVILLO', 'NOVILLA', 'CEBA', 'VACA', 'TORO', 'SIN_CATEGORIA'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-lg bg-campo-900 px-4 py-2 text-sm font-semibold text-white hover:bg-campo-800"
        >
          Filtrar
        </button>
      </form>

      {!listado.ok ? (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          {listado.error.code}: {listado.error.message}
        </p>
      ) : listado.data.items.length === 0 ? (
        <div className="rounded-2xl border border-campo-500/20 bg-white p-8 text-center">
          <p className="text-sm text-campo-900/70">
            No hay animales que coincidan. El registro de animales llega con la importación del hato (Fase 2).
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-campo-500/20 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-campo-100 text-xs uppercase tracking-wide text-campo-900/70">
              <tr>
                <th scope="col" className="px-4 py-3">Arete</th>
                <th scope="col" className="px-4 py-3">Nombre</th>
                <th scope="col" className="px-4 py-3">Sexo</th>
                <th scope="col" className="px-4 py-3">Edad</th>
                <th scope="col" className="px-4 py-3">Categoría</th>
                <th scope="col" className="px-4 py-3">Estado</th>
                <th scope="col" className="px-4 py-3">Lote</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-campo-100">
              {listado.data.items.map((animal) => (
                <tr key={animal.id} className="hover:bg-campo-100/40">
                  <td className="px-4 py-2.5 font-mono text-xs">
                    <Link href={`/animales/${animal.id}`} className="text-campo-700 underline">
                      {animal.arete}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{animal.nombre ?? '—'}</td>
                  <td className="px-4 py-2.5">{animal.sexo === 'HEMBRA' ? 'Hembra' : 'Macho'}</td>
                  <td className="px-4 py-2.5">
                    {animal.edadMeses === null ? '—' : `${animal.edadMeses} m`}
                  </td>
                  <td className="px-4 py-2.5">{animal.categoria}</td>
                  <td className="px-4 py-2.5">{animal.estado}</td>
                  <td className="px-4 py-2.5">{animal.lote ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Paginación">
        <Link
          href={`/animales?page=${Math.max(1, page - 1)}${params.q ? `&q=${encodeURIComponent(params.q)}` : ''}`}
          aria-disabled={page <= 1}
          className={page <= 1 ? 'pointer-events-none opacity-40' : 'text-campo-700 underline'}
        >
          ← Anterior
        </Link>
        <span className="text-campo-900/60">
          Página {page} de {totalPaginas}
        </span>
        <Link
          href={`/animales?page=${Math.min(totalPaginas, page + 1)}${params.q ? `&q=${encodeURIComponent(params.q)}` : ''}`}
          aria-disabled={page >= totalPaginas}
          className={page >= totalPaginas ? 'pointer-events-none opacity-40' : 'text-campo-700 underline'}
        >
          Siguiente →
        </Link>
      </nav>
    </main>
  );
}
