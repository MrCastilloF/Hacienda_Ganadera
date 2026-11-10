# ADR-0001: Formato y proceso de ADR

- **Estado:** Aceptada
- **Fecha:** 2026-11-10
- **Decisores:** Arquitecto de software, líder técnico
- **Requisitos afectados:** v1 §44, §47; `docs/01-especificacion-corregida.md` §8

## Contexto

La plataforma tiene decisiones estructurales que, si se toman por conversación o por costumbre, se revierten
solas: persistencia, sincronización, inmutabilidad, seguridad de dispositivos. El equipo es pequeño y el
conocimiento debe sobrevivir a la rotación de personas y a las pausas del proyecto.

## Decisión

Se adopta **Architecture Decision Records** en formato Markdown, versionados en `docs/adr/`, numerados
secuencialmente, con estados explícitos, y vinculantes cuando están en estado `Aceptada`. Un ADR aceptado no
se edita: se sustituye.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas | Motivo de descarte |
|---|---|---|---|
| Documento de arquitectura único | Simple | Se desactualiza; no hay historial de decisiones | No registra el porqué ni el cuándo |
| Wiki externa | Editable por todos | Fuera del repositorio, sin revisión por PR | Se desincroniza del código |
| ADR en Markdown en el repositorio | Versionado, revisable en PR, cerca del código | Requiere disciplina | **Adoptada** |

## Consecuencias

**Positivas**
- Cada decisión tiene fecha, autor, alternativas descartadas y consecuencias.
- El PR que cambia una regla estructural enlaza el ADR; la revisión se enfoca en la decisión, no en el estilo.

**Negativas / costos asumidos**
- Escribir un ADR cuesta entre 20 y 40 minutos.
- Un ADR desactualizado es peor que ninguno: por eso se sustituye, no se edita.

**Riesgos residuales**
- ADR escritos "para cumplir" sin alternativas reales. Se controla en la revisión: un ADR sin tabla de
  alternativas se rechaza.

## Cumplimiento

- Revisión de PR: cambio en `docs/01`, `docs/03`, `docker-compose.yml`, esquema de BD o contrato de API sin
  ADR ⇒ PR bloqueado.
- `scripts/ci/check-docs.mjs` verifica que cada ADR tenga las secciones obligatorias y una fila en el índice.

## Referencias

- `docs/adr/README.md`
- Michael Nygard, *Documenting Architecture Decisions*
