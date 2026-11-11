/**
 * lib/seed.mjs — catálogos base, roles, permisos y usuario administrador.
 *
 * Idempotente: se puede ejecutar tantas veces como se quiera.
 * El usuario administrador NUNCA se siembra con una contraseña fija:
 *   · SEED_ADMIN_PASSWORD define la clave (mínimo 12 caracteres)
 *   · si no existe, se genera una aleatoria y se imprime una sola vez
 */

import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { hash as argonHash } from '@node-rs/argon2';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@hacienda.local';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Administrador de hacienda';
const FINCA_CODIGO = process.env.SEED_FINCA_CODIGO ?? 'HACIENDA-01';
const FINCA_NOMBRE = process.env.SEED_FINCA_NOMBRE ?? 'Hacienda principal';

const ROLES = [
  ['superadmin', 'Superadministrador', 'Control total del sistema.'],
  ['administrador', 'Administrador de hacienda', 'Administra la operación del predio.'],
  ['veterinario', 'Veterinario', 'Historia clínica, tratamientos y reproducción.'],
  ['mayordomo', 'Mayordomo', 'Operación diaria: animales, potreros y movimientos.'],
  ['operario', 'Operario', 'Registra pesajes y eventos en campo.'],
  ['bascula', 'Responsable de báscula', 'Pesaje y dispositivos de pesaje.'],
  ['contador', 'Contador', 'Costos, compras, ventas y reportes financieros.'],
  ['consulta', 'Usuario de consulta', 'Solo lectura y exportación de reportes.'],
];

// [modulo, operaciones]
const MODULOS = [
  ['usuarios', ['consultar', 'crear', 'modificar', 'anular']],
  ['fincas', ['consultar', 'crear', 'modificar', 'anular']],
  ['animales', ['consultar', 'crear', 'modificar', 'anular', 'exportar']],
  ['pesajes', ['consultar', 'crear', 'anular', 'exportar']],
  ['basculas', ['consultar', 'crear', 'modificar', 'administrar_dispositivos']],
  ['salud', ['consultar', 'crear', 'modificar', 'anular', 'exportar']],
  ['reproduccion', ['consultar', 'crear', 'modificar', 'anular']],
  ['alimentacion', ['consultar', 'crear', 'modificar']],
  ['potreros', ['consultar', 'crear', 'modificar', 'anular']],
  ['inventario', ['consultar', 'crear', 'modificar', 'exportar']],
  ['compras', ['consultar', 'crear', 'modificar', 'anular', 'aprobar']],
  ['ventas', ['consultar', 'crear', 'anular', 'aprobar']],
  ['finanzas', ['consultar', 'crear', 'modificar', 'cerrar_periodo', 'exportar']],
  ['documentos', ['consultar', 'crear', 'anular', 'ver_datos_personales']],
  ['reportes', ['consultar', 'exportar']],
  ['auditoria', ['consultar', 'exportar']],
  ['configuracion', ['consultar', 'modificar']],
  ['iot', ['consultar', 'crear', 'modificar', 'administrar_dispositivos']],
  ['mapas', ['consultar']],
  ['sync', ['consultar', 'resolver_conflicto']],
];

/** Permisos por rol: [modulo, operaciones] con alcance. */
const MATRIZ = {
  superadmin: { alcance: 'global', regla: null }, // null = todos
  administrador: {
    alcance: 'finca',
    regla: null, // todos los permisos, limitados a la finca
  },
  veterinario: {
    alcance: 'finca',
    regla: {
      salud: ['consultar', 'crear', 'modificar', 'exportar'],
      reproduccion: ['consultar', 'crear', 'modificar'],
      animales: ['consultar', 'modificar'],
      pesajes: ['consultar'],
      potreros: ['consultar'],
      alimentacion: ['consultar'],
      documentos: ['consultar', 'crear'],
      reportes: ['consultar', 'exportar'],
  salud: ['consultar', 'crear', 'modificar'],
      mapas: ['consultar'],
    },
  },
  mayordomo: {
    alcance: 'finca',
    regla: {
      animales: ['consultar', 'crear', 'modificar'],
      potreros: ['consultar', 'crear', 'modificar'],
      pesajes: ['consultar', 'crear'],
      salud: ['consultar'],
      reproduccion: ['consultar', 'crear'],
      alimentacion: ['consultar', 'crear'],
      inventario: ['consultar'],
      documentos: ['consultar', 'crear'],
      reportes: ['consultar'],
      mapas: ['consultar'],
    },
  },
  operario: {
    alcance: 'propio',
    regla: {
      animales: ['consultar'],
      pesajes: ['consultar', 'crear'],
      potreros: ['consultar'],
      salud: ['consultar', 'crear'],
      documentos: ['consultar', 'crear'],
      mapas: ['consultar'],
    },
  },
  bascula: {
    alcance: 'finca',
    regla: {
      pesajes: ['consultar', 'crear', 'anular'],
      animales: ['consultar'],
      basculas: ['consultar', 'crear', 'modificar', 'administrar_dispositivos'],
      reportes: ['consultar'],
    },
  },
  contador: {
    alcance: 'finca',
    regla: {
      finanzas: ['consultar', 'crear', 'modificar', 'exportar'],
      compras: ['consultar', 'aprobar', 'exportar'],
      ventas: ['consultar', 'aprobar', 'exportar'],
      inventario: ['consultar', 'exportar'],
      animales: ['consultar'],
      reportes: ['consultar', 'exportar'],
      auditoria: ['consultar'],
    },
  },
  consulta: {
    alcance: 'finca',
    regla: 'SOLO_LECTURA',
  },
};

function permisosDelRol(codigoRol) {
  const cfg = MATRIZ[codigoRol];
  const out = [];
  for (const [modulo, operaciones] of MODULOS) {
    let permitidas;
    if (cfg.regla === null) {
      permitidas = operaciones;
    } else if (cfg.regla === 'SOLO_LECTURA') {
      permitidas = operaciones.filter((o) => ['consultar', 'exportar'].includes(o));
    } else {
      permitidas = cfg.regla[modulo] ?? [];
    }
    for (const operacion of permitidas) {
      out.push({ codigo: `${modulo}:${operacion}`, modulo, operacion, alcance: cfg.alcance });
    }
  }
  return out;
}

export async function runSeed({ databaseUrl, silent = false } = {}) {
  const url = databaseUrl ?? process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL para sembrar datos');

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const creado = { roles: 0, permisos: 0, usuario: false, finca: false };
  let passwordGenerada = null;

  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL search_path = app, public");

    // ── Roles ────────────────────────────────────────────────────────────────
    for (const [codigo, nombre, descripcion] of ROLES) {
      const r = await client.query(
        `INSERT INTO app.rol (codigo, nombre, descripcion, sistema)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion
         RETURNING id`,
        [codigo, nombre, descripcion],
      );
      if (r.rowCount === 1) creado.roles++;
    }

    // ── Permisos ─────────────────────────────────────────────────────────────
    for (const [modulo, operaciones] of MODULOS) {
      for (const operacion of operaciones) {
        const ins = await client.query(
          `INSERT INTO app.permiso (codigo, modulo, operacion, descripcion)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (codigo) DO NOTHING`,
          [`${modulo}:${operacion}`, modulo, operacion, `${operacion} en ${modulo}`],
        );
        creado.permisos += ins.rowCount ?? 0;
      }
    }

    // ── Asignación rol → permiso ─────────────────────────────────────────────
    for (const codigoRol of Object.keys(MATRIZ)) {
      const { rows } = await client.query('SELECT id FROM app.rol WHERE codigo = $1', [codigoRol]);
      const rolId = rows[0]?.id;
      if (!rolId) continue;
      for (const permiso of permisosDelRol(codigoRol)) {
        await client.query(
          `INSERT INTO app.rol_permiso (rol_id, permiso_id, alcance)
           SELECT $1, p.id, $3 FROM app.permiso p WHERE p.codigo = $2
           ON CONFLICT DO NOTHING`,
          [rolId, permiso.codigo, permiso.alcance],
        );
      }
    }

    // ── Catálogos de animales (Fase 2) ───────────────────────────────────────
    // Las razas se siembran como SUGERIDAS: el negocio debe validarlas
    // (docs/01 §15). No se inventan datos clínicos ni productivos.
    const RAZAS = [
      ['BRAHMAN', 'Brahman', 'BOVINO'],
      ['NELORE', 'Nelore', 'BOVINO'],
      ['ANGUS', 'Angus', 'BOVINO'],
      ['HOLSTEIN', 'Holstein', 'BOVINO'],
      ['GYR', 'Gyr', 'BOVINO'],
      ['SIMMENTAL', 'Simmental', 'BOVINO'],
      ['CRUCE', 'Cruce comercial', 'BOVINO'],
      ['BUFALO', 'Búfalo de agua', 'BUFALINO'],
    ];
    for (const [codigo, nombre, especie] of RAZAS) {
      await client.query(
        `INSERT INTO app.raza (codigo, nombre, especie, source)
         VALUES ($1, $2, $3, 'SEED')
         ON CONFLICT (codigo) DO NOTHING`,
        [codigo, nombre, especie],
      );
    }

    const CATEGORIAS = [
      ['TERNERO', 'Ternero', 'MACHO', 0, 12, 10],
      ['TERNERA', 'Ternera', 'HEMBRA', 0, 12, 11],
      ['NOVILLO', 'Novillo', 'MACHO', 12, 24, 20],
      ['NOVILLA', 'Novilla', 'HEMBRA', 12, 24, 21],
      ['CEBA', 'Ceba', 'MACHO', 24, null, 30],
      ['VACA', 'Vaca', 'HEMBRA', 24, null, 31],
      ['TORO', 'Toro', 'MACHO', 24, null, 32],
    ];
    for (const [codigo, nombre, sexo, min, max, orden] of CATEGORIAS) {
      await client.query(
        `INSERT INTO app.categoria_animal (codigo, nombre, sexo, edad_min_meses, edad_max_meses, orden)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (codigo) DO UPDATE
           SET nombre = EXCLUDED.nombre, edad_min_meses = EXCLUDED.edad_min_meses,
               edad_max_meses = EXCLUDED.edad_max_meses, orden = EXCLUDED.orden`,
        [codigo, nombre, sexo, min, max, orden],
      );
    }

    // ── Finca ────────────────────────────────────────────────────────────────
    const finca = await client.query(
      `INSERT INTO app.finca (codigo, nombre, zona_horaria, moneda, unidad_peso)
       VALUES ($1, $2, 'America/Bogota', 'COP', 'kg')
       ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING id`,
      [FINCA_CODIGO, FINCA_NOMBRE],
    );
    const fincaId = finca.rows[0].id;

    // ── Báscula por defecto (perfil HACIENDA-GEN-01) ─────────────────────────
    // Supuesto declarado: mientras no se confirme marca y modelo (C-02), la
    // hacienda arranca con un perfil ASCII genérico marcado como "declared".
    const PERFIL = {
      perfil: 'HACIENDA-GEN-01',
      puerto: { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
      trama: {
        delimitador: '\r\n',
        campoPeso: 2,
        separadorCampos: ',',
        caracterEstable: 'ST',
        caracterInestable: 'US',
        decimales: 1,
        unidadPorDefecto: 'kg',
      },
      resolucionKg: 0.1,
    };

    await client.query(
      `INSERT INTO app.bascula
         (finca_id, nombre, protocol_id, transporte, config_json,
          tolerance_kg, window_ms, min_samples, min_kg, max_kg, estado_integracion)
       VALUES ($1, 'Báscula principal (perfil por defecto)', 'generic-ascii', 'SERIAL', $2,
               0.5, 1200, 5, 0, 1500, 'declared')
       ON CONFLICT (finca_id, nombre) DO UPDATE SET config_json = EXCLUDED.config_json`,
      [fincaId, JSON.stringify(PERFIL)],
    );

    // ── Numeración de aretes (RF-ANI-10) ─────────────────────────────────────
    // Se siembra una configuración por defecto editable por el administrador.
    await client.query(
      `INSERT INTO app.configuracion (finca_id, clave, valor_json)
       SELECT $1, 'numeracion_arete',
              jsonb_build_object('prefijo', codigo, 'longitud', 6, 'siguiente', 1, 'digitoVerificacion', true)
       FROM app.finca WHERE id = $1
       ON CONFLICT DO NOTHING`,
      [fincaId],
    );

    // ── Usuario administrador ────────────────────────────────────────────────
    const existente = await client.query('SELECT id FROM app.usuario WHERE lower(email) = lower($1)', [ADMIN_EMAIL]);
    let usuarioId = existente.rows[0]?.id;

    if (!usuarioId) {
      let password = process.env.SEED_ADMIN_PASSWORD;
      if (!password) {
        password = randomBytes(18).toString('base64url');
        passwordGenerada = password;
      }
      if (password.length < 12) {
        throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 12 caracteres');
      }
      const passwordHash = await argonHash(password, {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });
      const ins = await client.query(
        `INSERT INTO app.usuario (email, password_hash, nombre, cargo, mfa_habilitado)
         VALUES ($1, $2, $3, 'Administrador', false)
         RETURNING id`,
        [ADMIN_EMAIL.toLowerCase(), passwordHash, ADMIN_NAME],
      );
      usuarioId = ins.rows[0].id;
      creado.usuario = true;
      creado.finca = true;

      await client.query(
        `INSERT INTO app.usuario_rol (usuario_id, rol_id)
         SELECT $1, id FROM app.rol WHERE codigo = 'superadmin'`,
        [usuarioId],
      );
      await client.query(
        `INSERT INTO app.usuario_finca (usuario_id, finca_id, es_predeterminada)
         VALUES ($1, $2, true)`,
        [usuarioId, fincaId],
      );
    }

    await client.query('COMMIT');

    if (!silent) {
      const asignados = await client.query('SELECT count(*)::int AS n FROM app.rol_permiso');
      const permisos = await client.query('SELECT count(*)::int AS n FROM app.permiso');
      console.log(`   roles: ${ROLES.length} · permisos: ${permisos.rows[0].n} · asignaciones rol-permiso: ${asignados.rows[0].n}`);
      console.log(`   finca: ${FINCA_CODIGO} · usuario admin: ${ADMIN_EMAIL}`);
      if (passwordGenerada) {
        console.log('');
        console.log('   ┌──────────────────────────────────────────────────────────────┐');
        console.log('   │  Contraseña generada para el administrador (se muestra una vez) │');
        console.log(`   │  ${passwordGenerada.padEnd(60)}│`);
        console.log('   └──────────────────────────────────────────────────────────────┘');
        console.log('');
      }
    }

    return { ...creado, adminEmail: ADMIN_EMAIL, password: passwordGenerada };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith('seed.mjs');
if (isMain) {
  try {
    await runSeed({});
    console.log('\n   seed completado\n');
  } catch (err) {
    console.error(`\n   ${err.message}\n`);
    process.exit(1);
  }
}
