-- =============================================================================
--  0002 · Núcleo de seguridad: finca, usuario, rol, permiso, sesión
--
--  Modelo de §4 de docs/01 (roles y permisos con alcance) y §14 (seguridad).
-- =============================================================================

SET search_path = app, public;

-- ── Finca ────────────────────────────────────────────────────────────────────
CREATE TABLE app.finca (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid,
  codigo                    text NOT NULL,
  nombre                    text NOT NULL,
  propietario               text,
  identificacion_tributaria text,
  direccion                 text,
  zona_horaria              text NOT NULL DEFAULT 'America/Bogota',
  moneda                    char(3) NOT NULL DEFAULT 'COP',
  unidad_peso               text NOT NULL DEFAULT 'kg' CHECK (unidad_peso IN ('kg','lb','arroba')),
  activa                    boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid,
  updated_by                uuid,
  deleted_at                timestamptz,
  CONSTRAINT uq_finca_codigo UNIQUE (codigo),
  CONSTRAINT ck_finca_codigo CHECK (codigo ~ '^[A-Z0-9_-]{2,20}$')
);

CREATE INDEX ix_finca_activa ON app.finca (activa) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_finca_touch BEFORE UPDATE ON app.finca
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

COMMENT ON TABLE app.finca IS 'Predio del propietario. Una instalación puede tener varias (ADR-0006).';

-- ── Usuario ──────────────────────────────────────────────────────────────────
CREATE TABLE app.usuario (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid,
  email            text NOT NULL,
  password_hash    text NOT NULL,
  nombre           text NOT NULL,
  cargo            text,
  activo           boolean NOT NULL DEFAULT true,
  mfa_habilitado   boolean NOT NULL DEFAULT false,
  mfa_secret_enc   text,
  intentos_fallidos integer NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta  timestamptz,
  ultimo_acceso_at timestamptz,
  password_cambiada_at timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_by       uuid,
  deleted_at       timestamptz
);

CREATE UNIQUE INDEX uq_usuario_email ON app.usuario (lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX ix_usuario_activo ON app.usuario (activo) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_usuario_touch BEFORE UPDATE ON app.usuario
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

COMMENT ON COLUMN app.usuario.password_hash IS 'Argon2id. Nunca se registra en logs ni se devuelve por API.';

-- ── Rol y permiso ────────────────────────────────────────────────────────────
CREATE TABLE app.rol (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo     text NOT NULL,
  nombre     text NOT NULL,
  descripcion text,
  sistema    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rol_codigo UNIQUE (codigo)
);

CREATE TABLE app.permiso (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo     text NOT NULL,
  modulo     text NOT NULL,
  operacion  text NOT NULL,
  descripcion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_permiso_codigo UNIQUE (codigo),
  CONSTRAINT ck_permiso_operacion CHECK (operacion IN
    ('consultar','crear','modificar','anular','aprobar','exportar','resolver_conflicto','administrar_dispositivos','ver_datos_personales','cerrar_periodo')),
  CONSTRAINT ck_permiso_codigo CHECK (codigo = modulo || ':' || operacion)
);

CREATE INDEX ix_permiso_modulo ON app.permiso (modulo);

CREATE TABLE app.rol_permiso (
  rol_id     uuid NOT NULL REFERENCES app.rol(id) ON DELETE CASCADE,
  permiso_id uuid NOT NULL REFERENCES app.permiso(id) ON DELETE CASCADE,
  alcance    text NOT NULL DEFAULT 'finca'
             CHECK (alcance IN ('global','finca','lote','propio')),
  PRIMARY KEY (rol_id, permiso_id, alcance)
);

CREATE TABLE app.usuario_rol (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES app.usuario(id) ON DELETE RESTRICT,
  rol_id     uuid NOT NULL REFERENCES app.rol(id) ON DELETE RESTRICT,
  finca_id   uuid REFERENCES app.finca(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE UNIQUE INDEX uq_usuario_rol ON app.usuario_rol (usuario_id, rol_id, coalesce(finca_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE app.usuario_finca (
  usuario_id        uuid NOT NULL REFERENCES app.usuario(id) ON DELETE RESTRICT,
  finca_id          uuid NOT NULL REFERENCES app.finca(id) ON DELETE RESTRICT,
  es_predeterminada boolean NOT NULL DEFAULT false,
  PRIMARY KEY (usuario_id, finca_id)
);

CREATE UNIQUE INDEX uq_usuario_finca_predeterminada
  ON app.usuario_finca (usuario_id) WHERE es_predeterminada;

-- ── Sesiones y refresh tokens rotativos ──────────────────────────────────────
CREATE TABLE app.sesion (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id     uuid NOT NULL REFERENCES app.usuario(id) ON DELETE RESTRICT,
  refresh_family uuid NOT NULL,
  refresh_hash   text NOT NULL,
  user_agent     text,
  ip             text,
  creada_at      timestamptz NOT NULL DEFAULT now(),
  expira_at      timestamptz NOT NULL,
  revocada_at    timestamptz,
  reemplazada_por uuid,
  motivo_revocacion text,
  CONSTRAINT uq_sesion_refresh_hash UNIQUE (refresh_hash),
  CONSTRAINT ck_sesion_ip CHECK (ip IS NULL OR ip::inet IS NOT NULL)
);

CREATE INDEX ix_sesion_usuario ON app.sesion (usuario_id, creada_at DESC);
CREATE INDEX ix_sesion_family ON app.sesion (refresh_family);
CREATE INDEX ix_sesion_activas ON app.sesion (expira_at) WHERE revocada_at IS NULL;

COMMENT ON TABLE app.sesion IS
  'Cada refresh emitido es una fila. La reutilización de un refresh revocado revoca toda la familia (RF-SEG-03).';

-- ── Intentos de login ────────────────────────────────────────────────────────
CREATE TABLE app.intento_login (
  id         bigserial PRIMARY KEY,
  email      text NOT NULL,
  ip         text,
  exito      boolean NOT NULL,
  motivo     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_intento_ip CHECK (ip IS NULL OR ip::inet IS NOT NULL)
);

CREATE INDEX ix_intento_login_email ON app.intento_login (lower(email), created_at DESC);
CREATE INDEX ix_intento_login_fallos ON app.intento_login (created_at DESC) WHERE exito = false;

-- ── Configuración versionada ─────────────────────────────────────────────────
CREATE TABLE app.configuracion (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id       uuid REFERENCES app.finca(id) ON DELETE RESTRICT,
  clave          text NOT NULL,
  valor_json     jsonb NOT NULL,
  version        integer NOT NULL DEFAULT 1,
  vigente_desde  timestamptz NOT NULL DEFAULT now(),
  vigente_hasta  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  CONSTRAINT uq_configuracion UNIQUE (finca_id, clave, version),
  CONSTRAINT ck_configuracion_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
);

CREATE INDEX ix_configuracion_finca_clave ON app.configuracion (finca_id, clave)
  WHERE vigente_hasta IS NULL;
