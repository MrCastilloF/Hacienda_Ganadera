import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, getSession } from '@/lib/api';
import { logoutAction } from '../actions';

export const metadata = { title: 'Panel · Hacienda Ganadera' };

interface Stats {
  total: number;
  ultimo: string | null;
}

export default async function PanelPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [stats, eventos] = await Promise.all([
    apiFetch<Stats>('/auditoria/estadisticas', { token: session.token }),
    apiFetch<{ total: number; items: Array<{ id: string; action: string; occurredAt: string; resultado: string }> }>(
      '/auditoria?limit=5',
      { token: session.token },
    ),
  ]);

  const { user } = session;
  const finca = user.fincas.find((f) => f.predeterminada) ?? user.fincas[0];

  return (
    <main id="contenido" className="mx-auto max-w-6xl px-6 py-8">
      <nav className="mb-6 flex flex-wrap gap-3 text-sm" aria-label="Accesos directos">
        <Link
          href="/animales"
          className="rounded-lg bg-campo-900 px-4 py-2 font-semibold text-white hover:bg-campo-800"
        >
          Animales
        </Link>
        <Link
          href="/pesaje"
          className="rounded-lg bg-campo-900 px-4 py-2 font-semibold text-white hover:bg-campo-800"
        >
          Pesaje
        </Link>
        <Link
          href="/auditoria"
          className="rounded-lg border border-campo-500/40 px-4 py-2 font-semibold text-campo-900 hover:bg-campo-100"
        >
          Auditoría
        </Link>
      </nav>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-campo-700">
            {finca ? finca.nombre : 'Sin finca asignada'}
          </p>
          <h1 className="mt-1 text-3xl font-bold text-campo-950">Hola, {user.nombre}</h1>
          <p className="mt-1 text-sm text-campo-900/70">
            {user.roles.join(' · ')} · alcance {user.alcance}
          </p>
        </div>

        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-lg border border-campo-500/40 bg-white px-4 py-2 text-sm font-medium hover:bg-campo-100"
          >
            Cerrar sesión
          </button>
        </form>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card titulo="Permisos efectivos" valor={String(user.permisos.length)} nota={`alcance ${user.alcance}`} />
        <Card titulo="Fincas" valor={String(user.fincas.length)} nota={finca?.codigo ?? '—'} />
        <Card
          titulo="Eventos de auditoría"
          valor={stats.ok ? String(stats.data.total) : '—'}
          nota={stats.ok ? 'cadena verificable' : 'no disponible'}
        />
        <Card
          titulo="Segundo factor"
          valor={user.mfaHabilitado ? 'Activo' : 'Inactivo'}
          nota={user.mfaHabilitado ? 'TOTP' : 'recomendado para administradores'}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-campo-500/20 bg-white p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Últimos eventos</h2>
            <Link href="/auditoria" className="text-sm font-medium text-campo-700 underline">
              Ver auditoría completa
            </Link>
          </div>

          {eventos.ok && eventos.data.items.length > 0 ? (
            <ul className="divide-y divide-campo-100">
              {eventos.data.items.map((evento) => (
                <li key={evento.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <span className="font-mono text-xs text-campo-800">{evento.action}</span>
                  <span className="text-campo-900/60">
                    {new Date(evento.occurredAt).toLocaleString('es-CO')}
                  </span>
                  <Badge resultado={evento.resultado} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-campo-900/70">
              Aún no hay eventos. Al iniciar sesión y operar, cada acción queda registrada.
            </p>
          )}
        </div>

        <aside className="rounded-2xl border border-campo-500/20 bg-white p-6">
          <h2 className="text-lg font-semibold">Estado del sistema</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Row etiqueta="Base de datos" valor={stats.ok ? 'Operativa' : 'Sin respuesta'} />
            <Row etiqueta="Auditoría" valor={stats.ok ? 'Íntegra (verificable)' : '—'} />
            <Row etiqueta="Fase" valor="1 · plataforma base" />
            <Row etiqueta="Versión" valor="0.1.0" />
          </dl>
          <p className="mt-5 rounded-lg bg-campo-100 p-3 text-xs text-campo-900/80">
            Módulos de animales, pesajes y pesaje con báscula llegan en las fases 2–4. Lo que ve aquí ya es la
            plataforma real: sesión, permisos y auditoría funcionando.
          </p>
        </aside>
      </section>
    </main>
  );
}

function Card({ titulo, valor, nota }: { titulo: string; valor: string; nota: string }) {
  return (
    <div className="rounded-2xl border border-campo-500/20 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-campo-900/60">{titulo}</p>
      <p className="mt-2 text-3xl font-bold text-campo-950">{valor}</p>
      <p className="mt-1 text-xs text-campo-900/60">{nota}</p>
    </div>
  );
}

function Row({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-campo-900/70">{etiqueta}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}

function Badge({ resultado }: { resultado: string }) {
  const clases =
    resultado === 'OK'
      ? 'bg-emerald-50 text-emerald-800'
      : resultado === 'DENEGADO'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-red-50 text-red-800';
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${clases}`}>{resultado}</span>;
}
