# ADR-0007: Gestión de secretos y ciclo de vida de dispositivos LoRaWAN

- **Estado:** Aceptada
- **Fecha:** 2026-11-10
- **Decisores:** Especialista en ciberseguridad, especialista IoT/LoRaWAN, arquitecto
- **Requisitos afectados:** v1 §30, §38; `HAL-26`, `RF-SEG-19`…`22`, `RF-IOT-15`

## Contexto

La red LoRaWAN se autentica con claves (AppKey/NwkKey en OTAA, o AppSKey/NwkSKey en ABP). Si esas claves se
filtran, un atacante puede suplantar un tag y generar posiciones o telemetría falsas — exactamente el dato que
el sistema prohíbe inventar (`INV-03`, `INV-04`).

La v1 exige "no almacenar claves raíz en texto plano", OTAA cuando sea posible y auditoría, pero no define
dónde viven las claves, quién las rota ni qué pasa cuando se pierde un dispositivo.

## Decisión

1. **Las claves nunca están en la base de datos ni en Git.** Viven en un gestor de secretos
   (Vault/SOPS + archivo cifrado para instalaciones pequeñas, variables inyectadas en tiempo de ejecución).
2. **OTAA preferente**; ABP solo con justificación escrita en el acta de integración.
3. **Ciclo de vida explícito**: `provisioned → active → suspended → retired`, con actor y motivo auditados.
4. **Rotación y revocación** con procedimiento documentado; revocar un dispositivo purga sus sesiones en el
   servidor LoRaWAN y marca sus últimas telemetrías como sospechosas.
5. **Claves de la aplicación** (JWT, certificados del bridge, credenciales SMTP) siguen la misma regla.
6. **Secret scanning en CI** bloquea cualquier patrón de credencial en el diff.

## Alternativas consideradas

| Alternativa | Ventajas | Desventajas | Motivo de descarte |
|---|---|---|---|
| Claves en `.env` sin cifrar en el servidor | Operación simple | Una copia del archivo compromete toda la red | Aceptable solo como mal menor con permisos 600, no como diseño |
| Claves en la base de datos | Cómodo | La base se respalda y se copia: la clave se propaga | Viola `RF-SEG-19` |
| Gestor de secretos dedicado (Vault) | Rotación, auditoría, control de acceso | Complejidad operativa | Adoptado para producción; SOPS para instalaciones mínimas |
| **Gestor de secretos + SOPS como mínimo** | Seguridad real, operable a escala pequeña | Requiere procedimiento | **Adoptada** |

## Consecuencias

**Positivas**
- Comprometer un backup de la base no expone claves LoRaWAN.
- Un tag robado se revoca sin recompilar ni redesplegar.

**Negativas / costos asumidos**
- Hay un componente más que respaldar y operar (las claves).
- Si se pierde la clave de un dispositivo sin notas, el dispositivo debe reprovisionarse.

**Riesgos residuales**
- Pérdida del gestor de secretos ⇒ pérdida de acceso a la red LoRaWAN. Mitigación: copia cifrada offline en
  sobre sellado, con procedimiento de recuperación documentado.

## Cumplimiento

- `ci` job `secrets` con `gitleaks` y patrones propios (DevEUI/AppKey, `BEGIN PRIVATE KEY`, `password=`).
- Revisión: ningún PR puede agregar una credencial, ni siquiera de prueba.
- Prueba: intento de conexión LoRaWAN con clave inexistente falla y queda auditado.

## Referencias

- `docs/01-especificacion-corregida.md` §11.5 y §12.4
- `HAL-26` en `docs/00-validacion-de-la-especificacion.md`
