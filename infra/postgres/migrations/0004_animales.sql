-- =============================================================================
--  0004 · Animales, identificación, catálogos y genealogía
--
--  Implementa RF-ANI-01…12 y RF-REP-05/06 de docs/01:
--    · ficha única por animal con unicidad de arete (por finca) y código de
--      barras (global);
--    · historial de identificadores con prohibición de reutilización;
--    · historial de estados append-only (la trazabilidad no se reescribe);
--    · genealogía con restricciones de coherencia en la propia base.
-- =============================================================================

SET search_path = app, public;

-- ── Catálogos ────────────────────────────────────────────────────────────────
CREATE TABLE app.raza (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      text NOT NULL,
  nombre      text NOT NULL,
  especie     text NOT NULL DEFAULT 'BOVINO' CHECK (especie IN ('BOVINO','BUFALINO','EQUINO','OTRO')),
  origen      text,
  activo      boolean NOT NULL DEFAULT true,
  source      text NOT NULL DEFAULT 'SEED' CHECK (source IN ('SEED','ADMIN','IMPORT')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_raza_codigo UNIQUE (codigo)
);

COMMENT ON TABLE app.raza IS
  'Catálogo de razas. Las sembradas por migración se marcan como SEED y deben ser validadas por el negocio.';

CREATE TABLE app.categoria_animal (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text NOT NULL,
  nombre          text NOT NULL,
  sexo            text NOT NULL CHECK (sexo IN ('MACHO','HEMBRA','AMBOS')),
  edad_min_meses  integer CHECK (edad_min_meses >= 0),
  edad_max_meses  integer CHECK (edad_max_meses IS NULL OR edad_max_meses > 0),
  orden           integer NOT NULL DEFAULT 0,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_categoria_codigo UNIQUE (codigo),
  CONSTRAINT ck_categoria_edades CHECK (edad_max_meses IS NULL OR edad_max_meses > edad_min_meses)
);

COMMENT ON TABLE app.categoria_animal IS
  'Categorías del hato. La categoría del animal es DERIVADA (sexo + edad + estado productivo), nunca editada a mano (AMB-07).';

CREATE TABLE app.lote (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id   uuid NOT NULL REFERENCES app.finca(id) ON DELETE RESTRICT,
  codigo     text NOT NULL,
  nombre     text NOT NULL,
  activo     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_lote_codigo UNIQUE (finca_id, codigo),
  CONSTRAINT ck_lote_codigo CHECK (codigo ~ '^[A-Z0-9_-]{2,20}$')
);

CREATE TRIGGER trg_lote_touch BEFORE UPDATE ON app.lote
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ── Animal ───────────────────────────────────────────────────────────────────
CREATE TABLE app.animal (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id               uuid NOT NULL REFERENCES app.finca(id) ON DELETE RESTRICT,
  arete                  text NOT NULL,
  codigo_barras          text NOT NULL,
  rfid                   text,
  nombre                 text,
  sexo                   text NOT NULL CHECK (sexo IN ('MACHO','HEMBRA')),
  fecha_nacimiento       date,
  peso_nacimiento_kg     numeric(8,2) CHECK (peso_nacimiento_kg > 0),
  raza_id                uuid REFERENCES app.raza(id) ON DELETE RESTRICT,
  cruce_racial            text,
  color                  text,
  caracteristicas        text,
  procedencia            text,
  madre_id               uuid REFERENCES app.animal(id) ON DELETE RESTRICT,
  padre_id               uuid REFERENCES app.animal(id) ON DELETE RESTRICT,
  tipo_nacimiento        text CHECK (tipo_nacimiento IN ('SIMPLE','GEMELO','TRIPLE')),
  estado                 text NOT NULL DEFAULT 'activo'
                         CHECK (estado IN ('activo','cuarentena','enfermo','vendido','fallecido','sacrificado','trasladado')),
  estado_productivo      text,
  condicion_corporal     smallint CHECK (condicion_corporal BETWEEN 1 AND 5),
  lote_id                uuid REFERENCES app.lote(id) ON DELETE RESTRICT,
  corral                 text,
  identificacion_oficial text,
  observaciones          text,
  version                integer NOT NULL DEFAULT 1,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid,
  deleted_at             timestamptz,

  CONSTRAINT uq_animal_finca_arete UNIQUE (finca_id, arete),
  CONSTRAINT uq_animal_codigo_barras UNIQUE (codigo_barras),
  -- Un animal no puede ser su propio padre ni su propia madre (RF-REP-06).
  CONSTRAINT ck_animal_no_autoparent CHECK (madre_id IS DISTINCT FROM id AND padre_id IS DISTINCT FROM id),
  -- La madre es hembra y el padre es macho: se refuerza con trigger porque un
  -- CHECK no puede consultar otra fila.
  CONSTRAINT ck_animal_madre_padre_distintos CHECK (madre_id IS NULL OR padre_id IS NULL OR madre_id <> padre_id)
);

CREATE UNIQUE INDEX uq_animal_rfid ON app.animal (rfid) WHERE rfid IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_animal_finca_estado ON app.animal (finca_id, estado) WHERE deleted_at IS NULL;
CREATE INDEX ix_animal_lote ON app.animal (lote_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_animal_madre ON app.animal (madre_id) WHERE madre_id IS NOT NULL;
CREATE INDEX ix_animal_padre ON app.animal (padre_id) WHERE padre_id IS NOT NULL;
CREATE INDEX ix_animal_nombre_trgm ON app.animal USING gin (nombre gin_trgm_ops);

CREATE TRIGGER trg_animal_touch BEFORE UPDATE ON app.animal
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

COMMENT ON TABLE app.animal IS
  'Ficha única del animal. No se elimina: se anula o pasa a un estado terminal (INV-07).';
COMMENT ON COLUMN app.animal.version IS
  'Control de concurrencia optimista; se incrementa en cada actualización desde la API.';

-- Coherencia de sexo y fechas en la genealogía. Se valida en la base porque una
-- madre macho o un padre nacido después del hijo son datos imposibles, no
-- "advertencias" (RF-REP-06).
CREATE OR REPLACE FUNCTION app.validar_genealogia() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_madre app.animal%ROWTYPE;
  v_padre app.animal%ROWTYPE;
BEGIN
  IF NEW.madre_id IS NOT NULL THEN
    SELECT * INTO v_madre FROM app.animal WHERE id = NEW.madre_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La madre indicada no existe' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_madre.sexo <> 'HEMBRA' THEN
      RAISE EXCEPTION 'La madre debe ser hembra (animal % es %)', v_madre.arete, v_madre.sexo
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.fecha_nacimiento IS NOT NULL AND v_madre.fecha_nacimiento IS NOT NULL
       AND v_madre.fecha_nacimiento >= NEW.fecha_nacimiento THEN
      RAISE EXCEPTION 'La madre (%) nació después o el mismo día que la cría', v_madre.arete
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.padre_id IS NOT NULL THEN
    SELECT * INTO v_padre FROM app.animal WHERE id = NEW.padre_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El padre indicado no existe' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_padre.sexo <> 'MACHO' THEN
      RAISE EXCEPTION 'El padre debe ser macho (animal % es %)', v_padre.arete, v_padre.sexo
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.fecha_nacimiento IS NOT NULL AND v_padre.fecha_nacimiento IS NOT NULL
       AND v_padre.fecha_nacimiento >= NEW.fecha_nacimiento THEN
      RAISE EXCEPTION 'El padre (%) nació después o el mismo día que la cría', v_padre.arete
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_animal_genealogia
  BEFORE INSERT OR UPDATE OF madre_id, padre_id, fecha_nacimiento, sexo ON app.animal
  FOR EACH ROW EXECUTE FUNCTION app.validar_genealogia();

-- ── Identificadores (historial, sin reutilización) ───────────────────────────
CREATE TABLE app.animal_identificacion (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id      uuid NOT NULL REFERENCES app.animal(id) ON DELETE RESTRICT,
  tipo           text NOT NULL CHECK (tipo IN ('ARETE','CODIGO_BARRAS','RFID','OFICIAL')),
  valor          text NOT NULL,
  vigente_desde  timestamptz NOT NULL DEFAULT now(),
  vigente_hasta  timestamptz,
  estado         text NOT NULL DEFAULT 'active' CHECK (estado IN ('active','retired')),
  motivo         text,
  created_by     uuid,
  CONSTRAINT ck_ident_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
);

-- Un identificador retirado no vuelve a asignarse (RF-ANI-11).
CREATE UNIQUE INDEX uq_ident_valor_activo
  ON app.animal_identificacion (tipo, valor) WHERE estado = 'active';
CREATE UNIQUE INDEX uq_ident_animal_activo
  ON app.animal_identificacion (animal_id, tipo) WHERE estado = 'active';
CREATE INDEX ix_ident_animal ON app.animal_identificacion (animal_id, vigente_desde DESC);

COMMENT ON TABLE app.animal_identificacion IS
  'Historial de identificadores. Uno retirado conserva su historia y nunca se reutiliza.';

-- ── Historial de estados (append-only) ───────────────────────────────────────
CREATE TABLE app.animal_estado_historial (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id       uuid NOT NULL REFERENCES app.animal(id) ON DELETE RESTRICT,
  estado_anterior text,
  estado_nuevo    text NOT NULL,
  motivo          text,
  actor_id        uuid,
  occurred_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_estado_nuevo CHECK (estado_nuevo IN
    ('activo','cuarentena','enfermo','vendido','fallecido','sacrificado','trasladado'))
);

CREATE INDEX ix_estado_animal ON app.animal_estado_historial (animal_id, occurred_at DESC);

CREATE TRIGGER trg_estado_immutable
  BEFORE UPDATE OR DELETE ON app.animal_estado_historial
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

COMMENT ON TABLE app.animal_estado_historial IS
  'Transiciones de estado. Append-only: corregir exige un evento compensatorio.';

-- ── Privilegios ──────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON app.animal TO app_rw;
GRANT SELECT, INSERT, UPDATE ON app.animal_identificacion TO app_rw;
GRANT SELECT, INSERT ON app.animal_estado_historial TO app_rw;
GRANT SELECT, INSERT, UPDATE ON app.raza, app.categoria_animal, app.lote TO app_rw;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO app_ro;

REVOKE DELETE ON app.animal FROM app_rw;
REVOKE UPDATE, DELETE ON app.animal_estado_historial FROM app_rw;
