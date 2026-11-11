import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { randomUUID } from 'node:crypto';

const EMAIL = 'prueba.pesajes@hacienda.local';
const EMAIL_OPERARIO = 'prueba.pesajes.operario@hacienda.local';

describe('pesajes y básculas (integración)', () => {
  let ctx: TestContext;
  let token: string;
  let tokenOperario: string;
  let fincaId: string;
  let basculaId: string;
  let animalId: string;
  let animalVendidoId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    await upsertTestUser(ctx.prisma, EMAIL, ['superadmin']);
    await upsertTestUser(ctx.prisma, EMAIL_OPERARIO, ['operario']);

    token = (await login(ctx, EMAIL)).body.accessToken;
    tokenOperario = (await login(ctx, EMAIL_OPERARIO)).body.accessToken;

    const finca = await ctx.prisma.finca.findFirst({ where: { deletedAt: null }, select: { id: true } });
    fincaId = finca!.id;

    await limpiar(ctx);

    const animal = await post(
      ctx,
      '/api/v1/animales',
      { fincaId, arete: 'PES-0001', sexo: 'MACHO', fechaNacimiento: '2024-01-15' },
      token,
    );
    animalId = animal.body.id;

    const vendido = await post(
      ctx,
      '/api/v1/animales',
      { fincaId, arete: 'PES-0002', sexo: 'MACHO', fechaNacimiento: '2024-01-15' },
      token,
    );
    animalVendidoId = vendido.body.id;
    await post(ctx, `/api/v1/animales/${animalVendidoId}/estado`, { estado: 'vendido', motivo: 'Venta de prueba' }, token);

    const bascula = await post(
      ctx,
      '/api/v1/basculas',
      { fincaId, nombre: 'Báscula de prueba', protocolId: 'generic-ascii', transporte: 'SERIAL', maxKg: 1500 },
      token,
    );
    basculaId = bascula.body.id;
  });

  afterAll(async () => {
    await limpiar(ctx);
    await cleanupTestUsers(ctx.prisma, [EMAIL, EMAIL_OPERARIO]);
    await closeTestContext(ctx);
  });

  async function limpiar(contexto: TestContext): Promise<void> {
    const animales = await contexto.prisma.animal.findMany({
      where: { arete: { startsWith: 'PES-' } },
      select: { id: true },
    });
    const ids = animales.map((a) => a.id);
    if (ids.length > 0) {
      await contexto.prisma.$executeRawUnsafe('ALTER TABLE app.pesaje DISABLE TRIGGER trg_pesaje_immutable');
      await contexto.prisma.$executeRawUnsafe(
        'ALTER TABLE app.pesaje_anulacion DISABLE TRIGGER trg_pesaje_anulacion_immutable',
      );
      try {
        const pesajes = await contexto.prisma.pesaje.findMany({
          where: { animalId: { in: ids } },
          select: { id: true },
        });
        await contexto.prisma.pesajeAnulacion.deleteMany({
          where: { pesajeId: { in: pesajes.map((p) => p.id) } },
        });
        await contexto.prisma.pesaje.deleteMany({ where: { animalId: { in: ids } } });
      } finally {
        await contexto.prisma.$executeRawUnsafe('ALTER TABLE app.pesaje ENABLE TRIGGER trg_pesaje_immutable');
        await contexto.prisma.$executeRawUnsafe(
          'ALTER TABLE app.pesaje_anulacion ENABLE TRIGGER trg_pesaje_anulacion_immutable',
        );
      }
      await contexto.prisma.animalIdentificacion.deleteMany({ where: { animalId: { in: ids } } });
      await contexto.prisma.$executeRawUnsafe(
        'ALTER TABLE app.animal_estado_historial DISABLE TRIGGER trg_estado_immutable',
      );
      try {
        await contexto.prisma.animalEstadoHistorial.deleteMany({ where: { animalId: { in: ids } } });
      } finally {
        await contexto.prisma.$executeRawUnsafe(
          'ALTER TABLE app.animal_estado_historial ENABLE TRIGGER trg_estado_immutable',
        );
      }
      await contexto.prisma.animal.updateMany({ where: { id: { in: ids } }, data: { madreId: null, padreId: null } });
      await contexto.prisma.animal.deleteMany({ where: { id: { in: ids } } });
    }
    await contexto.prisma.bascula.deleteMany({ where: { nombre: 'Báscula de prueba' } });
  }

  it('registra un pesaje con edad calculada', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/pesajes',
      { animalId, basculaId, pesoKg: 412.5, origen: 'FIELD', tipo: 'CONTROL' },
      token,
    );

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.pesoKg).toBe(412.5);
    expect(respuesta.body.arete).toBe('PES-0001');
    expect(respuesta.body.duplicado).toBe(false);
    expect(respuesta.body.edadDias).toBeGreaterThan(300);
    expect(respuesta.body.idempotente).toBe(false);
  });

  it('es idempotente: el mismo idempotencyKey no duplica', async () => {
    const clave = randomUUID();
    const primero = await post(
      ctx,
      '/api/v1/pesajes',
      { animalId, basculaId, pesoKg: 420, origen: 'FIELD', idempotencyKey: clave },
      token,
    );
    const segundo = await post(
      ctx,
      '/api/v1/pesajes',
      { animalId, basculaId, pesoKg: 420, origen: 'FIELD', idempotencyKey: clave },
      token,
    );

    expect(segundo.status).toBe(201);
    expect(segundo.body.id).toBe(primero.body.id);
    expect(segundo.body.idempotente).toBe(true);
  });

  it('deduplica un doble escaneo dentro de la ventana', async () => {
    // Animal propio: la ventana de deduplicación es por animal y báscula, así que
    // usar uno recién pesado marcaría el primero como duplicado (y con razón).
    const propio = await post(
      ctx,
      '/api/v1/animales',
      { fincaId, arete: 'PES-0003', sexo: 'HEMBRA', fechaNacimiento: '2024-05-01' },
      token,
    );
    const animalPropio = propio.body.id;

    const primero = await post(
      ctx,
      '/api/v1/pesajes',
      { animalId: animalPropio, basculaId, pesoKg: 430, origen: 'FIELD' },
      token,
    );
    expect(primero.body.duplicado).toBe(false);

    // Segundo registro del mismo animal en la misma báscula, segundos después.
    const segundo = await post(
      ctx,
      '/api/v1/pesajes',
      { animalId: animalPropio, basculaId, pesoKg: 430.4, origen: 'FIELD' },
      token,
    );
    expect(segundo.status).toBe(201);
    expect(segundo.body.duplicado).toBe(true);
    expect(segundo.body.duplicateOf).toBe(primero.body.id);
  });

  it('rechaza pesar un animal vendido', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/pesajes',
      { animalId: animalVendidoId, basculaId, pesoKg: 400, origen: 'FIELD' },
      token,
    );
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.message).toMatch(/vendido/i);
  });

  it('rechaza un peso fuera del rango de la báscula', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/pesajes',
      { animalId, basculaId, pesoKg: 2000, origen: 'FIELD' },
      token,
    );
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.message).toMatch(/rango/i);
  });

  it('el pesaje es inmutable: no se puede modificar ni borrar', async () => {
    await expect(
      ctx.prisma.$executeRaw`UPDATE app.pesaje SET peso_kg = 1 WHERE animal_id = ${animalId}::uuid`,
    ).rejects.toThrow(/inmutable/i);

    await expect(
      ctx.prisma.$executeRaw`DELETE FROM app.pesaje WHERE animal_id = ${animalId}::uuid`,
    ).rejects.toThrow(/inmutable/i);
  });

  it('el pesaje simulado usa la cadena real y queda marcado como SIMULATOR', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/pesajes/simulado',
      { animalId, basculaId, pesoBaseKg: 460, modo: 'estable' },
      token,
    );

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.creado).toBe(true);
    expect(respuesta.body.pesaje.origen).toBe('SIMULATOR');
    expect(respuesta.body.diagnostico.tramas).toBeGreaterThan(0);
    expect(respuesta.body.aviso).toMatch(/SIMULADOS/i);
  });

  it('un animal inestable no produce pesaje', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/pesajes/simulado',
      { animalId, basculaId, pesoBaseKg: 460, modo: 'inestable' },
      token,
    );

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.creado).toBe(false);
    expect(respuesta.body.motivo).toBe('FUERA_DE_TOLERANCIA');
  });

  it('un equipo desconectado no produce pesaje', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/pesajes/simulado',
      { animalId, basculaId, pesoBaseKg: 460, modo: 'desconectada' },
      token,
    );
    expect(respuesta.body.creado).toBe(false);
    expect(respuesta.body.motivo).toBe('POCAS_MUESTRAS');
  });

  it('expone el historial del animal con su último peso', async () => {
    const respuesta = await get(ctx, `/api/v1/pesajes/animal/${animalId}`, token);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBeGreaterThan(0);
    expect(respuesta.body.ultimo.anterior).not.toBeNull();
    expect(respuesta.body.items[0].arete).toBe('PES-0001');
  });

  it('el rol de operario puede pesar pero no administrar básculas', async () => {
    const pesaje = await post(
      ctx,
      '/api/v1/pesajes',
      { animalId, pesoKg: 425, origen: 'FIELD' },
      tokenOperario,
    );
    expect(pesaje.status).toBe(201);

    const bascula = await post(
      ctx,
      '/api/v1/basculas',
      { fincaId, nombre: 'Báscula no autorizada' },
      tokenOperario,
    );
    expect(bascula.status).toBe(403);
  });

  it('declara el soporte del protocolo y no inventa adaptadores', async () => {
    const adaptadores = await get(ctx, '/api/v1/basculas/adaptadores', token);
    expect(adaptadores.status).toBe(200);
    expect(adaptadores.body.items.map((a: { id: string }) => a.id)).toContain('generic-ascii');

    const sinAdaptador = await post(
      ctx,
      '/api/v1/basculas',
      { fincaId, nombre: 'Báscula de marca desconocida', protocolId: 'marca-x-9000' },
      token,
    );
    expect(sinAdaptador.status).toBe(201);
    expect(sinAdaptador.body.soportada).toBe(false);

    await ctx.prisma.bascula.deleteMany({ where: { nombre: 'Báscula de marca desconocida' } });
  });


  it('anula un pesaje con motivo y deja rastro', async () => {
    const animal = await post(
      ctx,
      '/api/v1/animales',
      { fincaId, arete: 'PES-0004', sexo: 'HEMBRA', fechaNacimiento: '2024-06-01' },
      token,
    );

    const pesaje = await post(
      ctx,
      '/api/v1/pesajes',
      { animalId: animal.body.id, pesoKg: 300, origen: 'MANUAL' },
      token,
    );
    expect(pesaje.status).toBe(201);

    const anulacion = await post(
      ctx,
      `/api/v1/pesajes/${pesaje.body.id}/anular`,
      { motivo: 'Peso mal leído: el animal se movió' },
      token,
    );
    expect(anulacion.status).toBe(201);
    expect(anulacion.body.anulado).toBe(true);

    // El pesaje sigue existiendo, marcado como anulado.
    const historial = await get(ctx, `/api/v1/pesajes/animal/${animal.body.id}`, token);
    const fila = historial.body.items.find((p: { id: string }) => p.id === pesaje.body.id);
    expect(fila).toBeDefined();
    expect(fila.anulado).toBe(true);
    expect(fila.motivoAnulacion).toContain('se movió');

    // Una segunda anulación es un error del cliente.
    const repetida = await post(
      ctx,
      `/api/v1/pesajes/${pesaje.body.id}/anular`,
      { motivo: 'Otra vez el mismo pesaje' },
      token,
    );
    expect(repetida.status).toBe(409);
  });

  it('exige motivo para anular', async () => {
    const respuesta = await post(ctx, `/api/v1/pesajes/${'00000000-0000-0000-0000-000000000000'}/anular`, { motivo: 'no' }, token);
    expect(respuesta.status).toBe(400);
  });

  it('registra los pesajes en la auditoría con su origen', async () => {
    const auditoria = await get(ctx, '/api/v1/auditoria?limit=40', token);
    const acciones = auditoria.body.items.map((i: { action: string }) => i.action);
    expect(acciones).toContain('pesajes.crear');
    expect(acciones).toContain('pesajes.crear.duplicado');
    expect(acciones).toContain('basculas.crear');
    expect(acciones).toContain('pesajes.anular');
  });
});
