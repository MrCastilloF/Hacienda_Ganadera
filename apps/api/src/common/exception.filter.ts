import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError, ErrorCode } from './app-error';
import { currentContext } from './request-context';
import { LOGGER, type Logger } from './logger';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

/**
 * Filtro global de errores (RF-SEG-15).
 * Traduce cualquier excepción a un código estable y nunca devuelve stack traces,
 * consultas ni datos internos.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ id?: string; method?: string; url?: string }>();
    const reply = ctx.getResponse<{
      status: (code: number) => { send: (body: ErrorBody) => void };
    }>();

    const requestId = currentContext()?.requestId ?? request?.id ?? 'desconocido';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL;
    let message = 'Error interno del servidor';
    let details: unknown;
    let logLevel: 'warn' | 'error' = 'error';

    if (exception instanceof AppError) {
      status = exception.status;
      code = exception.code;
      message = exception.expose ? exception.message : 'Error interno del servidor';
      details = exception.expose ? exception.details : undefined;
      logLevel = status >= 500 ? 'error' : 'warn';
    } else if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      code = ErrorCode.VALIDATION_ERROR;
      message = 'Los datos enviados no son válidos';
      details = exception.issues.map((i) => ({ ruta: i.path.join('.'), mensaje: i.message }));
      logLevel = 'warn';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      const payload =
        typeof response === 'string' ? { message: response } : (response as Record<string, unknown>);
      code = mapHttpStatus(status);
      message =
        typeof payload.message === 'string'
          ? payload.message
          : Array.isArray(payload.message)
            ? (payload.message as string[]).join('; ')
            : exception.message;
      logLevel = status >= 500 ? 'error' : 'warn';
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = mapPrismaError(exception);
      status = mapped.status;
      code = mapped.code;
      message = mapped.message;
      logLevel = 'warn';
    }

    const body: ErrorBody = {
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
        requestId,
      },
    };

    if (logLevel === 'error') {
      this.logger.error(
        {
          requestId,
          code,
          status,
          method: request?.method,
          url: request?.url,
          err: serializeError(exception),
        },
        'Error no controlado en la API',
      );
    } else {
      this.logger.warn({ requestId, code, status, method: request?.method, url: request?.url }, message);
    }

    reply.status(status).send(body);
  }
}

function mapHttpStatus(status: number): string {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_ERROR;
    case 401:
      return ErrorCode.UNAUTHENTICATED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 429:
      return ErrorCode.RATE_LIMITED;
    case 503:
      return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      return status >= 500 ? ErrorCode.INTERNAL : ErrorCode.VALIDATION_ERROR;
  }
}

function mapPrismaError(error: Prisma.PrismaClientKnownRequestError): {
  status: number;
  code: string;
  message: string;
} {
  switch (error.code) {
    case 'P2002':
      return { status: 409, code: ErrorCode.CONFLICT, message: 'Ya existe un registro con esos datos' };
    case 'P2003':
      return { status: 409, code: ErrorCode.CONFLICT, message: 'El registro está referenciado por otros datos' };
    case 'P2025':
      return { status: 404, code: ErrorCode.NOT_FOUND, message: 'El recurso no existe' };
    default:
      return { status: 500, code: ErrorCode.INTERNAL, message: 'Error al acceder a los datos' };
  }
}

function serializeError(exception: unknown): Record<string, unknown> {
  if (exception instanceof Error) {
    return { name: exception.name, message: exception.message, stack: exception.stack };
  }
  return { value: String(exception) };
}
