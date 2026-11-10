# Runbook — Restauración

**Objetivo:** devolver la plataforma a un estado íntegro y conocido, con la menor pérdida de datos posible.
**Cuándo:** corrupción, borrado accidental, fallo de disco, actualización fallida, incidente de seguridad.
**Tiempo estimado:** 1–4 h (RTO objetivo: 4 h).
**Pérdida máxima aceptable:** 15 min (RPO).
**Requisitos:** respaldo verificado, acceso al servidor, acceso al gestor de secretos.

---

## 0. Antes de tocar nada

1. **Detener la operación** para que no se generen escrituras nuevas:
   ```bash
   docker compose --profile app stop api web worker lora-service
   ```
2. **Preservar el estado actual**, incluso si está corrupto: es evidencia.
   ```bash
   docker run --rm -v hg-pgdata:/data -v "$PWD/backups:/backups" alpine \
     tar czf /backups/estado-fallido-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
   ```
3. Anotar la hora exacta del incidente y el último respaldo disponible.
4. Avisar a los responsables: toda operación de campo debe pasar a papel hasta nuevo aviso.

---

## 1. Restauración de la base (escenario normal)

```bash
# 1. Detener postgres
docker compose stop postgres

# 2. Recrear el volumen (¡destruye los datos actuales del volumen!)
#    Solo si el volumen está corrupto y ya se preservó el estado fallido.
docker compose rm -sf postgres
docker volume rm hg-pgdata

# 3. Levantar limpio (el init vuelve a crear extensiones y roles)
docker compose up -d postgres
sleep 20
docker compose exec -T postgres pg_isready -U hacienda_owner

# 4. Restaurar
docker compose exec -T postgres pg_restore \
  -U hacienda_owner -d hacienda --clean --if-exists --no-owner --no-privileges \
  < backups/hacienda-XXXXXXXX-XXXXXX.dump

# 5. Verificar
docker compose exec -T postgres psql -U hacienda_owner -d hacienda -c "\dt app.*" | head
docker compose exec -T postgres psql -U hacienda_owner -d hacienda -c "SELECT count(*) FROM app.animal;"
```

---

## 2. Restauración a un punto en el tiempo (PITR)

Si el archivado WAL está activo:

```bash
# 1. Detener postgres y conservar el volumen
docker compose stop postgres

# 2. Restaurar la base completa anterior al incidente (paso 1)
# 3. Configurar la recuperación al instante deseado
docker compose run --rm postgres sh -c '
  cat > /var/lib/postgresql/data/recovery.signal <<EOF
restore_command = '"'"'cp /var/lib/postgresql/wal_archive/%f %p'"'"'
recovery_target_time = '"'"'2026-11-10 14:30:00-05'"'"'
recovery_target_action = '"'"'promote'"'"'
EOF'

# 4. Arrancar y esperar la promoción
docker compose up -d postgres
docker compose logs -f postgres | grep -i "recovery"
```

**Verificación:** el log muestra `database system is ready to accept connections` y
`recovery finished`. Comprobar que el último evento antes del incidente existe y el posterior no.

---

## 3. Restauración de documentos

```bash
docker compose stop minio
docker run --rm -v hg-miniodata:/data -v "$PWD/backups:/backups" alpine \
  sh -c "rm -rf /data/* && tar xzf /backups/minio-XXXXXXXX-XXXXXX.tar.gz -C /data"
docker compose up -d minio
```

---

## 4. Verificación funcional (obligatoria)

| # | Verificación | Comando o acción | Esperado |
|---|---|---|---|
| 1 | Servicios arriba | `docker compose ps` | Todos `healthy` |
| 2 | Health de API | `curl -fsS http://localhost/api/health` | `200` |
| 3 | Login | Entrar con un usuario administrador | Sesión válida |
| 4 | Integridad de auditoría | `pnpm run audit:verify` (Fase 1) | Sin rupturas |
| 5 | Conteo de animales | Consulta en la ficha / SQL | Coincide con el respaldo |
| 6 | Último pesaje | Abrir el pesaje más reciente | Datos coherentes |
| 7 | Documento | Abrir un PDF desde la ficha del animal | Descarga correcta |
| 8 | Sincronización | Reconectar un dispositivo offline | Sin conflictos masivos |

**Criterio de cierre:** los 8 puntos pasan. Si alguno falla, **no** se reanuda la operación.

---

## 5. Reanudación

```bash
docker compose --profile app start api web worker lora-service
```

1. Comunicar a los usuarios que el sistema está operativo y desde qué momento hay datos.
2. Pedir a los puestos de pesaje que sincronicen los registros en papel o en cola local.
3. Revisar la bandeja de conflictos: los registros offline del periodo caído aparecerán ahí.
4. Documentar el incidente: causa, datos perdidos (si hubo), tiempo fuera de servicio.

---

## 6. Si falla

| Síntoma | Acción |
|---|---|
| `pg_restore` con errores de extensión | Verificar que el init se ejecutó (`CREATE EXTENSION postgis`) antes de restaurar |
| Roles inexistentes | Ejecutar `infra/postgres/init/00-extensions-roles.sql` antes de la restauración |
| Restauración incompleta | Repetir desde cero con otro respaldo más antiguo y PITR |
| Nada funciona | Declarar incidente mayor; activar operación en papel; escalar al responsable técnico |

---

## 7. Registro

Crear `docs/runbooks/bitacora-restauraciones.md` con: fecha, respaldo usado, RPO real, RTO real, verificaciones,
responsable y lecciones aprendidas. Se revisa en cada fase.
