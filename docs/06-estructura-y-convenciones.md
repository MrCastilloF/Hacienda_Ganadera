# Estructura del repositorio y convenciones de trabajo

**Documento:** `docs/06-estructura-y-convenciones.md`
**Versión:** 1.0.0
**Fecha:** 2026-11-10
**Requisitos:** v1 §44, §45, §47; `docs/01-especificacion-corregida.md` §17

---

## 1. Árbol del repositorio (monorepo)

```text
Hacienda_Ganadera/
├── README.md
├── LICENSE
├── CHANGELOG.md
├── ROADMAP.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── Makefile
├── .env.example
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .nvmrc
├── docker-compose.yml
├── docker-compose.override.example.yml
├── .devcontainer/
│   └── devcontainer.json
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                  # lint, typecheck, tests, migraciones, docs, secretos
│   │   ├── nightly.yml             # E2E, carga, restauración, verificación de auditoría
│   │   └── release.yml             # imágenes y paquete del bridge
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   ├── feature_request.yml
│   │   ├── hardware_integration.yml
│   │   ├── adr_proposal.yml
│   │   └── config.yml
│   ├── DISCUSSION_TEMPLATE/
│   │   └── decision.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── CODEOWNERS
│   └── dependabot.yml
├── apps/                           # (Fases 1+) aplicaciones desplegables
│   ├── web/                        # Next.js PWA
│   ├── api/                        # NestJS
│   ├── lora-service/               # ingesta LoRaWAN
│   └── local-bridge/               # agente de báscula
├── packages/                       # (Fases 1+) librerías compartidas
│   ├── contracts/                  # esquemas Zod + tipos generados de OpenAPI
│   ├── ui/                         # componentes compartidos
│   ├── domain/                     # reglas puras reutilizables
│   ├── scale-protocols/            # adaptadores de báscula
│   ├── sync-engine/                # outbox, HLC, reconciliación
│   ├── iot-codecs/                 # decodificadores de payload
│   └── config/                     # eslint, tsconfig, prettier
├── infra/
│   ├── docker/                     # Dockerfiles por servicio
│   ├── postgres/
│   │   ├── init/                   # extensiones, roles, esquema
│   │   └── migrations/             # migraciones SQL numeradas (fuente de verdad)
│   ├── chirpstack/                 # configuración local (perfil opcional)
│   ├── grafana/                    # dashboards provisionados
│   └── caddy/                      # proxy TLS
├── docs/
│   ├── README.md                   # índice de documentación
│   ├── 00-validacion-de-la-especificacion.md
│   ├── 01-especificacion-corregida.md
│   ├── 02-arquitectura.md
│   ├── 03-modelo-de-datos.md
│   ├── 04-estrategia-de-pruebas.md
│   ├── 05-requisitos-hardware-y-riesgos.md
│   ├── 06-estructura-y-convenciones.md
│   ├── 07-cierre-y-confirmaciones.md
│   ├── adr/                        # decisiones arquitectónicas
│   ├── diagrams/                   # fuentes .mmd versionadas
│   ├── manuals/                    # manuales de instalación/uso/báscula/LoRaWAN
│   ├── runbooks/                   # operación, respaldo, restauración, incidentes
│   ├── api/                        # OpenAPI generada
│   └── tests/load/                 # resultados de pruebas de carga
├── scripts/
│   ├── ci/                         # validaciones del repositorio (sin dependencias)
│   └── dev/                        # bootstrap, seed, utilidades
└── tests/
    ├── e2e/                        # Playwright
    ├── integration/                # suites con base real
    ├── load/                       # k6
    └── fixtures/                   # datasets y tramas de ejemplo
```

### 1.1 Regla de crecimiento

- Un módulo nuevo de negocio = carpeta en `apps/api/src/modules/<modulo>/` + feature en
  `apps/web/src/features/<modulo>/` + sección en la especificación.
- Un adaptador nuevo de hardware = archivo en `packages/scale-protocols/src/adapters/` + entrada en el
  registro + acta de integración en `docs/manuals/integraciones/`.
- Una decisión estructural = ADR en `docs/adr/`. Sin ADR no se acepta el PR.
- Un diagrama nuevo = archivo `.mmd` en `docs/diagrams/` referenciado desde el documento que lo usa.

---

## 2. Convenciones de nombres

| Elemento | Convención | Ejemplo |
|---|---|---|
| Carpetas y archivos | `kebab-case` | `animal-state-machine.ts` |
| Clases y tipos | `PascalCase` | `WeighingService` |
| Funciones y variables | `camelCase` | `calculateGdp` |
| Constantes | `UPPER_SNAKE_CASE` | `MAX_OFFLINE_HOURS` |
| Tablas y columnas SQL | `snake_case` | `movimiento_potrero` |
| Endpoints | plural, sustantivo, `kebab-case` | `GET /api/v1/weighings` |
| Ramas | `tipo/alcance-descripcion` | `feat/pesajes-dedupe` |
| Commits | Conventional Commits | `feat(pesajes): deduplicar pesajes en ventana de 60 s` |
| Variables de entorno | `UPPER_SNAKE_CASE` | `DATABASE_URL` |
| Códigos de error | `UPPER_SNAKE_CASE` | `ANIMAL_SOLD` |

---

## 3. Estrategia de ramas

Modelo **GitFlow ligero**, adaptado a un equipo pequeño que necesita releases estables para una hacienda en
producción.

```text
main        ●───────────●──────────────●────────►  (producción, protegida)
             \         / \            /
develop       ●───●───●───●───●───●──●─────────►  (integración, protegida)
               \     /     \   /
feature/*       ●───●       ●─●                     (corta vida, 1–5 días)
fix/*                                   ●──●       (correcciones sobre develop)
hotfix/*                                          ●──●  (emergencia sobre main)
release/x.y.z                             ●───●
```

| Rama | Nace de | Integra a | Protección | Propósito |
|---|---|---|---|---|
| `main` | — | — | Sí (2 revisores, CI verde, sin push directo) | Estado desplegable / producción |
| `develop` | `main` | — | Sí (1 revisor, CI verde) | Integración continua |
| `feature/*` | `develop` | `develop` (squash) | No | Nueva funcionalidad |
| `fix/*` | `develop` | `develop` | No | Corrección no urgente |
| `release/x.y.z` | `develop` | `main` + `develop` | Sí | Estabilización y versión |
| `hotfix/*` | `main` | `main` + `develop` | Sí | Corrección urgente en producción |
| `docs/*` | `develop` | `develop` | No | Documentación |

Reglas:

1. Una rama = un propósito. Si el PR necesita un "y", son dos ramas.
2. Vida máxima de una rama de trabajo: 5 días. Lo que no cabe se parte.
3. `main` siempre compila, siempre migra y siempre se puede desplegar.
4. Nunca se reescribe historia en `main` ni en `develop`.
5. El merge a `main` y `develop` es por **squash** (historial lineal y legible); las ramas de release pueden
   usar merge commit para conservar el punto de versión.
6. La rama se borra al integrar (`delete_branch_on_merge = true`).

---

## 4. Convención de commits

Formato [Conventional Commits](https://www.conventionalcommits.org/):

```text
<tipo>(<alcance>): <descripción en imperativo, minúscula, sin punto final>

[cuerpo opcional: qué y por qué, no cómo]

[footer opcional]
Refs: #123
BREAKING CHANGE: <descripción>
```

Tipos permitidos:

| Tipo | Uso |
|---|---|
| `feat` | Funcionalidad nueva visible |
| `fix` | Corrección de defecto |
| `docs` | Solo documentación |
| `refactor` | Cambio interno sin cambio de comportamiento |
| `perf` | Mejora de rendimiento |
| `test` | Pruebas |
| `build` | Build, dependencias, Docker |
| `ci` | Pipeline |
| `chore` | Mantenimiento |
| `revert` | Reversión |

Alcances (`scope`) definidos: `animales`, `pesajes`, `salud`, `reproduccion`, `alimentacion`, `potreros`,
`inventario`, `compras`, `ventas`, `finanzas`, `iot`, `mapas`, `geocercas`, `alertas`, `reportes`,
`documentos`, `usuarios`, `seguridad`, `sync`, `bridge`, `bascula`, `auditoria`, `web`, `api`, `infra`,
`docs`, `ci`, `deps`.

Ejemplos válidos:

```text
feat(pesajes): detectar peso estable con ventana configurable por báscula
fix(sync): impedir duplicado cuando el reintento llega después del ack
docs(adr): registrar decisión de inmutabilidad N3
perf(mapas): usar vista materializada para última posición
feat(iot)!: cambiar contrato de codec a versión 2

BREAKING CHANGE: los codecs v1 dejan de ser válidos; requiere migración de perfiles
```

Reglas adicionales:

- La descripción va en **imperativo** ("agrega", no "agregado" ni "agrega fix").
- Un commit = un cambio coherente y reversible.
- El cuerpo explica el **por qué**; el **qué** ya está en el diff.
- Todo commit de una fase referencia el issue o la fase: `Refs: #12`.

---

## 5. Versionado y releases

- **SemVer** `MAYOR.MENOR.PARCHE`, etiquetas `v0.1.0`.
- `MAYOR` cambia cuando cambia el contrato de sincronización, el esquema de forma incompatible o la API pública.
- Durante las 12 fases se avanza en `0.x.y`; `1.0.0` cuando se cumpla el criterio de terminación (v1 §48).
- Cada release incluye: `CHANGELOG.md` actualizado, imágenes Docker con digest, migraciones probadas, notas de
  despliegue y procedimiento de rollback.

---

## 6. Comandos de Git

### 6.1 Inicialización (ya ejecutada al crear el repositorio remoto)

```bash
# Identidad local del repositorio (no global)
git config user.name  "Eduardo Castillo"
git config user.email "tu-correo@ejemplo.com"

# Inicializar
git init -b main
git add -A
git commit -m "chore(repo): estructura inicial, especificación v2 y arquitectura"

# Remoto
git remote add origin https://github.com/MrCastilloF/Hacienda_Ganadera.git
git push -u origin main

# Rama de integración
git checkout -b develop
git push -u origin develop
```

### 6.2 Flujo diario

```bash
git checkout develop
git pull --ff-only

git checkout -b feat/pesajes-dedupe
# ... trabajo ...
git add -A
git commit -m "feat(pesajes): deduplicar pesajes dentro de la ventana configurada"
git push -u origin feat/pesajes-dedupe

# Abrir PR hacia develop (squash merge)
```

### 6.3 Inicio de una fase

```bash
git checkout develop && git pull --ff-only
git checkout -b release/0.1.0
# estabilización, version bump, changelog
git commit -m "chore(release): prepara 0.1.0 (Fase 1)"
git checkout main && git merge --no-ff release/0.1.0
git tag -a v0.1.0 -m "Fase 1: arquitectura, Docker, seguridad y autenticación"
git push origin main --tags
git checkout develop && git merge --no-ff release/0.1.0 && git push
```

### 6.4 Hotfix

```bash
git checkout main && git pull --ff-only
git checkout -b hotfix/pesaje-negativo
git commit -am "fix(pesajes): rechazar peso negativo del bridge"
git checkout main && git merge --no-ff hotfix/pesaje-negativo
git tag -a v0.1.1 -m "Hotfix: peso negativo"
git push origin main --tags
git checkout develop && git merge --no-ff hotfix/pesaje-negativo && git push
```

### 6.5 Utilidades

```bash
git log --oneline --graph --all -30
git branch -d feat/rama-terminada          # borrar rama local
git push origin --delete feat/rama-vieja   # borrar remota
git tag -l "v*"                            # listar versiones
git diff develop...main                    # qué falta por integrar
```

---

## 7. Protección de ramas (configuración del repositorio)

Aplicada a `main` y `develop`:

| Regla | `main` | `develop` |
|---|---|---|
| Push directo | Bloqueado | Bloqueado |
| Revisiones requeridas | 1–2 | 1 |
| CI obligatorio | `ci` completo | `ci` completo |
| Ramas actualizadas | Sí | No |
| Historial lineal | Sí (squash) | Sí (squash) |
| Firmas de commit | Opcional | Opcional |
| Administradores incluidos | Sí | No |
| Borrar al integrar | Sí | Sí |

Configuración por API (ejecutable con un token con permiso de administración):

```bash
curl -X PUT \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/MrCastilloF/Hacienda_Ganadera/branches/main/protection \
  -d '{
    "required_status_checks": {"strict": true, "contexts": ["ci"]},
    "enforce_admins": true,
    "required_pull_request_reviews": {"required_approving_review_count": 1, "dismiss_stale_reviews": true},
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false
  }'
```

### 7.0 Limitación conocida de la cuenta

Este repositorio es **privado** y la cuenta es de plan gratuito. GitHub **no permite protección de ramas en
repositorios privados** sin plan Pro/Team (responde `403 Upgrade to GitHub Pro or make this repository
public`). Opciones, en orden de preferencia:

1. **Pasar a plan Pro/Team** y ejecutar la configuración (recomendado si el repositorio seguirá privado).
2. **Hacer público el repositorio** (cambia la exposición del material: revisar antes con el titular).
3. **Operar sin protección de ramas**, con disciplina de PR y CI en verde como norma social (estado actual).

Mientras la protección no esté activa, la regla del proyecto sigue vigente por acuerdo: **nadie empuja
directo a `main`**, todo entra por PR hacia `develop`.

Las etiquetas y los hitos sí se pueden crear en cualquier plan, pero el token debe tener permiso
**Issues: Read and write**. El script de configuración los crea de forma idempotente:

```bash
# Un solo comando para dejar el repositorio configurado
GITHUB_TOKEN=<token-con-issues-y-administration> node scripts/dev/setup-github.mjs --all

# O por partes
node scripts/dev/setup-github.mjs --labels --milestones
node scripts/dev/setup-github.mjs --topics
node scripts/dev/setup-github.mjs --protection   # requiere Pro/Team o repo público
```

### 7.1 Etiquetas (labels)

| Etiqueta | Color | Uso |
|---|---|---|
| `tipo: feat` / `tipo: fix` / `tipo: docs` | `#1f6feb` / `#d73a4a` / `#0075ca` | Tipo de trabajo |
| `fase:1` … `fase:12` | `#0b3d2e` | Fase del roadmap |
| `prioridad: bloqueante` | `#b60205` | Impide avanzar |
| `prioridad: alta` / `media` / `baja` | `#d93f0b` / `#fbca04` / `#c2e0c6` | Prioridad |
| `hardware` | `#5319e7` | Requiere dispositivo físico |
| `simulado` | `#bfd4f2` | Se valida con simulador |
| `seguridad` | `#b60205` | Revisión de seguridad |
| `adr requerido` | `#8b5cf6` | Cambio estructural |
| `necesita confirmación` | `#f9d0c4` | Bloqueado por decisión del cliente |

### 7.2 Hitos (milestones)

Uno por fase: `F1 — Arquitectura y seguridad`, …, `F12 — Offline y despliegue`. Cada issue de implementación
pertenece exactamente a un hito.

### 7.3 Proyecto

Un tablero con columnas `Backlog`, `Listo`, `En curso`, `En revisión`, `Bloqueado`, `Hecho`. El criterio de
"Listo" incluye criterios de aceptación escritos; el de "Hecho" es la Definition of Done (§17.3 de la
especificación).

---

## 8. Estrategia de CI

### 8.1 Disparadores

| Workflow | Disparador | Propósito |
|---|---|---|
| `ci.yml` | PR a `main`/`develop`, push a `develop` | Calidad obligatoria |
| `nightly.yml` | Cron 03:00 UTC + manual | E2E, carga, restauración, auditoría |
| `release.yml` | Tag `v*` | Imágenes, paquete del bridge, notas |

### 8.2 Jobs de `ci.yml`

| Job | Qué hace | Cuándo |
|---|---|---|
| `docs` | Verifica enlaces internos, H1 por documento, front-matter de ADR, diagramas referenciados | Siempre |
| `secrets` | Busca patrones de credenciales y claves | Siempre |
| `compose` | `docker compose config -q` | Siempre |
| `lint` | ESLint + Prettier | Si existe `package.json` |
| `typecheck` | `tsc --noEmit` | Si existe `package.json` |
| `test` | Unitarias + cobertura | Si existe `package.json` |
| `integration` | Levanta PostGIS y aplica migraciones | Si existe `infra/postgres/migrations` |
| `drift` | Compara esquema migrado con el cliente ORM | Si existe esquema ORM |
| `e2e` | Playwright contra compose | Solo PR a `main`/`develop` |

Los jobs de aplicación se activan solos cuando el código aparece: hoy el repositorio es documental (Fase 0) y
el CI debe estar verde **sin** inventar pasos que no existen.

### 8.3 Reglas

- Ningún job instala dependencias globales innecesarias.
- Caché de `pnpm store` y de la imagen base.
- Un fallo de CI bloquea el merge; no hay "merge con rojo".
- Tiempo objetivo del PR: < 20 min.

---

## 9. Revisión de código (checklist del PR)

El PR debe poder responderse "sí" a todo:

1. ¿El cambio respeta los invariantes (`INV-01`…`INV-12`)?
2. ¿Agrega o actualiza pruebas? ¿Las pruebas fallarían si el cambio se revierte?
3. ¿Toca migraciones? ¿Son reversibles y probadas desde cero?
4. ¿Emite auditoría en las operaciones críticas?
5. ¿Aplica autorización y alcance?
6. ¿Introduce datos simulados sin marcarlos? (debe ser no)
7. ¿Declara el estado de integración si toca hardware?
8. ¿Actualiza la documentación afectada?
9. ¿Hay secretos, credenciales o rutas locales en el diff?
10. ¿El commit sigue la convención y explica el por qué?

---

## 10. Autogestión del repositorio

| Elemento | Archivo | Efecto |
|---|---|---|
| Propietarios de revisión | `.github/CODEOWNERS` | Asigna revisores por ruta |
| Dependencias | `.github/dependabot.yml` | PR semanales agrupados |
| Plantillas de issue | `.github/ISSUE_TEMPLATE/*` | Issues con información suficiente |
| Plantilla de PR | `.github/PULL_REQUEST_TEMPLATE.md` | Checklist obligatorio |
| Seguridad | `SECURITY.md` | Canal de reporte de vulnerabilidades |
| Contribución | `CONTRIBUTING.md` | Reglas de código y flujo |
| Conducta | `CODE_OF_CONDUCT.md` | Normas de colaboración |
| Roadmap | `ROADMAP.md` | Fases e hitos |
| Cambios | `CHANGELOG.md` | Historial por versión |

Con esto el repositorio se mantiene sin depender de la memoria de una persona: las reglas están escritas y
el CI las verifica donde es posible automatizarlas.
