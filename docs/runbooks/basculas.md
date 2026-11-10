# Runbook — Básculas y puesto de pesaje

**Objetivo:** diagnosticar y resolver problemas de lectura de peso en el puesto de pesaje.
**Cuándo:** el peso no llega, llega inestable, llega mal, o el sistema no identifica el animal.
**Tiempo estimado:** 10–30 min.

---

## 1. Diagnóstico rápido (5 minutos)

```text
[ ] ¿La báscula muestra peso en su propio indicador?      → si no, es la báscula (cable, celda, batería)
[ ] ¿El Local Bridge muestra "conectado"?                 → si no, ver §2
[ ] ¿El puesto de pesaje tiene red al servidor?           → si no, operar offline (es lo esperado)
[ ] ¿El lector de aretes escribe en la caja de búsqueda?  → si no, ver §3
[ ] ¿El peso aparece en la pantalla de pesaje?            → si no, ver §4
```

## 2. La báscula no conecta

```bash
# Ver puertos disponibles
# Windows: Administrador de dispositivos → Puertos (COM y LPT)
# Linux:
ls -l /dev/ttyUSB* /dev/ttyACM*
dmesg | tail -20

# Probar la trama con el modo diagnóstico del bridge
# Bridge → Diagnóstico → seleccionar puerto → "Escuchar tramas"
```

| Síntoma | Causa probable | Acción |
|---|---|---|
| No aparece el puerto | Driver del conversor USB-serie | Instalar driver FTDI/CH340; probar otro cable |
| Puerto ocupado | Otro programa lo usa | Cerrar el otro programa (software de la báscula) |
| Tramas ilegibles | Baud rate / paridad incorrectos | Probar 9600 8N1, luego 4800, 19200; verificar manual |
| Tramas vacías | Cable TX/RX invertido o mal pinneado | Revisar cableado RS232/RS485 (A/B en RS485) |
| Se corta a los segundos | Conversor de mala calidad o cable largo | Usar conversor con chip FTDI y cable corto |

## 3. El lector no identifica

| Síntoma | Acción |
|---|---|
| No escribe nada | Verificar que el cursor esté en la caja de búsqueda; probar en el Bloc de notas |
| Escribe con caracteres extra | Configurar prefijo/sufijo del lector o la normalización del puesto (`RF-LEC-03`) |
| Lee un código y el sistema dice "no existe" | Verificar que el arete esté registrado y que la finca sea la correcta |
| Lee bien pero el animal es otro | Revisar duplicidad de códigos y el historial de identificadores |

## 4. El peso llega inestable o no se confirma

- Los parámetros de estabilidad son **por báscula**, no globales: tolerancia (kg), ventana (ms), muestras
  mínimas, tiempo máximo de espera.
- Si el animal se mueve mucho: aumentar `window_ms` o la tolerancia con criterio técnico, nunca "hasta que
  funcione".
- Si el peso nunca se estabiliza: revisar la báscula (celdas, nivelación, viento, plataforma trabada).

```text
Valores por defecto: tolerancia 0,5 kg · ventana 1200 ms · mínimo 5 muestras · espera 10 s
```

**Nunca** se registra un peso "a ojo" para destrabar la operación. Si la báscula falla, se registra el pesaje
como estimado y se documenta; el dato debe seguir siendo honesto.

## 5. Escalada

Si el problema persiste después de §2–§4:

1. Capturar 10 tramas crudas desde el modo diagnóstico.
2. Anotar marca, modelo, configuración de puerto y versión del bridge.
3. Abrir issue con la plantilla `hardware_integration`.
4. Mientras tanto: operar con registro manual y cargar después, sin inventar pesos.
