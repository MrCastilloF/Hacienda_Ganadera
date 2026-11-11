import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { AppError, ErrorCode } from '../common/app-error';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  nombre: string;
  roles: string[];
  fincas: string[];
  scope: 'global' | 'finca' | 'lote' | 'propio';
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshFamily: string;
  refreshExpiresAt: Date;
}

/**
 * Emisión y verificación de tokens (RF-SEG-03).
 *
 * · Acceso: JWT firmado RS256, vida corta (15 min por defecto).
 * · Refresco: valor opaco aleatorio, guardado como hash SHA-256. No es un JWT:
 *   así la revocación es inmediata y la reutilización se puede detectar.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async issueAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      algorithm: 'RS256',
      expiresIn: this.config.jwt.accessTtlSeconds,
      issuer: this.config.jwt.issuer,
      audience: this.config.jwt.audience,
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        algorithms: ['RS256'],
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
      });
    } catch (error) {
      const isExpired = error instanceof Error && error.name === 'TokenExpiredError';
      throw new AppError(
        isExpired ? ErrorCode.TOKEN_EXPIRED : ErrorCode.TOKEN_INVALID,
        401,
        isExpired ? 'La sesión expiró' : 'Token inválido',
      );
    }
  }

  createRefreshToken(): { token: string; hash: string; family: string; expiresAt: Date } {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      hash: hashRefreshToken(token),
      family: randomUUID(),
      expiresAt: new Date(Date.now() + this.config.jwt.refreshTtlSeconds * 1000),
    };
  }

  get refreshTtlSeconds(): number {
    return this.config.jwt.refreshTtlSeconds;
  }

  get accessTtlSeconds(): number {
    return this.config.jwt.accessTtlSeconds;
  }
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
