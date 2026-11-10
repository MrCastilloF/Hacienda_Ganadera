# ──────────────────────────────────────────────────────────────────────────────
#  Hacienda Ganadera — atajos de operación
#
#  Requiere `make` (Linux, macOS, WSL). En Windows sin make, ejecutar los
#  comandos equivalentes documentados en cada target.
#
#  Fase 0: solo targets de documentación e infraestructura.
#  Los targets de aplicación se activan en la Fase 1 cuando exista package.json.
# ──────────────────────────────────────────────────────────────────────────────

SHELL := /bin/sh
COMPOSE := docker compose
NODE := node

.DEFAULT_GOAL := help

.PHONY: help verify docs secrets compose up down ps logs \
        app-up app-down migrate seed test test-e2e test-load \
        backup restore clean release

## ── Ayuda ─────────────────────────────────────────────────────────────────
help: ## Muestra esta ayuda
	@echo ""
	@echo "  Hacienda Ganadera — comandos disponibles"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "  Estado: Fase 0 (especificación y arquitectura). Sin código de aplicación."
	@echo ""

## ── Validación del repositorio (funciona hoy) ──────────────────────────────
verify: docs secrets compose ## Ejecuta todas las validaciones disponibles
	@echo "✔ verify: todo en verde"

docs: ## Verifica enlaces, estructura y ADR de la documentación
	@$(NODE) scripts/ci/check-docs.mjs

secrets: ## Busca credenciales y secretos en el árbol de trabajo
	@$(NODE) scripts/ci/check-secrets.mjs

compose: ## Valida la sintaxis de docker-compose.yml
	@$(COMPOSE) config -q && echo "✔ compose válido"

## ── Infraestructura ────────────────────────────────────────────────────────
up: ## Levanta la infraestructura (postgres, redis, minio, proxy)
	@$(COMPOSE) up -d
	@$(COMPOSE) ps

down: ## Detiene la infraestructura (conserva volúmenes)
	@$(COMPOSE) down

ps: ## Muestra el estado de los servicios
	@$(COMPOSE) ps

logs: ## Muestra logs de todos los servicios
	@$(COMPOSE) logs -f --tail=100

## ── Aplicación (Fase 1+) ───────────────────────────────────────────────────
app-up: ## Levanta también api, web, worker y lora-service
	@$(COMPOSE) --profile app up -d

app-down: ## Detiene la aplicación (conserva la infraestructura)
	@$(COMPOSE) --profile app stop api web worker lora-service

migrate: ## Aplica las migraciones SQL pendientes
	@$(COMPOSE) exec -T api pnpm run migrate

seed: ## Carga catálogos base y datos de demostración marcados como SIMULATOR
	@$(COMPOSE) exec -T api pnpm run seed

## ── Pruebas (Fase 1+) ──────────────────────────────────────────────────────
test: ## Pruebas unitarias y de integración
	@$(COMPOSE) exec -T api pnpm test

test-e2e: ## Pruebas end-to-end con Playwright
	@$(COMPOSE) exec -T web pnpm test:e2e

test-load: ## Pruebas de carga con k6
	@k6 run tests/load/smoke.js

## ── Respaldos ──────────────────────────────────────────────────────────────
backup: ## Ejecuta un respaldo manual de la base
	@$(COMPOSE) --profile tools run --rm backup

restore: ## Restaura un respaldo (interactivo; ver docs/runbooks)
	@sh scripts/dev/restore.sh

## ── Limpieza ───────────────────────────────────────────────────────────────
clean: ## Detiene todo y elimina volúmenes (¡destruye datos locales!)
	@echo "ATENCIÓN: se eliminarán volúmenes de datos locales."
	@read -p "Escribe 'borrar' para continuar: " c && [ "$$c" = "borrar" ] || exit 1
	@$(COMPOSE) down -v

## ── Release ────────────────────────────────────────────────────────────────
release: ## Crea una etiqueta de versión (uso: make release V=0.1.0)
	@test -n "$(V)" || (echo "Falta V=<version>. Ejemplo: make release V=0.1.0" && exit 1)
	@git tag -a "v$(V)" -m "Release v$(V)" && git push origin "v$(V)"
	@echo "✔ etiqueta v$(V) publicada"
