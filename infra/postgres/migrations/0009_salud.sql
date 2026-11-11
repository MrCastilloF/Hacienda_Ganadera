-- =============================================================================
--  0009 · Tratamientos y periodo de retiro
--
--  RF-SAL-01…08:
--    · el tratamiento es un evento inmutable: se registra, no se edita;
--    · el periodo de retiro impide vender o sacrificar un animal con residuos;
--    · la fecha de fin de retiro se calcula y se guarda, no se recalcula al leer
--      (si cambia la regla, lo ya registrado no se reescribe);
--    · un tratamiento anulado exige evento compensatorio, igual que un pesaje.
-- =============================================================================

SET search_path = app, public;

CREATE TABLE app.tratamiento (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id          uuid NOT NULL REFERENCES app.finca(id) ON DELETE RESTRICT,
  animal_id         uuid NOT NULL REFERENCES app.animal(id) ON DELETE RESTRICT,
  medicamento       text NOT NULL CHECK (length(trim(medicamento)) >= 2),
  principio_activo  text,
  dosis             text,
  via               text CHECK (via IN ('IM','IV','SC','ORAL','TOPICA','INTRAMAMARIA','OTRA')),
  diagnostico       text,
  motivo            text,
  iniciado_at       timestamptz NOT NULL,
  dias_tratamiento  integer NOT NULL DEFAULT 1 CHECK (dias_tratamiento BETWEEN 1 AND 365),
  -- Días de retiro declarados por el veterinario o el prospecto del producto.
  dias_retiro       integer NOT NULL DEFAULT 0 CHECK (dias_retiro BETWEEN 0 AND 365),
  -- Calculado al registrar: fin del tratamiento y fin del retiro.
  fin_tratamiento   timestamptz NOT NULL,
  fin_retiro        timestamptz NOT NULL,
  veterinario       text,
  observaciones     text,
  origen            text NOT NULL DEFAULT 'FIELD' CHECK (origen IN ('FIELD','SIMULATOR','IMPORT','MANUAL')),
  registrado_por    uuid,
  idempotency_key   uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tratamiento_idempotencia UNIQUE (idempotency_key),
  CONSTRAINT ck_tratamiento_fechas CHECK (fin_retiro >= fin_tratamiento)
);

CREATE INDEX ix_tratamiento_animal ON app.tratamiento (animal_id, fin_retiro DESC);
CREATE INDEX ix_tratamiento_finca ON app.tratamiento (finca_id, iniciado_at DESC);
-- Búsqueda del bloqueo: tratamientos cuyo retiro aún no vence.
CREATE INDEX ix_tratamiento_retiro_vigente ON app.tratamiento (animal_id, fin_retiro);

CREATE TRIGGER trg_tratamiento_immutable
  BEFORE UPDATE OR DELETE ON app.tratamiento
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TABLE app.tratamiento_anulacion (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tratamiento_id uuid NOT NULL REFERENCES app.tratamiento(id) ON DELETE RESTRICT,
  motivo        text NOT NULL CHECK (length(trim(motivo)) >= 5),
  actor_id      uuid,
  occurred_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_tratamiento_anulacion UNIQUE (tratamiento_id)
);

CREATE TRIGGER trg_tratamiento_anulacion_immutable
  BEFORE UPDATE OR DELETE ON app.tratamiento_anulacion
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

COMMENT ON TABLE app.tratamiento IS
  'Tratamiento veterinario inmutable. El periodo de retiro bloquea la venta y el sacrificio (RF-SAL-06).';
COMMENT ON COLUMN app.tratamiento.fin_retiro IS
  'Fecha en que el animal puede venderse o sacrificarse. Se calcula al registrar y no se recalcula.';

GRANT SELECT, INSERT ON app.tratamiento, app.tratamiento_anulacion TO app_rw;
GRANT SELECT ON app.tratamiento, app.tratamiento_anulacion TO app_ro;

REVOKE UPDATE, DELETE ON app.tratamiento, app.tratamiento_anulacion FROM app_rw;
