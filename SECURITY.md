# Política de seguridad

## Versiones soportadas

| Versión | Soportada |
|---|---|
| `0.x` (fases 0–12) | Sí, desarrollo activo |
| `< 0.1` | No |

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Escribe al titular del repositorio en GitHub (`MrCastilloF`) o usa el canal
privado que se acuerde con el cliente, con:

1. Descripción de la vulnerabilidad y su impacto.
2. Pasos de reproducción o prueba de concepto.
3. Versión afectada y entorno.
4. Mitigación sugerida, si la conoces.

Compromiso de respuesta:

| Etapa | Plazo objetivo |
|---|---|
| Acuse de recibo | 72 h |
| Clasificación y severidad | 7 días |
| Corrección (crítica) | 7 días desde la clasificación |
| Corrección (alta) | 30 días |
| Divulgación | Coordinada, después de la corrección |

## Alcance

Dentro de alcance: API, web, Local Bridge, servicio de ingesta IoT, esquema de base de datos, configuración de
Docker y del proxy, gestión de secretos.

Fuera de alcance: ingeniería social, ataques físicos al servidor, denegación de servicio volumétrica contra la
red de la hacienda, vulnerabilidades en dependencias sin exploit demostrable (se reportan por Dependabot).

## Controles implementados

| Área | Control |
|---|---|
| Autenticación | Argon2id, JWT corto + refresh rotativo, MFA TOTP, bloqueo por intentos |
| Autorización | RBAC con alcance verificado en el backend; sin IDOR entre fincas |
| Transporte | TLS 1.2+, HSTS, mTLS para el Local Bridge |
| Aplicación | Validación de entrada, CSP, CSRF, rate limiting, errores sin fuga |
| Datos | Cifrado en reposo, PII con crypto-shredding, roles de BD sin superusuario |
| Inmutabilidad | Append-only + cadena de hashes verificada a diario |
| Dispositivos | Enrolamiento, rotación y revocación de claves, dedupe de mensajes |
| Cadena de suministro | Secret scanning, Dependabot, auditoría de dependencias en CI |
| Operación | Respaldos verificados, ensayo de restauración mensual, runbook de incidentes |

## Reglas para contribuir

- Nunca incluir credenciales, tokens, claves privadas ni datos personales reales.
- Los secretos van al gestor de secretos, no a `.env` versionados ni a la base de datos.
- Cualquier reporte de seguridad se trata como confidencial hasta su corrección.

## Divulgación

Se publicará un aviso en `CHANGELOG.md` (sección `Seguridad`) una vez corregida la vulnerabilidad, con crédito
al reportante si lo autoriza.
