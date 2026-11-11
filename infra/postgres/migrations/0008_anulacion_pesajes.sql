-- =============================================================================
--  0008 · Anulación de pesajes (evento compensatorio)
--
--  Un pesaje no se edita ni se borra (INV-05): se anula. La anulación es un
--  registro aparte, también inmutable, con motivo y responsable. Así la pregunta
--  "¿por qué cambió este peso?" tiene respuesta y el pesaje original sigue
--  visible en el historial.
-- =============================================================================

SET search_path = app, public;

CREATE TABLE app.pesaje_anulacion (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pesaje_id   uuid NOT NULL REFERENCES app.pesaje(id) ON DELETE RESTRICT,
  motivo      text NOT NULL CHECK (length(trim(motivo)) >= 5),
  actor_id    uuid,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- Un pesaje se anula una sola vez: la segunda vez es un error del cliente.
  CONSTRAINT uq_pesaje_anulacion UNIQUE (pesaje_id)
);

CREATE INDEX ix_pesaje_anulacion_fecha ON app.pesaje_anulacion (occurred_at DESC);

CREATE TRIGGER trg_pesaje_anulacion_immutable
  BEFORE UPDATE OR DELETE ON app.pesaje_anulacion
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

COMMENT ON TABLE app.pesaje_anulacion IS
  'Anulación de un pesaje con motivo. Append-only: corregir una anulación exige otro evento compensatorio.';

GRANT SELECT, INSERT ON app.pesaje_anulacion TO app_rw;
GRANT SELECT ON app.pesaje_anulacion TO app_ro;

REVOKE UPDATE, DELETE ON app.pesaje_anulacion FROM app_rw;
