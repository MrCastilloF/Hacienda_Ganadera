import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/token.service';

export const IS_PUBLIC_KEY = 'auth:public';
export const AUTH_ONLY_KEY = 'auth:only';
export const PERMISSION_KEY = 'auth:permission';

export interface PermissionRequirement {
  modulo: string;
  operacion: string;
}

/** Ruta sin autenticación (login, refresco, salud). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Ruta que solo exige sesión válida, sin permiso de módulo (por ejemplo /auth/me). */
export const AuthOnly = () => SetMetadata(AUTH_ONLY_KEY, true);

/**
 * Exige un permiso concreto.
 * El guard rechaza cualquier ruta autenticada que no declare `@Require`,
 * `@AuthOnly` o `@Public`: el defecto es denegar, no permitir.
 */
export const Require = (modulo: string, operacion: string) =>
  SetMetadata(PERMISSION_KEY, { modulo, operacion } satisfies PermissionRequirement);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ user?: AccessTokenPayload }>();
  return request.user;
});
