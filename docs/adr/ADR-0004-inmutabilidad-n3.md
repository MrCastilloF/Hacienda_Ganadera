# ADR-0004: Inmutabilidad N3 con cadena de hashes

- **Estado:** Aceptada
- **Fecha:** 2026-11-10
- **Decisores:** Arquitecto de software, especialista de base de datos, especialista en ciberseguridad
- **Requisitos afectados:** v1 §2, §39, §46; `HAL-01`, `HAL-06`, `HAL-15`; `INV-05`, `INV-06`, `INV-07`

## Contexto

La especificación exige que la historia de cada animal "nunca se altere retroactivamente" y que las
operaciones críticas no se eliminen sin trazabilidad. No define el mecanismo.

Opciones reales: confiar en la disciplina (nada verificable), impedir el borrado en la UI (insuficiente:
el `UPDATE` sigue permitido), impedir mutaciones en la base (bueno, pero un DBA puede), o encadenar hashes
(detecta alteración incluso por un DBA, salvo reescritura total de la cadena).

## Decisión

Se implementa **N3**: tablas append-only + cadena de hashes SHA-256 + roles de base de datos sin privilegios
de mutación, con dos mecanismos complementarios:

1. **`REVOKE UPDATE, DELETE`** sobre las tablas inmutables al rol de aplicación, más un trigger
   `reject_mutation()` como segunda barrera (defensa en profundidad).
2. **Encadenamiento**: `hash = SHA256(payload || prev_hash || occurred_at || actor_id)`, con verificación
   nocturna y endpoint de verificación por rango.

La corrección de un dato histórico se hace con **evento compensatorio** (anulación + nuevo registro), nunca
con `UPDATE`. N4 (anclaje externo/WORM) queda como opción en Fase 12 si el negocio lo exige.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas | Motivo de descarte |
|---|---|---|---|
| N0 disciplina + revisión | Costo cero | No verificable | No cumple el requisito |
| N1 soft-delete | Fácil | Los datos cambian sin dejar rastro | Insuficiente |
| N2 append-only con triggers | Fuerte, económico | Un superusuario/DBA puede alterar sin dejar evidencia | Base, pero incompleto |
| **N3 append-only + hash chain** | Detecta alteración, incluso por DBA | Costo de almacenamiento y de cómputo bajo; complejidad moderada | **Adoptada** |
| N4 anclaje externo (WORM, notaría, blockchain) | Prueba ante tercero | Dependencia externa, costo, latencia | Opcional en F12 |

## Consecuencias

**Positivas**
- Ante la pregunta "¿quién cambió este peso y cuándo?", hay respuesta.
- La exportación de un animal incluye una cadena verificable: sirve como evidencia ante un comprador o una
  autoridad sanitaria.
- La detección de alteración es automatizable y alertable.

**Negativas / costos asumidos**
- Las correcciones son aditivas: la UI debe mostrar el original y su corrección, no solo el valor final.
- Crecimiento de `audit_log` y `domain_event`: se resuelve con particiones anuales y retención ≥ 10 años.
- El cálculo del hash en trigger agrega latencia de escritura (medida: despreciable frente a la operación).

**Riesgos residuales**
- Reescritura completa de la cadena por un atacante con control total del servidor. Mitigación: copias de
  respaldo inmutables (WORM) y verificación de las copias; eventual anclaje externo (N4).
- Conflicto con el derecho de supresión de PII. Resuelto con **crypto-shredding** (`RF-PRI-11`…`13`).

## Cumplimiento

- Prueba de integración: `UPDATE` sobre `audit_log`/`pesaje` lanza excepción.
- Prueba de integridad: alterar una fila por SQL directo (como `postgres`) y verificar que el job detecta la
  ruptura en el evento exacto.
- Job nocturno `audit:verify` en `nightly.yml` con alerta si falla.

## Referencias

- `docs/03-modelo-de-datos.md` §4.5
- `docs/01-especificacion-corregida.md` §10 y §14.6
- `HAL-01`, `HAL-15` en `docs/00-validacion-de-la-especificacion.md`
