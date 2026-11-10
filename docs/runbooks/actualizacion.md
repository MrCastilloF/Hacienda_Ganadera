# Runbook — Actualización de versión

**Objetivo:** pasar de la versión N a la N+1 sin pérdida de datos y con posibilidad de volver atrás.
**Cuándo:** nueva versión aprobada, en ventana de mantenimiento.
**Tiempo estimado:** 45 min – 2 h.
**Requisitos:** respaldo verificado del paso 1, acceso al servidor, notas de la versión.

---

## 0. Reglas

1. **Sin respaldo verificado no hay actualización.** No es una formalidad: es la única salida si algo falla.
2. La ventana se comunica con 48 h de antelación; nunca en plena jornada de pesaje.
3. La migración se probó en un entorno con copia de producción antes de este día.
4. Si el paso 5 falla dos veces, se ejecuta el rollback. No se "intenta una cosa más".

---

## 1. Preparación (día anterior)

```bash
# Respaldo
docker compose --profile tools run --rm backup
ls -lh backups/ | tail -3

# Ensayo de restauración (ver restauracion.md §4)
# Registrar el resultado en la bitácora

# Anotar versión actual
docker compose images | tee backups/versiones-antes.txt
git describe --tags --always
```

---

## 2. Ventana de mantenimiento

```bash
# 1. Avisar: se detiene la operación
# 2. Pedir a los puestos que sincronicen antes de detener
# 3. Detener la aplicación (la infraestructura sigue arriba)
docker compose --profile app stop api web worker lora-service

# 4. Verificar que no hay escrituras en curso
docker compose exec -T postgres psql -U hacienda_owner -d hacienda \
  -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND datname = 'hacienda';"
```

---

## 3. Obtener la nueva versión

```bash
git fetch --tags
git checkout vX.Y.Z
docker compose --profile app build --pull
```

---

## 4. Migraciones

```bash
# 1. Ver qué se va a aplicar
docker compose --profile app run --rm api pnpm run migrate:status

# 2. Aplicar
docker compose --profile app run --rm api pnpm run migrate

# 3. Verificar el esquema
docker compose exec -T postgres psql -U hacienda_owner -d hacienda -c "\dt app.*"
```

Las migraciones del proyecto son **hacia adelante**; la reversa es el rollback completo del respaldo
(ADR-0002). No se ejecutan migraciones "down" en producción con datos.

---

## 5. Arranque y verificación

```bash
docker compose --profile app up -d
docker compose --profile app ps

curl -fsS http://localhost/api/health || echo "FALLO"
```

| # | Verificación | Esperado |
|---|---|---|
| 1 | Todos los contenedores `healthy` | Sí |
| 2 | `/health` y `/ready` | 200 |
| 3 | Login con usuario real | Correcto |
| 4 | Ficha de animal de prueba | Carga con pestañas |
| 5 | Pesaje de prueba con simulador | Se registra |
| 6 | Integridad de auditoría | Sin rupturas |
| 7 | Sincronización de un dispositivo | Sin conflictos inesperados |
| 8 | Logs sin errores nuevos | `docker compose logs --since 10m api` |

**Si los 8 pasan:** se declara la versión en producción y se comunica a los usuarios.

---

## 6. Rollback

```bash
# 1. Volver a la versión anterior del código
git checkout vX.Y.(Z-1)

# 2. Restaurar el respaldo previo (restauracion.md §1)
# 3. Reconstruir y arriba
docker compose --profile app build
docker compose --profile app up -d
# 4. Verificación del paso 5
```

Si hubo migraciones aplicadas, el rollback **exige** restaurar el respaldo: no se intenta revertir el esquema a
mano.

---

## 7. Cierre

1. Actualizar `CHANGELOG.md` si faltó algo y crear el tag si no existe.
2. Registrar en la bitácora: versión anterior, versión nueva, hora de inicio y fin, incidencias, resultado.
3. Confirmar con los usuarios que pueden volver a operar.
4. Revisar a los 7 días: errores en logs, métricas de rendimiento, conflictos de sincronización.
