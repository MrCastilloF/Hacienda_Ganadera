# Runbook — Respaldo

**Objetivo:** garantizar que existe una copia restaurable de la base, los documentos y la configuración, y que
esa copia está verificada.

**Cuándo:** diario (automático, 02:00 hora local) y antes de cualquier actualización o migración.
**Tiempo estimado:** 5 min automático · 20 min verificación manual.
**Requisitos:** acceso al servidor, `docker compose`, disco externo o NAS montado.

---

## 1. Qué se respalda

| Dato | Método | Frecuencia |
|---|---|---|
| Base de datos | `pg_dump -Fc` + archivado WAL continuo (PITR) | Diario + continuo |
| Documentos (MinIO) | Réplica incremental (`mc mirror`) | Diario |
| Configuración | `.env` cifrado + `docker-compose.yml` + `infra/` | En cada cambio |
| Secretos y claves | Exportación cifrada del gestor de secretos | Semanal, sobre sellado |
| Certificados (CA, mTLS) | Copia cifrada | En cada emisión/rotación |

Regla **3-2-1**: tres copias, dos medios, una fuera del sitio (disco que sale de la hacienda).

---

## 2. Respaldo automático

```bash
# Job diario definido en docker-compose (perfil tools)
docker compose --profile tools run --rm backup
```

El contenedor `backup`:

1. Ejecuta `pg_dump -Fc --no-owner --no-privileges`.
2. Guarda en `/backups/hacienda-AAAAMMDD-HHMMSS.dump`.
3. Elimina los respaldos con más de `BACKUP_RETENTION_DAYS` (30 por defecto).

**Salida esperada:** `respaldo completado` y un archivo nuevo con tamaño > 0.

---

## 3. Respaldo manual antes de una actualización

```bash
# 1. Respaldo de base
docker compose --profile tools run --rm backup

# 2. Respaldo de documentos
docker run --rm --network hg-internal \
  -v hg-miniodata:/data \
  -v "$PWD/backups:/backups" \
  alpine sh -c "tar czf /backups/minio-$(date +%Y%m%d-%H%M%S).tar.gz -C /data ."

# 3. Configuración
tar czf "backups/config-$(date +%Y%m%d-%H%M%S).tar.gz" \
  docker-compose.yml infra/ .env 2>/dev/null

# 4. Verificar que existen y no están vacíos
ls -lh backups/
```

---

## 4. Verificación (semanal, obligatoria)

```bash
# Integridad del archivo
pg_restore --list backups/hacienda-XXXXXXXX-XXXXXX.dump | head -20

# Ensayo real de restauración en contenedor desechable
docker run --rm -e POSTGRES_PASSWORD=test -d --name restore-test postgis/postgis:16-3.4
sleep 15
docker exec -i restore-test pg_restore -U postgres -d postgres --create \
  < backups/hacienda-XXXXXXXX-XXXXXX.dump
docker exec restore-test psql -U postgres -l          # la base debe aparecer
docker exec restore-test psql -U postgres -d hacienda -c "SELECT count(*) FROM app.animal;"
docker rm -f restore-test
```

**Criterio de éxito:** la base se crea, las tablas existen y el conteo de animales coincide con producción
(± los registros del día).

Sin este ensayo, el respaldo **no cuenta** como respaldo. Registrar en la bitácora:

```text
Fecha | Archivo | Tamaño | Ensayo OK (S/N) | Ejecutó | Observaciones
```

---

## 5. Si falla

| Síntoma | Causa probable | Acción |
|---|---|---|
| `pg_dump: connection refused` | Contenedor caído | `docker compose ps`, revisar logs de postgres |
| Archivo de 0 bytes | Disco lleno | `df -h`, liberar espacio, repetir |
| `permission denied` en `/backups` | Montaje sin permisos | Revisar `docker-compose.yml`, permisos del host |
| Tarda > 30 min | Base muy grande / disco lento | Revisar tamaño y plan de retención |

---

## 6. Registro

Toda ejecución se anota en `docs/runbooks/bitacora-respaldos.md` (crear en la primera ejecución) con fecha,
archivo, tamaño, resultado del ensayo y responsable.
