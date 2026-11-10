# Runbook — Instalación y alta de una finca

**Objetivo:** dejar la plataforma operando en el servidor de la hacienda y con una finca configurada.
**Cuándo:** primera instalación, reinstalación o alta de un predio nuevo.
**Tiempo estimado:** 3–5 h (incluye verificación y capacitación mínima).

> Este runbook se completa con los comandos reales en la Fase 1, cuando existan los servicios de aplicación.
> Lo que sigue es el procedimiento normativo y verificable.

---

## 1. Prerrequisitos (verificar antes de viajar)

- [ ] Servidor con la especificación de `docs/05` §1.1 (o superior).
- [ ] Linux LTS instalado, Docker y Docker Compose disponibles.
- [ ] UPS instalada y probada (desconectar corriente y verificar autonomía).
- [ ] Red local con acceso al puesto de pesaje; plan de direccionamiento anotado.
- [ ] Dominio o nombre local decidido; certificados según el modo TLS.
- [ ] Contraseñas iniciales generadas con `openssl rand -base64 48` (nunca `admin/admin`).
- [ ] Disco externo o NAS para respaldos, conectado y montado.

## 2. Instalación

```bash
# 1. Usuario de servicio y directorio
sudo adduser --system --group hacienda
sudo mkdir -p /opt/hacienda && sudo chown hacienda:hacienda /opt/hacienda

# 2. Código
sudo -u hacienda git clone https://github.com/MrCastilloF/Hacienda_Ganadera.git /opt/hacienda
cd /opt/hacienda
git checkout vX.Y.Z

# 3. Configuración
cp .env.example .env
chmod 600 .env
# Editar .env: cambios de contraseña, dominio, rutas de secretos, zona horaria

# 4. Secretos (nunca en el repositorio)
#    Generar claves JWT, CA de mTLS y credenciales; cargarlas en el gestor de secretos

# 5. Levantar
docker compose up -d
docker compose ps          # todo healthy

# 6. Migraciones y catálogos base
docker compose --profile app run --rm api pnpm run migrate
docker compose --profile app run --rm api pnpm run seed
```

## 3. Configuración funcional

1. Crear la finca: nombre, código, propietario, identificación, ubicación, moneda y unidades.
2. Configurar numeración de aretes (`RF-ANI-10`).
3. Dibujar potreros y fijar capacidades.
4. Revisar catálogos: razas, categorías, vacunas, enfermedades, medicamentos.
5. Crear usuarios con su rol y finca (mínimo: administrador, un operario, un veterinario).
6. Configurar reglas de alerta y destinatarios.
7. Si hay báscula: enrolar el Local Bridge y probar un pesaje (ver `basculas.md`).
8. Si hay LoRaWAN: provisionar gateway y tags (ver `lorawan.md`).

## 4. Verificación

| # | Verificación | Esperado |
|---|---|---|
| 1 | Login con cada rol | Acceso según permisos |
| 2 | Alta de un animal de prueba | Ficha completa |
| 3 | Pesaje con simulador | Registro y GDP |
| 4 | Respaldo manual | Archivo generado |
| 5 | Ensayo de restauración | Base restaurada (ver `restauracion.md`) |
| 6 | Corte de red | La PWA avisa y sigue registrando |
| 7 | Reinicio del servidor | Todo vuelve sin intervención |

## 5. Entrega

- Acta de instalación con: versión, fecha, hardware, responsable, verificaciones y pendientes.
- Capacitación mínima a los usuarios (pesaje, ficha del animal, alertas).
- Manual de usuario entregado y ubicado en el servidor.
- Contacto de soporte y procedimiento para reportar fallos.
