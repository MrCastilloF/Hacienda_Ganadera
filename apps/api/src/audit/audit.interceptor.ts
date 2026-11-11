import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';
import { wasAudited } from '../common/request-context';

interface HttpRequest {
  method?: string;
  url?: string;
  user?: { sub?: string };
}

/**
 * Red de seguridad de auditoría.
 *
 * Las operaciones de dominio registran su propio evento (con detalle de negocio).
 * Si un endpoint que muta estado no lo hizo, este interceptor deja constancia
 * igualmente: un cambio sin rastro es peor que un rastro genérico.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const method = request.method ?? 'GET';

    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return next.handle();

    return next.handle().pipe(
      tap(() => {
        if (wasAudited()) return;
        const url = (request.url ?? '').split('?')[0] ?? '';
        const entity = url.split('/').filter(Boolean).pop() ?? 'desconocido';
        void this.audit
          .record({
            action: `http.${method.toLowerCase()}`,
            entity,
            actorId: request.user?.sub ?? null,
            resultado: 'OK',
            after: { url },
          })
          .catch(() => undefined);
      }),
    );
  }
}
