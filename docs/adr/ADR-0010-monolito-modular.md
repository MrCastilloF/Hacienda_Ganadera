# ADR-0010: Monolito modular, no microservicios

- **Estado:** Aceptada
- **Fecha:** 2026-11-10
- **Decisores:** Arquitecto de software, especialista DevOps
- **Requisitos afectados:** v1 §4, §5, §43; `RNF-ESC-01`…`05`

## Contexto

La plataforma tiene módulos con perfiles de carga muy distintos: CRUD de animales (bajo volumen), ingesta IoT
(alto volumen, ráfagas), exportaciones (pesadas, esporádicas) y un bridge en el borde (hardware).

La tentación es microservicios "porque el sistema es grande". Pero el despliegue objetivo es **una hacienda con
un servidor**, operado —en el mejor caso— por una persona con conocimientos básicos de Linux.

## Decisión

1. **Un solo desplegable** (monolito modular NestJS) con fronteras de módulo estrictas y comunicación por
   eventos de dominio.
2. **Workers separados** de la misma base de código para ingesta IoT, exportaciones y jobs: se escalan y
   reinician por separado, pero comparten modelo y despliegue.
3. **No hay microservicios** ni API gateway distribuido ni bus externo (el bus de eventos es una tabla outbox +
   Redis).
4. La separación en servicios se evalúa solo ante una medición que lo justifique, y se registra como ADR nuevo.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas | Motivo de descarte |
|---|---|---|---|
| Microservicios (10+ servicios) | Aislamiento de fallos, escalado independiente | Costo operativo alto, latencia, consistencia distribuida, 1 servidor | Inviable con el equipo y el sitio |
| Serverless | Escalado automático | Requiere nube; la hacienda opera local | Contradice el requisito local-first |
| Monolito "clásico" sin fronteras | Simple al inicio | Se convierte en espagueti; imposible extraer nada | No escala en mantenimiento |
| **Monolito modular + workers** | Un despliegue, fronteras claras, escalado donde importa | Disciplina de módulos necesaria | **Adoptada** |

## Consecuencias

**Positivas**
- Un `docker compose up` levanta todo: se puede instalar en la hacienda y mantener por una persona.
- Transacciones simples: la consistencia no se reparte entre servicios.
- Diagnóstico en un solo lugar.

**Negativas / costos asumidos**
- Un fallo del proceso principal afecta a todos los módulos web (mitigado con reinicio automático y healthchecks).
- La disciplina de fronteras depende de revisión; sin ella el monolito se degrada.

**Riesgos residuales**
- Crecimiento del proceso de ingesta hasta competir con la API: mitigado porque el ingesta corre en un worker
  separado desde el inicio.

## Cumplimiento

- Regla de dependencia verificada en revisión (`docs/02` §4.1).
- `RNF-REN-03` (ingesta 50 msg/s sostenidos) probado con el worker separado.
- Cualquier propuesta de nuevo servicio exige ADR con medición previa.

## Referencias

- `docs/02-arquitectura.md` §3, §15
- `RNF-ESC-01`…`05` en `docs/01-especificacion-corregida.md` §6.3
