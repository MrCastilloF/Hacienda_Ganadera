import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error';
import { AuditService } from '../audit/audit.service';
import { RbacService } from './rbac.service';
import {
  AUTH_ONLY_KEY,
  IS_PUBLIC_KEY,
  PERMISSION_KEY,
  type PermissionRequirement,
} from './decorators';
import type { AccessTokenPayload } from '../auth/token.service';

interface RequestWithUser {
  user?: AccessTokenPayload;
  method?: string;
  url?: string;
  id?: string;
}

/**
 * Autorización de módulo y operación.
 *
 * Deny-by-default: si una ruta no declara `@Require`, `@AuthOnly` o `@Public`,
 * se rechaza. Así, olvidar una anotación produce un 403 visible en las pruebas,
 * no un agujero de autorización silencioso.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) throw AppError.unauthenticated();

    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(
      PERMISSION_KEY,
      targets,
    );

    if (!requirement) {
      if (this.reflector.getAllAndOverride<boolean>(AUTH_ONLY_KEY, targets)) return true;

      await this.audit
        .record({
          action: 'authz.sin_declaracion',
          entity: 'permiso',
          actorId: user.sub,
          resultado: 'DENEGADO',
          after: { method: request.method, url: request.url },
        })
        .catch(() => undefined);

      throw AppError.forbidden(
        'La ruta no declara una política de acceso. Esto es un defecto de configuración.',
      );
    }

    const allowed = await this.rbac.can(user.sub, requirement.modulo, requirement.operacion);
    if (!allowed) {
      await this.audit
        .record({
          action: `${requirement.modulo}.${requirement.operacion}`,
          entity: 'permiso',
          actorId: user.sub,
          resultado: 'DENEGADO',
          after: { method: request.method, url: request.url },
        })
        .catch(() => undefined);

      throw AppError.forbidden(
        `No tiene permiso para ${requirement.operacion} en ${requirement.modulo}`,
      );
    }

    return true;
  }
}
