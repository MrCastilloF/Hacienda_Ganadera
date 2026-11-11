import { redirect } from 'next/navigation';
import { getSession } from '@/lib/api';
import { LoginForm } from './login-form';

export const metadata = { title: 'Ingresar · Hacienda Ganadera' };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/panel');

  return (
    <main id="contenido" className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-campo-700">
          Plataforma de trazabilidad
        </p>
        <h1 className="mt-2 text-3xl font-bold text-campo-950">Hacienda Ganadera</h1>
        <p className="mt-2 text-sm text-campo-900/70">
          Administración, trazabilidad y monitoreo del hato. Operación local.
        </p>
      </header>

      <section className="rounded-2xl border border-campo-500/20 bg-white p-7 shadow-sm">
        <LoginForm />
      </section>

      <footer className="mt-6 space-y-1 text-center text-xs text-campo-900/60">
        <p>Toda operación queda registrada en la auditoría encadenada.</p>
        <p>Versión 0.1.0 · Fase 1</p>
      </footer>
    </main>
  );
}
