# Manual — Importación del hato existente

Cómo cargar los animales que hoy viven en un cuaderno, un Excel o el sistema anterior, sin inventar
datos y sin dejar la carga a medias.

**Requisito:** rol con permiso `animales:crear` (administrador de hacienda o superadministrador).

---

## 1. Antes de importar

1. **Configure la finca**: código, nombre, zona horaria y moneda.
2. **Revise el catálogo de razas**: el importador rechaza razas que no existan.
   `GET /api/v1/catalogos/razas`
3. **Revise la numeración de aretes** si va a dejar que el sistema los genere.
4. **Haga una copia de seguridad** si ya hay animales cargados (`docs/runbooks/respaldo.md`).

---

## 2. Plantilla

```csv
arete,nombre,sexo,fechaNacimiento,raza,color,pesoNacimientoKg,madreArete,padreArete,observaciones
HG0000014,Lucero,HEMBRA,2024-03-15,BRAHMAN,Colorado,34.5,,
HG0000021,Relámpago,MACHO,2024-04-02,NELORE,Negro,38,HG0000014,,Ingreso por compra
```

| Columna | Obligatoria | Regla |
|---|---|---|
| `arete` | No | Si falta, se genera con el esquema configurado. Letras, números y guiones (3–24). Único. |
| `nombre` | No | Texto libre. |
| `sexo` | **Sí** | `MACHO` o `HEMBRA`. |
| `fechaNacimiento` | No | `AAAA-MM-DD`, nunca futura. Sin ella la categoría queda como `SIN_CATEGORIA`. |
| `raza` | No | Código del catálogo (`BRAHMAN`, `NELORE`…). |
| `color` | No | Texto libre. |
| `pesoNacimientoKg` | No | Número entre 0 y 200. Se acepta coma decimal. |
| `madreArete` | No | Arete de una **hembra** existente o de otra fila del archivo. |
| `padreArete` | No | Arete de un **macho** existente o de otra fila del archivo. |
| `observaciones` | No | Texto libre. |

Detalles del formato:

- Separador: coma **o** punto y coma (se detecta solo).
- Comillas dobles para textos con separadores: `"Pérez; el bueno"`.
- Comillas escapadas: `"dice ""hola"""`.
- Encabezados sin tildes y en cualquier orden; se ignoran las columnas desconocidas (se informa cuáles).
- Codificación UTF-8, máximo 5.000 filas y 5 MB por archivo.

---

## 3. Validación previa (obligatoria)

```bash
curl -X POST http://localhost/api/v1/animales/importar \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"fincaId":"<uuid>","csv":"<contenido>","dryRun":true}'
```

Con `dryRun: true` (valor por defecto) **no se escribe nada**. La respuesta trae:

- `resumen`: filas, válidas, inválidas, creadas (0 en simulación);
- `errores`: `{ linea, campo, mensaje, valor }` por cada problema;
- `previsualizacion`: primeras 10 filas que sí se crearían.

Corrija el archivo y repita hasta que `errores` quede vacío.

---

## 4. Importación real

```bash
curl -X POST http://localhost/api/v1/animales/importar \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"fincaId":"<uuid>","csv":"<contenido>","dryRun":false}'
```

Reglas:

- **Todo o nada.** Si una sola fila es inválida, no se crea ningún animal: nadie se queda con media
  hacienda cargada y sin saber dónde se detuvo.
- Cada animal recibe su arete, su código de barras, su identificador en el historial, su estado inicial
  `activo` y su evento de auditoría.
- La genealogía se enlaza en una segunda pasada, cuando todos los animales del archivo ya existen.

---

## 5. Verificación posterior

1. `GET /api/v1/animales?limit=5` — el listado responde y las categorías derivadas tienen sentido.
2. Abra dos o tres fichas al azar: arete, sexo, fecha y raza deben coincidir con el origen.
3. `GET /api/v1/auditoria/verificar` — la cadena debe estar íntegra.
4. Cuente el hato: `GET /api/v1/animales?limit=1` → `total` debe ser el esperado.

Si el total no coincide, **no borre animales**: la baja es lógica (`anular`) y cada movimiento queda
auditado. Documente la diferencia y corríjala con eventos compensatorios.

---

## 6. Errores frecuentes

| Mensaje | Causa | Solución |
|---|---|---|
| `Falta la columna obligatoria: sexo` | Cabecera sin `sexo` | Añadir la columna |
| `El arete ya existe en la hacienda` | Animal duplicado | Revisar el origen; un identificador no se reutiliza |
| `Raza desconocida: X` | Código fuera de catálogo | Dar de alta la raza o corregir el valor |
| `El arete A es HEMBRA y debería ser MACHO` | Padre/madre mal asignado | Corregir la fila |
| `La fecha no puede ser futura` | Error de tecleo | Corregir la fecha |
| `El archivo debe tener cabecera y al menos una fila` | Archivo vacío o solo cabecera | Revisar el archivo |
