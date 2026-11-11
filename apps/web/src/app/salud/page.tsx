import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, getSession } from '@/lib/api';
import { registrarTratamientoAction } from './actions';
import { FormularioTratamiento } from './formulario';

export const metadata = { title: 'Salud · Hacienda Ganadera' };

interface Tratamiento {
  id: string;
  arete: string;
  medicamento: string;
  iniciadoAt: string;
  diasRetiro: number;
  finRetiro: string;
  retiroVigente: boolean;
  diasRestantes: number;
  anulado: boolean;
}

interface Alertas {
  ventanaDias: number;
  total: number;
  items: Array<{ arete: string; medicamento: string; finRetiro: string; diasRestantes: number; venceHoy: boolean }>;
}

interface Catalogo {
  total: number;
  aviso: string;
  items: Array<{ codigo: string; nombre: string; diasRetiroCarne: number | null; diasRetiroLeche: number | null }>;
}

interface AnimalResumen {
  id: string;
  arete: string;
  nombre: string | null;
  estado: string;
}

export default async function SaludPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; animalId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const params = await searchParams;
  const token = session.token;

  const [tratamientos, alertas, catalogo] = await Promise.all([
    apiFetch<{ total: number; items: Tratamiento[] }>('/tratamientos?limit=50', { token }),
    apiFetch<Alertas>('/tratamientos/alertas?dias=15', { token }),
    apiFetch<Catalogo>('/tratamientos/catalogo', { token }),
  ]);

  const busqueda = params.q?.trim();
  const buscador = busqueda
    ? await apiFetch<{ total: number; items: AnimalResumen[] }>(
        `/animales?q=${encodeURIComponent(busqueda)}&limit=10`,
        { token },
      )
    : null;

  const encontrados = buscador?.ok ? buscador.data.items : null;
  const vigentes = tratamientos.ok ? tratamientos.data.items.filter((t) => t.retiroVigente && !t.anulado) : [];

  return (
    <main id="contenido" className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-campo-700">Sanidad</p>
          <h1 className="mt-1 text-3xl font-bold text-campo-950">Salud del hato</h1>
          <p className="mt-1 text-sm text-campo-900/70">
            {vigentes.length} animal(es) con retiro vigente. Mientras dure, no se pueden vender ni sacrificar.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/animales" className="text-campo-700 underline">
            Animales
          </Link>
          <Link href="/reportes" className="text-campo-700 underline">
            Crecimiento
          </Link>
          <Link href="/panel" className="text-campo-700 underline">
            Panel
          </Link>
        </div>
      </header>

      {alertas.ok && alertas.data.total > 0 ? (
        <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            Retiros que vencen en los próximos {alertas.data.ventanaDias} días
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {alertas.data.items.map((a) => (
              <li key={`${a.arete}-${a.finRetiro}`}>
                <span className="font-mono text-xs">{a.arete}</span> · {a.medicamento} ·{' '}
                {a.venceHoy ? (
                  <strong>vence hoy</strong>
                ) : (
                  <>quedan {a.diasRestantes} día(s), hasta {a.finRetiro.slice(0, 10)}</>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!params.animalId ? (
        <>
          <form className="mb-6 flex gap-3 rounded-2xl border border-campo-500/20 bg-white p-4">
            <input
              name="q"
              autoFocus
              defaultValue={params.q ?? ''}
              placeholder="Arete del animal a tratar"
              className="flex-1 rounded-lg border border-campo-500/40 px-4 py-3 text-lg"
            />
            <button type="submit" className="rounded-lg bg-campo-900 px-5 py-3 font-semibold text-white">
              Buscar
            </button>
          </form>

          {encontrados ? (
            encontrados.length === 0 ? (
              <p className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
                Ningún animal coincide con «{busqueda}».
              </p>
            ) : (
              <ul className="divide-y divide-campo-100 overflow-hidden rounded-2xl border border-campo-500/20 bg-white">
                {encontrados.map((animal) => (
                  <li key={animal.id}>
                    <Link
                      href={`/salud?animalId=${animal.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-campo-100/50"
                    >
                      <span>
                        <span className="font-mono text-sm">{animal.arete}</span>{' '}
                        <span className="text-campo-900/70">{animal.nombre ?? '—'}</span>
                      </span>
                      <span className="text-xs text-campo-900/60">{animal.estado}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="text-sm text-campo-900/60">
              Busque el animal por arete para registrar un tratamiento.
            </p>
          )}
        </>
      ) : (
        <FormularioTratamiento
          animalId={params.animalId}
          catalogo={catalogo.ok ? catalogo.data.items : []}
          aviso={catalogo.ok ? catalogo.data.aviso : null}
          accion={registrarTratamientoAction}
        />
      )}

      <section className="mt-8 rounded-2xl border border-campo-500/20 bg-white p-6">
        <h2 className="text-lg font-semibold">Tratamientos registrados</h2>
        {!tratamientos.ok ? (
          <p className="mt-2 text-sm text-red-700">{tratamientos.error.message}</p>
        ) : tratamientos.data.items.length === 0 ? (
          <p className="mt-2 text-sm text-campo-900/70">Todavía no hay tratamientos.</p>
        ) : (
          <ul className="mt-3 divide-y divide-campo-100 text-sm">
            {tratamientos.data.items.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono text-xs">{t.arete}</span>
                <span className="text-campo-900/80">{t.medicamento}</span>
                <span className="text-xs text-campo-900/60">
                  {new Date(t.iniciadoAt).toLocaleDateString('es-CO')} · retiro {t.diasRetiro} d
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                    t.anulado
                      ? 'bg-campo-100 text-campo-900/50'
                      : t.retiroVigente
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {t.anulado
                    ? 'anulado'
                    : t.retiroVigente
                      ? `retiro ${t.diasRestantes} d`
                      : 'puede venderse'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-campo-900/50">
          El historial de tratamientos es inmutable: un error se anula con motivo, no se borra.
        </p>
      </section>
    </main>
  );
}
