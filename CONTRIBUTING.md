# Cómo contribuir

Gracias por trabajar en este proyecto. Estas reglas existen para que el sistema siga siendo **auditable y
predecible** dentro de cinco años, cuando quien lo mantenga no sea quien lo escribió.

Lee primero [`docs/01-especificacion-corregida.md`](docs/01-especificacion-corregida.md) §3 (invariantes) y
[`docs/06-estructura-y-convenciones.md`](docs/06-estructura-y-convenciones.md).

---

## 1. Antes de escribir código

| Situación | Qué hacer |
|---|---|
| Es un cambio de comportamiento | Abre un issue con criterios de aceptación |
| Es una decisión estructural (esquema, contrato, seguridad, despliegue) | Abre un ADR en `docs/adr/` **antes** del PR |
| Es hardware nuevo | Abre el issue `hardware_integration` y declara el estado de integración |
| Es documentación | PR directo a `develop` |

---

## 2. Flujo

```bash
git checkout develop
git pull --ff-only
git checkout -b feat/<alcance>-<descripcion-corta>

# trabajo...
git add -A
git commit -m "feat(<alcance>): <descripción en imperativo>"
git push -u origin feat/<alcance>-<descripcion-corta>
```

Abre el PR hacia `develop` con la plantilla completa. El merge es **squash**.

Tipos de rama: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`, `hotfix/`, `release/`.

---

## 3. Commits

Formato Conventional Commits, en español, imperativo, sin punto final:

```text
<tipo>(<alcance>): <descripción>

<cuerpo: por qué, no qué>

Refs: #123
```

Alcances válidos: `animales`, `pesajes`, `salud`, `reproduccion`, `alimentacion`, `potreros`, `inventario`,
`compras`, `ventas`, `finanzas`, `iot`, `mapas`, `geocercas`, `alertas`, `reportes`, `documentos`, `usuarios`,
`seguridad`, `sync`, `bridge`, `bascula`, `auditoria`, `web`, `api`, `infra`, `docs`, `ci`, `deps`.

---

## 4. Reglas de código

### 4.1 Generales

1. TypeScript **estricto**. Sin `any` implícito. Si necesitas `any`, justifícalo en el PR.
2. Toda entrada externa se valida con esquema (Zod) en el borde.
3. Manejo centralizado de errores. Códigos estables (`ANIMAL_SOLD`), nunca mensajes adivinables.
4. Prohibido concatenar SQL. Consultas parametrizadas o repositorio tipado.
5. Toda operación crítica emite auditoría. No depende de que te acuerdes: es un interceptor.
6. Sin secretos, credenciales, rutas locales ni datos personales en el código o en las pruebas.
7. Sin `console.log` en código de producción: logger estructurado.
8. Sin dependencias nuevas sin justificación en el PR (infraestructura ⇒ ADR).

### 4.2 Dominio

- `domain/` no importa NestJS, Prisma ni HTTP. Es TypeScript puro y es la parte con más pruebas.
- Los invariantes se validan en el dominio **y** en la base de datos (defensa en profundidad).
- Las transiciones de estado son comandos explícitos, nunca `update({estado})`.

### 4.3 Base de datos

- Migraciones SQL versionadas en `infra/postgres/migrations/`. Nunca `prisma migrate` ni `db push`.
- Toda migración se prueba desde cero y desde la versión anterior.
- Las tablas inmutables no reciben `UPDATE` ni `DELETE`: triggers y permisos al rol.
- Los cambios de esquema en tablas grandes se hacen en pasos compatibles (expandir → migrar → contraer).

### 4.4 Frontend

- Componentes de UI solo desde `packages/ui`.
- Accesibilidad obligatoria: foco visible, navegación por teclado, contraste ≥ 4,5:1.
- Botones deshabilitados explican el motivo (`RNF-USA-03`).
- Nunca se calcula en el cliente un valor de negocio (GDP, costo, utilidad): se recibe del servidor.

### 4.5 Pruebas

- Toda corrección de defecto incluye la prueba que falla sin el arreglo.
- Nada de mocks del ORM en integración: base real en contenedor.
- Los datos simulados llevan `origen = SIMULATOR` (`INV-08`).

---

## 5. Checklist del PR

- [ ] Respeta los invariantes `INV-01`…`INV-12`
- [ ] Agrega o actualiza pruebas; fallarían si el cambio se revierte
- [ ] Migraciones reversibles y probadas (si aplica)
- [ ] Auditoría en operaciones críticas
- [ ] Autorización y alcance verificados
- [ ] Sin datos simulados presentados como reales
- [ ] Estado de integración declarado (si toca hardware)
- [ ] Documentación actualizada en el mismo PR
- [ ] Sin secretos ni credenciales
- [ ] CI en verde

---

## 6. Definition of Done

Una tarea está terminada cuando la Definition of Done de [`docs/01` §17.3](docs/01-especificacion-corregida.md)
se cumple con evidencia: comando ejecutable, prueba que pasa, documento actualizado.

"No funciona en mi máquina" no es evidencia. "Pasa en CI" sí.

---

## 7. Reporte de defectos

Usa la plantilla `bug_report.yml` e incluye: versión, entorno, pasos, resultado esperado, resultado obtenido y
evidencia (log, captura, `request_id`). Si el defecto afecta datos, **no lo corrijas a mano en producción**:
regístralo y usa evento compensatorio.
