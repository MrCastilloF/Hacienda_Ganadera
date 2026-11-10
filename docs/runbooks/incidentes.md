# Runbook — Respuesta a incidentes

**Objetivo:** contener, evaluar y cerrar un incidente de seguridad o de integridad de datos sin empeorarlo.
**Cuándo:** acceso no autorizado, alteración de datos, fuga de información, suspensión de datos, pérdida de
auditoría, dispositivo comprometido.
**Tiempo estimado:** variable. La contención inicial es cuestión de minutos.

---

## 1. Clasificación

| Severidad | Definición | Tiempo de respuesta |
|---|---|---|
| **S1 Crítica** | Fuga de datos personales, alteración de historia, servidor comprometido | Inmediato, 24/7 |
| **S2 Alta** | Acceso con credenciales ajenas, bridge no autorizado, claves expuestas | < 2 h |
| **S3 Media** | Intento fallido sostenido, vulnerabilidad reportada sin exploit | < 24 h |
| **S4 Baja** | Hallazgo de configuración sin impacto probado | < 5 días |

---

## 2. Contención (primeros 15 minutos)

```bash
# 1. Aislar sin destruir evidencia (NO borrar contenedores ni volúmenes)
docker compose --profile app stop api web worker lora-service

# 2. Si el incidente es de red, cortar la salida a Internet del servidor
#    (mantener acceso por consola local)

# 3. Revocar sesiones y tokens sospechosos (procedimiento de Fase 1)
# 4. Revocar certificados de bridges comprometidos (ADR-0005)
# 5. Rotar secretos expuestos (ADR-0007): JWT, S3, SMTP, LoRaWAN

# 6. Preservar logs
docker compose logs --since 24h > backups/incidente-$(date +%Y%m%d-%H%M%S)-logs.txt
```

Reglas de contención:

- **No** reinstalar el servidor antes de preservar evidencia.
- **No** borrar usuarios ni registros "para limpiar": se desactivan, con auditoría.
- **No** comunicar detalles técnicos fuera del círculo de respuesta.

---

## 3. Evaluación (primera hora)

1. **Qué** se vio afectado: datos, servicio, credenciales, dispositivos.
2. **Cuándo** empezó y qué registros lo evidencian (usar `request_id`, `actor_id`, `occurred_at`).
3. **Cómo** entró: credencial, dispositivo, dependencia, configuración, insider.
4. **Alcance**: qué datos, de qué animales, de qué fincas, de qué personas.
5. Verificar la cadena de auditoría:
   ```bash
   # Debe devolver vacío (sin rupturas)
   pnpm run audit:verify --from=AAAA-MM-DD --to=AAAA-MM-DD
   ```

---

## 4. Erradicación y recuperación

| Causa | Acción |
|---|---|
| Credencial comprometida | Rotar, forzar cambio, revisar accesos del periodo |
| Bridge o dispositivo comprometido | Revocar certificado, re-enrolar con supervisión |
| Vulnerabilidad de dependencia | Actualizar, verificar, desplegar (runbook de actualización) |
| Alteración de datos | Restaurar y re-aplicar eventos legítimos; registrar evento compensatorio con motivo del incidente |
| Corrupción de auditoría | Tratar como S1: preservar, restaurar desde respaldo verificado, informar |

Después de recuperar, ejecutar la verificación funcional de `restauracion.md` §4.

---

## 5. Comunicación

| Destinatario | Cuándo | Qué |
|---|---|---|
| Responsable técnico | Inmediato | Todo |
| Propietario de la hacienda | < 4 h (S1/S2) | Impacto operativo, sin detalles explotables |
| Titulares de datos afectados | Según normativa aplicable | Qué dato, qué riesgo, qué hacer |
| Autoridad | Si hay datos personales comprometidos y la ley lo exige | Según procedimiento legal |

---

## 6. Cierre y aprendizaje

1. Informe con: línea de tiempo, causa raíz, datos afectados, acciones tomadas.
2. Acciones correctivas con responsable y fecha.
3. Prueba que evite la recurrencia (si es un fallo técnico, se convierte en prueba automatizada).
4. Actualizar este runbook con lo aprendido.

---

## 7. Registro

Crear `docs/runbooks/bitacora-incidentes.md`: ID, fecha, severidad, resumen, causa, acciones, estado, días sin
recurrencia.
