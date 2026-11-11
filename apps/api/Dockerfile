# ──────────────────────────────────────────────────────────────────────────────
#  API de Hacienda Ganadera — imagen de producción
#
#  El contexto de construcción es la raíz del monorepo (ver docker-compose.yml).
#  Se instala el workspace completo porque Prisma y el runner de migraciones
#  necesitan las dependencias compartidas.
#
#  Nota: imagen grande a propósito (todo el workspace). La optimización con
#  `pnpm deploy` queda para la Fase 12, junto con el endurecimiento.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@12.10.1 --activate
# Prisma detecta la versión de OpenSSL en tiempo de generación: sin el binario
# elige `debian-openssl-1.1.x` y el cliente falla al arrancar en el contenedor.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
# Paquetes compartidos del workspace (protocolos de báscula, dominio reutilizable).
COPY packages ./packages
COPY infra ./infra
COPY scripts ./scripts

RUN pnpm --filter @hacienda/api exec prisma generate \
 && pnpm --filter @hacienda/api run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    TZ=UTC
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates curl gosu \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=base /app/apps/api/package.json ./apps/api/package.json
COPY --from=base /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/apps/api/prisma ./apps/api/prisma
COPY --from=base /app/packages ./packages
COPY --from=base /app/infra ./infra
COPY --from=base /app/scripts ./scripts
COPY apps/api/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && chown -R node:node /app

WORKDIR /app/apps/api

# El entrypoint se ejecuta como root solo para preparar los secretos montados
# (propietario del host) y luego cede el control a `node` con gosu. El proceso
# de la aplicación nunca corre como root.
USER root

EXPOSE 3001
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3001/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/main.js"]
