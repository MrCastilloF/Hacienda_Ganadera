# Requisitos de hardware, infraestructura y registro de riesgos

**Documento:** `docs/05-requisitos-hardware-y-riesgos.md`
**Versión:** 1.0.0
**Fecha:** 2026-11-10
**Requisitos:** v1 §9, §20, §27, §43, §46; `docs/01-especificacion-corregida.md` §11

> Regla que gobierna este documento: **nada aquí afirma que una integración física fue validada.** Cada
> dispositivo tiene un estado de integración (`declared`, `simulated`, `lab_verified`, `field_verified`) que
> solo cambia con evidencia registrada.

---

## 1. Servidor local

### 1.1 Especificación mínima y recomendada

| Componente | Mínimo | Recomendado | Justificación |
|---|---|---|---|
| CPU | 4 vCPU | 8 vCPU | Ingesta IoT + reportes en paralelo |
| RAM | 8 GB | 16 GB | PostgreSQL con caché + colas + servicios |
| Disco | SSD 256 GB | SSD NVMe 512 GB + disco 1 TB para respaldos | Posiciones y documentos crecen monótonamente |
| Red | 1 GbE | 2 × 1 GbE (una para campo, una para administración) | Segmentación |
| SO | Linux (Ubuntu Server 24.04 LTS / Debian 12) | Igual | Docker, systemd, soporte LTS |
| Energía | UPS 900 VA / 15 min | UPS 1500 VA + apagado ordenado | Corte de energía es el fallo más común en campo |
| Virtualización | Opcional | Proxmox/Hyper-V con snapshot antes de actualizar | Rollback rápido |

### 1.2 Requisitos de sitio

- Espacio ventilado, sin polvo extremo, fuera del alcance de animales.
- Punto eléctrico con polo a tierra y UPS; el servidor no comparte circuito con motores o cercas eléctricas.
- Enlace a Internet intermitente aceptable, pero **al menos una sincronización cada 72 h** (límite de la
  ventana offline).
- Acceso físico restringido (armario con llave).
- Etiquetado de puertos y cables; plano de red en `docs/runbooks/`.

### 1.3 Almacenamiento

| Dato | Ubicación | Crecimiento estimado | Respaldo |
|---|---|---|---|
| Base de datos | SSD local (volumen Docker) | ~2–8 GB/año para 5.000 animales | Diario + WAL continuo |
| Documentos | MinIO (SSD) | 20–50 GB/año | Diario incremental |
| Configuración y secretos | Volumen cifrado | Trivial | Diario + copia offline |
| Respaldos | Disco externo/NAS | Igual a la base comprimida | Rotación 3-2-1 |

---

## 2. Puesto de pesaje

| Elemento | Requisito | Nota |
|---|---|---|
| PC / portátil | Windows 10+ o Linux, 8 GB RAM, 2 puertos USB | Debe permanecer encendido en jornada de pesaje |
| Local Bridge | Instalado como servicio, arranque automático | `apps/local-bridge` |
| Conversor USB–RS232/RS485 | Chip FTDI/CH340 con driver estable | Se registra el modelo; los conversores baratos pierden tramas |
| Lector de código | USB HID (recomendado), Bluetooth o serial | Code 128, Code 39, EAN-13, QR |
| UPS pequeña | 600 VA | Evita perder la jornada por un corte |
| Red | Wi-Fi o cable al servidor local; **no requiere Internet** para pesar | Imprescindible para operar offline |

### 2.1 Básculas — lo que el sistema debe asumir

| Aspecto | Se asume | Estado por defecto |
|---|---|---|
| Transporte | RS232, RS485 (vía conversor), USB-serie, TCP/IP, Wi-Fi | `declared` |
| Protocolo | ASCII con trama configurable, o propietario con adaptador | `declared` |
| Estabilidad | Indicador propio de la báscula o cálculo por ventana | `simulated` |
| Unidad | kg (se convierte si la trama viene en otra unidad) | `declared` |
| Resolución | 0,1 kg típico (configurable) | `declared` |

**No se asume ningún protocolo específico.** Si la báscula no está documentada, se capturan tramas con el
modo diagnóstico del bridge y se escribe un adaptador; mientras tanto el puesto opera con simulador.

---

## 3. Red y radiofrecuencia

### 3.1 Segmentación

| VLAN / red | Contenido | Acceso |
|---|---|---|
| Administración | Servidor, PC de pesaje, impresoras | LAN, VPN para remoto |
| Campo | Gateways, cámaras, repetidores | LAN restringida, solo salida a MQTT |
| Invitados | Tabletas/celulares de operarios | Solo al proxy (443) |

### 3.2 Gateways LoRaWAN

- **La cantidad no se fija en el documento**: la determina un estudio de cobertura/radiofrecuencia
  (`RF-IOT-19`). Cualquier cifra sin estudio es una suposición y no se usa para comprar.
- Criterios de instalación a considerar: altura de antena, relieve, vegetación, obstáculos metálicos,
  distancia entre gateways, redundancia, backhaul disponible.
- Cada gateway registra su ubicación real (coordenadas declaradas, no estimadas) y su altura.
- Métricas mínimas: RSSI, SNR, paquetes por hora, pérdida estimada, última comunicación.

### 3.3 Estudio de cobertura (entregable previo a compra)

Debe responder, con mediciones o simulación declarada como tal:

1. Extensión y topografía de la hacienda.
2. Ubicaciones candidatas de gateway y altura.
3. Cobertura esperada por SF y pérdida de paquetes estimada.
4. Número de gateways necesario para el factor de uso objetivo.
5. Puntos ciegos y su impacto operativo.

Sin este estudio, el sistema se entrega con topología declarada y **sin promesa de cobertura**.

---

## 4. Dispositivos IoT

| Tipo | Capacidades | Lo que NO se asume |
|---|---|---|
| Tag GPS/GNSS + LoRaWAN | coordenadas, fecha/hora, batería, movimiento, estado, sensores | Que transmita continuamente o con precisión métrica |
| Tag LoRaWAN de bajo consumo | presencia, movimiento, inactividad, batería, telemetría | **Que tenga GPS** (prohibido, `INV-03`) |
| Acelerómetro (si existe) | actividad, inactividad, patrones | Que equivalga a diagnóstico veterinario |
| Gateway | recepción, RSSI/SNR, backhaul | Que determine la posición del animal |

### 4.1 Ciclo de vida del dispositivo

```text
provisioned ──► active ──► suspended ──► retired
     │              │            │
     │              └──► mantenimiento / cambio de batería
     └──► rechazado si el DevEUI no está autorizado
```

- El enrolamiento requiere un usuario con `administrar_dispositivos`.
- Las claves (AppKey/NwkKey) viven en el gestor de secretos, nunca en la base ni en Git (`RF-SEG-20`).
- Un dispositivo `retired` no puede volver a `active`: se provisiona uno nuevo.

---

## 5. Lo que no puede verificarse sin hardware

| Requisito | Depende de | Cómo se entrega mientras tanto | Cómo se verifica |
|---|---|---|---|
| Lectura de peso real | Marca/modelo de báscula | Simulador de tramas + adaptador genérico | Acta de laboratorio (`lab_verified`) |
| Estabilidad con animal real | Comportamiento físico | Umbrales configurables + pruebas con trazas grabadas | Prueba en campo |
| Lectura de aretes con lector | Lector físico | Entrada de teclado + pruebas de normalización | Prueba en campo |
| Cobertura LoRaWAN | Estudio de RF | Topología declarada, sin promesa de cobertura | Medición en campo |
| Autonomía de batería | Ficha del fabricante | Dato del fabricante marcado como tal (`RF-IOT-20`) | Medición prolongada |
| Geolocalización GNSS | Tag con GNSS | Simulador con posiciones marcadas `SIMULATOR` | Prueba en campo |
| Backhaul del gateway (LTE) | Operador y cobertura celular | Ethernet/Wi-Fi | Prueba en sitio |

---

## 6. Registro de riesgos

Escala: **P** probabilidad (1 baja – 5 alta), **I** impacto (1 bajo – 5 crítico), **E = P × I**.
Umbral de atención: E ≥ 12 requiere mitigación activa y seguimiento en cada fase.

### 6.1 Riesgos del producto

| ID | Riesgo | P | I | E | Mitigación | Contingencia |
|---|---|---|---|---|---|---|
| R-01 | Duplicación o pérdida de datos offline | 4 | 5 | **20** | Contrato de sincronización §9: UUIDv7, idempotencia, HLC, outbox | Reconciliación manual desde bandeja con auditoría |
| R-02 | Deriva entre ORM y esquema real | 3 | 4 | 12 | Migraciones SQL como fuente de verdad + drift check en CI | Reconstruir cliente desde base migrada |
| R-03 | Desalojo de almacenamiento de la PWA en iOS | 4 | 3 | 12 | Bridge como almacén duradero; ventana de 72 h; advertencias | Recuperación desde bridge o sincronización previa |
| R-04 | Báscula real con protocolo desconocido o no documentado | 4 | 4 | **16** | Adaptador + modo diagnóstico + captura de tramas | Operación manual asistida con registro posterior |
| R-05 | Cobertura LoRaWAN insuficiente tras la compra | 3 | 4 | 12 | Estudio de RF antes de comprar; sin promesa de cobertura | Gateways adicionales / repetidores |
| R-06 | Uso de tags sin GNSS como si tuvieran posición | 3 | 5 | **15** | `INV-03`/`INV-04` + restricción en BD + E2E-12 | Corregir datos; auditoría de posiciones inválidas |
| R-07 | Crecimiento de posiciones degrada consultas | 3 | 3 | 9 | Particiones mensuales + vista materializada + retención | Archivado a almacenamiento frío |
| R-08 | Fuga de claves LoRaWAN | 2 | 5 | 10 | Gestor de secretos, rotación, revocación | Rotar claves y re-provisionar afectados |
| R-09 | Restauración nunca probada | 4 | 5 | **20** | Ensayo mensual obligatorio + verificación semanal automática | Restauración de emergencia con runbook |
| R-10 | Complejidad de 12 fases para un equipo pequeño | 4 | 3 | 12 | Entregas por fase con DoD medible; sin recorte de alcance | Reordenar fases por valor sin eliminar módulos |
| R-11 | Dependencia de un único proveedor de hardware | 3 | 3 | 9 | Interfaz de adaptadores + dos marcas objetivo | Sustitución con adaptador nuevo |
| R-12 | Reloj incorrecto en dispositivos | 4 | 3 | 12 | HLC + tres marcas de tiempo + NTP | Corrección por evento compensatorio |
| R-13 | Operarios no adoptan la PWA | 3 | 4 | 12 | UI de campo (48 px, 2 toques, alto contraste) + capacitación | Modo acompañado con formularios en papel + carga posterior |
| R-14 | Documentos sin control de acceso | 3 | 4 | 12 | URLs prefirmadas + autorización por entidad + auditoría | Revisión de accesos y rotación de enlaces |
| R-15 | Sobrecarga de potreros mal medida | 3 | 2 | 6 | Capacidad configurable + alerta con tolerancia | Ajuste de capacidad por el mayordomo |
| R-16 | Costos mal imputados | 3 | 3 | 9 | Regla de imputación explícita y visible; auditoría de cambios | Recálculo del periodo desde eventos |
| R-17 | Exportaciones bloquean el sistema | 2 | 3 | 6 | Cola asíncrona + límites | Cancelar job y repetir con filtros |
| R-18 | Alertas ruidosas desactivan el módulo | 4 | 3 | 12 | Umbrales configurables + antirrebote + cooldown | Recalibrar por potrero |
| R-19 | Dependencia de Internet para operar | 2 | 5 | 10 | Diseño local-first; validación sin red en cada fase | Operación con bridge + PWA offline |
| R-20 | Actualización de versión falla en producción | 2 | 4 | 8 | Migraciones probadas, snapshot previo, rollback documentado | Restaurar snapshot |
| R-21 | Pérdida de datos por fallo de disco | 2 | 5 | 10 | RAID/SSD + respaldo verificado + UPS | Restauración con RTO 4 h |
| R-22 | Acceso remoto inseguro habilitado | 2 | 5 | 10 | VPN obligatoria, nunca puertos abiertos | Cierre inmediato y rotación de credenciales |
| R-23 | PII en registros de auditoría | 3 | 4 | 12 | Auditoría por `actor_id`; PII cifrada por sujeto | Crypto-shredding |
| R-24 | Ingesta IoT pierde mensajes si la base cae | 3 | 4 | 12 | Cola persistente (AOF) + buffer de reintentos | Reproceso desde almacenamiento del LNS |
| R-25 | Duplicidad de animales por importación | 3 | 3 | 9 | Importación idempotente + validación de arete/código | Fusionar con auditoría y evento compensatorio |
| R-26 | Confusión kg / arroba en ventas | 3 | 4 | 12 | Unidad canónica + `price_basis` explícito + total mostrado | Corregir con nota de crédito y auditoría |
| R-27 | Servidor sin UPS en zona rural | 4 | 4 | **16** | UPS obligatoria en la especificación de sitio | Respaldo del bridge y recuperación por WAL |
| R-28 | Falta de persona de TI en la hacienda | 4 | 3 | 12 | Manuales + runbooks + soporte remoto | Contrato de soporte |
| R-29 | Licencia del código no definida | 2 | 2 | 4 | `LICENSE` propietaria por defecto, decisiones en ADR | Sustituir licencia antes de distribuir |
| R-30 | Cambio de alcance a mitad de fase | 4 | 3 | 12 | Control de cambios por ADR y backlog priorizado | Reproyectar la fase afectada |

### 6.2 Riesgos de seguridad (STRIDE)

Ver `docs/02-arquitectura.md` §12.2. Los tres de mayor exposición:

| ID | Amenaza | Vector real | Control |
|---|---|---|---|
| S-01 | Bridge falso inyectando pesajes | PC comprometido en la hacienda | mTLS + enrolamiento + firma + auditoría |
| S-02 | IDOR entre fincas | Cambiar un `id` en la URL | Validación de alcance en cada consulta |
| S-03 | Credenciales en repositorio | `.env` commiteado por error | `.gitignore` + secret scanning en CI |

---

## 7. Supuestos operativos declarados

| # | Supuesto | Si no se cumple |
|---|---|---|
| S-1 | Existe energía eléctrica estable con UPS | Se requiere planta o respaldo; RTO empeora |
| S-2 | Hay red local entre servidor y puesto de pesaje | El bridge no puede sincronizar; se opera con cola local hasta restablecer |
| S-3 | Hay Internet al menos cada 72 h | La ventana offline se agota; solo operación local de pesaje |
| S-4 | Existe una persona responsable del sistema | Se contrata soporte; los runbooks lo asumen |
| S-5 | Los dispositivos disponen de DevEUI y claves del fabricante | No se pueden provisionar; el módulo IoT queda en simulación |
| S-6 | Los operarios tienen tableta o celular disponible | Se usan PC de pesaje y formularios asistidos |

---

## 8. Presupuesto de hardware (orden de magnitud, sin precios)

| Rubro | Cantidad | Nota |
|---|---|---|
| Servidor local | 1 | Ver §1.1 |
| UPS servidor | 1 | 1500 VA |
| UPS puesto de pesaje | 1 | 600 VA |
| PC de pesaje | 1 | Puede reutilizarse uno existente |
| Conversores USB–serie | 2 | Uno de repuesto |
| Lecores de código | 1–2 | USB HID preferido |
| Gateway LoRaWAN | **según estudio** | No se fija aquí (R-05) |
| Tags GNSS | **según necesidad** | Solo animales que lo requieran |
| Tags bajo consumo | **según hato** | La mayoría del hato |
| Disco externo/NAS | 1 | 2 TB mínimo para respaldos |
| Patch panel / switch administrable | 1 | Segmentación de red |

Cualquier cifra de gateways o tags en un documento del proyecto es una **hipótesis de planificación**, no un
compromiso, hasta que exista el estudio de cobertura y la lista de animales a monitorear.
