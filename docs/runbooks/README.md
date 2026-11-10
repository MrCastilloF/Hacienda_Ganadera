# Runbooks de operación

Procedimientos que se ejecutan **bajo presión**: corte de energía, disco lleno, base caída, actualización
fallida. Deben poder seguirlos alguien cansado, a las 2 de la mañana, sin acceso a Internet.

Regla: un runbook que no se ha ejecutado al menos una vez no es un runbook, es una intención. Cada ejecución
se registra con fecha, ejecutor y resultado.

| Runbook | Cuándo se usa | Estado |
|---|---|---|
| [`instalacion.md`](instalacion.md) | Alta de una finca nueva o reinstalación | Pendiente (Fase 1) |
| [`respaldo.md`](respaldo.md) | Operación diaria y verificación semanal | Pendiente (Fase 1) |
| [`restauracion.md`](restauracion.md) | Pérdida de datos o corrupción | Pendiente (Fase 1) |
| [`actualizacion.md`](actualizacion.md) | Ventana de mantenimiento por nueva versión | Pendiente (Fase 1) |
| [`incidentes.md`](incidentes.md) | Falla de seguridad o de datos | Pendiente (Fase 1) |
| [`basculas.md`](basculas.md) | Problema con una báscula en el puesto de pesaje | Pendiente (Fase 3) |
| [`lorawan.md`](lorawan.md) | Tags sin comunicación, gateway caído | Pendiente (Fase 9) |

## Formato obligatorio de cada runbook

1. **Objetivo** — qué se logra al terminar.
2. **Cuándo ejecutarlo** — disparador concreto.
3. **Requisitos** — accesos, herramientas, tiempo estimado.
4. **Pasos numerados** — comandos exactos, con la salida esperada.
5. **Verificación** — cómo saber que salió bien.
6. **Qué hacer si falla** — plan B.
7. **Registro** — dónde se anota la ejecución.
