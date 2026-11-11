# Manual — Básculas y perfiles de pesaje

Cómo se conecta una báscula, qué se asume mientras no se conoce el equipo y cómo cambiar de modelo sin tocar
el código.

---

## 1. Perfil por defecto · `HACIENDA-GEN-01`

Mientras no se confirme la marca y el modelo reales (punto **C-02** de
[`docs/07`](../07-cierre-y-confirmaciones.md)), el sistema opera con este perfil genérico. La báscula queda en
estado de integración **`declared`**: *no* se declara validada en campo.

| Parámetro | Valor asumido | Por qué |
|---|---|---|
| Protocolo | `generic-ascii` | La mayoría de indicadores de ganado envían texto |
| Transporte | RS232 serie | El más común en mangas y bretes |
| Puerto | **9600 baudios, 8N1** (8 bits, sin paridad, 1 stop) | Ajuste más extendido; suficiente para tramas cortas |
| Delimitador de trama | `CRLF` (`\r\n`) | Separa tramas sin ambigüedad |
| Separador de campos | `,` | Formato habitual `ST,GS,+00450.0kg` |
| Campo del peso | índice 2 | El 0 es el estado y el 1 la escala bruta |
| Carácter estable | `ST` | Convención del indicador |
| Carácter inestable | `US` | Tiene prioridad sobre el anterior |
| Decimales | 1 | Resolución de 0,1 kg |
| Tolerancia de estabilidad | **0,5 kg** | El animal quieto oscila ±0,2–0,4 kg en la manga |
| Ventana | **1200 ms** | Permite 5–10 lecturas antes de decidir |
| Muestras mínimas | **5** | Evita aceptar un pico aislado |
| Rango | **0–1500 kg** | Del ternero recién nacido al toro adulto, con margen para la jaula |
| Resolución | 0,1 kg | La mínima útil en ganado |

> Estas cifras son **supuestos declarados**, no medidas del equipo real. En cuanto se conozca la báscula, se
> ajustan en la configuración de esa báscula y se cambia su estado a `lab_verified` o `field_verified` según la
> evidencia disponible (INV-09).

---

## 2. Cómo se interpreta una trama

```
ST,GS,+ 0452.3kg\r\n
│  │   │        │
│  │   │        └── unidad: se convierte a kg (acepta kg, lb, @)
│  │   └─────────── peso: se aísla el número (signo, coma o punto decimal)
│  └─────────────── escala bruta (se ignora)
└────────────────── estado: ST estable · US inestable
```

Reglas del adaptador:

1. Si el campo contiene comillas, la trama **se rechaza**: el protocolo no declara campos entrecomillados y
   truncar el valor sería inventar un peso.
2. Si el equipo no envía separador decimal, se usa el parámetro `decimales` de esa báscula.
3. La unidad se detecta aunque venga pegada al número (`+01000.0lb`).
4. El peso se convierte a **kg**: es la unidad canónica del sistema.
5. La trama cruda se guarda con el pesaje: sirve para auditar y para depurar el protocolo.

---

## 3. Detección de peso estable

Se evalúa sobre una ventana deslizante de lecturas:

```text
estable  ⇔  muestras ≥ 5
        ∧  (máximo − mínimo) ≤ 0,5 kg
        ∧  las muestras abarcan al menos la mitad de la ventana (1200 ms)
```

El peso registrado es el **promedio** de la ventana, no la última lectura. Un animal que forcejea produce picos;
registrar el último valor aceptaría un peso que nunca existió de forma estable.

Si no hay estabilidad, el sistema **no registra nada** y devuelve el motivo: `POCAS_MUESTRAS`,
`FUERA_DE_TOLERANCIA` o `VENTANA_INCOMPLETA`.

---

## 4. Simulador

Permite probar la cadena completa sin hardware:

```bash
curl -X POST http://localhost/api/v1/pesajes/simulado \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"animalId":"<uuid>","pesoBaseKg":450,"modo":"estable"}'
```

| Modo | Qué reproduce | Resultado esperado |
|---|---|---|
| `estable` | Animal quieto | Registra el pesaje |
| `inestable` | Animal que se mueve | No registra (`FUERA_DE_TOLERANCIA`) |
| `sobrecarga` | Peso por encima del rango | Rechazo por rango |
| `corrupta` | Trama ilegible | Rechazo de la lectura |
| `desconectada` | Equipo apagado | No registra (`POCAS_MUESTRAS`) |

Todo lo que produce el simulador se guarda con `origen = SIMULATOR` y la interfaz lo muestra como simulado
(INV-08). **Nunca** se presenta como dato de campo.

---

## 5. Agregar una marca nueva

1. Escribir un adaptador que implemente `ScaleProtocolAdapter v1` en
   `packages/scale-protocols/src/adapters/`.
2. Registrarlo en `packages/scale-protocols/src/registry.ts`.
3. Crear la báscula con su `protocolId` y sus parámetros.
4. Probar con el simulador de tramas reales (capturadas en modo diagnóstico).
5. Registrar el acta en `docs/manuals/integraciones/` y actualizar el estado de integración.

**No se toca el ERP**: es la decisión de diseño que evita acoplar la plataforma a un modelo de báscula
(INV-02).

---

## 6. Lo que todavía no existe

- **Local Bridge instalable** con mTLS y cola durable (Fase 3, pendiente de hardware para verificar).
- **WebSocket de peso en vivo** hacia la pantalla de pesaje.
- **Anulación de pesajes** desde la interfaz (la API ya impide modificarlos; la anulación con evento
  compensatorio llega con el módulo de correcciones).

Mientras no existan, la pantalla de pesaje acepta el peso digitado o simulado, y el operario confirma: el dato
sigue siendo honesto porque el origen queda declarado.
