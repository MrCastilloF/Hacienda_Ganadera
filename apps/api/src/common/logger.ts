import pino from 'pino';
import type { AppConfig } from '../config/env';

/**
 * Logger estructurado en JSON.
 * Redacta credenciales y datos personales: un log no es un lugar seguro para
 * un token ni para un número de identificación (RF-OPS-05).
 */
export function createLogger(config: AppConfig) {
  return pino({
    level: config.logLevel,
    base: { service: 'hacienda-api', version: config.version, env: config.env },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        '*.password',
        '*.passwordHash',
        '*.refreshToken',
        '*.token',
        '*.mfaSecret',
        '*.mfaSecretEnc',
        'email',
        '*.email',
      ],
      censor: '[redactado]',
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;

export const LOGGER = 'LOGGER';
