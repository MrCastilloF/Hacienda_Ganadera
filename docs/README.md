# Documentación — índice

Este directorio contiene la **especificación, la arquitectura y los procedimientos** de la plataforma. Es la
fuente de verdad del proyecto: si el código y este directorio no coinciden, uno de los dos está mal y hay que
corregirlo antes de seguir.

## Ruta de lectura recomendada

1. [`00-validacion-de-la-especificacion.md`](00-validacion-de-la-especificacion.md) — qué le falta a la
   especificación original y por qué se cambió.
2. [`01-especificacion-corregida.md`](01-especificacion-corregida.md) — el contrato: invariantes, requisitos
   funcionales y no funcionales.
3. [`02-arquitectura.md`](02-arquitectura.md) — cómo se construye: componentes, flujos, despliegue.
4. [`03-modelo-de-datos.md`](03-modelo-de-datos.md) — el modelo relacional y las reglas que la base garantiza.
5. [`04-estrategia-de-pruebas.md`](04-estrategia-de-pruebas.md) — cómo se demuestra que funciona.
6. [`05-requisitos-hardware-y-riesgos.md`](05-requisitos-hardware-y-riesgos.md) — qué hardware se necesita y
   qué puede salir mal.
7. [`06-estructura-y-convenciones.md`](06-estructura-y-convenciones.md) — cómo se trabaja en este repositorio.
8. [`07-cierre-y-confirmaciones.md`](07-cierre-y-confirmaciones.md) — qué falta confirmar para la Fase 1.

## Documentos

| Documento | Contenido | Audiencia |
|---|---|---|
| `00-validacion-de-la-especificacion.md` | 26 hallazgos, 9 bloqueantes, con impacto y recomendación | Arquitectura, cliente |
| `01-especificacion-corregida.md` | Invariantes, RF, RNF, offline, seguridad, fases y DoD | Todos |
| `02-arquitectura.md` | C4, flujos, frontend, backend, PostGIS, bridge, IoT, seguridad | Desarrollo, DevOps |
| `03-modelo-de-datos.md` | 68 tablas, DDL de referencia, índices, particiones, integridad | Backend, DBA |
| `04-estrategia-de-pruebas.md` | Pirámide, matriz, HIL, simuladores, carga, seguridad | QA, desarrollo |
| `05-requisitos-hardware-y-riesgos.md` | Servidor, básculas, gateways, 30 riesgos | Operación, cliente |
| `06-estructura-y-convenciones.md` | Árbol, ramas, commits, CI, releases, labels | Desarrollo |
| `07-cierre-y-confirmaciones.md` | Estado, decisiones y confirmaciones C-01…C-10 | Cliente, dirección |

## Subdirectorios

| Directorio | Contenido |
|---|---|
| [`adr/`](adr/README.md) | Decisiones arquitectónicas (10) y plantilla |
| [`diagrams/`](diagrams/) | Fuentes Mermaid versionadas (`.mmd`) |
| `manuals/` | Manuales de instalación, administración, usuario, básculas y LoRaWAN (Fases 1–12) |
| `runbooks/` | Operación: respaldo, restauración, actualización, incidentes |
| `api/` | `openapi.json` generado (Fase 1) |
| `tests/load/` | Resultados de pruebas de carga con fecha y hardware |

## Reglas de mantenimiento

1. Todo cambio de comportamiento actualiza el documento que lo describe **en el mismo PR**.
2. Todo cambio estructural agrega un ADR; nunca se edita uno aceptado.
3. Los diagramas viven en `docs/diagrams/*.mmd` y se referencian desde el documento (no se dibujan en línea
   sin fuente versionada).
4. Los documentos se numeran; no se renumeran. Un documento nuevo toma el siguiente número libre.
5. `scripts/ci/check-docs.mjs` verifica enlaces relativos, encabezado único y secciones mínimas de los ADR.
