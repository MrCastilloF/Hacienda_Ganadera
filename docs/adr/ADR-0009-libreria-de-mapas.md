# ADR-0009: Leaflet vs MapLibre para mapas

- **Estado:** Propuesta
- **Fecha:** 2026-11-10
- **Decisores:** Ingeniero frontend, especialista en GPS/GNSS y sistemas geoespaciales
- **Requisitos afectados:** v1 §23; `RF-MAP-01`…`03`, `RNF-REN-02`

## Contexto

El mapa debe mostrar límites de hacienda, potreros, corrales, mangas, bebederos, comederos, gateways, animales,
geocercas y zonas restringidas; permitir dibujar polígonos, medir distancias, ver recorridos y filtrar
animales. Debe funcionar bien en tabletas de campo, con 2.000 animales y muchos polígonos.

La v1 admite "Leaflet o MapLibre". La decisión depende de cómo se comporte cada uno con el volumen real y con
hardware modesto.

## Decisión (propuesta)

**Leaflet** como base inicial, por su ecosistema maduro (Leaflet.draw, MarkerCluster) y menor costo de
integración, **salvo** que la prueba de rendimiento con 2.000 puntos y 100 polígonos muestre degradación
inaceptable en WebGL-less; en ese caso se migra a **MapLibre GL JS**.

Se decide con una prueba, no con una preferencia. La prueba se ejecuta en Fase 10 con datos sembrados y en el
dispositivo objetivo (tableta real).

## Alternativas consideradas

**Alternativa A: Leaflet** (con clustering y Leaflet.draw) · **Alternativa B: MapLibre GL JS** (WebGL).
Comparación por criterio y peso:

| Criterio | Peso | Leaflet | MapLibre GL |
|---|---|---|---|
| Render de 2.000 puntos | Alto | DOM/SVG; requiere clustering | WebGL; mejor con volumen |
| Dibujo de polígonos | Medio | Leaflet.draw maduro | Terra Draw / plugin |
| Peso del bundle | Medio | ~40 KB | ~200 KB + worker |
| Soporte en tabletas modestas | Alto | Muy bueno | Requiere WebGL |
| Teselas vectoriales | Bajo | Vía plugin | Nativo |
| Curva de aprendizaje | Bajo | Baja | Media |

## Consecuencias de adoptar Leaflet

**Positivas**
- Menor peso y mejor comportamiento en dispositivos sin GPU.
- Ecosistema probado para edición de polígonos.

**Negativas**
- Con miles de puntos hace falta clustering y agregación en servidor.
- Sin teselas vectoriales: el estilo del mapa depende del proveedor OSM.

## Consecuencias de adoptar MapLibre

**Positivas**
- Rendimiento con volumen y capacidad 3D/rotación (útil para recorridos).
- Estilo propio de las teselas.

**Negativas**
- Requiere WebGL: riesgo en tabletas de gama baja de campo.
- Bundle mayor y más configuración de *sprites* y estilos.

## Cumplimiento

- Prueba de rendimiento en `docs/tests/load/` con dispositivo objetivo.
- La decisión final se registra sustituyendo este ADR (nunca editándolo).

## Referencias

- `docs/02-arquitectura.md` §7
- `RNF-REN-02` en `docs/01-especificacion-corregida.md` §6.1
