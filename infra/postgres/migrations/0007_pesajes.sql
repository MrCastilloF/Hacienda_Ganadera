-- =============================================================================
--  0007 · Básculas, bridges y pesajes
--
--  Implementa RF-BAS-01…08 y RF-PES-01…09 de docs/01:
--    · la báscula y su protocolo son DATOS, no código: agregar una marca no
--      requiere tocar el ERP (INV-02);
--    · el pesaje es append-only: no se edita ni se borra, se anula;
--    · la deduplicación por ventana evita el doble registro del mismo pesaje en
--      el mismo equipo (HAL-23);
--    · el origen del dato es obligatorio: FIELD, SIMULATOR, IMPORT o MANUAL
--      (INV-08: un dato simulado nunca se presenta como real);
--    · una báscula declara su estado de integración; sin hardware verificado no
--      se puede afirmar validación en campo (INV-09).
-- =============================================================================

SET search_path = app, public;

-- ── Báscula ──────────────────────────────────────────────────────────────────
CREATE TABLE app.bascula (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id            uuid NOT NULL REFERENCES app.finca(id) ON DELETE RESTRICT,
  nombre              text NOT NULL,
  marca               text,
  modelo              text,
  serie               text,
  -- El adaptador se resuelve por este identificador; un protocolo sin adaptador
  -- registrado deja la báscula en estado "unsupported" (no se inventa soporte).
  protocol_id         text NOT NULL DEFAULT 'generic-ascii',
  transporte          text NOT NULL DEFAULT 'SERIAL'
                      CHECK (transporte IN ('SERIAL','USB','TCP','USB_HID')),
  -- Parámetros del puerto o del socket: baud rate, paridad, bits, host, puerto.
  config_json         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Umbrales de estabilidad (RF-BAS-05), configurables por equipo.
  tolerance_kg        numeric(6,2) NOT NULL DEFAULT 0.50 CHECK (tolerance_kg > 0),
  window_ms           integer NOT NULL DEFAULT 1200 CHECK (window_ms BETWEEN 100 AND 10000),
  min_samples         integer NOT NULL DEFAULT 5 CHECK (min_samples BETWEEN 2 AND 100),
  min_kg              numeric(8,2) NOT NULL DEFAULT 0 CHECK (min_kg >= 0),
  max_kg              numeric(8,2) NOT NULL DEFAULT 2000 CHECK (max_kg > 0),
  estado_integracion  text NOT NULL DEFAULT 'declared'
                      CHECK (estado_integracion IN ('declared','simulated','lab_verified','field_verified')),
  activa              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  updated_by          uuid,
  CONSTRAINT uq_bascula_nombre UNIQUE (finca_id, nombre),
  CONSTRAINT ck_bascula_rango CHECK (max_kg > min_kg)
);

CREATE INDEX ix_bascula_finca ON app.bascula (finca_id) WHERE activa;

CREATE TRIGGER trg_bascula_touch BEFORE UPDATE ON app.bascula
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

COMMENT ON TABLE app.bascula IS
  'Báscula física con su protocolo y umbrales de estabilidad. El protocolo es un dato, no código (INV-02).';
COMMENT ON COLUMN app.bascula.estado_integracion IS
  'declared → simulated → lab_verified → field_verified. Solo el último habilita afirmar validación en campo (INV-09).';

-- ── Local Bridge ─────────────────────────────────────────────────────────────
CREATE TABLE app.bridge (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id            uuid NOT NULL REFERENCES app.finca(id) ON DELETE RESTRICT,
  nombre              text NOT NULL,
  version             text,
  huella_certificado  text,
  estado              text NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente','activo','suspendido','retirado')),
  ultima_comunicacion timestamptz,
  cola_pendiente      integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_bridge_nombre UNIQUE (finca_id, nombre)
);

CREATE TRIGGER trg_bridge_touch BEFORE UPDATE ON app.bridge
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

COMMENT ON TABLE app.bridge IS
  'Agente del puesto de pesaje. La huella del certificado permite revocarlo sin redesplegar (ADR-0005).';

-- ── Pesaje (inmutable) ───────────────────────────────────────────────────────
CREATE TABLE app.pesaje (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id         uuid NOT NULL REFERENCES app.finca(id) ON DELETE RESTRICT,
  animal_id        uuid NOT NULL REFERENCES app.animal(id) ON DELETE RESTRICT,
  bascula_id       uuid REFERENCES app.bascula(id) ON DELETE RESTRICT,
  bridge_id        uuid REFERENCES app.bridge(id) ON DELETE RESTRICT,
  peso_kg          numeric(8,2) NOT NULL CHECK (peso_kg > 0),
  tipo             text NOT NULL DEFAULT 'CONTROL'
                   CHECK (tipo IN ('NACIMIENTO','DESTETE','CONTROL','ENTRADA','SALIDA','OTRO')),
  ocurrido_at      timestamptz NOT NULL,
  recibido_at      timestamptz NOT NULL DEFAULT now(),
  registrado_por   uuid,
  edad_dias        integer CHECK (edad_dias IS NULL OR edad_dias >= 0),
  observaciones    text,
  origen           text NOT NULL CHECK (origen IN ('FIELD','SIMULATOR','IMPORT','MANUAL')),
  duplicate_of     uuid REFERENCES app.pesaje(id) ON DELETE RESTRICT,
  trama_cruda      text,
  idempotency_key  uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pesaje_idempotencia UNIQUE (idempotency_key)
);

CREATE INDEX ix_pesaje_animal_fecha ON app.pesaje (animal_id, ocurrido_at DESC);
CREATE INDEX ix_pesaje_finca_fecha ON app.pesaje (finca_id, ocurrido_at DESC);
-- Ventana de deduplicación: mismo animal en la misma báscula.
CREATE INDEX ix_pesaje_dedupe ON app.pesaje (animal_id, bascula_id, ocurrido_at)
  WHERE duplicate_of IS NULL;

CREATE TRIGGER trg_pesaje_immutable
  BEFORE UPDATE OR DELETE ON app.pesaje
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

COMMENT ON TABLE app.pesaje IS
  'Medición de peso, append-only. Corregir exige anulación (evento compensatorio) y un registro nuevo.';
COMMENT ON COLUMN app.pesaje.trama_cruda IS
  'Trama original recibida del equipo (RF-BAS-06): permite auditar y depurar el protocolo.';
COMMENT ON COLUMN app.pesaje.origen IS
  'FIELD = báscula real; SIMULATOR = generado por el simulador; IMPORT = carga histórica; MANUAL = digitado.';

-- ── Privilegios ──────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON app.bascula, app.bridge TO app_rw;
GRANT SELECT, INSERT ON app.pesaje TO app_rw;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO app_ro;

REVOKE UPDATE, DELETE ON app.pesaje FROM app_rw;
