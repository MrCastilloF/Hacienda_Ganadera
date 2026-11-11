import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { runWithContext, type RequestContext } from './request-context';

interface RawRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  id?: string;
  socket?: { remoteAddress?: string };
  url?: string;
}

interface RawReply {
  header?: (name: string, value: string) => void;
}

/**
 * Abre el contexto de la petición (requestId, IP, user agent) y lo propaga por
 * AsyncLocalStorage para que la auditoría registre el origen sin pasarlo por
 * parámetro en cada capa.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: RawRequest, res: RawReply, next: () => void): void {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && /^[0-9a-f-]{36}$/i.test(incoming) ? incoming : randomUUID();

    req.id = requestId;
    res.header?.('x-request-id', requestId);

    const forwarded = req.headers['x-forwarded-for'];
    const sourceIp =
      (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
      req.ip ??
      req.socket?.remoteAddress;

    const userAgent = req.headers['user-agent'];

    const ctx: RequestContext = {
      requestId,
      ...(sourceIp ? { ip: sourceIp.replace(/^::ffff:/, '') } : {}),
      ...(typeof userAgent === 'string' ? { userAgent: userAgent.slice(0, 300) } : {}),
    };

    runWithContext(ctx, () => next());
  }
}
