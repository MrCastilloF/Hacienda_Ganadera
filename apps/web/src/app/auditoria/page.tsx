import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, getSession } from '@/lib/api';

export const metadata = { title: 'Auditoría · Hacienda Ganadera' };

interface Evento {
  id: string;
  occurredAt: string;
  action: string;
  entity: string;
  entityId: string | null;
  resultado: string;
  ip: string | null;
  hash: string;
}

interface Verificacion {
  integra: boolean;
  rupturas: Array<{ id: string; motivo: string }>;
  verificadoEn: string;
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? '1') || 1);
  const limit = 25;
  const offset = (page - 1) * limit;

  const [lista, verificacion] = await Promise.all([
    apiFetch<{ total: number; items: Evento[] }>(`/auditoria?limit=${limit}&offset=${offset}`, {
      token: session.token,
    }),
    apiFetch<Verificacion>('/auditoria/verificar', { token: session.token }),
  ]);

  if (!lista.ok) {
    return (
      <main id="contenido" className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">Auditoría no disponible</h1>
        <p className="mt-2 text-sm text-campo-900/70">
          {lista.error.code}: {lista.error.message}
        </p>
        <Link href="/panel" className="mt-4 inline-block text-campo-700 underline">
          Volver al panel
        </Link>
      </main>
    );
  }

  const totalPaginas = Math.max(1, Math.ceil(lista.data.total / limit));

  return (
    <main id="contenido" className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-campo-950">Auditoría</h1>
          <p className="mt-1 text-sm text-campo-900/70">
            {lista.data.total} eventos · cadena de hashes SHA-256 verificable
          </p>
        </div>
        <Link href="/panel" className="text-sm font-medium text-campo-700 underline">
          Volver al panel
        </Link>
      </header>

      <section
        className={`mb-6 rounded-2xl border p-5 ${
          verificacion.ok && verificacion.data.integra
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-amber-300 bg-amber-50'
        }`}
      >
        <h2 className="text-sm font-semibold">
          {verificacion.ok && verificacion.data.integra
            ? 'Cadena íntegra: ningún registro fue alterado'
            : 'No fue posible verificar la cadena'}
        </h2>
        <p className="mt-1 text-xs text-campo-900/70">
          {verificacion.ok
            ? `Verificado ${new Date(verificacion.data.verificadoEn).toLocaleString('es-CO')}`
            : verificacion.error.message}
        </p>
      </section>

      <div className="overflow-hidden rounded-2xl border border-campo-500/20 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-campo-100 text-xs uppercase tracking-wide text-campo-900/70">
            <tr>
              <th scope="col" className="px-4 py-3">Fecha</th>
              <th scope="col" className="px-4 py-3">Acción</th>
              <th scope="col" className="px-4 py-3">Entidad</th>
              <th scope="col" className="px-4 py-3">Resultado</th>
              <th scope="col" className="px-4 py-3">Hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-campo-100">
            {lista.data.items.map((evento) => (
              <tr key={evento.id} className="hover:bg-campo-100/40">
                <td className="whitespace-nowrap px-4 py-2.5 text-campo-900/70">
                  {new Date(evento.occurredAt).toLocaleString('es-CO')}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{evento.action}</td>
                <td className="px-4 py-2.5">
                  {evento.entity}
                  {evento.entityId ? ` · ${evento.entityId.slice(0, 8)}` : ''}
                </td>
                <td className="px-4 py-2.5">{evento.resultado}</td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-campo-900/60">
                  {evento.hash.slice(0, 16)}…
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Paginación">
        <Link
          href={`/auditoria?page=${Math.max(1, page - 1)}`}
          aria-disabled={page <= 1}
          className={page <= 1 ? 'pointer-events-none opacity-40' : 'text-campo-700 underline'}
        >
          ← Anterior
        </Link>
        <span className="text-campo-900/60">
          Página {page} de {totalPaginas}
        </span>
        <Link
          href={`/auditoria?page=${Math.min(totalPaginas, page + 1)}`}
          aria-disabled={page >= totalPaginas}
          className={page >= totalPaginas ? 'pointer-events-none opacity-40' : 'text-campo-700 underline'}
        >
          Siguiente →
        </Link>
      </nav>
    </main>
  );
}
