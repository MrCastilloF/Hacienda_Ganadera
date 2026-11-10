# ADR-0006: Mono-tenant con N fincas y `tenant_id` reservado

- **Estado:** Aceptada
- **Fecha:** 2026-11-10
- **Decisores:** Arquitecto de software, líder técnico
- **Requisitos afectados:** v1 §6, §35, §37; `HAL-19`, `SUP-01`

## Contexto

La especificación incluye la entidad `Fincas` y el rol "Administrador de hacienda", pero no aclara si el
producto será usado por varios propietarios sobre la misma instalación (multi-tenant) o por uno solo con
varias fincas.

La diferencia no es cosmética: multi-tenant exige aislamiento por fila (RLS o `tenant_id` en cada consulta),
migraciones por inquilino, respaldos por inquilino y un modelo de permisos distinto. Cambiarlo después es una
migración de todo el sistema.

## Decisión

1. **Mono-tenant por instalación**: una instancia sirve a un propietario, con **N fincas**.
2. El aislamiento operativo es por `finca_id`, y los permisos tienen alcance `global | finca | lote | propio`.
3. Se reserva la columna `tenant_id uuid NULL` en las tablas raíz (`finca`, `usuario`) y un valor fijo en la
   configuración. No se usa todavía, pero evita una migración destructiva si el producto evoluciona.
4. Si en el futuro se requiere multi-tenant, se activa RLS sobre `tenant_id` y se rellenan los valores; el
   modelo de datos no cambia.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas | Motivo de descarte |
|---|---|---|---|
| Multi-tenant desde el inicio | Preparado para SaaS | Complejidad de aislamiento, pruebas por inquilino, riesgo de fuga cruzada; nada en el alcance lo pide | Sobreingeniería |
| Mono-tenant puro sin `tenant_id` | Lo más simple | Cambio futuro = migración de todo | Deuda evitable con una columna |
| **Mono-tenant + `tenant_id` reservado** | Simple hoy, migrable mañana | Una columna sin uso (documentada) | **Adoptada** |

## Consecuencias

**Positivas**
- El modelo de permisos queda simple y verificable.
- La migración futura a multi-tenant es aditiva, no destructiva.

**Negativas / costos asumidos**
- Una columna nula con semántica "reservada" que hay que documentar para que nadie la borre.

**Riesgos residuales**
- Que un tercero asuma multi-tenant y construya sobre esa base. Mitigación: declarado explícitamente en el
  alcance (`docs/01` §1.2) y en este ADR.

## Cumplimiento

- Revisión: ninguna consulta usa `tenant_id` sin ADR que lo justifique.
- Pruebas de autorización por finca (`IDOR`) en el nivel de integración.

## Referencias

- `docs/01-especificacion-corregida.md` §1.2
- `HAL-19` en `docs/00-validacion-de-la-especificacion.md`
