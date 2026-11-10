# Manuales

Documentación operativa para las personas que usan y administran la plataforma. No es documentación técnica:
está escrita para quien opera la hacienda, no para quien programa.

| Manual | Contenido | Fase | Estado |
|---|---|---|---|
| `instalacion.md` | Instalación del servidor y primer arranque | F1 | Pendiente |
| `administracion.md` | Usuarios, roles, permisos, fincas, catálogos, respaldos | F2 | Pendiente |
| `usuario.md` | Ficha del animal, pesaje, salud, reportes, uso en campo | F4 | Pendiente |
| `basculas.md` | Conexión de básculas, protocolos, calibración, diagnóstico | F3 | Pendiente |
| `lorawan.md` | Gateways, tags, perfiles, cobertura, resolución de problemas | F9 | Pendiente |
| `offline.md` | Trabajo sin conexión, sincronización, conflictos | F12 | Pendiente |
| `plantillas/` | Plantillas de importación CSV/XLSX | F2 | Pendiente |

## Reglas de redacción

1. Escrito para el operario, no para el programador: sin jerga innecesaria.
2. Cada procedimiento con pasos numerados y una captura o salida esperada.
3. Cada manual declara **qué NO puede hacer el sistema** (por ejemplo: no inventa posiciones, no valida
   hardware que no existe).
4. Ejemplos con datos ficticios, nunca con datos reales de la hacienda.
5. Se actualiza en el mismo PR que cambia el comportamiento que describe.

## Actas de integración

`integraciones/` guarda un acta por dispositivo verificado, con: marca, modelo, transporte, protocolo,
estado (`lab_verified` o `field_verified`), fecha, responsable, pruebas ejecutadas y resultado. Sin acta, un
dispositivo no puede declararse verificado (`INV-09`).
