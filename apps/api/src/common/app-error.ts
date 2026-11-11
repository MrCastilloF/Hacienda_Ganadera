/**
 * Catálogo de errores de la API.
 *
 * Reglas (RF-SEG-15):
 *  · el cliente recibe un código estable y un mensaje accionable;
 *  · nunca recibe stack trace, consulta SQL, credencial ni dato interno;
 *  · el detalle técnico se registra en el log con el requestId de correlación.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  MFA_REQUIRED: 'MFA_REQUIRED',
  INVALID_MFA_CODE: 'INVALID_MFA_CODE',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REUSED: 'TOKEN_REUSED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly code: ErrorCodeValue;
  readonly status: number;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    code: ErrorCodeValue,
    status: number,
    message: string,
    options: { details?: unknown; expose?: boolean; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = options.details;
    this.expose = options.expose ?? true;
    if (options.cause) this.cause = options.cause;
  }

  static validation(message = 'Los datos enviados no son válidos', details?: unknown): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, 400, message, { details });
  }

  static unauthenticated(message = 'Debe iniciar sesión'): AppError {
    return new AppError(ErrorCode.UNAUTHENTICATED, 401, message);
  }

  static forbidden(message = 'No tiene permiso para realizar esta operación'): AppError {
    return new AppError(ErrorCode.FORBIDDEN, 403, message);
  }

  static notFound(message = 'El recurso no existe'): AppError {
    return new AppError(ErrorCode.NOT_FOUND, 404, message);
  }

  static conflict(message = 'La operación entra en conflicto con el estado actual'): AppError {
    return new AppError(ErrorCode.CONFLICT, 409, message);
  }

  static rateLimited(message = 'Demasiados intentos. Espere unos minutos.'): AppError {
    return new AppError(ErrorCode.RATE_LIMITED, 429, message);
  }

  static internal(message = 'Error interno del servidor', cause?: unknown): AppError {
    return new AppError(ErrorCode.INTERNAL, 500, message, { expose: false, cause });
  }
}
