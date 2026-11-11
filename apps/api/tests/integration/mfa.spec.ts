import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateCode } from '../../src/auth/totp';
import {
  cleanupTestUsers,
  closeTestContext,
  createTestContext,
  get,
  login,
  post,
  upsertTestUser,
  type TestContext,
} from './helpers';

const EMAIL = 'prueba.mfa@hacienda.local';

describe('segundo factor TOTP (integración)', () => {
  let ctx: TestContext;
  let token: string;
  let secreto: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    await upsertTestUser(ctx.prisma, EMAIL, ['superadmin']);
    const sesion = await login(ctx, EMAIL);
    token = sesion.body.accessToken;
  });

  afterAll(async () => {
    // Se deja el usuario sin segundo factor para no interferir con otras suites.
    await ctx.prisma.usuario.updateMany({
      where: { email: EMAIL },
      data: { mfaHabilitado: false, mfaSecretEnc: null },
    });
    await cleanupTestUsers(ctx.prisma, [EMAIL]);
    await closeTestContext(ctx);
  });

  it('genera un secreto y una URL de aprovisionamiento', async () => {
    const response = await post(ctx, '/api/v1/auth/mfa/iniciar', {}, token);
    expect(response.status).toBe(201);
    expect(response.body.secreto).toMatch(/^[A-Z2-7]{16,}$/);
    expect(response.body.url).toContain('otpauth://totp/');

    secreto = response.body.secreto;
  });

  it('rechaza la activación con un código incorrecto', async () => {
    const response = await post(ctx, '/api/v1/auth/mfa/confirmar', { codigo: '000000' }, token);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_MFA_CODE');
  });

  it('activa el segundo factor con un código válido', async () => {
    const response = await post(
      ctx,
      '/api/v1/auth/mfa/confirmar',
      { codigo: generateCode(secreto) },
      token,
    );
    expect(response.status).toBe(200);
    expect(response.body.habilitado).toBe(true);
  });

  it('exige el código al iniciar sesión', async () => {
    const response = await login(ctx, EMAIL);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('MFA_REQUIRED');
  });

  it('rechaza un código inválido en el inicio de sesión', async () => {
    const response = await login(ctx, EMAIL, undefined, '123456');
    expect(response.status).toBe(401);
    // Puede coincidir por azar en 1 de 1.000.000 de casos: se acepta 401 en cualquier caso.
    expect(['INVALID_MFA_CODE', 'INVALID_CREDENTIALS']).toContain(response.body.error.code);
  });

  it('permite iniciar sesión con el código correcto', async () => {
    const response = await login(ctx, EMAIL, undefined, generateCode(secreto));
    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.user.mfaHabilitado).toBe(true);
  });

  it('el código se registra en la auditoría', async () => {
    const sesion = await login(ctx, EMAIL, undefined, generateCode(secreto));
    const auditoria = await get(ctx, '/api/v1/auditoria?limit=10', sesion.body.accessToken);
    expect(auditoria.status).toBe(200);
    const acciones = auditoria.body.items.map((i: { action: string }) => i.action);
    expect(acciones.some((a: string) => a.startsWith('auth.'))).toBe(true);
  });

  it('desactiva el segundo factor verificando un código vigente', async () => {
    const sesion = await login(ctx, EMAIL, undefined, generateCode(secreto));
    const response = await post(
      ctx,
      '/api/v1/auth/mfa/deshabilitar',
      { codigo: generateCode(secreto) },
      sesion.body.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body.habilitado).toBe(false);

    const sinMfa = await login(ctx, EMAIL);
    expect(sinMfa.status).toBe(200);
  });
});
