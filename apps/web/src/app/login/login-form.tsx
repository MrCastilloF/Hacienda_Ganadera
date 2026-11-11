'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from '../actions';

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          aria-invalid={state.campo === 'email'}
          aria-describedby={state.campo === 'email' ? 'error' : undefined}
          className="w-full rounded-lg border border-campo-500/40 bg-white px-4 py-3 text-base focus:border-campo-700"
          placeholder="usuario@hacienda.local"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.campo === 'password'}
          aria-describedby={state.campo === 'password' ? 'error' : undefined}
          className="w-full rounded-lg border border-campo-500/40 bg-white px-4 py-3 text-base focus:border-campo-700"
        />
      </div>

      <div>
        <label htmlFor="totp" className="mb-1 block text-sm font-medium">
          Código de verificación <span className="font-normal text-campo-800/70">(si tiene 2FA)</span>
        </label>
        <input
          id="totp"
          name="totp"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="one-time-code"
          aria-invalid={state.campo === 'totp'}
          className="w-full rounded-lg border border-campo-500/40 bg-white px-4 py-3 text-base tracking-[0.4em] focus:border-campo-700"
          placeholder="000000"
        />
      </div>

      {state.error ? (
        <p id="error" role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-campo-900 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-campo-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Verificando…' : 'Entrar'}
      </button>
    </form>
  );
}
