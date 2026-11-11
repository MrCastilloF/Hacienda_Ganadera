import { z } from 'zod';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Configuración validada del servicio.
 *
 * Regla: la aplicación no arranca con configuración inválida. Es preferible un
 * fallo al inicio que un comportamiento inseguro en producción (RF-SEG-*).
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PRIVATE_KEY_PATH: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_ISSUER: z.string().default('hacienda-ganadera'),
  JWT_AUDIENCE: z.string().default('hacienda-web'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().min(600).default(28800),

  MFA_ISSUER: z.string().default('Hacienda Ganadera'),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_VERSION: z.string().default('0.1.0'),

  ARGON2_MEMORY_KIB: z.coerce.number().int().min(8192).default(65536),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(3),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  host: string;
  databaseUrl: string;
  jwt: {
    privateKey: string;
    publicKey: string;
    issuer: string;
    audience: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
    ephemeral: boolean;
  };
  mfaIssuer: string;
  login: {
    maxAttempts: number;
    lockMinutes: number;
    rateLimitMax: number;
    rateLimitWindowMs: number;
  };
  corsOrigins: string[];
  logLevel: string;
  version: string;
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
}

function readKey(inline: string | undefined, path: string | undefined): string | undefined {
  if (inline && inline.trim().length > 0) return inline.replace(/\\n/g, '\n');
  if (path && existsSync(path)) return readFileSync(path, 'utf8');
  return undefined;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${detail}`);
  }
  const env = parsed.data;

  let privateKey = readKey(env.JWT_PRIVATE_KEY, env.JWT_PRIVATE_KEY_PATH);
  let publicKey = readKey(env.JWT_PUBLIC_KEY, env.JWT_PUBLIC_KEY_PATH);
  let ephemeral = false;

  if (!privateKey || !publicKey) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'En producción se exigen JWT_PRIVATE_KEY y JWT_PUBLIC_KEY (o sus rutas). ' +
          'No se generan claves efímeras: las sesiones se invalidarían en cada reinicio.',
      );
    }
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
    ephemeral = true;
  }

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    databaseUrl: env.DATABASE_URL,
    jwt: {
      privateKey,
      publicKey,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
      ephemeral,
    },
    mfaIssuer: env.MFA_ISSUER,
    login: {
      maxAttempts: env.LOGIN_MAX_ATTEMPTS,
      lockMinutes: env.LOGIN_LOCK_MINUTES,
      rateLimitMax: env.LOGIN_RATE_LIMIT_MAX,
      rateLimitWindowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
    },
    corsOrigins: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    logLevel: env.LOG_LEVEL,
    version: env.APP_VERSION,
    argon2: {
      memoryCost: env.ARGON2_MEMORY_KIB,
      timeCost: env.ARGON2_TIME_COST,
      parallelism: env.ARGON2_PARALLELISM,
    },
  };
}

/** Token de inyección de dependencias para la configuración. */
export const APP_CONFIG = 'APP_CONFIG';
