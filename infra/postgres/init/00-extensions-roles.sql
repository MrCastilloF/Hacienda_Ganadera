# ──────────────────────────────────────────────────────────────────────────────
#  Inicialización de PostgreSQL/PostGIS
#  Se ejecuta UNA vez, al crear el volumen de datos.
#  - Extensiones necesarias
#  - Roles de base de datos con privilegios mínimos (ADR-0004)
#  - Zona horaria y convenciones
#
#  La contraseña del rol de aplicación se inyecta desde el entorno del contenedor.
# ──────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on

-- Extensiones ------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Zona horaria por defecto (los datos se guardan en UTC) ------------------------
ALTER DATABASE :"POSTGRES_DB" SET timezone TO 'UTC';
ALTER DATABASE :"POSTGRES_DB" SET datestyle TO 'ISO, YMD';
ALTER DATABASE :"POSTGRES_DB" SET statement_timeout TO '60s';
ALTER DATABASE :"POSTGRES_DB" SET idle_in_transaction_session_timeout TO '30s';

-- Roles de base de datos -------------------------------------------------------
--  app_rw     → API: DML; sin UPDATE/DELETE en tablas inmutables (se revoca por migración)
--  app_ro     → reportes: solo lectura
--  migrator   → DDL: solo lo usa la herramienta de migraciones
--  lora_svc   → ingesta: INSERT en telemetría y posiciones
--  backup     → lectura para respaldos

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_ro') THEN
    CREATE ROLE app_ro LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') THEN
    CREATE ROLE migrator LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lora_svc') THEN
    CREATE ROLE lora_svc LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup') THEN
    CREATE ROLE backup LOGIN;
  END IF;
END $$;

-- La contraseña se define fuera del repositorio (ver .env y docs/runbooks).
-- Ejecutar manualmente en el primer arranque:
--   ALTER ROLE app_rw PASSWORD '<desde el gestor de secretos>';
--   ALTER ROLE app_ro PASSWORD '...';
--   ALTER ROLE migrator PASSWORD '...';
--   ALTER ROLE lora_svc PASSWORD '...';
--   ALTER ROLE backup PASSWORD '...';

GRANT CONNECT ON DATABASE :"POSTGRES_DB" TO app_rw, app_ro, migrator, lora_svc, backup;

-- Esquema de aplicación
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION migrator;
GRANT USAGE ON SCHEMA app TO app_rw, app_ro, lora_svc;

-- Privilegios por defecto (las migraciones crean tablas como `migrator`)
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA app
  GRANT SELECT ON TABLES TO app_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO app_rw, app_ro;

-- Sin acceso por defecto a `public` para nadie más
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- Nota: la revocación de UPDATE/DELETE sobre tablas inmutables (pesaje,
-- audit_log, evento_dominio, posicion, telemetria) se aplica en la migración
-- que crea cada tabla, junto con el trigger reject_mutation().
