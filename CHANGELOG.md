# Changelog

Todos los cambios notables de este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[SemVer](https://semver.org/lang/es/).

## [0.1.0] — 2026-11-11 · Fase 1

### Agregado
- **Monorepo pnpm** con TypeScript estricto: `apps/api` (NestJS + Fastify), `apps/web` (Next.js),
  scripts de operación y CI.
- **Migraciones SQL** (fuente de verdad del esquema): extensiones, esquema `app`, roles de base de datos
  con privilegios mínimos, tablas de seguridad, auditoría encadenada y preparación de outbox/idempotencia.
- **Auditoría encadenada N3**: `app.audit_append` con lock de asesoramiento, hash SHA-256 determinista,
  `app.audit_verify` para detectar alteraciones, triggers y `REVOKE` sobre `audit_log` y `evento_dominio`.
- **Autenticación**: JWT RS256 (15 min), refresh opaco rotativo con detección de reutilización y revocación
  de familia, Argon2id, bloqueo por intentos, MFA TOTP (RFC 6238) implementado sin dependencias externas.
- **RBAC con alcance** (global/finca/lote/propio), `deny-by-default` y auditoría de los accesos denegados.
- **API**: usuarios, fincas, auditoría (listado y verificación), salud; OpenAPI 3.1 generado (19 rutas).
- **Web operativa**: ingreso con Server Actions y cookies HttpOnly, panel con permisos y fincas, y visor
  de auditoría con el estado de la cadena.
- **Pruebas**: 15 unitarias + 22 de integración contra PostgreSQL real (autenticación, RBAC, inmutabilidad,
  detección de manipulación, privilegios del rol de aplicación).
- **Operación**: `pnpm verify`, `pnpm test:e2e`, `pnpm audit:verify`, `pnpm db:local` (PostgreSQL embebido
  sin Docker), Dockerfiles de API y web con usuario sin privilegios y migración al arrancar.

### Corregido (defectos encontrados durante la propia implementación)
- Las extensiones se instalaban en el esquema `app` y `digest()` no se resolvía: ahora van a `public` y las
  funciones fijan `search_path`.
- El seed comparaba una función con `null` y dejaba a `superadmin` **sin permisos**; detectado al verificar
  que el token llevaba 0 permisos.
- Prisma no deserializa el tipo compuesto `audit_log`: la función se proyecta como `(…).hash`.
- Los guards declarados con `APP_GUARD` se instanciaban en el módulo equivocado: se registran desde el
  contenedor en `bootstrap`, con una sola pila compartida por pruebas y producción.
- El runner de pruebas (esbuild) no emite metadatos de decoradores: se cambió a SWC.
- `output: standalone` de Next falla en Windows por enlaces simbólicos: se usa `next start`.

## [No publicado]

### Por venir (Fase 2)
- Animales, identificación y numeración de aretes.
- Inventario y categorías derivadas.
- Importador de hato existente (CSV/XLSX).

## [0.1.0] — 2026-11-10 · Fase 0

### Agregado
- `docs/00-validacion-de-la-especificacion.md`: 26 hallazgos (9 bloqueantes) con impacto y recomendación,
  incluido el análisis de los tres riesgos señalados: offline, inmutabilidad y conflictos de sincronización.
- `docs/01-especificacion-corregida.md` (v2): 12 invariantes con mecanismo de cumplimiento, requisitos
  funcionales por módulo con identificadores, requisitos no funcionales medibles, contrato de sincronización
  offline, contrato de inmutabilidad, contrato de hardware, seguridad, fases y Definition of Done.
- `docs/02-arquitectura.md`: vistas C4 (contexto, contenedores, componentes), flujos de pesaje, sincronización,
  ingesta IoT y geocercas, despliegue local e híbrido, arquitecturas de frontend, backend, PostGIS, bridge e
  ingesta LoRaWAN, modelo de amenazas y dependencias.
- `docs/03-modelo-de-datos.md`: catálogo de 68 tablas, DDL de referencia para las críticas (animal, pesaje,
  posiciones particionadas, auditoría encadenada, exclusión de tags y movimientos), índices y volumetría.
- `docs/04-estrategia-de-pruebas.md`: pirámide, matriz por módulo, pruebas de dominio con casos concretos,
  simuladores de báscula y LoRaWAN, 12 casos de sincronización con inyección de fallos, HIL y carga.
- `docs/05-requisitos-hardware-y-riesgos.md`: especificación de servidor y puesto de pesaje, criterios de
  radiofrecuencia, lo que no puede verificarse sin hardware y registro de 30 riesgos.
- `docs/06-estructura-y-convenciones.md`: árbol del monorepo, ramas, Conventional Commits, versionado,
  comandos de Git, protección de ramas, etiquetas, hitos y estrategia de CI.
- `docs/07-cierre-y-confirmaciones.md`: estado de entregables, decisiones tomadas y confirmaciones C-01…C-10.
- 10 ADR (`docs/adr/`) incluyendo sincronización offline, inmutabilidad N3, Local Bridge con mTLS y monolito
  modular.
- Estructura del repositorio: `.github/` con CI, plantillas de issue y PR, CODEOWNERS, Dependabot;
  `docker-compose.yml` base; `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- Validaciones de repositorio sin dependencias: `scripts/ci/check-docs.mjs` y `scripts/ci/check-secrets.mjs`.

### Notas
- Esta versión no contiene código de aplicación: es el entregable de la Fase 0 (especificación y arquitectura).
- No se declara ninguna integración física validada; no hay hardware disponible en esta etapa.
