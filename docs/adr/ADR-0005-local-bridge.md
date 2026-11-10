# ADR-0005: Local Bridge con mTLS y adaptadores versionados

- **Estado:** Aceptada
- **Fecha:** 2026-11-10
- **Decisores:** Arquitecto de software, especialista en integración de hardware, especialista en ciberseguridad
- **Requisitos afectados:** v1 §8, §9; `HAL-04`, `HAL-05`; `RF-BAS-01`…`08`, `RF-BRG-01`…`10`

## Contexto

El navegador no puede acceder a una báscula por puerto serie. Se necesita un componente instalado en el PC de
pesaje que lea hardware, detecte estabilidad y entregue el peso al ERP, funcionando sin Internet.

Ese componente tiene acceso a la red interna, se instala en un PC que puede no estar endurecido y puede
inyectar pesajes: es una **frontera de seguridad**, no una utilidad. La v1 lo describe por capacidades pero no
define su contrato: cómo se autentica, cómo se enrola, cómo evita duplicados y cómo se actualiza.

## Decisión

1. **Aplicación Node.js + TypeScript** con servicio en segundo plano, bandeja del sistema y arranque
   automático.
2. **Enrolamiento con código de un solo uso** emitido por un usuario con `administrar_dispositivos`; el bridge
   recibe un certificado de cliente (**mTLS**) y un `bridge_id` estable.
3. **Sin puertos entrantes:** el bridge se conecta a la PWA por `localhost` y sale al ERP por WSS con mTLS.
   Nunca se expone a Internet.
4. **Cola local durable en SQLite**, firmada e idempotente; sobrevive a cortes de red y reinicios.
5. **Adaptadores versionados** (`ScaleProtocolAdapter v1`): agregar una marca no toca el ERP; se registra el
   adaptador y se declara el estado de integración.
6. **Toda lectura guarda la trama cruda** aceptada (`RF-BAS-06`), para auditoría y diagnóstico.
7. **Actualización firmada** con verificación de integridad y posibilidad de reversión.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas | Motivo de descarte |
|---|---|---|---|
| Web Serial / WebUSB en el navegador | Cero instalación | Soporte limitado (Chrome), sin servicio, sin cola durable, sin acceso a RS485 nativo | Solo como respaldo opcional (`RF-BRG-10`) |
| Bridge como servicio central en el servidor | Un solo punto | No hay acceso físico al puerto serie de la báscula | Inviable |
| App de escritorio Electron | UI propia | Peso, actualizaciones complejas, superficie mayor | El bridge no necesita UI rica |
| Token estático en archivo de configuración | Simple | Si se copia, cualquiera pesa; no revocable | Falla de seguridad |
| **Bridge Node + mTLS + enrolamiento** | Seguro, revocable, sin inbound, compartir librería con el ERP | Requiere PKI interna y proceso de instalación | **Adoptada** |

## Consecuencias

**Positivas**
- La báscula queda aislada del ERP: el protocolo vive en un adaptador.
- Un bridge robado o clonado no puede inyectar datos sin certificado válido.
- El pesaje no se pierde si se corta la red: la cola está en disco.

**Negativas / costos asumidos**
- Hay que gestionar una PKI interna (CA local, emisión y revocación de certificados).
- El instalador debe manejar servicios, permisos y actualizaciones por sistema operativo.
- Un certificado caducado detiene el pesaje: la UI del bridge debe avisar con antelación (30/15/7 días).

**Riesgos residuales**
- PC de pesaje comprometido con certificado válido: se detecta por anomalías (volumen, horario, trama) y se
  puede revocar el certificado en segundos.

## Cumplimiento

- Pruebas de mTLS: sin certificado, certificado revocado, certificado de otro bridge ⇒ rechazo.
- Prueba de supervivencia: matar el proceso, reiniciar, la cola conserva los comandos.
- Contrato de mensajes versionado en `packages/scale-protocols` + pruebas de contrato.

## Referencias

- `docs/02-arquitectura.md` §10
- `docs/01-especificacion-corregida.md` §11.2 y §11.3
- `HAL-04`, `HAL-05` en `docs/00-validacion-de-la-especificacion.md`
