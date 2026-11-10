<!--
  Gracias por el PR. Completa la plantilla; un PR sin contexto se devuelve.
  Reglas: CONTRIBUTING.md · Convenciones: docs/06 · Invariantes: docs/01 §3
-->

## Qué cambia

<!-- Una o dos frases. Si no cabe, el PR es demasiado grande. -->

## Por qué

<!-- El problema o la decisión. Enlaza el issue y, si aplica, el ADR. -->

Closes #
Refs:

## Tipo de cambio

- [ ] `feat` — funcionalidad nueva
- [ ] `fix` — corrección de defecto
- [ ] `docs` — solo documentación
- [ ] `refactor` / `perf` — interno sin cambio de comportamiento
- [ ] `test` / `ci` / `build` / `chore`
- [ ] ⚠️ Cambio incompatible (requiere `BREAKING CHANGE` y ADR)

## Fase

- [ ] F0 · [ ] F1 · [ ] F2 · [ ] F3 · [ ] F4 · [ ] F5 · [ ] F6
- [ ] F7 · [ ] F8 · [ ] F9 · [ ] F10 · [ ] F11 · [ ] F12
- [ ] Sin fase (mantenimiento)

## Verificación

<!-- Comandos que ejecutaste y su resultado. "Funciona en mi máquina" no es evidencia. -->

```bash
node scripts/ci/check-docs.mjs
node scripts/ci/check-secrets.mjs
docker compose config -q
# pnpm verify            (Fase 1+)
```

## Checklist

### Invariantes (`docs/01` §3)
- [ ] `INV-05`/`INV-06` — no se sobrescribe historia; la auditoría sigue siendo verificable
- [ ] `INV-03`/`INV-04` — no se genera ni se muestra una posición sin respaldo GNSS
- [ ] `INV-08` — los datos simulados están marcados como tales
- [ ] `INV-09` — no se afirma una validación física que no existe
- [ ] `INV-11` — sin secretos, credenciales ni rutas locales

### Calidad
- [ ] Agregué o actualicé pruebas; **fallarían si revierto el cambio**
- [ ] Compila, lint y tipos sin errores
- [ ] Sin `any` implícito ni `console.log` en código de producción
- [ ] Sin dependencias nuevas sin justificación (infraestructura ⇒ ADR)

### Datos
- [ ] Migración SQL versionada incluida (si aplica)
- [ ] Probada desde cero y desde la versión anterior
- [ ] Reversible o con procedimiento de reversa documentado

### Seguridad
- [ ] Autorización y alcance verificados en el backend
- [ ] Validación de entrada en el borde
- [ ] Errores sin stack trace ni datos internos
- [ ] Operaciones críticas emiten auditoría

### Sincronización / offline (si aplica)
- [ ] `idempotency_key` en toda escritura
- [ ] Política de conflicto declarada para la entidad
- [ ] Orden por HLC, no por reloj del cliente

### Documentación
- [ ] Documento afectado actualizado en este mismo PR
- [ ] Diagrama `.mmd` actualizado (si cambió la arquitectura)
- [ ] `CHANGELOG.md` actualizado (si es cambio notable)

## Capturas o evidencia

<!-- Antes/después, log, captura de pantalla, salida de pruebas. -->

## Notas para quien revisa

<!-- Qué mirar con atención, qué quedó fuera, riesgos conocidos. -->
