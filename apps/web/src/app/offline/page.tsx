import Link from 'next/link';

export const metadata = { title: 'Sin conexión · Hacienda Ganadera' };

/**
 * Pantalla de último recurso cuando el service worker no puede alcanzar el
 * servidor. Es deliberadamente explícita: la Fase 1 no permite operar sin red;
 * eso llega con el contrato de sincronización de la Fase 12.
 */
export default function OfflinePage() {
  return (
    <main id="contenido" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold text-campo-950">Sin conexión con la hacienda</h1>
      <p className="mt-3 text-sm text-campo-900/80">
        Esta pantalla se sirve desde la memoria del dispositivo porque el servidor local no respondió.
      </p>

      <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">Importante</p>
        <p className="mt-1">
          En esta versión <strong>no se pueden registrar pesajes ni eventos sin conexión</strong>. La operación
          offline con sincronización y resolución de conflictos llega en la Fase 12.
        </p>
        <p className="mt-2">
          Si está en el puesto de pesaje, verifique el cable de red o el Wi-Fi hacia el servidor de la hacienda.
        </p>
      </div>

      <ul className="mt-6 space-y-2 text-sm text-campo-900/80">
        <li>· Confirme que el servidor de la hacienda está encendido (luz y UPS).</li>
        <li>· Verifique que su equipo está en la red local correcta.</li>
        <li>· Si el problema persiste, avise al responsable de sistemas.</li>
      </ul>

      <Link
        href="/login"
        className="mt-8 inline-block rounded-lg bg-campo-900 px-5 py-3 text-center text-sm font-semibold text-white"
      >
        Reintentar
      </Link>
    </main>
  );
}
