# Changelog

Todos los cambios notables de este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[SemVer](https://semver.org/lang/es/).

## [No publicado]

### Por venir (Fase 1)
- Monorepo pnpm con TypeScript estricto, lint y pruebas base.
- `docker-compose.yml` con PostgreSQL 16 + PostGIS, Redis, MinIO y proxy TLS.
- Migraciones iniciales, roles de base de datos y auditoría encadenada.
- Autenticación (login, refresh rotativo, MFA), RBAC con alcance y OpenAPI.
- Release `v0.1.0`.

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
