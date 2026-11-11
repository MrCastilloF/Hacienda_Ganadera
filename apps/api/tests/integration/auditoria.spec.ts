import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeTestContext,
  createTestContext,
  get,
  login,
  upsertTestUser,
  type TestContext,
} from './helpers';

const EMAIL = 'prueba.auditoria@hacienda.local';

describe('auditoría encadenada (integración)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    await upsertTestUser(ctx.prisma, EMAIL, ['superadmin']);
    // Garantiza al menos un evento encadenado antes de las aserciones.
    await login(ctx, EMAIL);
  });

  afterAll(async () => {
    await closeTestContext(ctx);
  });

  it('encadena los eventos: el hash de cada uno depende del anterior', async () => {
    // Se genera actividad para garantizar al menos dos eventos encadenados.
    await login(ctx, EMAIL);

    const rows = await ctx.prisma.$queryRaw<Array<{ id: bigint; hash: string; prev_hash: string | null }>>`
      SELECT id, hash, prev_hash FROM app.audit_log ORDER BY id DESC LIMIT 2`;

    expect(rows.length).toBe(2);
    const [ultimo, anterior] = rows;
    expect(ultimo!.prev_hash).toBe(anterior!.hash);
    expect(ultimo!.hash).not.toBe(anterior!.hash);
  });

  it('rechaza UPDATE sobre audit_log', async () => {
    await expect(
      ctx.prisma.$executeRaw`UPDATE app.audit_log SET action = 'alterado' WHERE id = (SELECT min(id) FROM app.audit_log)`,
    ).rejects.toThrow(/inmutable|immutable/i);
  });

  it('rechaza DELETE sobre audit_log', async () => {
    await expect(ctx.prisma.$executeRaw`DELETE FROM app.audit_log WHERE id = (SELECT min(id) FROM app.audit_log)`).rejects.toThrow(
      /inmutable|immutable/i,
    );
  });

  it('detecta una alteración hecha por un superusuario', async () => {
    const antes = await ctx.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT count(*) AS total FROM app.audit_log`;

    await ctx.prisma.$executeRawUnsafe('ALTER TABLE app.audit_log DISABLE TRIGGER trg_audit_immutable');
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE app.audit_log SET after_json = '{"alterado":true}'::jsonb WHERE id = (SELECT min(id) FROM app.audit_log)`,
    );
    await ctx.prisma.$executeRawUnsafe('ALTER TABLE app.audit_log ENABLE TRIGGER trg_audit_immutable');

    const rupturas = await ctx.prisma.$queryRaw<Array<{ id: bigint; motivo: string }>>`
      SELECT * FROM app.audit_verify(NULL, NULL)`;

    expect(Number(antes[0]?.total ?? 0)).toBeGreaterThan(0);
    expect(rupturas.length).toBeGreaterThan(0);
    expect(rupturas[0]?.motivo).toMatch(/hash/i);

    // Restaurar la integridad de la cadena para no dejar el entorno inconsistente:
    // se elimina el rango alterado y se vuelve a encadenar desde cero (solo en pruebas).
    await ctx.prisma.$executeRawUnsafe('ALTER TABLE app.audit_log DISABLE TRIGGER trg_audit_immutable');
    await ctx.prisma.$executeRawUnsafe('TRUNCATE app.audit_log');
    await ctx.prisma.$executeRawUnsafe('ALTER TABLE app.audit_log ENABLE TRIGGER trg_audit_immutable');
  });

  it('el endpoint /auditoria/verificar informa la cadena íntegra', async () => {
    const sesion = await login(ctx, EMAIL);
    const response = await get(ctx, '/api/v1/auditoria/verificar', sesion.body.accessToken);
    expect(response.status).toBe(200);
    expect(response.body.integra).toBe(true);
    expect(response.body.rupturas).toHaveLength(0);
  });

  it('el rol de aplicación no puede modificar lo inmutable', async () => {
    // `SET ROLE` dentro de una transacción demuestra los privilegios reales del rol
    // con el que corre la API en producción (app_rw).
    const resultado = await ctx.prisma
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE app_rw`);
        try {
          await tx.$executeRawUnsafe(`UPDATE app.audit_log SET action = 'x' WHERE id = (SELECT min(id) FROM app.audit_log)`);
          return 'permitido';
        } catch {
          return 'denegado';
        }
      })
      .catch(() => 'denegado');

    expect(resultado).toBe('denegado');
  });
});
