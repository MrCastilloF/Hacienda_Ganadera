# ADR-0003: Contrato de sincronización offline

- **Estado:** Aceptada
- **Fecha:** 2026-11-10
- **Decisores:** Arquitecto de software, ingeniero backend, ingeniero frontend
- **Requisitos afectados:** v1 §31; `HAL-02`, `HAL-10`, `HAL-11`, `HAL-23`; `RF-OFF-01`…`24`

## Contexto

La plataforma debe operar en una hacienda con conectividad limitada: registrar pesajes, eventos clínicos y
movimientos sin red, y sincronizar después. La v1 pide "IDs únicos, prevención de duplicados, resolución de
conflictos, estado de sincronización, reintentos controlados", pero no define **quién gana** ni **cómo** se
detecta un conflicto.

Sin contrato, el resultado típico es: pesajes duplicados (reintento de red), registros perdidos (la PWA
recarga), inventario inflado (doble venta) y discusiones sin evidencia.

## Decisión

Se adopta un contrato de sincronización explícito con seis reglas:

1. **Identidad generada en cliente:** UUIDv7 en todas las entidades creadas offline.
2. **Idempotencia:** cada comando lleva `idempotency_key`; el servidor guarda la respuesta 90 días.
3. **Orden causal:** reloj lógico híbrido (HLC) por dispositivo, no el reloj del dispositivo.
4. **Escritura local primero:** outbox durable (IndexedDB en PWA, SQLite en el bridge); la red es un detalle.
5. **Autoridad dividida:** el servidor manda en invariantes (estado del animal, unicidad de tag, inventario);
   el cliente manda en observaciones (peso, síntomas, observaciones), que se anulan, no se editan.
6. **Conflicto visible y decidido por humano:** `sync_conflict` + bandeja de resolución con permiso
   `resolver_conflicto` y auditoría de la decisión.

Políticas por entidad (resumen; detalle en `docs/01` §9.5):

| Entidad | Política |
|---|---|
| Estado del animal | Servidor autoritativo (máquina de estados) |
| Pesaje | Append-only + dedupe por ventana |
| Descriptivos | LWW por campo con HLC (perdedor conservado) |
| Asignación de tag | Servidor autoritativo (unicidad) |
| Movimiento de potrero | Autoritativo por intervalo; solape ⇒ conflicto |
| Venta / inventario / cierre | Prohibido offline |

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas | Motivo de descarte |
|---|---|---|---|
| Last-Write-Wins global por `updated_at` | Trivial de implementar | Pierde datos silenciosamente; relojes desfasados deciden | Inaceptable para trazabilidad |
| CRDT para todo | Convergencia automática | Complejidad alta; semántica de negocio no siempre conmutativa; difícil de auditar | Excesivo y arriesgado |
| Servidor autoritativo puro (rechaza todo offline) | Consistencia simple | El campo no puede trabajar | Viola el requisito central |
| Bloqueo optimista sin cola (reintento manual) | Simple | El operario pierde el pesaje si cierra la app | Inaceptable en campo |
| **Outbox + HLC + política por entidad** | No pierde datos, conflicto explícito, auditable | Complejo: reloj, dedupe, bandeja | **Adoptada** |

## Consecuencias

**Positivas**
- Ningún dato de campo se pierde, ni siquiera en un conflicto.
- El sistema puede explicar, con evidencia, por qué un registro quedó aplicado, duplicado o rechazado.
- La ventana offline es un parámetro medible, no una promesa vaga.

**Negativas / costos asumidos**
- Complejidad real: HLC, dedupe, idempotencia, bandeja de conflictos, UI de diff.
- La preparación debe existir desde la Fase 1 (aunque el offline funcional sea Fase 12): IDs, `version`,
  `updated_at`, outbox. Introducirlo después obliga a migrar todas las tablas.
- El servidor necesita una tabla de llaves idempotentes con purga.

**Riesgos residuales**
- Almacenamiento de la PWA desalojado por el sistema operativo (iOS). Mitigado con el bridge como almacén
  duradero y ventana máxima de 72 h (`RF-OFF-23`, `RF-OFF-24`).

## Cumplimiento

- Pruebas SYNC-01…12 en `docs/04-estrategia-de-pruebas.md` §8.
- `offline/outbox` y `sync-engine` tienen cobertura de dominio ≥ 80 %.
- Revisión de PR: ningún endpoint de escritura sin `idempotency_key`.

## Referencias

- `docs/01-especificacion-corregida.md` §9
- `docs/03-modelo-de-datos.md` §4.8
- `HAL-02`, `HAL-10` en `docs/00-validacion-de-la-especificacion.md`
