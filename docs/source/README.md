# Documentos de origen (inmutables)

Estos archivos son los **insumos originales** del proyecto, tal como los entregó el cliente. Se conservan sin
editar para que cualquier persona pueda comparar la especificación de origen con la versión corregida.

| Archivo | Qué es | Origen |
|---|---|---|
| `prompt-maestro-v1.txt` | Especificación original del producto (§1–§49, 1.521 líneas) | Cliente, 2026-11-10 |
| `inicio-tarea-fase-0.txt` | Encargo de la etapa 0: validar, corregir, estructurar y documentar sin escribir código | Cliente, 2026-11-10 |

## Regla

**No se modifican.** Si el cliente actualiza un insumo, se agrega una versión nueva
(`prompt-maestro-v2.txt`) y se anota aquí. La especificación vigente es
[`../01-especificacion-corregida.md`](../01-especificacion-corregida.md); estos archivos son evidencia, no
contrato.

## Cómo se relacionan

```text
prompt-maestro-v1.txt ──► docs/00 (26 hallazgos) ──► docs/01 v2 (contrato vigente)
                       └─► matriz de trazabilidad docs/01 §18

inicio-tarea-fase-0.txt ──► entregables 1..5 de la Fase 0
                            (docs/00, docs/01, docs/06, docs/02..05, docs/07)
```

La matriz de trazabilidad de [`../01-especificacion-corregida.md`](../01-especificacion-corregida.md) §18
demuestra que **ningún requisito explícito del original fue eliminado**: cada sección de la v1 tiene su
contraparte en la v2.
