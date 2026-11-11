import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error';
import { setContextUserId } from '../common/request-context';
import { IS_PUBLIC_KEY } from '../rbac/decorators';
import { TokenService, type AccessTokenPayload } from './token.service';

interface RequestWithAuth {
  headers: Record<string, string | string[] | undefined>;
  user?: AccessTokenPayload;
}

/**
 * Autenticación por token de acceso (Bearer JWT RS256).
 * Se ejecuta antes del guard de permisos y deja el usuario en la petición.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const header = request.headers['authorization'] ?? request.headers['Authorization'];
    const value = Array.isArray(header) ? header[0] : header;

    if (!value || !value.startsWith('Bearer ')) {
      throw AppError.unauthenticated('Falta el token de acceso');
    }

    const payload = await this.tokens.verifyAccessToken(value.slice('Bearer '.length).trim());
    request.user = payload;
    setContextUserId(payload.sub);
    return true;
  }
}
