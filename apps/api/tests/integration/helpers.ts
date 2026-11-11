// Debe ser la primera importación: los decoradores de Nest lo requieren.
import 'reflect-metadata';
import { hash as argonHash } from '@node-rs/argon2';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../../src/bootstrap';
import { loadConfig, type AppConfig } from '../../src/config/env';
import { PrismaService } from '../../src/database/prisma.service';

export const TEST_PASSWORD = 'ClaveDePrueba-2026';

export interface TestContext {
  app: NestFastifyApplication;
  server: unknown;
  prisma: PrismaService;
  config: AppConfig;
}

/**
 * Levanta la API real (mismos guards, filtros y plugins que producción) contra
 * la base indicada en DATABASE_URL.
 *
 * Requiere que las migraciones estén aplicadas y el seed ejecutado:
 *   node scripts/dev/lib/migrations.mjs && node scripts/dev/lib/seed.mjs
 */
export async function createTestContext(): Promise<TestContext> {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    DATABASE_URL: process.env.DATABASE_URL ?? '',
  });

  const { app } = await createApp(config);
  const prisma = app.get(PrismaService);

  return { app, server: app.getHttpServer(), prisma, config };
}

export async function closeTestContext(ctx: TestContext): Promise<void> {
  await ctx.app.close();
}

/** Crea (o recrea) un usuario de prueba con roles concretos y clave conocida. */
export async function upsertTestUser(
  prisma: PrismaService,
  email: string,
  roles: string[],
  options: { activo?: boolean; mfa?: boolean } = {},
): Promise<{ id: string; email: string }> {
  const passwordHash = await argonHash(TEST_PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });

  const rolRows = await prisma.rol.findMany({ where: { codigo: { in: roles } }, select: { id: true } });
  if (rolRows.length !== roles.length) {
    throw new Error(`Roles inexistentes en la base: ${roles.join(', ')} (¿se ejecutó el seed?)`);
  }

  const finca = await prisma.finca.findFirst({ where: { deletedAt: null }, select: { id: true } });

  const usuario = await prisma.usuario.upsert({
    where: { id: (await findByEmail(prisma, email)) ?? '00000000-0000-0000-0000-000000000000' },
    create: {
      email,
      nombre: `Prueba ${roles.join('+')}`,
      passwordHash,
      activo: options.activo ?? true,
      mfaHabilitado: options.mfa ?? false,
    },
    update: {
      passwordHash,
      activo: options.activo ?? true,
      intentosFallidos: 0,
      bloqueadoHasta: null,
      deletedAt: null,
    },
    select: { id: true, email: true },
  });

  await prisma.usuarioRol.deleteMany({ where: { usuarioId: usuario.id } });
  await prisma.usuarioRol.createMany({ data: rolRows.map((r) => ({ usuarioId: usuario.id, rolId: r.id })) });

  if (finca) {
    await prisma.usuarioFinca.upsert({
      where: { usuarioId_fincaId: { usuarioId: usuario.id, fincaId: finca.id } },
      create: { usuarioId: usuario.id, fincaId: finca.id, esPredeterminada: true },
      update: {},
    });
  }

  return usuario;
}

async function findByEmail(prisma: PrismaService, email: string): Promise<string | null> {
  const row = await prisma.usuario.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function login(
  ctx: TestContext,
  email: string,
  password = TEST_PASSWORD,
  totp?: string,
): Promise<{ status: number; body: any }> {
  const request = (await import('supertest')).default;
  const response = await request(ctx.server as never)
    .post('/api/v1/auth/login')
    .send({ email, password, ...(totp ? { totp } : {}) })
    .set('content-type', 'application/json');

  return { status: response.status, body: response.body };
}

export async function get(ctx: TestContext, path: string, token?: string) {
  const request = (await import('supertest')).default;
  const req = request(ctx.server as never).get(path);
  if (token) req.set('authorization', `Bearer ${token}`);
  return req;
}

export async function post(ctx: TestContext, path: string, body: unknown, token?: string) {
  const request = (await import('supertest')).default;
  const req = request(ctx.server as never).post(path).send(body as object);
  if (token) req.set('authorization', `Bearer ${token}`);
  return req;
}

/** Limpia los datos creados por las pruebas (no toca catálogos ni la finca). */
export async function cleanupTestUsers(prisma: PrismaService, emails: string[]): Promise<void> {
  const usuarios = await prisma.usuario.findMany({
    where: { email: { in: emails, mode: 'insensitive' } },
    select: { id: true },
  });
  const ids = usuarios.map((u) => u.id);
  if (ids.length === 0) return;

  await prisma.sesion.deleteMany({ where: { usuarioId: { in: ids } } });
  await prisma.usuarioRol.deleteMany({ where: { usuarioId: { in: ids } } });
  await prisma.usuarioFinca.deleteMany({ where: { usuarioId: { in: ids } } });
  await prisma.intentoLogin.deleteMany({ where: { email: { in: emails } } });
  await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
}
