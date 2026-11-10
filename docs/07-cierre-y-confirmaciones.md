# Cierre de la Fase 0 y confirmaciones previas a la Fase 1

**Documento:** `docs/07-cierre-y-confirmaciones.md`
**Versión:** 1.0.0
**Fecha:** 2026-11-10
**Requisitos:** v1 §49; `docs/01-especificacion-corregida.md` §19

---

## 1. Estado de los entregables

| # | Entregable | Documento | Estado |
|---|---|---|---|
| 1 | Validación de la especificación | [`00-validacion-de-la-especificacion.md`](00-validacion-de-la-especificacion.md) | ✅ Completo (26 hallazgos, 9 P0) |
| 2 | Especificación corregida y ampliada (v2) | [`01-especificacion-corregida.md`](01-especificacion-corregida.md) | ✅ Completo |
| 3 | Estructura del repositorio, CI, plantillas y convenciones | [`06-estructura-y-convenciones.md`](06-estructura-y-convenciones.md) | ✅ Completo |
| 4 | Arquitectura, diagramas, modelo de datos, dependencias, pruebas y hardware | `02`…`05` | ✅ Completo |
| 5 | Cierre y confirmaciones | este documento | ✅ Completo |
| — | ADR de las decisiones estructurales | [`adr/`](adr/) | ✅ 10 ADR |

**Ningún código de aplicación fue escrito en esta etapa**, según lo pedido en v1 §49 y en la instrucción de
la tarea.

---

## 2. Lo que ya está decidido (y no requiere confirmación para avanzar)

| Decisión | Valor | ADR |
|---|---|---|
| Forma de persistencia | Migraciones SQL como fuente de verdad + Prisma para dominio | ADR-0002 |
| Sincronización offline | UUIDv7 + HLC + outbox + política por entidad | ADR-0003 |
| Inmutabilidad | N3 (append-only + cadena de hashes + roles de BD) | ADR-0004 |
| Local Bridge | mTLS, enrolamiento, adaptadores versionados, cola firmada | ADR-0005 |
| Tenancy | Mono-tenant con N fincas, `tenant_id` reservado | ADR-0006 |
| Secretos y dispositivos IoT | Gestor de secretos + ciclo de vida de claves | ADR-0007 |
| UI | Tailwind + shadcn/ui (Radix) | ADR-0008 |
| Estilo de despliegue | Monolito modular + workers | ADR-0010 |
| Unidad y moneda | kg canónico, COP por defecto, arroba como presentación | v2 §5.10 |
| Alcance financiero | Costeo directo operativo, no contabilidad formal | v2 §5.8 |

---

## 3. Confirmaciones necesarias antes de la Fase 1

Responder en el mismo formato. Cada punto tiene un valor por defecto que se aplica si no hay respuesta; el
valor por defecto está elegido para **no bloquear** el arranque.

### C-01 — Aprobación de la especificación v2

- **Pregunta:** ¿se aprueba la especificación v2 como base contractual, o hay objeciones?
- **Formato:** `APROBADA` / `APROBADA CON CAMBIOS: <lista>` / `RECHAZADA: <motivo>`
- **Por defecto:** se asume aprobada para iniciar F1; las objeciones se registran como ADR y no bloquean la
  arquitectura base.

### C-02 — Báscula

- **Pregunta:** ¿marca, modelo y protocolo? ¿Existe el manual de tramas?
- **Formato:** `MARCA / MODELO / PROTOCOLO / ¿MANUAL? (sí/no)`
- **Por defecto:** adaptador ASCII genérico + simulador; la báscula queda `declared` hasta tener tramas
  reales. F3 puede completarse con simulador (`INV-09`).

### C-03 — Servidor local

- **Pregunta:** ¿hardware disponible, sistema operativo, UPS, capacidad de disco? ¿Servidor propio o VPS
  híbrido?
- **Formato:** `CPU / RAM / DISCO / SO / UPS (sí/no) / ¿virtualizado?`
- **Por defecto:** Linux, 8 vCPU, 16 GB, SSD 512 GB, UPS 1500 VA, sin virtualización.

### C-04 — Multi-finca

- **Pregunta:** ¿una sola hacienda o varias fincas del mismo propietario? ¿Se prevé multi-propietario?
- **Formato:** `1 finca` / `N fincas` / `multi-propietario`
- **Por defecto:** mono-tenant con N fincas (ADR-0006).

### C-05 — Licencia y titular

- **Pregunta:** ¿razón social del titular y tipo de licencia (propietaria, MIT, AGPL)?
- **Formato:** `TITULAR / LICENCIA`
- **Por defecto:** propietaria, todos los derechos reservados (`LICENSE`).

### C-06 — Responsable de TI de la hacienda

- **Pregunta:** ¿quién opera el sistema en sitio (nombre y rol)? ¿Quién recibe las alertas de plataforma?
- **Formato:** `NOMBRE / ROL / CONTACTO`
- **Por defecto:** el administrador de hacienda asume las tareas, con runbooks y soporte remoto.

### C-07 — Nivel de inmutabilidad

- **Pregunta:** ¿N3 (append-only + hash) es suficiente, o se exige anclaje externo/WORM desde el inicio?
- **Formato:** `N3` / `N4`
- **Por defecto:** N3 (ADR-0004).

### C-08 — Dispositivos IoT previstos

- **Pregunta:** ¿modelos de tag y gateway? ¿Con GNSS? ¿Existe estudio de cobertura?
- **Formato:** `TAG / GATEWAY / ¿GNSS? / ¿ESTUDIO?`
- **Por defecto:** tags sin GNSS, topología declarada, sin promesa de cobertura; posiciones solo
  administrativas hasta tener GNSS real.

### C-09 — Datos históricos

- **Pregunta:** ¿se migran animales, pesajes y vacunas existentes? ¿En qué formato?
- **Formato:** `SÍ/NO / formato / volumen aproximado`
- **Por defecto:** sí, CSV/XLSX con el importador de F2.

### C-10 — Usuarios y permisos iniciales

- **Pregunta:** lista de personas y rol asignado (o al menos cuántos por rol).
- **Formato:** tabla `nombre | rol | finca`
- **Por defecto:** un `superadmin`, un `administrador de hacienda`, un `veterinario`, un `mayordomo`, dos
  `operarios`, un `responsable de báscula`, un `contador`, un `consulta`.

---

## 4. Qué se puede iniciar sin ninguna confirmación

La Fase 1 (arquitectura, repositorio, Docker, PostgreSQL/PostGIS, backend, seguridad y autenticación) no
depende de hardware, ni de datos históricos, ni de decisiones de negocio. Puede comenzar de inmediato con los
valores por defecto.

**Orden de trabajo sugerido de la Fase 1:**

1. Monorepo pnpm + TypeScript estricto + lint/test base.
2. `docker-compose.yml` con PostgreSQL 16 + PostGIS, Redis y MinIO; healthchecks.
3. Migraciones `0001` (extensiones, roles de BD, esquema) y `0002` (usuarios, roles, permisos, sesiones).
4. Auditoría encadenada + triggers + verificación (con prueba que la demuestra).
5. Autenticación (login, refresh rotativo, MFA TOTP), guards de RBAC y alcance.
6. Endpoints base + OpenAPI + manejo global de errores + observabilidad mínima.
7. Pruebas de autorización por matriz y prueba de integridad de auditoría.
8. `make verify` verde + primer release `v0.1.0`.

---

## 5. Riesgos que quedan abiertos al cerrar la Fase 0

| Riesgo | Estado tras Fase 0 | Se resuelve en |
|---|---|---|
| R-04 báscula desconocida | Mitigado por diseño (adaptador + simulador) | F3 + confirmación C-02 |
| R-05 cobertura LoRaWAN | Declarado, sin promesa | Estudio de RF antes de F9 |
| R-09 restauración no probada | Procedimiento definido | F1 (primer ensayo) y luego mensual |
| R-13 adopción por operarios | Riesgo de producto, no técnico | F3/F4 con pruebas de campo |
| R-29 licencia | Pendiente de confirmación | C-05 |

---

## 6. Declaración final de la etapa

> La arquitectura propuesta es **implementable**, el modelo de datos **soporta los invariantes** exigidos
> (inmutabilidad, exclusividad de tags, diferenciación de ubicaciones) y la estrategia de pruebas **puede
> demostrar** cada requisito con evidencia reproducible.
>
> Lo que **no** puede afirmarse en este punto, y no se afirmará: que exista una integración física validada
> con básculas, tags o gateways reales. No hay hardware disponible en esta etapa; por eso el diseño incluye
> simuladores con datos marcados y un estado de integración explícito por dispositivo.
>
> La Fase 1 puede comenzar cuando se apruebe este paquete (C-01). Las confirmaciones C-02 a C-10 no bloquean
> el inicio y tienen valor por defecto declarado.
