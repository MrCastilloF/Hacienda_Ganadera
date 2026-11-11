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
import { calcularCategoria } from '../../src/animales/domain/categoria';

const EMAIL_ADMIN = 'prueba.animales@hacienda.local';
const EMAIL_CONSULTA = 'prueba.animales.consulta@hacienda.local';


async function limpiarAnimalesDePrueba(ctx: TestContext): Promise<void> {
  const animales = await ctx.prisma.animal.findMany({
    where: { arete: { startsWith: 'TST' } },
    select: { id: true },
  });
  const ids = animales.map((a) => a.id);
  if (ids.length === 0) return;

  await ctx.prisma.animalIdentificacion.deleteMany({ where: { animalId: { in: ids } } });

  // El historial de estados es inmutable por diseño (INV-05): la aplicación no
  // puede borrarlo. El arnés de pruebas sí necesita resetear, así que desactiva
  // el trigger durante la limpieza y lo vuelve a activar de inmediato. Esto es
  // exclusivo del entorno de pruebas y nunca forma parte del código de producto.
  await ctx.prisma.$executeRawUnsafe('ALTER TABLE app.animal_estado_historial DISABLE TRIGGER trg_estado_immutable');
  try {
    await ctx.prisma.animalEstadoHistorial.deleteMany({ where: { animalId: { in: ids } } });
  } finally {
    await ctx.prisma.$executeRawUnsafe('ALTER TABLE app.animal_estado_historial ENABLE TRIGGER trg_estado_immutable');
  }

  await ctx.prisma.animal.updateMany({ where: { id: { in: ids } }, data: { madreId: null, padreId: null } });
  await ctx.prisma.animal.deleteMany({ where: { id: { in: ids } } });
}

describe('animales (integración)', () => {
  let ctx: TestContext;
  let token: string;
  let tokenConsulta: string;
  let fincaId: string;
  let terneroId: string;
  let abuelaId: string;
  let madreId: string;
  let criaId: string;

  const patch = (path: string, body: unknown, t = token) =>
    request(ctx.server as never).patch(path).set('authorization', `Bearer ${t}`).send(body as object);

  beforeAll(async () => {
    ctx = await createTestContext();
    await upsertTestUser(ctx.prisma, EMAIL_ADMIN, ['superadmin']);
    await upsertTestUser(ctx.prisma, EMAIL_CONSULTA, ['consulta']);

    const sesion = await login(ctx, EMAIL_ADMIN);
    token = sesion.body.accessToken;
    const sesionConsulta = await login(ctx, EMAIL_CONSULTA);
    tokenConsulta = sesionConsulta.body.accessToken;

    const finca = await ctx.prisma.finca.findFirst({ where: { deletedAt: null }, select: { id: true } });
    fincaId = finca!.id;

    // Idempotencia: si una ejecución previa falló, no deben quedar animales TST.
    await limpiarAnimalesDePrueba(ctx);
  });

  afterAll(async () => {
    await limpiarAnimalesDePrueba(ctx);
    await cleanupTestUsers(ctx.prisma, [EMAIL_ADMIN, EMAIL_CONSULTA]);
    await closeTestContext(ctx);
  });

  it('registra un animal con arete explícito y deja historial', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/animales',
      {
        fincaId,
        arete: 'TST-0001',
        sexo: 'MACHO',
        fechaNacimiento: new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10),
        pesoNacimientoKg: 38.5,
        color: 'Colorado',
      },
      token,
    );

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.arete).toBe('TST-0001');
    terneroId = respuesta.body.id;

    const ficha = await get(ctx, `/api/v1/animales/${terneroId}`, token);
    expect(ficha.status).toBe(200);
    expect(ficha.body.estado).toBe('activo');
    expect(ficha.body.categoria.codigo).toBe('TERNERO');
    expect(ficha.body.identificaciones).toHaveLength(2);
    expect(ficha.body.historialEstados).toHaveLength(1);
    expect(ficha.body.transicionesPosibles).toContain('enfermo');
  });

  it('genera el arete con el esquema configurado cuando no se envía', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/animales',
      { fincaId, sexo: 'HEMBRA', nombre: 'Generada' },
      token,
    );

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.arete).toMatch(/^[A-Z]{2,4}\d{6}\d$/);
    expect(respuesta.body.codigoBarras).toBe(respuesta.body.arete);
  });

  it('rechaza un arete duplicado', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/animales',
      { fincaId, arete: 'TST-0001', sexo: 'MACHO' },
      token,
    );
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('CONFLICT');
  });

  it('rechaza una madre que no es hembra', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/animales',
      { fincaId, arete: 'TST-0100', sexo: 'MACHO', madreId: terneroId, fechaNacimiento: '2026-01-01' },
      token,
    );
    expect(respuesta.status).toBe(400);
    expect(JSON.stringify(respuesta.body)).toMatch(/madre debe ser hembra|madre/i);
  });

  it('rechaza la edad futura', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/animales',
      { fincaId, arete: 'TST-0101', sexo: 'HEMBRA', fechaNacimiento: '2099-01-01' },
      token,
    );
    expect(respuesta.status).toBe(400);
  });

  it('aplica concurrencia optimista al modificar', async () => {
    const ficha = await get(ctx, `/api/v1/animales/${terneroId}`, token);
    const versionActual = ficha.body.version;

    const conflicto = await patch(`/api/v1/animales/${terneroId}`, { version: versionActual + 5, nombre: 'X' });
    expect(conflicto.status).toBe(409);

    const ok = await patch(`/api/v1/animales/${terneroId}`, { version: versionActual, color: 'Negro' });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(versionActual + 1);
  });

  it('exige motivo para pasar a enfermo y registra el historial', async () => {
    const sinMotivo = await post(ctx, `/api/v1/animales/${terneroId}/estado`, { estado: 'enfermo' }, token);
    expect(sinMotivo.status).toBe(400);

    const conMotivo = await post(
      ctx,
      `/api/v1/animales/${terneroId}/estado`,
      { estado: 'enfermo', motivo: 'Fiebre detectada en la revisión' },
      token,
    );
    expect(conMotivo.status).toBe(201);
    expect(conMotivo.body.estado).toBe('enfermo');

    const ficha = await get(ctx, `/api/v1/animales/${terneroId}`, token);
    expect(ficha.body.historialEstados[0].estadoNuevo).toBe('enfermo');
    expect(ficha.body.historialEstados[0].motivo).toContain('Fiebre');
  });

  it('impide vender un animal enfermo (debe recuperarse primero)', async () => {
    const ventaDirecta = await post(
      ctx,
      `/api/v1/animales/${terneroId}/estado`,
      { estado: 'vendido', motivo: 'Venta a cliente 42' },
      token,
    );
    expect(ventaDirecta.status).toBe(409);
    expect(ventaDirecta.body.error.message).toMatch(/No se puede pasar de "enfermo"/i);
  });

  it('impide salir de un estado terminal', async () => {
    const recuperacion = await post(
      ctx,
      `/api/v1/animales/${terneroId}/estado`,
      { estado: 'activo', motivo: 'Recuperado tras tratamiento' },
      token,
    );
    expect(recuperacion.status).toBe(201);

    const venta = await post(
      ctx,
      `/api/v1/animales/${terneroId}/estado`,
      { estado: 'vendido', motivo: 'Venta a cliente 42' },
      token,
    );
    expect(venta.status).toBe(201);

    const reingreso = await post(
      ctx,
      `/api/v1/animales/${terneroId}/estado`,
      { estado: 'activo', motivo: 'devolución' },
      token,
    );
    expect(reingreso.status).toBe(409);
    expect(reingreso.body.error.message).toMatch(/terminal/i);
  });

  it('construye el árbol genealógico de tres generaciones', async () => {
    const abuela = await post(
      ctx,
      '/api/v1/animales',
      { fincaId, arete: 'TST-2000', sexo: 'HEMBRA', fechaNacimiento: '2018-01-01', nombre: 'Abuela' },
      token,
    );
    abuelaId = abuela.body.id;

    const madre = await post(
      ctx,
      '/api/v1/animales',
      { fincaId, arete: 'TST-2001', sexo: 'HEMBRA', fechaNacimiento: '2021-01-01', madreId: abuelaId, nombre: 'Madre' },
      token,
    );
    madreId = madre.body.id;

    const cria = await post(
      ctx,
      '/api/v1/animales',
      { fincaId, arete: 'TST-2002', sexo: 'MACHO', fechaNacimiento: '2025-01-01', madreId, nombre: 'Cría' },
      token,
    );
    criaId = cria.body.id;

    const arbol = await get(ctx, `/api/v1/animales/${criaId}/genealogia`, token);
    expect(arbol.status).toBe(200);
    expect(arbol.body.ascendientes[0].arete).toBe('TST-2001');
    expect(arbol.body.ascendientes[0].ascendientes[0].arete).toBe('TST-2000');

    const descendencia = await get(ctx, `/api/v1/animales/${abuelaId}/genealogia`, token);
    expect(descendencia.body.descendientes[0].arete).toBe('TST-2001');
    expect(descendencia.body.descendientes[0].descendientes[0].arete).toBe('TST-2002');
  });

  it('impide crear un ciclo genealógico', async () => {
    // Se usa una descendiente SIN fecha de nacimiento para que la comprobación de
    // fechas no se dispare antes y el rechazo provenga realmente del ciclo.
    const descendiente = await post(
      ctx,
      '/api/v1/animales',
      { fincaId, arete: 'TST-2003', sexo: 'HEMBRA', madreId, nombre: 'Descendiente' },
      token,
    );
    expect(descendiente.status).toBe(201);

    const intento = await patch(`/api/v1/animales/${abuelaId}`, { madreId: descendiente.body.id });
    expect(intento.status).toBe(400);
    expect(intento.body.error.message).toMatch(/ciclo/i);
  });

  it('rechaza una fecha de nacimiento anterior a la de la madre', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/animales',
      { fincaId, arete: 'TST-2100', sexo: 'MACHO', fechaNacimiento: '2017-01-01', madreId: abuelaId },
      token,
    );
    expect(respuesta.status).toBe(400);
    expect(JSON.stringify(respuesta.body)).toMatch(/nació después/i);
  });

  it('lista y filtra por texto y por categoría derivada', async () => {
    const porTexto = await get(ctx, '/api/v1/animales?q=TST-200&limit=10', token);
    expect(porTexto.status).toBe(200);
    expect(porTexto.body.total).toBeGreaterThanOrEqual(3);

    const porCategoria = await get(ctx, '/api/v1/animales?categoria=TERNERA&limit=10', token);
    expect(porCategoria.status).toBe(200);
    expect(porCategoria.body.items.every((i: { categoria: string }) => i.categoria === 'TERNERA')).toBe(true);

    const inexistente = await get(ctx, '/api/v1/animales?q=ZZZ-NO-EXISTE', token);
    expect(inexistente.body.total).toBe(0);
  });

  it('la web puede leer pero el rol de consulta no puede crear', async () => {
    const lectura = await get(ctx, '/api/v1/animales?limit=5', tokenConsulta);
    expect(lectura.status).toBe(200);

    const escritura = await post(ctx, '/api/v1/animales', { fincaId, sexo: 'MACHO' }, tokenConsulta);
    expect(escritura.status).toBe(403);
  });

  it('registra las operaciones en la auditoría', async () => {
    const auditoria = await get(ctx, '/api/v1/auditoria?limit=40', token);
    const acciones = auditoria.body.items.map((i: { action: string }) => i.action);
    expect(acciones).toContain('animales.crear');
    expect(acciones).toContain('animales.estado');
    expect(acciones).toContain('animales.modificar');
  });

  it('la categoría de SQL y la del dominio coinciden', async () => {
    const casos = [
      { sexo: 'HEMBRA', fecha: '2025-06-15', productivo: null },
      { sexo: 'HEMBRA', fecha: '2023-06-15', productivo: null },
      { sexo: 'MACHO', fecha: '2025-06-15', productivo: null },
      { sexo: 'MACHO', fecha: '2023-06-15', productivo: null },
      { sexo: 'MACHO', fecha: '2020-06-15', productivo: 'REPRODUCTOR' },
    ] as const;

    for (const caso of casos) {
      const filas = await ctx.prisma.$queryRaw<Array<{ categoria: string }>>`
        SELECT app.categoria_de(${caso.sexo}, ${caso.fecha}::date, ${caso.productivo}) AS categoria`;
      const desdeSql = filas[0]!.categoria;
      const desdeTs = calcularCategoria({
        sexo: caso.sexo,
        fechaNacimiento: caso.fecha,
        estadoProductivo: caso.productivo,
        referencia: new Date(),
      }).codigo;
      expect(desdeTs).toBe(desdeSql);
    }
  });
});
