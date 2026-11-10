# ADR-0008: Tailwind CSS + shadcn/ui como sistema de componentes

- **Estado:** Aceptada
- **Fecha:** 2026-11-10
- **Decisores:** Diseñador UI/UX, ingeniero frontend
- **Requisitos afectados:** v1 §4, §36; `RNF-USA-01`…`05`

## Contexto

La v1 pide "componentes UI modernos", interfaz profesional, uso en exteriores, botones grandes y contraste
alto. No fija librería. La elección condiciona accesibilidad, velocidad de desarrollo y el costo de mantener un
diseño consistente en ~15 módulos.

## Decisión

**Tailwind CSS** para estilos y **shadcn/ui** (componentes sobre Radix UI, copiados al repositorio) como base.

Razones concretas:

- Los componentes Radix aportan accesibilidad (foco, teclado, ARIA) que es costoso replicar.
- Al copiar los componentes al repositorio, no hay dependencia de una librería que cambie de API: el código es
  nuestro y se ajusta a la paleta (verde oscuro, blanco, tierra, gris neutro).
- Tailwind permite implementar modo alto contraste y tamaños táctiles con tokens, sin CSS ad hoc.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas | Motivo de descarte |
|---|---|---|---|
| MUI | Componentes completos | Look genérico difícil de adaptar; tema rígido; peso | El diseño de campo exige control fino |
| Ant Design | Muy completo, tablas potentes | Estética empresarial genérica; difícil de "aterrizar" | Choca con el diseño pedido |
| Chakra UI | Buen DX | Dependencia de versión; menos control de tokens | Menos flexible para alto contraste |
| Componentes propios desde cero | Control total | Accesibilidad y estados cuestan semanas | Costo alto sin beneficio |
| **Tailwind + shadcn/ui** | Accesible, adaptable, código propio | Hay que mantener los componentes copiados | **Adoptada** |

## Consecuencias

**Positivas**
- Consistencia visual con tokens; cambio de paleta en un archivo.
- Accesibilidad base resuelta (foco, teclado, lectores de pantalla).

**Negativas / costos asumidos**
- Los componentes viven en el repositorio: hay que revisarlos y actualizarlos manualmente.
- Tailwind en JSX requiere disciplina para no crear clases mágicas; se usan `cva` y tokens.

**Riesgos residuales**
- Deriva visual entre módulos. Mitigación: `packages/ui` como única fuente de componentes y una página
  `/_design` con el inventario.

## Cumplimiento

- Revisión: ningún componente de formulario o tabla se implementa fuera de `packages/ui`.
- Prueba E2E de contraste y tamaño táctil en las pantallas de campo (pesaje).
- Lint de clases prohibidas (colores fuera de la paleta).

## Referencias

- `docs/02-arquitectura.md` §7
- `RNF-USA-01`…`05` en `docs/01-especificacion-corregida.md` §6.5
