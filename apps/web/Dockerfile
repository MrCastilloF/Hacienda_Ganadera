# ──────────────────────────────────────────────────────────────────────────────
#  Web de Hacienda Ganadera — imagen de producción (Next.js)
#  Contexto de construcción: la raíz del monorepo.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@12.10.1 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web

RUN pnpm --filter @hacienda/web run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    TZ=UTC
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=base /app/apps/web/package.json ./apps/web/package.json
COPY --from=base /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=base /app/apps/web/.next ./apps/web/.next
COPY --from=base /app/apps/web/public ./apps/web/public
COPY --from=base /app/apps/web/next.config.mjs ./apps/web/next.config.mjs
RUN chown -R node:node /app

USER node
WORKDIR /app/apps/web

EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/login || exit 1

CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
