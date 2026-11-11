import { cookies } from 'next/headers';

export const ACCESS_COOKIE = 'hg_access';
export const REFRESH_COOKIE = 'hg_refresh';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3100';

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError; status: number };

export interface SessionUser {
  id: string;
  email: string;
  nombre: string;
  cargo?: string | null;
  roles: string[];
  alcance: string;
  permisos: Array<{ codigo: string; alcance: string }>;
  fincas: Array<{ id: string; codigo: string; nombre: string; moneda: string; predeterminada: boolean }>;
  mfaHabilitado: boolean;
  ultimoAccesoAt?: string | null;
}

export interface AuditEvent {
  id: string;
  occurredAt: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  resultado: 'OK' | 'ERROR' | 'DENEGADO';
  ip: string | null;
  requestId: string;
  hash: string;
}

/** Llamada al backend desde el servidor (los tokens no llegan al navegador). */
export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<ApiResult<T>> {
  const { method = 'GET', body, token } = options;

  try {
    const response = await fetch(`${API_URL}/api/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });

    const text = await response.text();
    const parsed: unknown = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const error = (parsed as { error?: ApiError } | null)?.error ?? {
        code: 'ERROR_DESCONOCIDO',
        message: `El servidor respondió ${response.status}`,
      };
      return { ok: false, error, status: response.status };
    }

    return { ok: true, data: parsed as T };
  } catch {
    return {
      ok: false,
      status: 503,
      error: {
        code: 'SIN_CONEXION',
        message: 'No fue posible contactar el servidor de la hacienda. Verifique la red local.',
      },
    };
  }
}

export async function getSession(): Promise<{ user: SessionUser; token: string } | null> {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  const result = await apiFetch<SessionUser>('/auth/me', { token });
  if (!result.ok) return null;
  return { user: result.data, token };
}
