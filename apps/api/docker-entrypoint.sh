#!/bin/sh
# Punto de entrada de la API.
#
# Orden deliberado: migrar primero, arrancar después. Si una migración falla, el
# contenedor NO arranca: es preferible un servicio caído a uno operando con un
# esquema inconsistente (ADR-0002).
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] aplicando migraciones…"
  node /app/scripts/dev/lib/migrations.mjs
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] sembrando catálogos y usuario administrador…"
  node /app/scripts/dev/lib/seed.mjs
fi

echo "[entrypoint] iniciando: $*"
exec "$@"
