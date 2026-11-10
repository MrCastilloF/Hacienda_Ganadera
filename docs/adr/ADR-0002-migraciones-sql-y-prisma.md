# ADR-0002: Migraciones SQL como fuente de verdad + Prisma como ORM de dominio

- **Estado:** Aceptada
- **Fecha:** 2026-11-10
- **Decisores:** Arquitecto de software, especialista PostgreSQL/PostGIS
- **Requisitos afectados:** v1 §4, §37; `HAL-03`; `RF-ARQ-04`…`07`

## Contexto

La v1 pide "Prisma ORM cuando sea compatible con los requerimientos" y "SQL nativo cuando determinadas
operaciones geoespaciales lo requieran". A la vez exige: índices espaciales, particionamiento de posiciones
históricas, triggers de auditoría inmutable, exclusión de solapes y restricciones `CHECK` complejas.

Prisma no modela: particiones declarativas, `EXCLUDE USING gist`, triggers, funciones `plpgsql`, índices
parciales con expresión ni vistas materializadas. Si Prisma es dueño del esquema, la base real diverge del
modelo; y un esquema que diverge no se puede auditar.

## Decisión

1. **Las migraciones SQL versionadas son la fuente de verdad del esquema** (`infra/postgres/migrations/`).
2. **Prisma se usa como cliente tipado** para el dominio y operaciones CRUD, generado por `prisma db pull`
   (introspección) sobre la base ya migrada.
3. **`prisma migrate` y `prisma db push` quedan prohibidos** en cualquier entorno con datos.
4. PostGIS, ventanas analíticas, agregados y consultas geoespaciales se escriben en **SQL tipado** revisado,
   encapsulado en repositorios.
5. El CI verifica que el cliente generado coincide con el esquema migrado (**drift check**) y falla si no.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas | Motivo de descarte |
|---|---|---|---|
| Prisma dueño del esquema (`prisma migrate`) | Un solo lenguaje, DX excelente | Sin particiones, triggers, `EXCLUDE`, `CHECK` complejos; PostGIS limitado | No cumple §37 ni la inmutabilidad |
| TypeORM | Entidades + migraciones SQL posibles | Historial de bugs en migraciones; menos tipos | Mayor riesgo, menos control que SQL puro |
| Kysely + SQL | Tipado fuerte, SQL explícito | Más trabajo inicial; ecosistema menor | Válido, pero el equipo ya conoce Prisma para CRUD |
| SQL puro sin ORM | Control total | Productividad baja en CRUD amplio | Costo alto para 68 tablas |
| **SQL migraciones + Prisma cliente** | Control total del esquema, DX en CRUD | Dos lenguajes; disciplina de drift | **Adoptada** |

## Consecuencias

**Positivas**
- La base puede usar todo el poder de PostgreSQL: particiones, triggers, `EXCLUDE`, `GIST`, vistas.
- Las migraciones son revisables línea por línea, como cualquier código.
- El drift se detecta en CI, no en producción.

**Negativas / costos asumidos**
- Dos fuentes de verdad "en la práctica": el SQL y el `schema.prisma` generado. El drift check lo controla.
- El equipo debe saber SQL. Es una habilidad necesaria de todos modos para este dominio.
- Cambios de esquema requieren migración + regeneración del cliente (dos pasos).

**Riesgos residuales**
- Alguien ejecuta `prisma db push` "para probar". Mitigación: script de CI y documentación; la regla está en
  `CONTRIBUTING.md`.

## Cumplimiento

- `ci.yml` job `drift`: levanta PostGIS, aplica migraciones, genera cliente, compara.
- Revisión: toda migración nueva se prueba desde cero y desde la versión anterior.
- Ninguna migración aplicada se edita; se agrega otra.

## Referencias

- `docs/03-modelo-de-datos.md` §7
- `HAL-03` en `docs/00-validacion-de-la-especificacion.md`
