'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, REFRESH_COOKIE, apiFetch } from '@/lib/api';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { nombre: string; roles: string[] };
}

export interface LoginState {
  error?: string;
  campo?: string;
}

/**
 * Inicio de sesión con Server Action.
 *
 * Los tokens se guardan en cookies HttpOnly: el JavaScript del navegador nunca
 * los ve, lo que reduce el impacto de un XSS (RF-SEG-04).
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const totp = String(formData.get('totp') ?? '').trim();

  if (!email || !password) {
    return { error: 'Ingrese su correo y contraseña', campo: !email ? 'email' : 'password' };
  }

  const result = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password, ...(totp ? { totp } : {}) },
  });

  if (!result.ok) {
    if (result.error.code === 'MFA_REQUIRED' || result.error.code === 'INVALID_MFA_CODE') {
      return { error: 'Ingrese el código de 6 dígitos de su autenticador', campo: 'totp' };
    }
    return { error: result.error.message, campo: 'password' };
  }

  const store = await cookies();
  const secure = process.env.NODE_ENV === 'production';

  store.set(ACCESS_COOKIE, result.data.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 15,
  });
  store.set(REFRESH_COOKIE, result.data.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 8,
  });

  redirect('/panel');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    await apiFetch('/auth/logout', { method: 'POST', body: { refreshToken } });
  }

  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  redirect('/login');
}
