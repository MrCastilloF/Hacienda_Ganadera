import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, getSession } from '@/lib/api';

export const metadata = { title: 'Crecimiento · Hacienda Ganadera' };

interface Fila {
  animalId: string;
  arete: string;
  nombre: string | null;
  categoria: string;
  estado: string;
  pesajes: number;
  ultimoPesoKg: number | null;
  gdpKgDia: number | null;
  clasificacion: 'SIN_DATOS' | 'INSUFICIENTE' | 'BAJO' | 'NORMAL' | 'ALTO';
  rangoEsperado: { minKgDia: number; maxKgDia: number } | null;
  diasTotales: number | null;
  motivo: string | null;
}

interface Reporte {
  total: number;
  resumen: { conDatos: number; bajos: number; sinDatos: number; gdpPromedioKgDia: number | null };
  rangosPorCategoria: Record<string, { minKgDia: number; maxKgDia: number }>;
  items: Fila[];
}

interface Detalle {
  animal: { id: string; arete: string; nombre: string | null; categoria: string; pesoNacimientoKg: number | null };
  resumen: {
    pesajes: number;
    primerPesoKg: number | null;
    ultimoPesoKg: number | null;
    gananciaTotalKg: number | null;
    gdpPromedioKgDia: number | null;
    diasTotales: number | null;
    clasificacion: string;
    rangoEsperado: { minKgDia: number; maxKgDia: number } | null;
    tramos: Array<{ desde: string; hasta: string; dias: number; gananciaKg: number; gdpKgDia: number }>;
  };
  curva: Array<{ fecha: string; pesoKg: number; origen: string }>;
  proyeccion: { pesoEstimadoKg: number | null; advertencia: string | null };
}

const COLOR: Record<string, string> = {
  BAJO: 'bg-red-100 text-red-800',
  NORMAL: 'bg-emerald-100 text-emerald-800',
  ALTO: 'bg-amber-100 text-amber-900',
  INSUFICIENTE: 'bg-campo-100 text-campo-900/70',
  SIN_DATOS: 'bg-campo-100 text-campo-900/50',
};

const ETIQUETA: Record<string, string> = {
  BAJO: 'Crecimiento bajo',
  NORMAL: 'Normal',
  ALTO: 'Por encima del rango',
  INSUFICIENTE: 'Faltan pesajes',
  SIN_DATOS: 'Sin datos',
};

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ soloBajo?: string; animalId?: string; categoria?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const params = await searchParams;
  const query = new URLSearchParams({ limit: '200' });
  if (params.soloBajo === 'true') query.set('soloBajo', 'true');
  if (params.categoria) query.set('categoria', params.categoria);

  const [reporte, detalle] = await Promise.all([
    apiFetch<Reporte>(`/reportes/crecimiento?${query.toString()}`, { token: session.token }),
    params.animalId
      ? apiFetch<Detalle>(`/reportes/crecimiento/${params.animalId}`, { token: session.token })
      : Promise.resolve(null),
  ]);

  if (!reporte.ok) {
    return (
      <main id="contenido" className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-bold">No se pudo cargar el reporte</h1>
        <p className="mt-2 text-sm text-campo-900/70">
          {reporte.error.code}: {reporte.error.message}
        </p>
        <Link href="/panel" className="mt-4 inline-block text-campo-700 underline">
          Volver al panel
        </Link>
      </main>
    );
  }

  const datos = reporte.data;

  return (
    <main id="contenido" className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-campo-700">Reportes</p>
          <h1 className="mt-1 text-3xl font-bold text-campo-950">Crecimiento del hato</h1>
          <p className="mt-1 text-sm text-campo-900/70">
            Ganancia diaria de peso calculada entre pesajes reales. Los animales con crecimiento bajo aparecen
            primero.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/animales" className="text-campo-700 underline">
            Animales
          </Link>
          <Link href="/pesaje" className="text-campo-700 underline">
            Pesaje
          </Link>
          <Link href="/panel" className="text-campo-700 underline">
            Panel
          </Link>
        </div>
      </header>

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta etiqueta="Con datos suficientes" valor={String(datos.resumen.conDatos)} />
        <Tarjeta etiqueta="Crecimiento bajo" valor={String(datos.resumen.bajos)} alerta={datos.resumen.bajos > 0} />
        <Tarjeta etiqueta="Sin pesajes" valor={String(datos.resumen.sinDatos)} />
        <Tarjeta
          etiqueta="GDP promedio del hato"
          valor={datos.resumen.gdpPromedioKgDia === null ? '—' : `${datos.resumen.gdpPromedioKgDia} kg/d`}
        />
      </section>

      <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Filtros">
        <Link
          href="/reportes"
          className={`rounded-lg px-3 py-1.5 ${params.soloBajo === 'true' ? 'border border-campo-500/40' : 'bg-campo-900 text-white'}`}
        >
          Todos
        </Link>
        <Link
          href="/reportes?soloBajo=true"
          className={`rounded-lg px-3 py-1.5 ${params.soloBajo === 'true' ? 'bg-red-600 text-white' : 'border border-campo-500/40'}`}
        >
          Solo crecimiento bajo
        </Link>
      </nav>

      {datos.items.length === 0 ? (
        <p className="rounded-2xl border border-campo-500/20 bg-white p-8 text-center text-sm text-campo-900/70">
          No hay animales con los filtros seleccionados.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-campo-500/20 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-campo-100 text-xs uppercase tracking-wide text-campo-900/70">
              <tr>
                <th scope="col" className="px-4 py-3">Arete</th>
                <th scope="col" className="px-4 py-3">Categoría</th>
                <th scope="col" className="px-4 py-3">Pesajes</th>
                <th scope="col" className="px-4 py-3">Último peso</th>
                <th scope="col" className="px-4 py-3">GDP</th>
                <th scope="col" className="px-4 py-3">Rango esperado</th>
                <th scope="col" className="px-4 py-3">Clasificación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-campo-100">
              {datos.items.map((fila) => (
                <tr key={fila.animalId} className="hover:bg-campo-100/40">
                  <td className="px-4 py-2.5 font-mono text-xs">
                    <Link href={`/reportes?animalId=${fila.animalId}`} className="text-campo-700 underline">
                      {fila.arete}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{fila.categoria}</td>
                  <td className="px-4 py-2.5 tabular-nums">{fila.pesajes}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {fila.ultimoPesoKg === null ? '—' : `${fila.ultimoPesoKg} kg`}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold">
                    {fila.gdpKgDia === null ? '—' : `${fila.gdpKgDia} kg/d`}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-campo-900/60">
                    {fila.rangoEsperado
                      ? `${fila.rangoEsperado.minKgDia}–${fila.rangoEsperado.maxKgDia}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-md px-2 py-1 text-xs font-medium ${COLOR[fila.clasificacion]}`}>
                      {ETIQUETA[fila.clasificacion]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-campo-900/50">
        Los rangos por categoría son una referencia declarada, no una verdad zootécnica: dependen de raza,
        pastura y suplementación. Se excluyen pesajes duplicados y anulados.
      </p>

      {detalle && detalle.ok ? <DetalleCrecimiento detalle={detalle.data} /> : null}
      {detalle && !detalle.ok ? (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No se pudo cargar el detalle: {detalle.error.message}
        </p>
      ) : null}
    </main>
  );
}

function DetalleCrecimiento({ detalle }: { detalle: Detalle }) {
  const { resumen, curva, proyeccion, animal } = detalle;

  return (
    <section className="mt-8 rounded-2xl border border-campo-500/20 bg-white p-6">
      <h2 className="text-lg font-semibold">
        Curva de peso · <span className="font-mono text-sm">{animal.arete}</span>{' '}
        <span className="text-sm font-normal text-campo-900/60">
          {animal.categoria} · {resumen.clasificacion}
        </span>
      </h2>

      {curva.length === 0 ? (
        <p className="mt-3 text-sm text-campo-900/70">Este animal no tiene pesajes válidos todavía.</p>
      ) : (
        <>
          <Chart puntos={curva.map((c) => ({ fecha: new Date(c.fecha), pesoKg: c.pesoKg }))} />

          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Dato etiqueta="Primer peso" valor={resumen.primerPesoKg === null ? '—' : `${resumen.primerPesoKg} kg`} />
            <Dato etiqueta="Último peso" valor={resumen.ultimoPesoKg === null ? '—' : `${resumen.ultimoPesoKg} kg`} />
            <Dato
              etiqueta="Ganancia total"
              valor={resumen.gananciaTotalKg === null ? '—' : `${resumen.gananciaTotalKg} kg`}
            />
            <Dato
              etiqueta="GDP promedio"
              valor={resumen.gdpPromedioKgDia === null ? '—' : `${resumen.gdpPromedioKgDia} kg/d`}
            />
          </dl>

          {resumen.tramos.length > 0 ? (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-campo-900/60">
                  <tr>
                    <th scope="col" className="py-2">Desde</th>
                    <th scope="col" className="py-2">Hasta</th>
                    <th scope="col" className="py-2">Días</th>
                    <th scope="col" className="py-2">Ganancia</th>
                    <th scope="col" className="py-2">GDP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-campo-100">
                  {resumen.tramos.map((tramo) => (
                    <tr key={`${tramo.desde}-${tramo.hasta}`}>
                      <td className="py-1.5 text-xs">{new Date(tramo.desde).toLocaleDateString('es-CO')}</td>
                      <td className="py-1.5 text-xs">{new Date(tramo.hasta).toLocaleDateString('es-CO')}</td>
                      <td className="py-1.5 tabular-nums">{tramo.dias}</td>
                      <td className="py-1.5 tabular-nums">{tramo.gananciaKg} kg</td>
                      <td className="py-1.5 tabular-nums font-medium">{tramo.gdpKgDia} kg/d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {proyeccion.pesoEstimadoKg !== null ? (
            <p className="mt-4 rounded-lg bg-campo-100 px-3 py-2 text-sm text-campo-900/80">
              Estimación a 30 días: <strong>{proyeccion.pesoEstimadoKg} kg</strong>
              {proyeccion.advertencia ? ` · ${proyeccion.advertencia}` : ''}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Gráfico de línea en SVG puro: sin dependencias y funciona sin JavaScript. */
function Chart({ puntos }: { puntos: Array<{ fecha: Date; pesoKg: number }> }) {
  const ancho = 720;
  const alto = 220;
  const margen = 34;

  const pesos = puntos.map((p) => p.pesoKg);
  const minPeso = Math.min(...pesos);
  const maxPeso = Math.max(...pesos);
  const rango = maxPeso - minPeso || 1;

  const x = (i: number) => margen + (i * (ancho - margen * 2)) / Math.max(1, puntos.length - 1);
  const y = (peso: number) => alto - margen - ((peso - minPeso) / rango) * (alto - margen * 2);

  const linea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.pesoKg).toFixed(1)}`).join(' ');
  const area = `${linea} L ${x(puntos.length - 1).toFixed(1)} ${alto - margen} L ${margen} ${alto - margen} Z`;

  return (
    <svg
      viewBox={`0 0 ${ancho} ${alto}`}
      className="mt-4 w-full"
      role="img"
      aria-label={`Curva de peso: de ${minPeso} a ${maxPeso} kg en ${puntos.length} pesajes`}
    >
      <line x1={margen} y1={alto - margen} x2={ancho - margen} y2={alto - margen} stroke="#d6d3d1" />
      <line x1={margen} y1={margen} x2={margen} y2={alto - margen} stroke="#d6d3d1" />
      <path d={area} fill="rgba(87,120,72,0.12)" />
      <path d={linea} fill="none" stroke="#3f5c34" strokeWidth={2.5} strokeLinejoin="round" />
      {puntos.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.pesoKg)} r={3.5} fill="#3f5c34" />
      ))}
      <text x={4} y={margen + 4} className="fill-campo-900/60" fontSize={11}>
        {maxPeso} kg
      </text>
      <text x={4} y={alto - margen} className="fill-campo-900/60" fontSize={11}>
        {minPeso} kg
      </text>
      <text x={margen} y={alto - 8} className="fill-campo-900/60" fontSize={11}>
        {puntos[0]!.fecha.toLocaleDateString('es-CO')}
      </text>
      <text x={ancho - margen - 60} y={alto - 8} className="fill-campo-900/60" fontSize={11}>
        {puntos[puntos.length - 1]!.fecha.toLocaleDateString('es-CO')}
      </text>
    </svg>
  );
}

function Tarjeta({ etiqueta, valor, alerta }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${alerta ? 'border-red-300 bg-red-50' : 'border-campo-500/20 bg-white'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-campo-900/60">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${alerta ? 'text-red-800' : 'text-campo-950'}`}>{valor}</p>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-campo-900/60">{etiqueta}</dt>
      <dd className="text-sm font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}
