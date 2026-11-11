# Changelog

Todos los cambios notables de este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
[SemVer](https://semver.org/lang/es/).

## [0.3.1] — 2026-11-11

### Corregido
- **La imagen Docker de la API no compilaba**: el Dockerfile copiaba `apps/api` pero no `packages/`, así que
  el paquete compartido `@hacienda/scale-protocols` no existía dentro del contenedor. Lo detectó la
  construcción de la imagen en el release, no la revisión.

## [0.3.0] — 2026-11-11 · Fase 3 (núcleo sin hardware)

### Agregado
- **Paquete `@hacienda/scale-protocols`**: contrato de adaptador v1, adaptador ASCII genérico configurable,
  detección de estabilidad por ventana, simulador con cinco modos y registro de adaptadores. 24 pruebas.
- **Perfil de báscula por defecto `HACIENDA-GEN-01`** (supuesto declarado): 8N1 a 9600, trama `ST,GS,+kg`,
  tolerancia 0,5 kg, ventana 1200 ms, 5 muestras, rango 0–1500 kg, resolución 0,1 kg.
- **Tablas de báscula, bridge y pesaje**: el pesaje es append-only (trigger + `REVOKE`), con trama cruda,
  origen explícito e índice de deduplicación.
- **API de pesajes**: registro inmutable e idempotente, deduplicación por ventana de 60 s, validación de
  estado del animal y rango del equipo, historial por animal y **pesaje simulado de punta a punta**
  (adaptador → estabilidad → registro) marcado como `SIMULATOR`.
- **API de básculas**: alta y ajuste de umbrales por equipo, listado de protocolos con adaptador y aviso
  cuando un protocolo no tiene soporte.
- **Pantalla de pesaje web**: buscador por arete, peso en tipografía grande, diferencia contra el último
  pesaje, botón de simulación con diagnóstico (tramas, muestras, dispersión).

### Corregido (defectos encontrados al ejecutar)
- **La unidad pegada al número no se detectaba** (`+01000.0lb` se leía como kg): el límite de palabra de la
  expresión regular no existe entre dígito y letra.
- **Una trama con campos entrecomillados se truncaba** y producía un peso inventado (1,45 kg): ahora se rechaza.
- El módulo de pesajes no estaba registrado y el paquete compartido no se construía antes de la API
  (pre-scripts agregados).

## [0.2.0] — 2026-11-11 · Fase 2

### Agregado
- **Ficha única del animal** con identificación (arete, código de barras, RFID, identificación oficial),
  datos biológicos, condición corporal, lote y observaciones.
- **Numeración de aretes configurable** (prefijo + consecutivo + dígito de verificación alfanumérico).
  Si no se envía arete, se genera; el código de barras se deriva del arete.
- **Historial de identificadores** con prohibición de reutilización: un arete retirado conserva su historia.
- **Máquina de estados** (activo, cuarentena, enfermo, vendido, fallecido, sacrificado, trasladado) con
  transiciones validadas, motivo obligatorio y estados terminales sin salida.
- **Genealogía** con validaciones: madre hembra, padre macho, fechas coherentes, sin ciclos (la base
  refuerza sexo y fechas con trigger; el dominio impide ciclos y devuelve error de negocio).
- **Categoría derivada** (ternero/ternera, novillo/novilla, ceba, vaca, toro) calculada en SQL y en el
  dominio con **el mismo criterio**, verificado por una prueba de equivalencia.
- **Búsqueda y filtros** por arete, código de barras, nombre, estado y categoría, con paginación.
- **Importador de hato** con validación previa (`dryRun`), errores por línea y campo, importación
  transaccional todo-o-nada y enlace de genealogía por arete.
- **Interfaz web**: listado con filtros y ficha con genealogía, historial de estados e identificadores.
- **Catálogos** de razas, categorías, lotes y estados.
- 54 pruebas de integración y 36 unitarias (90 en total).

### Corregido (defectos encontrados al ejecutar)
- El **dígito de verificación devolvía `NaN`** con prefijos alfanuméricos: solo contemplaba dígitos.
- La **edad se calculaba con días/30,4375**, lo que desviaba los límites de 12 y 24 meses y clasificaba
  mal a los animales: ahora es meses calendario, en TypeScript y en SQL.
- La validación de fechas de progenitores dependía solo del trigger y devolvía 500; ahora es un 400 de
  negocio con mensaje claro.
- El módulo de animales no estaba registrado en el módulo raíz (las rutas devolvían 404).
- Las pruebas no eran idempotentes: los datos residuales de una ejecución fallida rompían la siguiente.

## [0.1.5] — 2026-11-11

### Corregido
- **El contenedor no encontraba el motor de Prisma**: Prisma detectaba `debian-openssl-1.1.x` al generar el
  cliente porque la etapa de build no tenía el binario `openssl`, mientras la imagen final usa `3.0.x`.
  Se declara `binaryTargets = ["native", "debian-openssl-3.0.x"]` y se instala `openssl` en el build.
  De nuevo: lo detectó la prueba que arranca el contenedor, no la revisión de código.

## [0.1.4] — 2026-11-11

### Corregido
- **La API no podía leer las claves montadas en Docker** (`EACCES` sobre `/run/secrets/jwt_private.pem`): un
  *bind mount* conserva el propietario del host y el contenedor corre como `node`. El entrypoint ahora copia
  los secretos a una ruta interna, ajusta propietario y permisos, y cede privilegios con `gosu`: el proceso
  de la aplicación **nunca** corre como root. Detectado por la prueba `docker-smoke`, no en revisión.

## [0.1.3] — 2026-11-11

### Agregado
- **Generación de claves RS256** (`scripts/dev/generate-keys.mjs`): en producción la API se niega a arrancar
  sin claves, y antes no había forma de generarlas. Compose las monta como secretos en `/run/secrets`.
- **Prueba de imagen publicada** (`docker-smoke`): arranca el contenedor contra un PostgreSQL real, espera
  `/health`, verifica `/ready`, inicia sesión y comprueba la cadena de auditoría. Construir una imagen no
  demuestra que funcione.

## [0.1.2] — 2026-11-11

### Corregido
- **Build de la imagen de la API**: el Dockerfile no copiaba `tsconfig.base.json`, de modo que `tsc` corría
  sin `skipLibCheck` ni `esModuleInterop` y fallaba al tipar los tipos de dependencias (zod). La imagen de
  la web ya se construía correctamente.

## [0.1.1] — 2026-11-11

### Agregado
- **PWA completa**: manifest con cuatro iconos (incluido *maskable*), iconos PNG generados sin dependencias
  por `scripts/dev/generate-icons.mjs`, service worker con precarga del shell, pantalla `/offline` honesta
  y registro del service worker solo en producción.
- **Pruebas de segundo factor**: 8 pruebas de integración del flujo TOTP completo (iniciar, confirmar,
  exigir código, rechazar código inválido, desactivar), sobre 45 pruebas en total.

### Corregido
- **La imagen Docker de la API no se construía**: el job usaba `./apps/api` como contexto (los Dockerfiles
  necesitan la raíz del monorepo) y el nombre de la imagen conservaba mayúsculas, que ghcr.io rechaza.
  También se agregó caché de capas por servicio.
- Aviso de ESLint por el comentario `eslint-env` en el service worker (los globales se declaran en la
  configuración).

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
