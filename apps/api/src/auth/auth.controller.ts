import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { parseBody } from '../common/validation';
import { currentContext } from '../common/request-context';
import { AuthOnly, CurrentUser, Public } from '../rbac/decorators';
import { RateLimiterService } from '../common/rate-limiter.service';
import { APP_CONFIG, type AppConfig } from '../config/env';
import type { AccessTokenPayload } from './token.service';

const LoginSchema = z.object({
  email: z.string().email('Debe ser un correo válido'),
  password: z.string().min(1, 'La contraseña es obligatoria').max(200),
  totp: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos').optional(),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(20, 'Token de refresco inválido'),
});

const PasswordSchema = z.object({
  actual: z.string().min(1, 'La contraseña actual es obligatoria'),
  nueva: z
    .string()
    .min(12, 'La nueva contraseña debe tener al menos 12 caracteres')
    .max(200)
    .regex(/[A-Za-z]/, 'Debe incluir al menos una letra')
    .regex(/[0-9]/, 'Debe incluir al menos un número'),
});

const MfaConfirmSchema = z.object({
  codigo: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos'),
});

@ApiTags('autenticación')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(RateLimiterService) private readonly limiter: RateLimiterService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Inicia sesión y devuelve un token de acceso y uno de refresco' })
  async login(@Body() body: unknown, @Req() request: { ip?: string; headers: Record<string, string> }) {
    const input = parseBody(LoginSchema, body);
    const ctx = currentContext();
    const ip = ctx?.ip ?? request.ip;

    this.limiter.consume(
      `login:${ip ?? 'desconocida'}:${input.email.toLowerCase()}`,
      this.config.login.rateLimitMax,
      this.config.login.rateLimitWindowMs,
    );

    return this.auth.login(input, { ip: ip ?? undefined, userAgent: ctx?.userAgent });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rota el token de refresco y emite un nuevo par de tokens' })
  async refresh(@Body() body: unknown) {
    const { refreshToken } = parseBody(RefreshSchema, body);
    const ctx = currentContext();
    return this.auth.refresh(refreshToken, { ip: ctx?.ip, userAgent: ctx?.userAgent });
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoca el token de refresco (idempotente)' })
  async logout(@Body() body: unknown) {
    const { refreshToken } = parseBody(RefreshSchema, body);
    const ctx = currentContext();
    return this.auth.logout(refreshToken, { ip: ctx?.ip, userAgent: ctx?.userAgent });
  }

  @AuthOnly()
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario autenticado con roles, alcance, fincas y permisos' })
  async me(@CurrentUser() user: AccessTokenPayload) {
    return this.auth.me(user.sub);
  }

  @AuthOnly()
  @Post('password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambia la contraseña y revoca las sesiones activas' })
  async cambiarPassword(@Body() body: unknown, @CurrentUser() user: AccessTokenPayload) {
    const { actual, nueva } = parseBody(PasswordSchema, body);
    const ctx = currentContext();
    return this.auth.cambiarPassword(user.sub, actual, nueva, {
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });
  }

  @AuthOnly()
  @Post('mfa/iniciar')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Genera un secreto TOTP y la URL para el autenticador' })
  async iniciarMfa(@CurrentUser() user: AccessTokenPayload) {
    return this.auth.iniciarMfa(user.sub);
  }

  @AuthOnly()
  @Post('mfa/confirmar')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activa el segundo factor tras verificar un código' })
  async confirmarMfa(@Body() body: unknown, @CurrentUser() user: AccessTokenPayload) {
    const { codigo } = parseBody(MfaConfirmSchema, body);
    return this.auth.confirmarMfa(user.sub, codigo);
  }

  @AuthOnly()
  @Post('mfa/deshabilitar')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desactiva el segundo factor verificando un código vigente' })
  async deshabilitarMfa(@Body() body: unknown, @CurrentUser() user: AccessTokenPayload) {
    const { codigo } = parseBody(MfaConfirmSchema, body);
    return this.auth.deshabilitarMfa(user.sub, codigo);
  }
}
