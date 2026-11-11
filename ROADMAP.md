# Roadmap

**Versión:** 1.0.0 · **Fecha:** 2026-11-10
Plan de 12 fases según v1 §45. Cada fase se acepta con la Definition of Done de
[`docs/01` §17.3](docs/01-especificacion-corregida.md), no con "ya funciona en mi máquina".

---

## Principios del plan

1. **Nada se recorta para simplificar.** Si el tiempo no alcanza, se reordena; no se elimina.
2. **Cada fase deja el sistema desplegable.** Si una fase rompe el `docker compose up`, no terminó.
3. **Lo que depende de hardware no bloquea.** Se entrega con simulador y estado `simulated`.
4. **La infraestructura de sincronización se prepara desde F1**, aunque el offline funcional sea F12.

---

## F0 · Especificación y arquitectura ✅

| Entregable | Estado |
|---|---|
| Validación de la especificación (26 hallazgos) | ✅ `docs/00` |
| Especificación corregida v2 | ✅ `docs/01` |
| Arquitectura C4, flujos y despliegue | ✅ `docs/02` |
| Modelo de datos con PostGIS | ✅ `docs/03` |
| Estrategia de pruebas | ✅ `docs/04` |
| Hardware y riesgos | ✅ `docs/05` |
| Repositorio, CI, plantillas y convenciones | ✅ `docs/06`, `.github/` |
| 10 ADR | ✅ `docs/adr/` |
| Confirmaciones previas a F1 | ✅ `docs/07` |

**Criterio de aceptación:** los 9 hallazgos bloqueantes tienen decisión y mecanismo de cumplimiento; el CI
valida estructura, enlaces y ausencia de secretos.

---

## F1 · Plataforma base, Docker, seguridad y autenticación ✅

| # | Entregable |
|---|---|
| 1 | Monorepo pnpm + TypeScript estricto + lint + pruebas base |
| 2 | `docker-compose.yml` con PostgreSQL 16 + PostGIS, Redis, MinIO, proxy; healthchecks |
| 3 | Migraciones `0001` (extensiones, roles de BD, esquema base) y `0002` (usuarios, roles, permisos, sesiones) |
| 4 | Auditoría encadenada + triggers + job de verificación |
| 5 | Autenticación: login, refresh rotativo, MFA TOTP, bloqueo por intentos |
| 6 | RBAC con alcance (`global/finca/lote/propio`) y guard de autorización |
| 7 | Manejo global de errores, códigos estables, OpenAPI, observabilidad mínima |
| 8 | Pruebas: matriz de autorización, inmutabilidad, cadena de auditoría |
| 9 | `make verify` verde y release `v0.1.0` |

**Estado: entregada.** Evidencia: migraciones aplicadas desde cero, 22 pruebas de integración contra
PostgreSQL real (incluye detección de manipulación de la auditoría y privilegios del rol `app_rw`), web
operativa con ingreso real y OpenAPI con 19 rutas exportado en `docs/api/openapi.json`.

---

## F2 · Animales, identificación, usuarios e inventario

Ficha única, identificación y numeración, genealogía con validaciones, estados y transiciones, inventario y
categorías derivadas, permisos por rol aplicados a cada módulo, importador de hato existente (`RF-IMP-01`…`06`).

**Criterio:** un animal no puede quedar en estado inconsistente ni con genealogía imposible, y el inventario
cuadra tras 50 operaciones mezcladas.

---

## F3 · Báscula, códigos de barras y Local Bridge

Contrato de adaptador, transporte serie/TCP, detección de estabilidad, enrolamiento mTLS, cola durable,
diagnóstico, lector HID, pantalla de pesaje con 2 toques.
Simulador de báscula obligatorio; estado `simulated` hasta tener hardware.

**Criterio:** pesaje completo sin red, sin pérdida, con trama cruda auditada.

---

## F4 · Pesajes, crecimiento y reportes

Curva de crecimiento, GDP, comparaciones, alertas de variación, deduplicación, reportes de pesaje exportables.

**Criterio:** un pesaje duplicado por doble escaneo produce un solo registro con `duplicate_of`.

---

## F5 · Veterinaria y salud

Historia clínica, vacunación con próxima dosis, tratamientos con periodo de retiro, exámenes, cuarentena,
alertas sanitarias.

**Criterio:** la venta de un animal con retiro activo se bloquea con motivo visible.

---

## F6 · Reproducción, nacimientos y genética

Montas e inseminaciones, diagnóstico de preñez, partos con creación automática de cría, árbol genealógico,
indicadores reproductivos.

**Criterio:** parto crea cría, actualiza madre y no permite genealogía cíclica.

---

## F7 · Alimentación, potreros y movimientos

Insumos, planes nutricionales, consumos y costos, potreros con geometría, movimientos sin solape, alertas de
sobrecarga.

**Criterio:** dos movimientos solapados del mismo animal son rechazados por la base.

---

## F8 · Compras, ventas y finanzas

Compras y ventas con trazabilidad de salida, costeo directo operativo, imputación explícita, utilidad y
costo/kg con fórmula visible, cierre de periodo.

**Criterio:** la utilidad de un animal se puede reconstruir desde sus eventos, paso a paso.

---

## F9 · LoRaWAN, tags y gateways

Ingesta por MQTT/webhook, deduplicación, codecs versionados, ciclo de vida de dispositivos, perfiles de
transmisión con simulación de autonomía, gestión de gateways y panel de salud de red.

**Criterio:** 5.000 tags simulados sin pérdida de mensajes y sin duplicados.

---

## F10 · GPS/GNSS, mapas, PostGIS y geocercas

Posiciones con tipo y precisión, mapa con clustering, dibujo de polígonos, geocercas con histéresis,
diferenciación visual de tipos de ubicación, historial y mapas de calor.

**Criterio:** un tag sin GNSS **no** produce un punto en el mapa (`E2E-12`).

---

## F11 · Dashboard, notificaciones, reportes y analítica

Paneles de hato e IoT, alertas con prioridad y escalamiento, exportaciones asíncronas, reportes con filtros y
plantillas.

**Criterio:** exportación de 50.000 filas termina en segundo plano y notifica al usuario.

---

## F12 · Offline/PWA, sincronización, hardening, carga y despliegue

Outbox y bandeja de conflictos, ventana offline, snapshot de permisos, PWA instalable, hardening (ZAP,
dependencias, secretos), pruebas de carga, manuales completos, despliegue y respaldo verificado.

**Criterio:** SYNC-01…12 en verde y una restauración completa ejecutada y documentada.

---

## Después de F12

- `1.0.0` cuando se cumpla el criterio de terminación de v1 §48.
- Opcionales evaluados con ADR: anclaje externo de auditoría (N4), notificaciones por WhatsApp, multi-tenant,
  aplicación móvil nativa, analítica predictiva.
