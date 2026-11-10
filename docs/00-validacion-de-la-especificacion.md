# Validación de la especificación — Plataforma Hacienda Ganadera

**Documento:** `docs/00-validacion-de-la-especificacion.md`
**Versión:** 1.0.0
**Fecha:** 2026-11-10
**Entrada analizada:** `PROMPT MAESTRO — DESARROLLO DE PLATAFORMA WEB INTEGRAL…` (§1–§49, 1.521 líneas)
**Salida:** especificación corregida `docs/01-especificacion-corregida.md` (v2.0.0)
**Rol del revisor:** arquitecto de software senior / líder técnico

---

## 1. Propósito y método

Este documento valida la especificación original **antes** de escribir una sola línea de código de
aplicación. El objetivo no es opinar sobre el producto, sino determinar si la especificación es
**implementable sin ambigüedad, verificable y verificablemente correcta**. Un requisito ambiguo se
convierte, en fase de ejecución, en una decisión arbitraria del programador: eso es exactamente lo que
produce retrabajo, deuda técnica y discusiones de aceptación al final del proyecto.

Método aplicado, en cuatro pasadas:

| Pasada | Pregunta | Criterio de hallazgo |
|---|---|---|
| 1. Completitud | ¿Existe todo lo necesario para construir y operar? | Requisito faltante (RF/RNF/US/OP) |
| 2. Consistencia | ¿Dos reglas pueden cumplirse a la vez? | Contradicción |
| 3. Precisión | ¿Dos implementaciones distintas cumplirían el texto? | Ambigüedad |
| 4. Factibilidad | ¿Es alcanzable con la tecnología declarada, en el plazo declarado? | Riesgo técnico |

Cada hallazgo se registra con **ID**, **categoría**, **impacto** (qué se rompe o encarece si no se
corrige) y **recomendación concreta** (la decisión que se tomó en la v2). Prioridad:

- **P0 — Bloqueante:** impide iniciar la Fase 1 o garantiza retrabajo estructural.
- **P1 — Alta:** no bloquea el arranque, pero debe decidirse antes de la fase donde se usa.
- **P2 — Media:** mejora de calidad; se puede resolver durante la fase.

---

## 2. Veredicto

> **La especificación es APTA EN ALCANCE y NO APTA AÚN PARA EJECUCIÓN DIRECTA.**
>
> Es un documento de producto excepcionalmente completo (cobertura funcional, prohibiciones explícitas,
> criterio de terminación), pero le falta la capa **normativa y verificable**: no define contratos entre
> componentes, no fija métricas no funcionales, no resuelve las contradicciones entre "offline",
> "inmutabilidad" y "eliminar", y deja tres piezas críticas (sincronización, báscula y LoRaWAN) descritas
> por intención y no por contrato.

**Resultado:** 26 hallazgos → **9 P0**, **10 P1**, **7 P2**. Los 9 P0 están cerrados en la v2 de la
especificación y en 8 ADR. Ningún requisito explícito del original fue eliminado: la v2 solo **agrega
precisión**, y cada adición es trazable a un hallazgo de este documento (columna `Origen` en la matriz de
trazabilidad de la v2, §18).

**Riesgo dominante del proyecto:** no es la IA ni el hardware. Es la **coherencia entre tres verdades
simultáneas** — el dato de campo (offline), el dato histórico (inmutable) y el dato agregado (inventario,
finanzas) — que hoy la especificación no obliga a reconciliar de forma determinista.

---

## 3. Tabla maestra de hallazgos

### 3.1 Bloqueantes (P0)

| ID | Cat. | Hallazgo | Impacto si no se corrige | Recomendación adoptada (v2) |
|---|---|---|---|---|
| **HAL-01** | Ambigüedad | "Trazabilidad histórica e **inalterable**" (§2, §39) no define el mecanismo. No se distingue entre *no editable en UI*, *no borrable*, *append-only* o *encadenamiento criptográfico*. | Auditoría sin valor probatorio; dos desarrolladores implementan cosas distintas; imposible certificar ante un tercero (ICA, comprador, autoridad sanitaria). | Definir 4 niveles de inmutabilidad (N0–N3), adoptar **N3** en Fase 1: `domain_events` append-only + `audit_log` con `prev_hash` (SHA-256) + triggers que rechazan `UPDATE`/`DELETE` + rol de aplicación sin privilegios de mutación. Corrección de historia solo por **evento compensatorio**. Ver `INV-05`, `INV-06` y ADR-0004. |
| **HAL-02** | Requisito faltante | §31 exige offline con "resolución de conflictos" pero no define **qué** conflicto, **quién** gana, **cómo** se detecta ni **cómo** se audita. Tampoco define IDs, idempotencia, orden causal ni ventana máxima offline. | Duplicación de pesajes, doble conteo de inventario, animales "vendidos y pesados", pérdida silenciosa de registros de campo. Es el fallo más caro del sistema. | **Contrato de sincronización** completo (v2 §10): UUIDv7 generado en cliente, `idempotency_key`, reloj híbrido HLC + `device_seq`, política de conflicto **por entidad**, estados `pending/applied/conflict/rejected`, dead-letter y UI de resolución. ADR-0003. |
| **HAL-03** | Contradicción técnica | §4 pide "Prisma ORM cuando sea compatible" **y** "SQL nativo cuando determinadas operaciones geoespaciales lo requieran", pero §37/§39 exigen particionamiento, índices espaciales, triggers de auditoría y datos inmutables: tres cosas que Prisma **no** modela. | Migraciones divergentes, drift entre esquema Prisma y base real, imposibilidad de auditar cambios. | **Prisma para el modelo de dominio CRUD** + **migraciones SQL versionadas** (fuente de verdad) + SQL crudo tipado para PostGIS y consultas analíticas. Prisma `introspect` sobre la base migrada; nunca `db push` en entornos con datos. ADR-0002. |
| **HAL-04** | Ambigüedad | "El sistema detecta un **peso estable**" (§8). No hay ventana, tolerancia, número mínimo de muestras, ni definición de inestabilidad por movimiento del animal. | Cada implementación inventa un umbral; pesajes erróneos o bloqueo del operario en campo. | Contrato de báscula (§13): `stability = (max−min) ≤ tolerance_kg` sobre ventana `window_ms`, con mínimo `min_samples`, todo **configurable por báscula** con valores por defecto y registro de la muestra cruda. |
| **HAL-05** | Requisito faltante | §9 describe capacidades del Local Bridge pero **no su contrato**: autenticación, transporte, formato de cola, versionado, enrolamiento del dispositivo, comportamiento ante reloj incorrecto. | Bridge es un componente con acceso a la red interna y capacidad de inyectar pesajes: superficie de ataque no especificada. | Contrato del bridge: enrolamiento con código de un solo uso → mTLS (cert. de cliente) → canal WebSocket + REST de respaldo; cola local firmada, idempotente y versionada; bridge **sin exposición a Internet**. ADR-0005. |
| **HAL-06** | Contradicción | §6 exige permiso **Eliminar**; §39 dice "las operaciones críticas no deben eliminarse sin trazabilidad"; §46 "no sobrescribir datos históricos". | Un usuario con "Eliminar" puede destruir trazabilidad, o el permiso queda inerte y el rol es mentira. | **Se elimina el borrado físico de entidades críticas.** "Eliminar" se reespecifica como **Anular** (soft-delete con motivo, autor y evento). Borrado físico solo para datos no críticos (borradores) y solo para `superadmin`, siempre auditado. `INV-07`. |
| **HAL-07** | Requisito faltante | No existen objetivos no funcionales medibles: ni latencia, ni disponibilidad, ni RPO/RTO, ni volumen de mensajes/s, ni tiempo de respuesta de mapa. Solo "más de 2.000 animales" y "5.000 dispositivos". | No se puede dimensionar infraestructura, ni probar carga, ni declarar una fase terminada de forma objetiva. | RNF con cifras verificables (v2 §6): p95 API < 400 ms, mapa < 2 s con 2.000 puntos, ingesta 50 msg/s sostenidos / 200 msg/s pico, RPO ≤ 15 min, RTO ≤ 4 h, disponibilidad 99,5 % local. |
| **HAL-08** | Ambigüedad técnica | §21 admite "ubicación **estimada** por infraestructura de comunicaciones cuando técnicamente sea posible". En LoRaWAN, con **un** gateway no existe trilateración: solo se conoce el gateway receptor, no una coordenada. | Riesgo directo de violar la prohibición central del proyecto ("no inventar posiciones"): un "centroide de gateway" presentado como ubicación estimada es una posición inventada. | Regla de degradación explícita: sin GNSS y sin ≥3 gateways con TDOA/RSSI calibrado, **no se produce coordenada**; se registra `location_type = GATEWAY_COVERAGE` (referencia administrativa, sin lat/lon) o `LAST_KNOWN` con su antigüedad. `INV-03`, `INV-04`. |
| **HAL-09** | Requisito faltante | §18 pide "rentabilidad por animal", "costo/kg", "utilidad", pero no define base contable, criterio de imputación de costos indirectos, ni tratamiento de IVA/retenciones/COP. | Dos informes financieros distintos para el mismo periodo; decisiones de venta sobre números no comparables. | Se define **costeo directo operativo** (no contabilidad formal): imputación por evento con `cost_center` y `allocation_rule`; `utilidad = ingreso − costo directo imputado`; impuestos fuera de alcance (se exporta a contabilidad externa). Documentado como límite explícito del sistema. |

### 3.2 Alta prioridad (P1)

| ID | Cat. | Hallazgo | Impacto | Recomendación adoptada |
|---|---|---|---|---|
| **HAL-10** | Requisito faltante | Offline + JWT: no se especifica qué pasa cuando el token expira sin red, cómo se aplica RBAC sin servidor, ni cómo se revoca un usuario despedido que sigue offline. | Operario bloqueado en campo, o peor: usuario revocado operando. | Access token 15 min + refresh rotativo; **ventana offline de gracia de 12 h** con *permission snapshot* firmado; revocación aplicada en la primera sincronización; bloqueo de operaciones sensibles (anular, cambiar precios) en modo offline. §9.7. |
| **HAL-11** | Requisito faltante | Sin política de tiempo. Dispositivos de campo con reloj incorrecto; registros offline con hora del dispositivo; jornadas que cruzan medianoche. | Ordenamiento incorrecto de eventos, GDP calculado con fechas imposibles, geocercas mal evaluadas. | Se almacenan **tres** marcas: `occurred_at` (dispositivo), `received_at` (servidor), `recorded_at` (usuario). NTP obligatorio en servidores; tolerancia de desfase ±5 min con marca `clock_skew`; zona `America/Bogota` por defecto, almacenamiento en UTC. §10.6. |
| **HAL-12** | Ambigüedad | §7/§13 exigen "número de arete" y "código de barras único" sin regla de numeración, unicidad por finca o global, ni política de reutilización. | Aretes duplicados, trazabilidad rota al reutilizar un arete de un animal vendido. | Esquema configurable por finca (`prefijo + consecutivo + dígito de verificación`), unicidad `(finca_id, arete)` y `codigo_barras` global; **prohibida la reutilización** de identificadores; arete retirado queda con historial. §5.2. |
| **HAL-13** | Requisito faltante | Catálogos maestros (razas, vacunas, enfermedades, medicamentos, categorías, tipos de pasto) se listan como entidades pero no se define su origen, versionado ni curaduría. | Datos inconsistentes entre fincas; imposible comparar indicadores. | Catálogos **sembrados** (seed) con fuente declarada, versionados (`catalog_version`), ampliables por el administrador, nunca borrables si están en uso. §15. |
| **HAL-14** | Requisito faltante | §34 exige adjuntar documentos, pero no define almacenamiento, cifrado, antivirus, URLs firmadas, límites ni retención. | Fuga de documentos (facturas, certificados), almacenamiento sin control de crecimiento, backups incompletos. | Object storage S3-compatible (MinIO local), cifrado en reposo, validación de MIME real + antivirus, URLs prefirmadas de 5 min, cuota configurable, checksum SHA-256 por documento. §13. |
| **HAL-15** | Requisito faltante | No se trata la protección de datos personales (empleados, veterinarios, clientes, proveedores) ni la PII que inevitablemente aparece en la auditoría. | Incumplimiento legal (Colombia: Ley 1581 de 2012; si hay terceros UE: RGPD), y contradicción con inmutabilidad si alguien pide supresión. | Minimización de PII, auditoría con `actor_id` (no nombre), y **crypto-shredding**: la PII va en tabla cifrada con clave por sujeto; borrar la clave equivale a suprimir sin romper la cadena de hashes. §14.6. |
| **HAL-16** | Requisito faltante | §40 exige exportar a Excel y PDF sin plantilla, sin límite de filas ni estrategia para reportes grandes. | Timeouts, servidor bloqueado, reportes de 200.000 filas que tumban el ERP. | Exportación **asíncrona** por cola cuando el resultado estimado > 5.000 filas; plantillas XLSX/PDF versionadas en el repositorio; descarga vía URL firmada; límite duro configurable. §5.9. |
| **HAL-17** | Requisito faltante | §41 pide backups pero no define política, verificación ni ensayo de restauración. | "Tenemos backup" sin haber restaurado nunca = no hay backup. | 3-2-1, `pg_basebackup` + WAL archiving (PITR), copia de documentos y configuración, **verificación automática semanal** y **ensayo de restauración mensual documentado** (runbook). RPO 15 min / RTO 4 h. §13. |
| **HAL-18** | Requisito faltante | No hay observabilidad de plataforma: logs estructurados, métricas, trazas, alertas de infraestructura, SLO. | Fallos detectados por el usuario final; imposible diagnosticar en una hacienda sin acceso remoto. | OpenTelemetry + Prometheus + Grafana + Loki; `/health` y `/ready`; alertas de plataforma separadas de las alertas de negocio. §15. |
| **HAL-19** | Ambigüedad | Existe entidad `Fincas` y roles "Administrador de hacienda", pero no se aclara si el producto es multi-tenant (varias haciendas de varios propietarios) o mono-tenant con varias fincas. | Esquema de base de datos y modelo de permisos distintos; cambiarlo después es una migración de todo el sistema. | **Mono-tenant por instalación** con múltiples fincas del mismo propietario; `tenant_id` se deja como columna preparatoria (nulo) para no cerrar la puerta a multi-tenant sin pagar el costo ahora. ADR-0006. |
| **HAL-20** | Requisito faltante | §45 exige que cada fase quede "funcional, integrada, probada, documentada, ejecutable", sin criterios medibles. | Nadie puede aceptar o rechazar una fase de forma objetiva; el proyecto se declara terminado sin estarlo (§48 lo intenta evitar, pero sin métricas). | **Definition of Done** por fase con criterios binarios y evidencia (comando que lo demuestra). v2 §17.3, tabla DoD. |

### 3.3 Media prioridad (P2)

| ID | Cat. | Hallazgo | Impacto | Recomendación adoptada |
|---|---|---|---|---|
| **HAL-21** | Requisito faltante | No hay estrategia de carga inicial del hato existente (Excel, cuadernos, sistema anterior). | El día 1 la plataforma está vacía y el cliente no la adopta. | Importador CSV/XLSX con validación, previsualización, informe de rechazos y **modo dry-run**; plantilla de carga en `docs/manuals/`. Fase 2. |
| **HAL-22** | Ambigüedad | "Peso: kg" configurable, pero en Colombia se comercia en **arroba** (12,5 kg) y el precio se pacta por kg o por arroba. | Errores de facturación de 25 %. | Unidad canónica kg en base; unidades de presentación configurables (kg, @, lb) con factor versionado y conversión explícita en UI. §5.10. |
| **HAL-23** | Riesgo | Doble registro del mismo pesaje (doble escaneo, dos operarios, reintento de red). | Inventario y GDP inflados. | Regla de deduplicación: mismo `animal_id` + `dispositivo_id` + ventana configurable (por defecto 60 s) ⇒ evento duplicado, no nuevo pesaje. §5.3. |
| **HAL-24** | Ambigüedad | "Concentraciones anormales", "permanencia excesiva", "antirrebote" sin parámetros. | Alertas inútiles o silencio total; el operario desactiva el módulo. | Cada regla de geocerca es **configurable por potrero** (tolerancia m, permanencia mínima, nº de posiciones consecutivas, histéresis, cooldown) con valores por defecto documentados. §5.6. |
| **HAL-25** | Requisito faltante | Perfiles de transmisión definidos conceptualmente, sin versionado ni relación con firmware/OTA. | Cambiar un perfil cambia la batería de 5.000 tags sin control. | `profile_version` inmutable, asignación con vigencia (`valid_from/valid_to`), simulación de impacto en autonomía antes de aplicar. §5.5. |
| **HAL-26** | Requisito faltante | Sin ciclo de vida de identidad de dispositivos: enrolamiento, rotación de claves, DevEUI/AppKey, baja y reemplazo. | Claves filtradas sin rotación; tags dados de baja que siguen transmitiendo. | Ciclo de vida `provisioned → active → suspended → retired`; claves en gestor de secretos (nunca en BD ni en Git); rotación y revocación auditadas; comando de purga de sesiones LoRaWAN. §5.5 y ADR-0007. |

---

## 4. Análisis profundo de los tres riesgos señalados

### 4.1 Operación offline y sincronización de datos

**Lo que dice la especificación:** PWA, consultar sin Internet, registrar eventos, registrar pesajes,
operar báscula local, almacenar pendientes, sincronizar después, implementar IDs únicos, prevención de
duplicados, resolución de conflictos, estado de sincronización, reintentos controlados (§31).

**Lo que falta para que eso sea implementable:**

1. **Autoridad de datos.** No se dice qué copia manda. Sin esto, "resolución de conflictos" es una
   intención. La decisión adoptada: **el servidor es autoritativo para invariantes** (estado del animal,
   unicidad de tag, inventario); **el cliente es autoritativo para observaciones** (peso, síntomas,
   observación de campo), que nunca se "editan": se anulan y se registran de nuevo.
2. **Mecanismo de identidad.** Sin IDs generados en cliente no se puede sincronizar sin colisión. Se
   adopta **UUIDv7** (ordenable por tiempo, sin coordinación) en todas las entidades que el cliente crea
   offline.
3. **Idempotencia.** Todo lote y todo comando llevan `idempotency_key`; el servidor guarda llaves
   procesadas y responde el mismo resultado ante reintento. Sin esto, un timeout de red duplica pesajes.
4. **Orden causal.** Los relojes de tabletas se desfasan. Se adopta **reloj lógico híbrido (HLC)** por
   dispositivo (`physical_ms`, `logical`, `device_id`) que da un orden total consistente sin depender del
   reloj del dispositivo.
5. **Ventana y cota de almacenamiento.** IndexedDB no es infinito y **iOS puede desalojar el
   almacenamiento de una PWA no usada en ~7 días**. La especificación no lo contempla. Mitigación
   adoptada: (a) ventana offline objetivo 12 h, máxima 72 h; (b) el Local Bridge actúa como **almacén
   duradero del puesto de pesaje** (SQLite) y es la fuente de recuperación; (c) la PWA sincroniza de forma
   agresiva y avisa antes de llegar al límite; (d) en iOS no se promete persistencia más allá de la
   ventana: se declara como limitación conocida y verificable.
6. **Qué NO se puede hacer offline.** Vender un animal, anular una venta, cambiar precios, cerrar caja,
   aprobar. Si se permitieran, el conflicto sería económico, no técnico. Se bloquean por política y la UI
   lo muestra explícitamente (sin botones inertes: el botón aparece deshabilitado **con la razón**).
7. **Cierre del ciclo.** Un lote sincronizado puede quedar `applied`, `conflict` o `rejected`. Debe existir
   una **bandeja de resolución** con diff campo a campo y una decisión auditada por un humano autorizado.
   Sin esa bandeja, los conflictos se pierden en un log y el dato queda ambiguo para siempre.

**Conclusión:** el offline no es una feature de la PWA; es un **contrato de sincronización** con estados,
relojes e idempotencia. Ese contrato está en v2 §10 y ADR-0003. Se implementa en Fase 12 *funcionalmente*,
pero se **prepara desde la Fase 1** (IDs UUIDv7, `version`, `updated_at`, outbox), porque introducirlo
después obliga a migrar todas las tablas y todas las APIs.

### 4.2 Integridad de la trazabilidad inalterable

**Lo que dice la especificación:** "Los registros históricos nunca deberán alterarse retroactivamente"
(§2); "no sobrescribir datos históricos" (§46); auditoría con valor anterior y nuevo (§39).

**Lo que falta:** el mecanismo, el alcance y el procedimiento de corrección. Una regla sin mecanismo se
cumple por disciplina del programador, y la disciplina no es un control.

Decisiones adoptadas:

| Nivel | Nombre | Qué garantiza | Costo | Adoptado |
|---|---|---|---|---|
| N0 | Disciplina | Nada verificable | 0 | No |
| N1 | Soft-delete | No se borra desde la UI | Bajo | Insuficiente solo |
| N2 | Append-only en BD | Triggers rechazan `UPDATE`/`DELETE` | Bajo | Sí (Fase 1) |
| N3 | Append-only + cadena de hashes | Detecta alteración incluso por DBA | Medio | **Sí (Fase 1)** |
| N4 | Anclaje externo / WORM | Prueba ante tercero independiente | Alto | Opcional (Fase 12) |

Implementación mínima de N3:

```text
audit_log(
  id, occurred_at, actor_id, action, entity, entity_id,
  before_hash, after_hash, payload, prev_hash, hash
)
hash = SHA256(canonical_json(payload) || prev_hash || occurred_at || actor_id)
```

Se verifica con un job nocturno (`audit:verify`) y con un endpoint que recalcula la cadena de un rango.
Una ruptura se trata como **incidente de seguridad**, no como bug.

**Corrección de historia sin destruirla:** todo error se corrige con un **evento compensatorio**
(`ANULACION` + `CORRECCION` con referencia al evento original). El historial muestra ambas cosas: lo que
se creyó y lo que se corrigió, con autor y motivo. Esto es lo que exige una trazabilidad ganadera real
(la pregunta no es "cuál es el peso" sino "quién lo cambió y por qué").

**Conflicto con datos personales (HAL-15):** la inmutabilidad choca con el derecho de supresión. Se
resuelve con **crypto-shredding**: la PII vive cifrada con una clave por sujeto; borrar la clave destruye
el dato sin romper la cadena de hashes (los hashes son de contenido no personal).

### 4.3 Gestión de conflictos en la sincronización

Un conflicto no es un error de red: es **dos verdades de negocio simultáneas**. La matriz adoptada
(política por entidad, no global) es la siguiente:

| Entidad / operación | Política | Regla concreta | Estado resultante si choca |
|---|---|---|---|
| Estado del animal (activo, vendido, muerto…) | **Servidor autoritativo** (máquina de estados) | Transiciones válidas definidas; `vendido` es terminal para pesajes nuevos | `rejected` con motivo legible |
| Pesaje | **Append-only + dedupe** | Nunca se resuelve: se conserva; duplicado por ventana se descarta | `applied` (con `duplicate_of`) |
| Datos descriptivos (color, observaciones, foto) | **LWW por campo** con HLC | Gana el mayor HLC; se guarda el valor perdedor en el evento | `applied` + `conflict_record` informativo |
| Asignación de tag | **Servidor autoritativo** (unicidad global) | Un tag no puede estar en dos animales activos | `rejected` |
| Movimiento de potrero | **Servidor autoritativo por intervalo** | Dos movimientos con intervalos solapados ⇒ conflicto para resolución humana | `conflict` |
| Evento clínico (vacuna, tratamiento) | **Append-only** | Se registran ambos; la UI muestra duplicados potenciales | `applied` + marca |
| Inventario / venta | **Prohibido offline** | No se permite la operación sin red | N/A |
| Documento (foto, PDF) | **Append-only por checksum** | Mismo checksum = mismo documento | `applied` |

Reglas transversales:

- **Nunca se pierde un dato de campo.** Un registro `rejected` se conserva íntegro y visible en la bandeja,
  porque puede ser la única evidencia de un pesaje real.
- **Toda decisión de conflicto queda auditada** (quién, cuándo, por qué).
- **Un conflicto no puede quedar abierto indefinidamente:** alerta a las 24 h, escalamiento a las 72 h.
- **Los invariantes se validan en el servidor siempre**, incluso si el cliente ya los validó (defensa en
  profundidad: el cliente offline puede haber quedado desactualizado).

---

## 5. Supuestos no declarados (los que hoy están implícitos en el texto)

| ID | Supuesto implícito | ¿Es seguro? | Acción en v2 |
|---|---|---|---|
| SUP-01 | Una sola instalación por hacienda (mono-tenant) | Probable, no declarado | Declarado explícitamente (HAL-19) |
| SUP-02 | Un solo idioma: español (Colombia) | Sí, razonable | Declarado; i18n no requerido |
| SUP-03 | Una sola moneda activa por instalación (COP) | Sí | Declarado; multimoneda fuera de alcance |
| SUP-04 | Internet intermitente pero existente (no aislamiento total) | **No seguro** | Declarado: se asume enlace ≥ 1 vez/72 h; sin él, solo operación local del bridge |
| SUP-05 | Servidor local en la hacienda con energía estable | **No seguro** | Requisito de UPS declarado (docs/05) |
| SUP-06 | Los operarios tienen smartphone/tableta propia o de la hacienda | No declarado | Requisito de hardware declarado |
| SUP-07 | Los tags se compran con DevEUI/AppKey provistos por el fabricante | Sí | Declarado en ciclo de vida de dispositivos |
| SUP-08 | Existe una persona responsable de TI en la hacienda | **No seguro** | Se declara perfil mínimo y manual de administración |
| SUP-09 | Los datos históricos previos existen en papel/Excel y deben migrarse | Probable | Importador en Fase 2 (HAL-21) |
| SUP-10 | Ninguna integración fiscal/DIAN es requerida | Probable | Declarado fuera de alcance (HAL-09) |

---

## 6. Requisitos faltantes (además de los P0/P1/P2 ya listados)

| Área | Falta | Se incorpora en |
|---|---|---|
| Operación | Procedimiento de alta de una finca nueva (onboarding) | v2 §16, runbook |
| Operación | Gestión de usuarios dados de baja y traspaso de responsabilidades | v2 §14.5 |
| Datos | Política de retención (qué se guarda 5, 10, 20 años) y purga | v2 §14.5 |
| Datos | Estrategia de migración entre versiones mayores | v2 §13 |
| Seguridad | Modelo de amenazas (STRIDE) y superficie de ataque del bridge | `docs/05` |
| Seguridad | Procedimiento de respuesta a incidentes | `docs/runbooks/` |
| IoT | Cálculo de capacidad LoRaWAN (airtime, duty cycle, ADR) | v2 §11.9 |
| IoT | Contrato de decodificación de payload (codec versionado) | v2 §11.5 |
| Hardware | Kit de conformidad para nuevos adaptadores de báscula | v2 §11.2, `packages/scale-protocols` |
| Pruebas | Pruebas de hardware real y su sustitución por simulador certificado | `docs/04` |
| Legal | Términos de la licencia del repositorio | `LICENSE` |

---

## 7. Ambigüedades que bloquean una implementación determinista

Además de HAL-01/02/04/08/09, se detectaron:

| ID | Frase ambigua | Interpretación adoptada |
|---|---|---|
| AMB-01 | "Alta disponibilidad local" | No es clúster: es **reinicio automático + PITR + UPS** con RTO 4 h. Se declara para no prometer 99,99 %. |
| AMB-02 | "Procesamiento asíncrono/colas cuando sea necesario" | Cola desde el día 1 para ingesta IoT y exportaciones; no "cuando sea necesario". |
| AMB-03 | "Componentes UI modernos" | Tailwind + shadcn/ui (Radix) — decisión cerrada en ADR-0008. |
| AMB-04 | "Ubicación administrativa" vs "última ubicación geográfica disponible" | Son dos campos distintos con origen distinto y **nunca** se mezclan en la UI. |
| AMB-05 | "Condición corporal" | Escala 1–5 (estándar ganadero) con parámetro configurable; se documenta el supuesto. |
| AMB-06 | "Estado productivo" | Catálogo configurable (levante, ceba, cría, doble propósito, descarte). |
| AMB-07 | "Categoría" del animal | Derivada de sexo + edad + estado reproductivo, **calculada**, no editable a mano (evita contradicciones). |
| AMB-08 | "Dashboard en tiempo real" | Refresco por WebSocket con intervalo mínimo de 5 s y *fallback* a polling de 30 s. |

---

## 8. Riesgos técnicos (registro resumido)

El registro completo con probabilidad, impacto, mitigación y responsable está en
[`docs/05-requisitos-hardware-y-riesgos.md`](05-requisitos-hardware-y-riesgos.md).

| ID | Riesgo | Sev. | Nota |
|---|---|---|---|
| R-01 | Duplicidad o pérdida de datos offline | Crítica | Cerrado por contrato §10 |
| R-02 | Deriva entre ORM y base real | Alta | Cerrado por ADR-0002 |
| R-03 | Desalojo de almacenamiento en iOS en PWA | Alta | Declarado como limitación; mitigado por bridge |
| R-04 | Báscula real con protocolo desconocido | Alta | Adaptador + simulador + kit de conformidad |
| R-05 | Cobertura LoRaWAN insuficiente | Alta | Estudio de RF obligatorio antes de comprar gateways |
| R-06 | Tags sin GNSS usados como si tuvieran GPS | Crítica | INV-03/INV-04 + validación en BD |
| R-07 | Crecimiento de la tabla de posiciones | Media | Particionamiento mensual + retención |
| R-08 | Fuga de claves LoRaWAN | Crítica | Secret manager + rotación (ADR-0007) |
| R-09 | Restauración nunca probada | Alta | Ensayo mensual obligatorio |
| R-10 | Complejidad de 12 fases en un solo equipo | Media | Entregas incrementales con DoD medible |
| R-11 | Dependencia de un único proveedor de hardware | Media | Interfaz de adaptadores + 2 marcas objetivo |
| R-12 | Reloj incorrecto en dispositivos | Media | HLC + marcas de tiempo triples |

---

## 9. Trazabilidad de la corrección

Cada hallazgo P0/P1 tiene su requisito normativo en la v2 de la especificación y, cuando implica una
decisión arquitectónica, su ADR:

| Hallazgo | Requisito v2 | ADR |
|---|---|---|
| HAL-01 | `INV-05`, `INV-06`, §10 | ADR-0004 |
| HAL-02 | §10 completo | ADR-0003 |
| HAL-03 | §9.2 | ADR-0002 |
| HAL-04 | §11.2 | ADR-0005 |
| HAL-05 | §11.3 | ADR-0005 |
| HAL-06 | `INV-07` | — |
| HAL-07 | §6 (RNF) | — |
| HAL-08 | `INV-03`, `INV-04`, §11.6 | ADR-0007 |
| HAL-09 | §5.8 | — |
| HAL-10 | §9.7 | ADR-0003 |
| HAL-15 | §14.6 | ADR-0004 |
| HAL-19 | §1.2 | ADR-0006 |

---

## 10. Condiciones para iniciar la Fase 1

La Fase 1 puede comenzar cuando se cumpla lo siguiente (detalle y formato de respuesta en
`docs/07-cierre-y-confirmaciones.md`):

1. **Aprobación de la especificación v2** o registro de las objeciones en un ADR.
2. **Confirmación de la marca/modelo de báscula** (o decisión explícita de arrancar solo con simulador).
3. **Confirmación del servidor local** (hardware, UPS, sistema operativo, direccionamiento).
4. **Decisión sobre multi-finca** (se asume mono-tenant con N fincas).
5. **Nombre legal del titular y tipo de licencia** (por defecto: propietaria, ver `LICENSE`).
6. **Designación de la persona responsable de TI** de la hacienda.
7. **Nivel de inmutabilidad exigido por el negocio** (por defecto N3).

Ninguna de estas condiciones requiere hardware para trabajar: la Fase 1 (arquitectura, Docker,
PostgreSQL/PostGIS, backend, seguridad y autenticación) se ejecuta con simuladores y puede empezar en
paralelo a las confirmaciones 2, 3 y 6.

---

## Anexo A — Lo que la especificación original hace bien (y no debe perderse)

Se conserva íntegro y se refuerza en la v2:

1. **Las prohibiciones.** No inventar posiciones, no asumir GPS en LoRaWAN, no asumir protocolos de
   báscula, no presentar datos simulados como reales. Son la parte más valiosa del documento: convierten
   un riesgo de credibilidad del producto en una regla ejecutable.
2. **La distinción de ubicaciones** (GPS / estimada / última conocida). Es un requisito poco común y
   técnicamente correcto; se convierte en `INV-03`/`INV-04` con restricciones en base de datos.
3. **El criterio de terminación** (§48), que impide declarar éxito por tener pantallas.
4. **La separación por fases** con entregables verificables por fase.
5. **La exigencia de adaptadores** para hardware desconocido: es la decisión que evita que el ERP se
   acople a un modelo de báscula.
