import { Inject, Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { AppConfig } from '../config/env';
import { AppError, ErrorCode } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password.service';
import { TokenService, hashRefreshToken } from './token.service';
import { RbacService } from '../rbac/rbac.service';
import { generateCode, generateSecret, otpauthUrl, verifyCode } from './totp';

export interface LoginInput {
  email: string;
  password: string;
  totp?: string;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: {
    id: string;
    email: string;
    nombre: string;
    roles: string[];
    fincas: string[];
    scope: string;
    mfaHabilitado: boolean;
    permisos: string[];
  };
}

/**
 * Autenticación (RF-SEG-01…08).
 *
 * Decisiones relevantes:
 *  · El mensaje de credenciales inválidas es idéntico exista o no el usuario:
 *    evita enumeración de cuentas.
 *  · Los intentos fallidos se cuentan con bloqueo temporal configurable.
 *  · El refresco es rotativo y de un solo uso: reutilizar un token revocado
 *    revoca toda la familia (detección de robo de sesión).
 *  · Todo se registra en la auditoría encadenada dentro de la transacción.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    @Inject('APP_CONFIG') private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(RbacService) private readonly rbac: RbacService,
  ) {
    this.encryptionKey = this.deriveEncryptionKey(config);
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<SessionResult> {
    const email = input.email.trim().toLowerCase();

    const usuario = await this.prisma.usuario.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    });

    if (!usuario) {
      await this.registerAttempt(email, meta, false, 'usuario_inexistente');
      await this.audit.record({
        action: 'auth.login',
        entity: 'usuario',
        actorId: null,
        resultado: 'DENEGADO',
        after: { email, motivo: 'usuario_inexistente' },
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 401, 'Credenciales inválidas');
    }

    if (usuario.bloqueadoHasta && usuario.bloqueadoHasta.getTime() > Date.now()) {
      const minutos = Math.max(1, Math.ceil((usuario.bloqueadoHasta.getTime() - Date.now()) / 60000));
      await this.audit.record({
        action: 'auth.login',
        entity: 'usuario',
        entityId: usuario.id,
        actorId: usuario.id,
        resultado: 'DENEGADO',
        after: { motivo: 'cuenta_bloqueada' },
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
      throw new AppError(
        ErrorCode.ACCOUNT_LOCKED,
        423,
        `La cuenta está bloqueada por intentos fallidos. Intente en ${minutos} minuto(s).`,
      );
    }

    if (!usuario.activo) {
      await this.registerAttempt(email, meta, false, 'usuario_inactivo');
      throw new AppError(ErrorCode.ACCOUNT_INACTIVE, 403, 'El usuario está desactivado');
    }

    const passwordOk = await this.passwords.verify(usuario.passwordHash, input.password);
    if (!passwordOk) {
      await this.handleFailedPassword(usuario.id, usuario.intentosFallidos, email, meta);
    }

    if (usuario.mfaHabilitado) {
      if (!input.totp) {
        throw new AppError(ErrorCode.MFA_REQUIRED, 401, 'Se requiere el código de verificación');
      }
      const secret = usuario.mfaSecretEnc ? this.decrypt(usuario.mfaSecretEnc) : null;
      if (!secret || !verifyCode(secret, input.totp)) {
        await this.registerAttempt(email, meta, false, 'codigo_mfa_invalido');
        await this.audit.record({
          action: 'auth.mfa',
          entity: 'usuario',
          entityId: usuario.id,
          actorId: usuario.id,
          resultado: 'DENEGADO',
          after: { motivo: 'codigo_invalido' },
        });
        throw new AppError(ErrorCode.INVALID_MFA_CODE, 401, 'Código de verificación inválido');
      }
    }

    const context = await this.rbac.getContext(usuario.id);
    if (!context) throw AppError.unauthenticated('El usuario ya no está disponible');

    const refresh = this.tokens.createRefreshToken();

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuario.id },
        data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoAccesoAt: new Date() },
      });
      await tx.intentoLogin.create({
        data: { email, ip: meta.ip ?? null, exito: true, motivo: null },
      });
      const created = await tx.sesion.create({
        data: {
          usuarioId: usuario.id,
          refreshFamily: refresh.family,
          refreshHash: refresh.hash,
          userAgent: meta.userAgent ?? null,
          ip: meta.ip ?? null,
          expiraAt: refresh.expiresAt,
        },
      });
      await this.audit.record(
        {
          action: 'auth.login',
          entity: 'sesion',
          entityId: created.id,
          actorId: usuario.id,
          resultado: 'OK',
          after: { familia: refresh.family },
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
        tx,
      );
      return created;
    });

    const accessToken = await this.tokens.issueAccessToken({
      sub: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      roles: context.roles,
      fincas: context.fincas,
      scope: context.scope,
    });

    this.logger.log({ usuarioId: usuario.id, sesionId: session.id }, 'Inicio de sesión correcto');

    return {
      accessToken,
      refreshToken: refresh.token,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTtlSeconds,
      user: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        roles: context.roles,
        fincas: context.fincas,
        scope: context.scope,
        mfaHabilitado: usuario.mfaHabilitado,
        permisos: [...context.permissions.keys()].sort(),
      },
    };
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<SessionResult> {
    const hash = hashRefreshToken(refreshToken);
    const sesion = await this.prisma.sesion.findUnique({ where: { refreshHash: hash } });

    if (!sesion) {
      throw new AppError(ErrorCode.TOKEN_INVALID, 401, 'Token de refresco inválido');
    }

    if (sesion.revocadaAt) {
      // Reutilización de un token ya rotado: se asume robo y se revoca la familia.
      await this.revokeFamily(sesion.refreshFamily, 'reutilizacion_detectada');
      await this.audit.record({
        action: 'auth.refresh.reuso',
        entity: 'sesion',
        entityId: sesion.id,
        actorId: sesion.usuarioId,
        resultado: 'DENEGADO',
        after: { familia: sesion.refreshFamily },
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
      throw new AppError(
        ErrorCode.TOKEN_REUSED,
        401,
        'La sesión fue invalidada por seguridad. Vuelva a iniciar sesión.',
      );
    }

    if (sesion.expiraAt.getTime() <= Date.now()) {
      throw new AppError(ErrorCode.TOKEN_EXPIRED, 401, 'La sesión expiró');
    }

    const context = await this.rbac.getContext(sesion.usuarioId);
    if (!context) throw new AppError(ErrorCode.ACCOUNT_INACTIVE, 403, 'El usuario ya no está disponible');

    const usuario = await this.prisma.usuario.findFirst({
      where: { id: sesion.usuarioId, deletedAt: null },
      select: { id: true, email: true, nombre: true, mfaHabilitado: true },
    });
    if (!usuario) throw new AppError(ErrorCode.ACCOUNT_INACTIVE, 403, 'El usuario ya no está disponible');

    const next = this.tokens.createRefreshToken();

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.sesion.create({
        data: {
          usuarioId: sesion.usuarioId,
          refreshFamily: sesion.refreshFamily,
          refreshHash: next.hash,
          userAgent: meta.userAgent ?? sesion.userAgent,
          ip: meta.ip ?? sesion.ip,
          expiraAt: next.expiresAt,
        },
      });
      await tx.sesion.update({
        where: { id: sesion.id },
        data: {
          revocadaAt: new Date(),
          reemplazadaPor: created.id,
          motivoRevocacion: 'rotacion',
        },
      });
      await this.audit.record(
        {
          action: 'auth.refresh',
          entity: 'sesion',
          entityId: created.id,
          actorId: sesion.usuarioId,
          resultado: 'OK',
          after: { anterior: sesion.id },
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
        tx,
      );
    });

    const accessToken = await this.tokens.issueAccessToken({
      sub: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      roles: context.roles,
      fincas: context.fincas,
      scope: context.scope,
    });

    return {
      accessToken,
      refreshToken: next.token,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTtlSeconds,
      user: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        roles: context.roles,
        fincas: context.fincas,
        scope: context.scope,
        mfaHabilitado: usuario.mfaHabilitado,
        permisos: [...context.permissions.keys()].sort(),
      },
    };
  }

  async logout(refreshToken: string, meta: RequestMeta): Promise<{ revocado: boolean }> {
    const hash = hashRefreshToken(refreshToken);
    const sesion = await this.prisma.sesion.findUnique({ where: { refreshHash: hash } });
    if (!sesion || sesion.revocadaAt) return { revocado: false };

    await this.prisma.$transaction(async (tx) => {
      await tx.sesion.update({
        where: { id: sesion.id },
        data: { revocadaAt: new Date(), motivoRevocacion: 'logout' },
      });
      await this.audit.record(
        {
          action: 'auth.logout',
          entity: 'sesion',
          entityId: sesion.id,
          actorId: sesion.usuarioId,
          resultado: 'OK',
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
        tx,
      );
    });

    return { revocado: true };
  }

  async me(userId: string) {
    const context = await this.rbac.getContext(userId);
    if (!context) throw AppError.unauthenticated();

    const usuario = await this.prisma.usuario.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        nombre: true,
        cargo: true,
        mfaHabilitado: true,
        ultimoAccesoAt: true,
        fincas: {
          select: {
            fincaId: true,
            esPredeterminada: true,
            finca: { select: { codigo: true, nombre: true, zonaHoraria: true, moneda: true } },
          },
        },
      },
    });

    if (!usuario) throw AppError.unauthenticated();

    return {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      cargo: usuario.cargo,
      mfaHabilitado: usuario.mfaHabilitado,
      ultimoAccesoAt: usuario.ultimoAccesoAt,
      roles: context.roles,
      alcance: context.scope,
      permisos: [...context.permissions.entries()]
        .map(([codigo, alcance]) => ({ codigo, alcance }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo)),
      fincas: usuario.fincas.map((f) => ({
        id: f.fincaId,
        codigo: f.finca.codigo,
        nombre: f.finca.nombre,
        zonaHoraria: f.finca.zonaHoraria,
        moneda: f.finca.moneda,
        predeterminada: f.esPredeterminada,
      })),
    };
  }

  async iniciarMfa(userId: string): Promise<{ secreto: string; url: string }> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!usuario) throw AppError.notFound('Usuario no encontrado');
    if (usuario.mfaHabilitado) {
      throw AppError.conflict('El segundo factor ya está activo. Desactívelo antes de reconfigurarlo.');
    }

    const secreto = generateSecret();
    await this.prisma.usuario.update({
      where: { id: userId },
      data: { mfaSecretEnc: this.encrypt(secreto) },
    });

    await this.audit.record({
      action: 'auth.mfa.iniciar',
      entity: 'usuario',
      entityId: userId,
      actorId: userId,
      resultado: 'OK',
    });

    return { secreto, url: otpauthUrl(secreto, usuario.email, this.config.mfaIssuer) };
  }

  async confirmarMfa(userId: string, codigo: string): Promise<{ habilitado: boolean }> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!usuario?.mfaSecretEnc) throw AppError.conflict('No hay una configuración de MFA en curso');

    const secreto = this.decrypt(usuario.mfaSecretEnc);
    if (!verifyCode(secreto, codigo)) {
      await this.audit.record({
        action: 'auth.mfa.confirmar',
        entity: 'usuario',
        entityId: userId,
        actorId: userId,
        resultado: 'DENEGADO',
        after: { motivo: 'codigo_invalido' },
      });
      throw new AppError(ErrorCode.INVALID_MFA_CODE, 400, 'Código de verificación inválido');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: userId }, data: { mfaHabilitado: true } });
      await this.audit.record(
        {
          action: 'auth.mfa.confirmar',
          entity: 'usuario',
          entityId: userId,
          actorId: userId,
          resultado: 'OK',
          after: { mfaHabilitado: true },
        },
        tx,
      );
    });

    return { habilitado: true };
  }

  async deshabilitarMfa(userId: string, codigo: string): Promise<{ habilitado: boolean }> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!usuario?.mfaHabilitado) throw AppError.conflict('El segundo factor no está activo');

    const secreto = usuario.mfaSecretEnc ? this.decrypt(usuario.mfaSecretEnc) : null;
    if (!secreto || !verifyCode(secreto, codigo)) {
      throw new AppError(ErrorCode.INVALID_MFA_CODE, 400, 'Código de verificación inválido');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: userId },
        data: { mfaHabilitado: false, mfaSecretEnc: null },
      });
      await this.audit.record(
        {
          action: 'auth.mfa.desactivar',
          entity: 'usuario',
          entityId: userId,
          actorId: userId,
          resultado: 'OK',
          after: { mfaHabilitado: false },
        },
        tx,
      );
    });

    return { habilitado: false };
  }

  async cambiarPassword(
    userId: string,
    actual: string,
    nueva: string,
    meta: RequestMeta,
  ): Promise<{ actualizada: boolean; sesionesRevocadas: number }> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!usuario) throw AppError.notFound('Usuario no encontrado');

    const ok = await this.passwords.verify(usuario.passwordHash, actual);
    if (!ok) {
      await this.audit.record({
        action: 'auth.password',
        entity: 'usuario',
        entityId: userId,
        actorId: userId,
        resultado: 'DENEGADO',
        after: { motivo: 'password_actual_incorrecta' },
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 400, 'La contraseña actual no es correcta');
    }

    const nuevoHash = await this.passwords.hash(nueva);

    const revocadas = await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: userId },
        data: { passwordHash: nuevoHash, passwordCambiadaAt: new Date() },
      });
      const result = await tx.sesion.updateMany({
        where: { usuarioId: userId, revocadaAt: null },
        data: { revocadaAt: new Date(), motivoRevocacion: 'cambio_password' },
      });
      await this.audit.record(
        {
          action: 'auth.password',
          entity: 'usuario',
          entityId: userId,
          actorId: userId,
          resultado: 'OK',
          after: { sesionesRevocadas: result.count },
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
        tx,
      );
      return result.count;
    });

    return { actualizada: true, sesionesRevocadas: revocadas };
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  private async handleFailedPassword(
    usuarioId: string,
    intentosPrevios: number,
    email: string,
    meta: RequestMeta,
  ): Promise<never> {
    const intentos = intentosPrevios + 1;
    const debeBloquear = intentos >= this.config.login.maxAttempts;
    const bloqueadoHasta = debeBloquear
      ? new Date(Date.now() + this.config.login.lockMinutes * 60_000)
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { intentosFallidos: intentos, bloqueadoHasta },
      });
      await tx.intentoLogin.create({
        data: { email, ip: meta.ip ?? null, exito: false, motivo: 'password_incorrecta' },
      });
      await this.audit.record(
        {
          action: 'auth.login',
          entity: 'usuario',
          entityId: usuarioId,
          actorId: usuarioId,
          resultado: 'DENEGADO',
          after: { intentos, bloqueado: Boolean(bloqueadoHasta) },
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
        tx,
      );
    });

    throw new AppError(ErrorCode.INVALID_CREDENTIALS, 401, 'Credenciales inválidas');
  }

  private async registerAttempt(
    email: string,
    meta: RequestMeta,
    exito: boolean,
    motivo: string,
  ): Promise<void> {
    await this.prisma.intentoLogin.create({
      data: { email, ip: meta.ip ?? null, exito, motivo },
    });
  }

  private async revokeFamily(family: string, motivo: string): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { refreshFamily: family, revocadaAt: null },
      data: { revocadaAt: new Date(), motivoRevocacion: motivo },
    });
  }

  private deriveEncryptionKey(config: AppConfig): Buffer {
    const source = config.jwt.privateKey;
    return createHash('sha256').update(`mfa:${source}`).digest();
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
  }

  private decrypt(payload: string): string {
    const [version, ivB64, dataB64, tagB64] = payload.split('.');
    if (version !== 'v1' || !ivB64 || !dataB64 || !tagB64) {
      throw AppError.internal('Secreto MFA con formato inválido');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Utilidad para pruebas: genera un código válido del secreto indicado. */
  static codigoPara(secreto: string, at?: number): string {
    return generateCode(secreto, at);
  }
}
