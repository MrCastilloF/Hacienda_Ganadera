# Runbook — LoRaWAN y dispositivos IoT

**Objetivo:** restablecer la recepción de datos de tags y gateways, y distinguir un fallo de red de un fallo
de dispositivo.
**Cuándo:** tags sin comunicación, gateway caído, baterías bajas, posiciones ausentes.
**Tiempo estimado:** 15–60 min.

---

## 1. Diagnóstico por capas

```text
Capa 1  Dispositivo (tag)      ¿tiene batería? ¿transmite? ¿está activo en el servidor LoRaWAN?
Capa 2  Radio                   ¿lo ve algún gateway? ¿RSSI/SNR razonables?
Capa 3  Gateway                 ¿está conectado al servidor LoRaWAN? ¿tiene backhaul?
Capa 4  Servidor LoRaWAN        ¿recibe uplinks? ¿los publica en MQTT?
Capa 5  Ingesta                 ¿el servicio lora-service consume? ¿decodifica?
Capa 6  Aplicación              ¿se guardó la telemetría? ¿se evaluó la geocerca?
```

Se diagnostica **en ese orden**. Saltar capas hace perder tiempo.

## 2. Comandos y verificaciones

```bash
# Estado de los servicios de ingesta
docker compose ps lora-service mosquitto chirpstack

# Logs de ingesta (últimos 10 minutos)
docker compose logs --since 10m lora-service

# ¿Llegan mensajes al broker?
docker compose exec mosquitto mosquitto_sub -t 'application/#' -v -C 5

# Última telemetría recibida por tag (SQL)
docker compose exec -T postgres psql -U hacienda_owner -d hacienda -c "
  SELECT tag_id, max(recibido_at) AS ultima, count(*) AS mensajes
  FROM app.telemetria
  WHERE recibido_at > now() - interval '24 hours'
  GROUP BY tag_id ORDER BY ultima DESC LIMIT 20;"
```

## 3. Casos frecuentes

| Síntoma | Causa probable | Acción |
|---|---|---|
| Ningún tag reporta | Gateway caído o servidor LoRaWAN sin uplinks | Revisar gateway (LED, backhaul, IP) y sesión en el servidor |
| Un tag no reporta | Batería agotada, fuera de cobertura, dado de baja | Verificar batería y `estado_ciclo`; revisar si está `suspended` |
| Reporta pero sin posición | **El tag no tiene GNSS** | Es el comportamiento correcto (`INV-03`); no se debe "inventar" el punto |
| Reporta y decodifica mal | Codec desactualizado o versión incorrecta | Revisar `codec_id`/`codec_version`; el payload crudo quedó guardado |
| Mensajes duplicados | Retransmisión del mismo `f_cnt` | Verificar deduplicación activa |
| Batería baja masiva | Perfil de transmisión demasiado agresivo | Revisar perfil y simular impacto antes de cambiarlo (`RF-IOT-12`) |

## 4. Reglas que no se rompen

1. **Un tag sin GNSS no produce coordenadas.** Si no hay posición, el sistema muestra cobertura de gateway o
   ubicación administrativa. Nunca un punto inventado.
2. **No se declara cobertura** sin estudio de radiofrecuencia: el sistema registra topología, no promete
   alcance.
3. **No se cambian las claves** de un dispositivo por prueba y error: se hace con el procedimiento de rotación
   (`ADR-0007`) y se audita.
4. Los datos del simulador se identifican como simulados; no se mezclan con telemetría real en informes.

## 5. Escalada

1. Recolectar: DevEUI, última transmisión, gateway receptor, RSSI/SNR, batería, versión de firmware.
2. Verificar si el problema es de un tag, de una zona o de todo el despliegue.
3. Si es de cobertura: registrar la zona afectada y anotarla como insumo del estudio de RF.
4. Abrir issue con la plantilla `hardware_integration` y estado de integración correspondiente.
