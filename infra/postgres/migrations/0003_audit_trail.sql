-- =============================================================================
--  0003 · Trazabilidad: auditoría encadenada, eventos de dominio, outbox
--
--  Implementa ADR-0004 (inmutabilidad N3):
--    · tablas append-only con triggers que rechazan UPDATE/DELETE
--    · cadena de hashes SHA-256 verificable
--    · rol de aplicación sin privilegios de mutación sobre lo inmutable
-- =============================================================================

SET search_path = app, public;

-- ── Auditoría encadenada ─────────────────────────────────────────────────────
CREATE TABLE app.audit_log (
  id          bigserial NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_id    uuid,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  before_json jsonb,
  after_json  jsonb,
  resultado   text NOT NULL DEFAULT 'OK' CHECK (resultado IN ('OK','ERROR','DENEGADO')),
  ip          text,
  user_agent  text,
  request_id  uuid NOT NULL,
  prev_hash   text,
  hash        text NOT NULL,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE app.audit_log_2026 PARTITION OF app.audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE app.audit_log_2027 PARTITION OF app.audit_log
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
CREATE TABLE app.audit_log_default PARTITION OF app.audit_log DEFAULT;

CREATE INDEX ix_audit_entidad ON app.audit_log (entity, entity_id, occurred_at DESC);
CREATE INDEX ix_audit_actor ON app.audit_log (actor_id, occurred_at DESC);
CREATE INDEX ix_audit_action ON app.audit_log (action, occurred_at DESC);

CREATE TRIGGER trg_audit_immutable
  BEFORE UPDATE OR DELETE ON app.audit_log
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

COMMENT ON TABLE app.audit_log IS
  'Registro de auditoría append-only con cadena de hashes. INSERT solo por app.audit_append().';

-- Formato determinista de la marca de tiempo dentro del hash (independiente de
-- DateStyle y de la zona horaria de la sesión).
CREATE OR REPLACE FUNCTION app.fmt_ts(ts timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE STRICT
  SET search_path = pg_catalog, public, app AS $$
  SELECT to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
$$;

CREATE OR REPLACE FUNCTION app.audit_hash(
  p_actor uuid, p_action text, p_entity text, p_entity_id text,
  p_before jsonb, p_after jsonb, p_occurred_at timestamptz, p_prev_hash text
) RETURNS text
LANGUAGE sql IMMUTABLE
  SET search_path = pg_catalog, public, app AS $$
  SELECT encode(digest(
    coalesce(p_after::text, '') || '|' ||
    coalesce(p_before::text, '') || '|' ||
    coalesce(p_prev_hash, '') || '|' ||
    app.fmt_ts(p_occurred_at) || '|' ||
    coalesce(p_actor::text, '') || '|' ||
    p_action || '|' || p_entity || '|' || coalesce(p_entity_id, ''),
    'sha256'), 'hex');
$$;

-- Única vía de escritura de auditoría. Serializa la cadena con un lock de
-- asesoramiento transaccional para que dos transacciones no lean el mismo
-- prev_hash.
CREATE OR REPLACE FUNCTION app.audit_append(
  p_actor uuid,
  p_action text,
  p_entity text,
  p_entity_id text,
  p_before jsonb,
  p_after jsonb,
  p_resultado text,
  p_ip text,
  p_user_agent text,
  p_request_id uuid
) RETURNS app.audit_log
LANGUAGE plpgsql
  SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_prev text;
  v_hash text;
  v_now  timestamptz := clock_timestamp();
  v_row  app.audit_log;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('app.audit_log.chain'));

  SELECT hash INTO v_prev FROM app.audit_log ORDER BY id DESC LIMIT 1;

  v_hash := app.audit_hash(p_actor, p_action, p_entity, p_entity_id,
                           p_before, p_after, v_now, v_prev);

  INSERT INTO app.audit_log (
    occurred_at, actor_id, action, entity, entity_id,
    before_json, after_json, resultado, ip, user_agent, request_id, prev_hash, hash
  ) VALUES (
    v_now, p_actor, p_action, p_entity, p_entity_id,
    p_before, p_after, coalesce(p_resultado, 'OK'), p_ip::inet, p_user_agent, p_request_id, v_prev, v_hash
  ) RETURNING * INTO v_row;

  RETURN v_row;
END $$;

COMMENT ON FUNCTION app.audit_append IS
  'Inserta un evento de auditoría encadenado. Devuelve la fila creada.';

-- Verificación de la cadena. Devuelve una fila por ruptura: si no devuelve
-- nada, la cadena del rango es íntegra.
CREATE OR REPLACE FUNCTION app.audit_verify(
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL
) RETURNS TABLE (id bigint, occurred_at timestamptz, motivo text)
LANGUAGE sql STABLE
  SET search_path = pg_catalog, public, app AS $$
  WITH ordenado AS (
    SELECT a.id, a.occurred_at, a.actor_id, a.action, a.entity, a.entity_id,
           a.before_json, a.after_json, a.prev_hash, a.hash,
           lag(a.hash) OVER (ORDER BY a.id) AS prev_real
    FROM app.audit_log a
    WHERE (p_from IS NULL OR a.occurred_at >= p_from)
      AND (p_to   IS NULL OR a.occurred_at <  p_to)
  ), calculado AS (
    SELECT o.*,
           app.audit_hash(o.actor_id, o.action, o.entity, o.entity_id,
                          o.before_json, o.after_json, o.occurred_at, o.prev_hash) AS recomputado
    FROM ordenado o
  )
  SELECT c.id, c.occurred_at,
         CASE
           WHEN c.prev_hash IS DISTINCT FROM c.prev_real THEN 'cadena rota: prev_hash no coincide con el evento anterior'
           ELSE 'hash recalculado no coincide: el registro fue alterado'
         END AS motivo
  FROM calculado c
  WHERE c.prev_hash IS DISTINCT FROM c.prev_real
     OR c.hash IS DISTINCT FROM c.recomputado
  ORDER BY c.id;
$$;

COMMENT ON FUNCTION app.audit_verify IS
  'Devuelve las rupturas de la cadena de auditoría. Sin filas = cadena íntegra (RF-AUD-05).';

-- ── Eventos de dominio ───────────────────────────────────────────────────────
CREATE TABLE app.evento_dominio (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo        text NOT NULL,
  entidad     text NOT NULL,
  entidad_id  uuid,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id    uuid,
  origin      text NOT NULL DEFAULT 'API' CHECK (origin IN ('API','SIMULATOR','IMPORT','MANUAL','SYSTEM')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id  uuid,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE app.evento_dominio_2026 PARTITION OF app.evento_dominio
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE app.evento_dominio_default PARTITION OF app.evento_dominio DEFAULT;

CREATE INDEX ix_evento_entidad ON app.evento_dominio (entidad, entidad_id, occurred_at DESC);
CREATE INDEX ix_evento_tipo ON app.evento_dominio (tipo, occurred_at DESC);

CREATE TRIGGER trg_evento_immutable
  BEFORE UPDATE OR DELETE ON app.evento_dominio
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

COMMENT ON TABLE app.evento_dominio IS
  'Hechos del negocio, append-only. Su integridad se ancla con audit_log.';

-- ── Outbox e idempotencia (preparación de la sincronización, Fase 12) ────────
CREATE TABLE app.outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agregado     text NOT NULL,
  agregado_id  uuid NOT NULL,
  tipo_evento  text NOT NULL,
  payload      jsonb NOT NULL,
  intentos     integer NOT NULL DEFAULT 0,
  disponible_en timestamptz NOT NULL DEFAULT now(),
  procesado_at timestamptz,
  ultimo_error text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_outbox_pendientes ON app.outbox (disponible_en) WHERE procesado_at IS NULL;

CREATE TABLE app.idempotency_record (
  key           uuid PRIMARY KEY,
  usuario_id    uuid REFERENCES app.usuario(id) ON DELETE SET NULL,
  endpoint      text NOT NULL,
  request_hash  text NOT NULL,
  response_json jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expira_at     timestamptz NOT NULL DEFAULT now() + interval '90 days'
);

CREATE INDEX ix_idempotency_expira ON app.idempotency_record (expira_at);

COMMENT ON TABLE app.idempotency_record IS
  'Reintentos idempotentes (docs/01 §9.2). La purga corre por job; nunca se borra un registro vigente.';

-- ── Privilegios del rol de aplicación ────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_rw;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO app_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO lora_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO app_rw, app_ro, lora_svc;

-- Lo inmutable no se puede modificar ni siquiera con el rol de la aplicación.
REVOKE UPDATE, DELETE ON app.audit_log FROM app_rw;
REVOKE UPDATE, DELETE ON app.evento_dominio FROM app_rw;

-- Sin borrado de usuarios ni fincas con historia (anulación lógica, INV-07).
REVOKE DELETE ON app.usuario FROM app_rw;
REVOKE DELETE ON app.finca FROM app_rw;
