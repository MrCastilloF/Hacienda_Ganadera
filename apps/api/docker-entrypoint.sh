#!/bin/sh
# Punto de entrada de la API.
#
# Orden deliberado: preparar secretos → migrar → arrancar, y ceder privilegios
# antes de ejecutar la aplicación. Si una migración falla, el contenedor NO
# arranca: es preferible un servicio caído a uno operando con un esquema
# inconsistente (ADR-0002).
#
# ¿Por qué se copian los secretos? Un bind mount conserva el propietario del
# host; si el archivo pertenece a otro UID, el proceso (usuario `node`) no puede
# leerlo y la API no arranca. Fue un fallo real detectado por `docker-smoke`.
set -eu

APP_USER="${APP_USER:-node}"
SECRETS_SRC="${SECRETS_DIR:-/run/secrets}"
SECRETS_DST="/app/.secrets"

if [ -d "$SECRETS_SRC" ]; then
  mkdir -p "$SECRETS_DST"
  # Se copia el contenido y se ajustan propietario y permisos para el usuario de
  # la aplicación. El montaje original permanece de solo lectura.
  cp -R "$SECRETS_SRC"/. "$SECRETS_DST"/ 2>/dev/null || true
  chown -R "$APP_USER:$APP_USER" "$SECRETS_DST" 2>/dev/null || true
  find "$SECRETS_DST" -type f -exec chmod 600 {} \; 2>/dev/null || true

  if [ -f "$SECRETS_DST/jwt_private.pem" ]; then
    export JWT_PRIVATE_KEY_PATH="$SECRETS_DST/jwt_private.pem"
  fi
  if [ -f "$SECRETS_DST/jwt_public.pem" ]; then
    export JWT_PUBLIC_KEY_PATH="$SECRETS_DST/jwt_public.pem"
  fi
fi

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] aplicando migraciones…"
  gosu "$APP_USER" node /app/scripts/dev/lib/migrations.mjs
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] sembrando catálogos y usuario administrador…"
  gosu "$APP_USER" node /app/scripts/dev/lib/seed.mjs
fi

echo "[entrypoint] iniciando como ${APP_USER}: $*"
exec gosu "$APP_USER" "$@"
