import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupTestUsers,
  closeTestContext,
  createTestContext,
  login,
  post,
  upsertTestUser,
  type TestContext,
} from './helpers';
import { parsearCsv } from '../../src/animales/importador.service';

const EMAIL = 'prueba.importador@hacienda.local';
const EMAIL_CONSULTA = 'prueba.importador.consulta@hacienda.local';

const CSV_VALIDO = `arete,nombre,sexo,fechaNacimiento,raza,color,pesoNacimientoKg,madreArete,padreArete,observaciones
IMP-0001,Lucero,HEMBRA,2024-03-15,BRAHMAN,Colorado,34.5,,,
IMP-0002,Relámpago,MACHO,2024-04-02,NELORE,Negro,38,IMP-0001,,Ingreso por compra
IMP-0003,Trueno,MACHO,2023-05-10,CRUCE,Bayo,41,,,Sin observaciones
`;

const CSV_CON_ERRORES = `arete,nombre,sexo,fechaNacimiento,raza,pesoNacimientoKg
IMP-1001,Mal sexo,OTRO,2024-01-01,BRAHMAN,30
IMP-1002,Fecha mala,HEMBRA,15-01-2024,BRAHMAN,30
IMP-1003,Raza inexistente,MACHO,2024-01-01,INVENTADA,30
IMP-1004,,MACHO,2024-01-01,BRAHMAN,-5
IMP-1001,Duplicado,MACHO,2024-01-01,BRAHMAN,30
`;

describe('importador de hato (integración)', () => {
  let ctx: TestContext;
  let token: string;
  let tokenConsulta: string;
  let fincaId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    await upsertTestUser(ctx.prisma, EMAIL, ['superadmin']);
    await upsertTestUser(ctx.prisma, EMAIL_CONSULTA, ['consulta']);

    token = (await login(ctx, EMAIL)).body.accessToken;
    tokenConsulta = (await login(ctx, EMAIL_CONSULTA)).body.accessToken;

    const finca = await ctx.prisma.finca.findFirst({ where: { deletedAt: null }, select: { id: true } });
    fincaId = finca!.id;

    await limpiar(ctx);
  });

  afterAll(async () => {
    await limpiar(ctx);
    await cleanupTestUsers(ctx.prisma, [EMAIL, EMAIL_CONSULTA]);
    await closeTestContext(ctx);
  });

  async function limpiar(contexto: TestContext): Promise<void> {
    const animales = await contexto.prisma.animal.findMany({
      where: { arete: { startsWith: 'IMP-' } },
      select: { id: true },
    });
    const ids = animales.map((a) => a.id);
    if (ids.length === 0) return;

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

  it('el modo dry-run no escribe nada y reporta lo que haría', async () => {
    const antes = await ctx.prisma.animal.count({ where: { arete: { startsWith: 'IMP-' } } });

    const respuesta = await post(
      ctx,
      '/api/v1/animales/importar',
      { fincaId, csv: CSV_VALIDO, dryRun: true },
      token,
    );

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.dryRun).toBe(true);
    expect(respuesta.body.resumen.filas).toBe(3);
    expect(respuesta.body.resumen.validas).toBe(3);
    expect(respuesta.body.resumen.creadas).toBe(0);
    expect(respuesta.body.previsualizacion).toHaveLength(3);

    const despues = await ctx.prisma.animal.count({ where: { arete: { startsWith: 'IMP-' } } });
    expect(despues).toBe(antes);
  });

  it('informa cada error por línea y campo', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/animales/importar',
      { fincaId, csv: CSV_CON_ERRORES, dryRun: true },
      token,
    );

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.resumen.validas).toBe(0);
    expect(respuesta.body.relacionErrores ?? respuesta.body.errores.length).toBeGreaterThan(0);

    const errores = respuesta.body.errores as Array<{ linea: number; campo: string }>;
    const campos = errores.map((e) => e.campo);
    expect(campos).toContain('sexo');
    expect(campos).toContain('fechaNacimiento');
    expect(campos).toContain('raza');
    expect(campos).toContain('pesoNacimientoKg');
    expect(campos).toContain('arete');
    expect(errores.every((e) => e.linea > 1)).toBe(true);
  });

  it('importa en una transacción y enlaza la genealogía por arete', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/animales/importar',
      { fincaId, csv: CSV_VALIDO, dryRun: false },
      token,
    );

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.dryRun).toBe(false);
    expect(respuesta.body.resumen.creadas).toBe(3);
    expect(respuesta.body.creados).toHaveLength(3);

    const hijo = await ctx.prisma.animal.findFirst({
      where: { arete: 'IMP-0002' },
      select: { id: true, madreId: true, padreId: true },
    });
    expect(hijo).not.toBeNull();

    const madre = await ctx.prisma.animal.findFirst({ where: { arete: 'IMP-0001' }, select: { id: true } });
    expect(hijo!.madreId).toBe(madre!.id);
    expect(hijo!.padreId).toBeNull();
  });

  it('rechaza el archivo completo si un arete ya existe en la hacienda', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/animales/importar',
      { fincaId, csv: CSV_VALIDO, dryRun: false },
      token,
    );

    // Ahora los aretes existen: la segunda importación debe detectarlo y no escribir.
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.creadas ?? respuesta.body.resumen.creadas).toBe(0);
    expect(JSON.stringify(respuesta.body)).toMatch(/ya existe/i);

    const total = await ctx.prisma.animal.count({ where: { arete: { startsWith: 'IMP-' } } });
    expect(total).toBe(3);
  });

  it('exige permiso de creación', async () => {
    const respuesta = await post(
      ctx,
      '/api/v1/animales/importar',
      { fincaId, csv: CSV_VALIDO, dryRun: true },
      tokenConsulta,
    );
    expect(respuesta.status).toBe(403);
  });

  it('la plantilla publica las columnas que el importador acepta', async () => {
    const plantilla = await (await import('supertest')).default(ctx.server as never)
      .get('/api/v1/animales/importar/plantilla')
      .set('authorization', `Bearer ${token}`);

    expect(plantilla.status).toBe(200);
    expect(plantilla.body.csv).toContain('arete,nombre,sexo');
    expect(plantilla.body.columnasObligatorias).toContain('sexo');
  });

  it('el parser acepta punto y coma y comillas', () => {
    const csv = 'arete;nombre;sexo;observaciones\nIMP-9001;"Pérez; el bueno";MACHO;"dice ""hola"""\n';
    const { filas, errores } = parsearCsv(csv);

    expect(errores).toHaveLength(0);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.valores.nombre).toBe('Pérez; el bueno');
    expect(filas[0]!.valores.observaciones).toBe('dice "hola"');
  });

  it('el parser rechaza un archivo sin la columna obligatoria', () => {
    const { filas, errores } = parsearCsv('arete,nombre\nX,Y\n');
    expect(filas).toHaveLength(0);
    expect(errores[0]!.mensaje).toMatch(/columna obligatoria/i);
  });
});
