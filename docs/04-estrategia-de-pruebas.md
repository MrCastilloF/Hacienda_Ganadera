# Estrategia de pruebas

**Documento:** `docs/04-estrategia-de-pruebas.md`
**Versión:** 1.0.0
**Fecha:** 2026-11-10
**Requisitos:** v1 §42; `docs/01-especificacion-corregida.md` §17.3
**Herramientas:** Vitest (unitarias/integración), Playwright (E2E), k6 (carga), Testcontainers (base real)

---

## 1. Principios

| # | Principio |
|---|---|
| P1 | **Se prueba el comportamiento, no la implementación.** Un test que se rompe al renombrar una variable no aporta. |
| P2 | **La base es real.** Las pruebas de integración usan PostgreSQL + PostGIS en contenedor, nunca un mock del ORM. |
| P3 | **Lo crítico va primero.** Pesaje, sincronización, auditoría y permisos tienen cobertura obligatoria alta. |
| P4 | **Los simuladores se declaran.** Todo dato simulado lleva `origen = SIMULATOR` y la UI lo muestra (`INV-08`). |
| P5 | **Una prueba que no puede fallar no se escribe.** Si no se puede imaginar el fallo, no hay test. |
| P6 | **El hardware ausente no bloquea la fase.** Se sustituye por un simulador de protocolo y se declara el estado (`INV-09`). |

---

## 2. Pirámide y proporciones objetivo

```text
        ┌──────────────────┐
        │  E2E (Playwright) │   ~15 escenarios críticos
        ├──────────────────┤
        │ Integración (API, │   ~120 pruebas (BD real, colas, mTLS)
        │ BD, colas, mTLS)  │
        ├──────────────────┤
        │ Unitarias (dominio,│  cientos: invariantes, cálculos,
        │ adaptadores, sync) │  parsers de trama, HLC
        └──────────────────┘
```

| Nivel | Herramienta | Alcance | Meta |
|---|---|---|---|
| Unitaria | Vitest | Dominio puro, adaptadores, utilidades | ≥ 85 % en `domain/` |
| Integración | Vitest + Testcontainers | Casos de uso, repositorios, SQL, colas | ≥ 75 % en módulos críticos |
| Contrato | Vitest + OpenAPI | DTOs, códigos de error, esquemas | 100 % de endpoints cubiertos |
| E2E | Playwright | Flujos de usuario completos | 15 flujos críticos |
| Carga | k6 | API, ingesta, mapas | RNF-REN-01…05 |
| Seguridad | ZAP + pruebas propias | Autorización, IDOR, inyección, rate limit | Sin hallazgos altos |

Puertas de cobertura (`RNF-MAN-01`): dominio y servicios críticos ≥ 80 %, global backend ≥ 60 %, frontend
≥ 50 % en lógica de negocio (no en componentes visuales).

---

## 3. Matriz de pruebas por módulo

| Módulo | Unitaria | Integración | E2E | Hardware | Notas |
|---|---|---|---|---|---|
| Autenticación / RBAC | ✔ | ✔ | ✔ | — | Incluye expiración, refresh rotativo, revocación, alcance |
| Animales / identificación | ✔ | ✔ | ✔ | — | Unicidad, estados, genealogía |
| Pesajes | ✔ | ✔ | ✔ | Simulador de báscula | Dedupe, estabilidad, inmutabilidad |
| Local Bridge | ✔ | ✔ | — | Simulador de puerto serie | Reconexión, cola, mTLS |
| Salud | ✔ | ✔ | ✔ | — | Periodo de retiro, alertas |
| Reproducción | ✔ | ✔ | ✔ | — | Validaciones genealógicas, fechas |
| Potreros / movimientos | ✔ | ✔ | ✔ | — | Solapes, sobrecarga |
| Inventario / compras / ventas | ✔ | ✔ | ✔ | — | Trazabilidad de salida |
| Finanzas | ✔ | ✔ | — | — | Imputación y utilidad |
| IoT ingest | ✔ | ✔ | — | Simulador LoRaWAN | Dedupe, codecs, undecoded |
| Geocercas | ✔ | ✔ | ✔ | Simulador | Antifalsas alarmas |
| Mapas | — | ✔ | ✔ | — | Rendimiento con 2.000 puntos |
| Auditoría | ✔ | ✔ | — | — | Cadena, verificación, ruptura detectada |
| Sincronización offline | ✔ | ✔ | ✔ | — | Conflictos, idempotencia, HLC |
| Reportes / exportación | ✔ | ✔ | ✔ | — | Asíncrono, plantillas |
| Respaldos | — | ✔ | — | — | Restauración real en CI programado |

---

## 4. Pruebas del dominio (las que más valor tienen)

### 4.1 Cálculos ganaderos

| Caso | Entrada | Esperado |
|---|---|---|
| GDP simple | 200 kg → 260 kg en 60 días | 1,00 kg/día |
| GDP con mismo día | dos pesajes el mismo día | no divide por cero; usa días ≥ 1 o marca inválido |
| Pérdida de peso | 300 → 280 kg | −20 kg, GDP negativa, alerta si supera umbral |
| Edad al pesaje | nacimiento 2026-01-01, pesaje 2026-03-01 | 59 días |
| Curva de crecimiento | 10 pesajes | orden cronológico, sin huecos inventados |
| Costo/kg | costo imputado 1.200.000, peso 450 kg | 2.666,67 /kg con redondeo declarado |
| Utilidad | venta 3.000.000 − costos 1.800.000 | 1.200.000 (fórmula visible) |

### 4.2 Máquina de estados

- Transición válida actualiza estado y emite evento.
- Transición inválida (`vendido → activo`) es rechazada con `ANIMAL_SOLD`.
- Pesaje sobre animal `fallecido` es rechazado.
- Toda transición queda en `animal_estado_historial` y en `audit_log`.

### 4.3 Estabilidad de báscula

| Secuencia de muestras | `tolerance_kg=0,5`, `window_ms=1200`, `min_samples=5` | Esperado |
|---|---|---|
| 450,0 · 450,1 · 450,2 · 450,1 · 450,0 | dentro de ventana | estable |
| 430 · 460 · 450 · 470 · 440 | dispersión alta | inestable |
| 4 muestras constantes | menos del mínimo | inestable |
| 450 constante durante 400 ms | ventana incompleta | inestable |

### 4.4 Genealogía

- Animal como su propio padre ⇒ error.
- Ciclo A→B→A ⇒ error.
- Padre con fecha de nacimiento posterior al hijo ⇒ error.
- Madre macho ⇒ error.
- Árbol de 4 generaciones se construye sin duplicar nodos.

### 4.5 HLC

- Dos dispositivos con relojes desfasados 30 min producen orden consistente por HLC.
- Un mensaje con `physical_ms` futuro no adelanta el reloj del servidor (se acota).
- HLC empata ⇒ desempate por `device_id` (orden total determinista).

---

## 5. Pruebas de integración

### 5.1 Con base real

- Cada suite levanta PostgreSQL + PostGIS desde `docker-compose.test.yml`, aplica migraciones desde cero y
  siembra un dataset mínimo (`factories`).
- Se ejecutan con un rol `app_rw` (no superusuario) para detectar dependencias de privilegios.
- Las pruebas de inmutabilidad **deben fallar** si el trigger se elimina: se verifica explícitamente que un
  `UPDATE` lanza excepción.

### 5.2 Autorización (matriz exhaustiva)

Para cada endpoint: 8 roles × 8 operaciones ⇒ matriz generada automáticamente y comparada con la declarada.
Un endpoint sin decisión explícita **falla la prueba** (deny by default).

### 5.3 Colas y asincronía

- Un job fallido se reintenta con backoff y termina en dead letter con motivo.
- Un job idempotente ejecutado dos veces produce un solo efecto.
- La exportación grande genera archivo, notifica y expone URL firmada.
- El worker caído a mitad de job retoma sin duplicar.

### 5.4 mTLS del bridge

- Bridge sin certificado ⇒ conexión rechazada.
- Certificado revocado ⇒ rechazado.
- Certificado de otro bridge ⇒ rechazado (identidad ligada a `bridge_id`).
- Comando firmado con `bridge_id` distinto ⇒ rechazado.

---

## 6. Pruebas E2E (15 flujos críticos)

| # | Flujo | Criterio de éxito |
|---|---|---|
| E2E-01 | Login, MFA y logout | Sesión creada y destruida; refresh no reutilizable |
| E2E-02 | Alta de animal con arete y foto | Ficha visible con pestañas |
| E2E-03 | Pesaje con báscula simulada | Peso guardado, GDP calculado, evento de auditoría |
| E2E-04 | Pesaje sin red y sincronización posterior | Registro aparece una sola vez |
| E2E-05 | Pesaje duplicado por doble escaneo | Un solo pesaje, marca `duplicate_of` |
| E2E-06 | Registro de vacunación con próxima dosis | Alerta generada en el panel |
| E2E-07 | Parto con creación de cría | Cría creada, madre actualizada, genealogía correcta |
| E2E-08 | Movimiento de potrero y sobrecarga | Alerta por capacidad |
| E2E-09 | Venta con peso de salida | Animal `vendido`, trazabilidad completa |
| E2E-10 | Venta bloqueada por retiro de medicamento | Bloqueo con motivo visible |
| E2E-11 | Posición GNSS en mapa | Punto con leyenda "GNSS"; tipo correcto |
| E2E-12 | Tag sin GNSS | **No** se muestra punto; se muestra cobertura administrativa |
| E2E-13 | Geocerca de salida de potrero | Evento y alerta, sin duplicados por rebote |
| E2E-14 | Exportación de reporte grande | Job asíncrono + notificación + descarga |
| E2E-15 | Verificación de auditoría | Cadena OK; alteración simulada detectada |

E2E-12 es una **prueba de prohibición**: verifica que el sistema no hace algo. Es tan importante como las
funcionales.

---

## 7. Simuladores

### 7.1 Simulador de báscula

- Emula un puerto serie (PTY virtual o socket TCP según el caso) y produce tramas ASCII configurables.
- Modos: estable, inestable, ruido, animal que se mueve, sobrecarga, trama corrupta, desconexión.
- **Toda lectura generada se marca `origen = SIMULATOR`.**
- Se usa en: pruebas de bridge, pruebas E2E de pesaje, demostraciones. **Nunca** en producción con datos
  reales presentados como reales (`INV-08`).

### 7.2 Simulador LoRaWAN

- Genera N tags (hasta 5.000) con uplinks por MQTT.
- Campos por tag: `dev_eui`, batería, movimiento, temperatura, GPS opcional, gateway receptor, RSSI/SNR.
- Escenarios: miles de tags, pérdida de conexión, cambio de potrero, batería baja, tag mudo, posición fuera
  de límites, payload corrupto, mensaje duplicado.
- Los decodificadores se prueban con payloads de ejemplo del fabricante cuando existan; si no existen, el
  simulador declara su propio formato y el tag queda en estado `simulated`.

### 7.3 Simulador de Local Bridge

- Permite probar la PWA sin báscula física: se conecta por WebSocket como si fuera un bridge real.
- Respeta el contrato de mensajes, incluido el latido y el reporte de estado.

---

## 8. Pruebas offline y de sincronización

Estas son las pruebas de mayor valor del proyecto. Se ejecutan con **inyección de fallos de red**.

| Caso | Escenario | Esperado |
|---|---|---|
| SYNC-01 | 50 pesajes sin red, luego sincronización | 50 aplicados, ninguno duplicado |
| SYNC-02 | Sincronización interrumpida en el comando 25 | 25 aplicados; reintento aplica 25–50 sin duplicar |
| SYNC-03 | Mismo comando enviado 3 veces | Un solo efecto (idempotencia) |
| SYNC-04 | Animal vendido en otro dispositivo mientras se pesa offline | `rejected` con motivo, comando íntegro en bandeja |
| SYNC-05 | Dos usuarios cambian el mismo campo descriptivo | LWW; valor perdedor conservado en evento |
| SYNC-06 | Dos movimientos de potrero solapados | `conflict`, resolución humana requerida |
| SYNC-07 | Reloj del dispositivo adelantado 2 h | `clock_skew = true`; orden por HLC correcto |
| SYNC-08 | Token expirado sin red | ventana de gracia; luego solo lectura |
| SYNC-09 | Usuario revocado que sincroniza | comandos marcados `actor_revoked`, alerta |
| SYNC-10 | Lote con checksum alterado | rechazo del lote completo, sin efectos parciales |
| SYNC-11 | Outbox saturada (80 % de cota) | advertencia visible, sincronización forzada |
| SYNC-12 | 30 días sin sincronizar | dead letter visible; no se pierde nada |

Infraestructura: `tc`/proxy con capacidad de cortar y degradar la red, y Playwright con `route.abort()` para
simular offline en el navegador.

---

## 9. Pruebas de hardware (HIL)

| Nivel | Qué se prueba | Requisito |
|---|---|---|
| `declared` | Solo contrato e interfaz | Ninguno |
| `simulated` | Adaptador contra simulador de tramas | Simulador + pruebas automatizadas |
| `lab_verified` | Báscula real conectada al bridge en oficina | Hardware en laboratorio + acta |
| `field_verified` | Báscula real en la hacienda, con operario real | Visita a campo + acta firmada |

Sin `lab_verified` no se comercializa la integración; sin `field_verified` no se afirma validación en campo
(`INV-09`). El repositorio guarda un acta por dispositivo en `docs/manuals/integraciones/`.

Pruebas HIL mínimas cuando haya hardware:

1. Lectura de peso en vacío y con carga conocida (verificación contra patrón).
2. Secuencia de estabilidad con animal real en movimiento.
3. Desconexión/reconexión del cable serie durante el pesaje.
4. Corte de red durante el pesaje (la cola local debe retenerlo).
5. Reinicio del PC de pesaje (el bridge debe recuperar la cola).
6. Lectura de arete con lector real (Code 128 y QR).

---

## 10. Pruebas de carga

| Escenario | Herramienta | Criterio |
|---|---|---|
| 15 usuarios concurrentes navegando | k6 | p95 < 400 ms, 0 errores 5xx |
| 200 msg/s de ingesta IoT durante 10 min | k6 + MQTT | sin pérdida, sin crecimiento infinito de cola |
| Mapa con 2.000 animales y 24 h de posiciones | Playwright + datos sembrados | < 2 s de carga, interacción fluida |
| Exportación de 50.000 filas | k6 | responde 202, job termina < 2 min |
| Consulta de curva con 10 años de historia | k6 | < 300 ms |

Los resultados se registran en `docs/tests/load/AAAA-MM-DD.md` con versión, hardware y conclusión.

---

## 11. Pruebas de seguridad

| Prueba | Método |
|---|---|
| Autorización por endpoint | Matriz automatizada (8 roles × 8 operaciones) |
| IDOR entre fincas | Prueba de integración con dos fincas y usuario de una |
| Inyección SQL | Pruebas con payloads en todos los filtros + revisión de consultas |
| XSS | Payloads en observaciones, nombres y documentos |
| CSRF | Peticiones sin token desde origen externo |
| Rate limiting | Superar el límite y verificar 429 |
| Fuga de errores | Forzar 500 y verificar que no hay stack trace |
| Secretos | `gitleaks`/script propio en CI |
| Dependencias | `pnpm audit` + Dependabot |
| Escaneo dinámico | OWASP ZAP baseline en el entorno de staging |

---

## 12. Entornos y datos de prueba

| Entorno | Base | Datos |
|---|---|---|
| Unitarias | ninguna (dominio puro) | fixtures en código |
| Integración | PostgreSQL en contenedor, migraciones reales | factories deterministas |
| E2E | Compose completo (test) | dataset sembrado de 300 animales + 30 días de historia |
| Staging | Compose + datos anonimizados | copia anonimizada de producción (nunca datos personales reales) |
| Producción | — | sin pruebas destructivas; solo smoke tests |

Reglas:

- **Nunca** se copian datos personales reales a un entorno de pruebas (`RF-PRI-01`).
- El dataset de demo se genera con `scripts/dev/seed-demo.ts` y está marcado como `origen = SIMULATOR`.
- Todo entorno de prueba se destruye al terminar; no hay bases "de prueba" persistentes sin dueño.

---

## 13. CI y ejecución

```text
Pull request
├── lint + typecheck                       (2 min)
├── unitarias                              (3 min)
├── integración (Postgres + PostGIS)       (8 min)
├── migraciones desde cero + drift check   (3 min)
├── contrato OpenAPI                       (1 min)
├── secretos + dependencias                (1 min)
└── E2E (solo en PR hacia main/develop)    (15 min)

Nocturno (main)
├── E2E completo
├── carga k6
├── ZAP baseline
├── restauración de respaldo en entorno desechable
└── verificación de cadena de auditoría sobre datos sembrados
```

Comandos locales (mismos que CI):

```bash
pnpm install
pnpm lint && pnpm typecheck
pnpm test            # unitarias
pnpm test:integration
pnpm test:e2e
pnpm test:load
pnpm verify          # todo lo anterior + compose config
```

---

## 14. Criterios de aceptación por fase (extracto)

| Fase | Evidencia mínima |
|---|---|
| F1 | Login, RBAC, migraciones desde cero, auditoría encadenada verificable, compose levanta, pruebas de autorización verdes |
| F2 | CRUD de animales con invariantes, unicidad, genealogía validada, inventario consistente |
| F3 | Bridge con simulador, cola durable, mTLS, E2E-03 y E2E-05 |
| F4 | GDP y curva correctos, reportes de pesaje, dedupe probado |
| F5 | Vacunación, tratamiento, periodo de retiro, alertas |
| F6 | Parto crea cría, genealogía sin ciclos, indicadores reproductivos |
| F7 | Movimientos sin solape, sobrecarga, alimentación y costos |
| F8 | Compra/venta con trazabilidad completa, utilidad y costo/kg |
| F9 | Ingesta con simulador, dedupe, perfiles versionados, estado de tags |
| F10 | PostGIS, geocercas con histéresis, mapa con 2.000 puntos, E2E-12 |
| F11 | Dashboard, alertas, exportaciones asíncronas |
| F12 | SYNC-01…12 verdes, endurecimiento, carga, manuales, despliegue |
