# Registro de decisiones arquitectónicas (ADR)

Una **ADR** documenta una decisión estructural: qué se decidió, por qué, qué alternativas se descartaron y
qué consecuencias tiene. Sin ADR, una decisión no existe para el equipo y se vuelve a discutir cada tres
meses.

## Reglas

1. Toda decisión que afecte el modelo de datos, los contratos entre componentes, la seguridad o el
   despliegue **requiere** un ADR antes del PR que la implementa.
2. Una ADR **no se edita** una vez aceptada. Se reemplaza por otra que la sustituye (`Estado: Sustituida por ADR-00XX`).
3. Numeración secuencial de cuatro dígitos, sin reutilizar números.
4. Un ADR se aprueba en el PR que lo introduce; la discusión queda enlazada.
5. Los ADR con estado `Propuesta` no son vinculantes; `Aceptada` sí.

## Estados

| Estado | Significado |
|---|---|
| `Propuesta` | En discusión |
| `Aceptada` | Vinculante |
| `Rechazada` | Se descartó (se conserva el motivo) |
| `Sustituida por ADR-XXXX` | Reemplazada |
| `Obsoleta` | Ya no aplica |

## Índice

| ADR | Título | Estado | Fecha |
|---|---|---|---|
| [ADR-0001](ADR-0001-registro-de-decisiones.md) | Formato y proceso de ADR | Aceptada | 2026-11-10 |
| [ADR-0002](ADR-0002-migraciones-sql-y-prisma.md) | Migraciones SQL como fuente de verdad + Prisma como ORM de dominio | Aceptada | 2026-11-10 |
| [ADR-0003](ADR-0003-sincronizacion-offline.md) | Contrato de sincronización offline | Aceptada | 2026-11-10 |
| [ADR-0004](ADR-0004-inmutabilidad-n3.md) | Inmutabilidad N3 con cadena de hashes | Aceptada | 2026-11-10 |
| [ADR-0005](ADR-0005-local-bridge.md) | Local Bridge con mTLS y adaptadores versionados | Aceptada | 2026-11-10 |
| [ADR-0006](ADR-0006-tenancy-mono-tenant.md) | Mono-tenant con N fincas y `tenant_id` reservado | Aceptada | 2026-11-10 |
| [ADR-0007](ADR-0007-gestion-secretos-iot.md) | Gestión de secretos y ciclo de vida de dispositivos LoRaWAN | Aceptada | 2026-11-10 |
| [ADR-0008](ADR-0008-sistema-de-componentes-ui.md) | Tailwind CSS + shadcn/ui como sistema de componentes | Aceptada | 2026-11-10 |
| [ADR-0009](ADR-0009-libreria-de-mapas.md) | Leaflet vs MapLibre para mapas | Propuesta | 2026-11-10 |
| [ADR-0010](ADR-0010-monolito-modular.md) | Monolito modular, no microservicios | Aceptada | 2026-11-10 |

## Plantilla

Copiar en `docs/adr/ADR-XXXX-titulo-en-kebab-case.md`:

```markdown
# ADR-XXXX: <Título imperativo y breve>

- **Estado:** Propuesta | Aceptada | Rechazada | Sustituida por ADR-YYYY | Obsoleta
- **Fecha:** AAAA-MM-DD
- **Decisores:** <nombres o roles>
- **Requisitos afectados:** <RF-*, RNF-*, INV-*>
- **Sustituye a:** ADR-YYYY (opcional)

## Contexto

Qué situación obliga a decidir. Hechos, no opiniones. Restricciones reales (hardware, plazo, equipo,
normativa).

## Decisión

Qué se decide, en presente y en una frase. Luego el detalle necesario.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas | Motivo de descarte |
|---|---|---|---|
| A | | | |
| B | | | |

## Consecuencias

**Positivas**
- ...

**Negativas / costos asumidos**
- ...

**Riesgos residuales**
- ...

## Cumplimiento

Cómo se verifica que la decisión se respeta (prueba, revisión, regla de CI, restricción de base de datos).

## Referencias

- Enlaces a especificación, hallazgos (`HAL-*`), documentos técnicos.
```
