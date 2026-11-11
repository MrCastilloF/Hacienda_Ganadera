import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { apiFetch, getSession } from '@/lib/api';

export const metadata = { title: 'Ficha del animal · Hacienda Ganadera' };

interface Ficha {
  id: string;
  arete: string;
  codigoBarras: string;
  rfid: string | null;
  nombre: string | null;
  sexo: string;
  fechaNacimiento: string | null;
  edadMeses: number | null;
  categoria: { codigo: string; nombre: string; edadMeses: number | null };
  pesoNacimientoKg: number | null;
  raza: { codigo: string; nombre: string } | null;
  color: string | null;
  estado: string;
  estadoProductivo: string | null;
  condicionCorporal: number | null;
  lote: { nombre: string } | null;
  observaciones: string | null;
  version: number;
  createdAt: string;
  genealogia: {
    madre: { arete: string; nombre: string | null } | null;
    padre: { arete: string; nombre: string | null } | null;
    crias: Array<{ id: string; arete: string; fechaNacimiento: string | null }>;
  };
  identificaciones: Array<{ id: string; tipo: string; valor: string; estado: string; vigenteDesde: string }>;
  historialEstados: Array<{ id: string; estadoAnterior: string | null; estadoNuevo: string; motivo: string | null; occurredAt: string }>;
  transicionesPosibles: string[];
}

export default async function FichaAnimalPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const resultado = await apiFetch<Ficha>(`/animales/${id}`, { token: session.token });

  if (!resultado.ok) {
    if (resultado.status === 404) notFound();
    return (
      <main id="contenido" className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">No fue posible abrir la ficha</h1>
        <p className="mt-2 text-sm text-campo-900/70">
          {resultado.error.code}: {resultado.error.message}
        </p>
        <Link href="/animales" className="mt-4 inline-block text-campo-700 underline">
          Volver al listado
        </Link>
      </main>
    );
  }

  const a = resultado.data;

  return (
    <main id="contenido" className="mx-auto max-w-6xl px-6 py-8">
      <nav className="mb-4 text-sm text-campo-900/60">
        <Link href="/animales" className="text-campo-700 underline">
          Animales
        </Link>{' '}
        / <span className="font-mono">{a.arete}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-campo-950">
            {a.nombre ?? 'Sin nombre'}{' '}
            <span className="font-mono text-lg text-campo-900/60">{a.arete}</span>
          </h1>
          <p className="mt-1 text-sm text-campo-900/70">
            {a.categoria.nombre} · {a.sexo === 'HEMBRA' ? 'Hembra' : 'Macho'} ·{' '}
            {a.edadMeses === null ? 'edad no registrada' : `${a.edadMeses} meses`} · estado{' '}
            <strong>{a.estado}</strong>
          </p>
        </div>
        <span className="rounded-lg bg-campo-100 px-3 py-1 text-xs font-semibold text-campo-900">
          versión {a.version}
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-campo-500/20 bg-white p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold">Identificación</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Dato etiqueta="Arete" valor={a.arete} mono />
            <Dato etiqueta="Código de barras" valor={a.codigoBarras} mono />
            <Dato etiqueta="RFID" valor={a.rfid ?? '—'} />
            <Dato etiqueta="Fecha de nacimiento" valor={formatearFecha(a.fechaNacimiento)} />
            <Dato etiqueta="Raza" valor={a.raza?.nombre ?? '—'} />
            <Dato etiqueta="Color" valor={a.color ?? '—'} />
            <Dato etiqueta="Peso al nacer" valor={a.pesoNacimientoKg ? `${a.pesoNacimientoKg} kg` : '—'} />
            <Dato etiqueta="Condición corporal" valor={a.condicionCorporal ? `${a.condicionCorporal}/5` : '—'} />
            <Dato etiqueta="Lote" valor={a.lote?.nombre ?? '—'} />
            <Dato etiqueta="Estado productivo" valor={a.estadoProductivo ?? '—'} />
          </dl>

          {a.observaciones ? (
            <p className="mt-5 rounded-lg bg-campo-100 p-3 text-sm text-campo-900/80">{a.observaciones}</p>
          ) : null}

          <h2 className="mt-8 text-lg font-semibold">Identificadores registrados</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {a.identificaciones.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 border-b border-campo-100 pb-2">
                <span className="font-mono text-xs">{i.valor}</span>
                <span className="text-campo-900/60">{i.tipo}</span>
                <span className="text-campo-900/60">{i.estado}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-campo-900/50">
            Un identificador retirado conserva su historia y no se reutiliza en otro animal.
          </p>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-campo-500/20 bg-white p-6">
            <h2 className="text-lg font-semibold">Genealogía</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Dato etiqueta="Madre" valor={a.genealogia.madre?.arete ?? 'No registrada'} mono />
              <Dato etiqueta="Padre" valor={a.genealogia.padre?.arete ?? 'No registrado'} mono />
            </dl>
            {a.genealogia.crias.length > 0 ? (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-campo-900/60">Crías</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {a.genealogia.crias.map((c) => (
                    <li key={c.id}>
                      <Link href={`/animales/${c.id}`} className="font-mono text-xs text-campo-700 underline">
                        {c.arete}
                      </Link>{' '}
                      <span className="text-campo-900/50">{formatearFecha(c.fechaNacimiento)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-xs text-campo-900/60">Sin crías registradas.</p>
            )}
          </section>

          <section className="rounded-2xl border border-campo-500/20 bg-white p-6">
            <h2 className="text-lg font-semibold">Historial de estado</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {a.historialEstados.map((h) => (
                <li key={h.id} className="border-b border-campo-100 pb-2">
                  <p className="font-medium">
                    {h.estadoAnterior ? `${h.estadoAnterior} → ` : ''}
                    {h.estadoNuevo}
                  </p>
                  <p className="text-xs text-campo-900/60">
                    {new Date(h.occurredAt).toLocaleString('es-CO')}
                  </p>
                  {h.motivo ? <p className="text-xs text-campo-900/70">{h.motivo}</p> : null}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-campo-900/50">
              El historial es inmutable. Transiciones disponibles: {a.transicionesPosibles.join(', ') || 'ninguna'}.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Dato({ etiqueta, valor, mono }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-campo-900/60">{etiqueta}</dt>
      <dd className={mono ? 'font-mono text-sm' : 'text-sm'}>{valor}</dd>
    </div>
  );
}

function formatearFecha(valor: string | null): string {
  if (!valor) return '—';
  return new Date(valor).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
}
