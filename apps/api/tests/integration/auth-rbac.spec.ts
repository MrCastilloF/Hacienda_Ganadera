import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
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

const EMAILS = [
  'prueba.super@hacienda.local',
  'prueba.consulta@hacienda.local',
  'prueba.inactivo@hacienda.local',
  'prueba.bloqueo@hacienda.local',
];

describe('autenticación y autorización (integración)', () => {
  let ctx: TestContext;
  let superToken: string;
  let consultaToken: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    await upsertTestUser(ctx.prisma, EMAILS[0]!, ['superadmin']);
    await upsertTestUser(ctx.prisma, EMAILS[1]!, ['consulta']);
    await upsertTestUser(ctx.prisma, EMAILS[2]!, ['consulta'], { activo: false });
    await upsertTestUser(ctx.prisma, EMAILS[3]!, ['consulta']);

    const superLogin = await login(ctx, EMAILS[0]!);
    superToken = superLogin.body.accessToken;
    const consultaLogin = await login(ctx, EMAILS[1]!);
    consultaToken = consultaLogin.body.accessToken;
  });

  afterAll(async () => {
    await cleanupTestUsers(ctx.prisma, EMAILS);
    await closeTestContext(ctx);
  });

  it('login correcto devuelve tokens y el alcance del usuario', async () => {
    const response = await login(ctx, EMAILS[0]!);
    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.refreshToken).toBeTruthy();
    expect(response.body.user.scope).toBe('global');
    expect(response.body.user.permisos.length).toBeGreaterThan(50);
  });

  it('login con contraseña incorrecta devuelve 401 con mensaje genérico', async () => {
    const response = await login(ctx, EMAILS[1]!, 'ClaveIncorrecta-123');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    // No se revela si el usuario existe.
    expect(response.body.error.message).toBe('Credenciales inválidas');
  });

  it('login de un usuario inexistente responde igual que una clave incorrecta', async () => {
    const response = await login(ctx, 'no.existe@hacienda.local', 'ClaveIncorrecta-123');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('un usuario inactivo no puede iniciar sesión', async () => {
    const response = await login(ctx, EMAILS[2]!);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('bloquea la cuenta tras superar el máximo de intentos', async () => {
    const email = EMAILS[3]!;
    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const response = await login(ctx, email, `Mala-${i}`);
      lastStatus = response.status;
    }
    expect([401, 423]).toContain(lastStatus);

    const bloqueado = await login(ctx, email);
    expect(bloqueado.status).toBe(423);
    expect(bloqueado.body.error.code).toBe('ACCOUNT_LOCKED');

    // Se libera para no afectar a otras ejecuciones.
    await ctx.prisma.usuario.updateMany({
      where: { email },
      data: { bloqueadoHasta: null, intentosFallidos: 0 },
    });
  });

  it('rota el refresh y detecta la reutilización', async () => {
    const primera = await login(ctx, EMAILS[1]!);
    const original = primera.body.refreshToken;

    const rotado = await request(ctx.server as never)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: original });
    expect(rotado.status).toBe(200);
    expect(rotado.body.refreshToken).not.toBe(original);

    const reuso = await request(ctx.server as never)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: original });
    expect(reuso.status).toBe(401);
    expect(reuso.body.error.code).toBe('TOKEN_REUSED');

    // Toda la familia quedó revocada: el token rotado tampoco sirve.
    const familia = await request(ctx.server as never)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotado.body.refreshToken });
    expect(familia.status).toBe(401);
  });

  it('rechaza peticiones sin token', async () => {
    const response = await request(ctx.server as never).get('/api/v1/usuarios');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rechaza un token con firma inválida', async () => {
    const response = await get(ctx, '/api/v1/usuarios', 'Bearer.invalido.token');
    expect(response.status).toBe(401);
  });

  it('permite consultar usuarios con el rol adecuado', async () => {
    const response = await get(ctx, '/api/v1/usuarios', superToken);
    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThan(0);
  });

  it('deniega la creación de usuarios al rol de consulta', async () => {
    const response = await post(
      ctx,
      '/api/v1/usuarios',
      { email: 'x@y.co', nombre: 'X', password: 'ClaveSegura-2026', roles: ['operario'] },
      consultaToken,
    );
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('permite al rol de consulta leer pero no escribir', async () => {
    const lectura = await get(ctx, '/api/v1/usuarios', consultaToken);
    expect(lectura.status).toBe(200);

    const escritura = await post(
      ctx,
      '/api/v1/usuarios',
      { email: 'z@y.co', nombre: 'Z', password: 'ClaveSegura-2026', roles: ['operario'] },
      consultaToken,
    );
    expect(escritura.status).toBe(403);
  });

  it('/auth/me devuelve el perfil y los permisos efectivos', async () => {
    const response = await get(ctx, '/api/v1/auth/me', superToken);
    expect(response.status).toBe(200);
    expect(response.body.email).toBe(EMAILS[0]);
    expect(response.body.roles).toContain('superadmin');
    expect(response.body.permisos.length).toBeGreaterThan(50);
    expect(response.body.fincas.length).toBeGreaterThan(0);
  });

  it('crea un usuario y lo registra en la auditoría', async () => {
    const email = 'prueba.creado@hacienda.local';
    const creado = await post(
      ctx,
      '/api/v1/usuarios',
      { email, nombre: 'Usuario Creado', password: 'ClaveSegura-2026', roles: ['operario'] },
      superToken,
    );

    expect(creado.status).toBe(201);
    expect(creado.body.email).toBe(email);

    const auditoria = await get(ctx, '/api/v1/auditoria?entity=usuario&limit=10', superToken);
    expect(auditoria.status).toBe(200);
    const acciones = auditoria.body.items.map((i: { action: string }) => i.action);
    expect(acciones).toContain('usuarios.crear');

    await cleanupTestUsers(ctx.prisma, [email]);
  });

  it('la cadena de auditoría permanece íntegra tras las operaciones', async () => {
    const response = await get(ctx, '/api/v1/auditoria/verificar', superToken);
    expect(response.status).toBe(200);
    expect(response.body.integra).toBe(true);
    expect(response.body.rupturas).toHaveLength(0);
  });

  it('devuelve un requestId de correlación en cada error', async () => {
    const response = await request(ctx.server as never).get('/api/v1/usuarios');
    expect(response.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('no filtra detalles internos en los errores', async () => {
    const response = await login(ctx, EMAILS[1]!, 'ClaveIncorrecta-123');
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toMatch(/at\s+\w+\s+\(/); // stack trace
    expect(serialized).not.toMatch(/prisma|select |password_hash|argon2/i);
  });
});
