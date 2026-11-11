-- =============================================================================
--  0001 · Extensiones, esquema y roles
--
--  Se ejecuta como superusuario (o `hacienda_owner`). Idempotente.
--  PostGIS es opcional en este entorno: las tablas geoespaciales llegan en las
--  fases 7 y 10. Si la imagen no lo trae, la migración avisa y continúa.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS app;
SET search_path = app, public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
    CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public;
    RAISE NOTICE 'PostGIS habilitado';
  ELSE
    RAISE NOTICE 'PostGIS no disponible: las migraciones geoespaciales (F7/F10) no se podrán aplicar en este entorno';
  END IF;
END $$;

-- Siempre en `public`: si una extensión cae en `app`, `digest()` no se
-- encuentra desde sesiones con otro search_path (fue un fallo real durante la Fase 1).
CREATE EXTENSION IF NOT EXISTS pgcrypto  SCHEMA public;
CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm   SCHEMA public;
CREATE EXTENSION IF NOT EXISTS unaccent  SCHEMA public;

-- Roles de base de datos con privilegios mínimos (ADR-0004).
-- Si el script de inicialización de Docker ya los creó con LOGIN y clave, aquí
-- no se tocan: solo se crean los que falten.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_ro') THEN
    CREATE ROLE app_ro NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') THEN
    CREATE ROLE migrator NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lora_svc') THEN
    CREATE ROLE lora_svc NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup') THEN
    CREATE ROLE backup NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA app TO app_rw, app_ro, lora_svc;

-- Función compartida: rechaza toda mutación sobre tablas inmutables.
CREATE OR REPLACE FUNCTION app.reject_mutation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
BEGIN
  RAISE EXCEPTION 'Tabla %.% es inmutable: use un evento compensatorio (INV-05)',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

COMMENT ON FUNCTION app.reject_mutation() IS
  'Bloquea UPDATE y DELETE sobre tablas de trazabilidad. Ver docs/01 INV-05.';

-- Marca de tiempo de actualización
CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
