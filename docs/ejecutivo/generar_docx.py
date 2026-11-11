"""Genera el informe ejecutivo en formato Word (.docx) con formato corporativo.

Se construye con python-docx para no depender de Microsoft Word.
"""
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

VERDE = RGBColor(0x2F, 0x4F, 0x2F)
VERDE_CLARO = RGBColor(0x3F, 0x5C, 0x34)
GRIS = RGBColor(0x4B, 0x55, 0x63)
VERDE_OK = RGBColor(0x16, 0x65, 0x34)
AMBAR = RGBColor(0x92, 0x40, 0x0E)
ROJO = RGBColor(0x99, 0x1B, 0x1B)

doc = Document()

# ── Página y estilos base ────────────────────────────────────────────────────
seccion = doc.sections[0]
seccion.page_height = Cm(29.7)
seccion.page_width = Cm(21.0)
seccion.top_margin = Cm(2.2)
seccion.bottom_margin = Cm(2.0)
seccion.left_margin = Cm(2.0)
seccion.right_margin = Cm(2.0)

normal = doc.styles["Normal"]
normal.font.name = "Arial"
normal.font.size = Pt(10.5)
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.15

for nivel, tam, color in ((1, 17, VERDE), (2, 13, VERDE_CLARO), (3, 11, GRIS)):
    estilo = doc.styles[f"Heading {nivel}"]
    estilo.font.name = "Arial"
    estilo.font.size = Pt(tam)
    estilo.font.color.rgb = color
    estilo.font.bold = True
    estilo.paragraph_format.space_before = Pt(14 if nivel == 1 else 10)
    estilo.paragraph_format.space_after = Pt(6)


def parrafo(texto="", negrita=False, tam=None, color=None, alineacion=None, espacio_despues=None):
    p = doc.add_paragraph()
    run = p.add_run(texto)
    run.bold = negrita
    if tam:
        run.font.size = Pt(tam)
    if color:
        run.font.color.rgb = color
    if alineacion:
        p.alignment = alineacion
    if espacio_despues is not None:
        p.paragraph_format.space_after = Pt(espacio_despues)
    return p


def vineta(texto, negrita_hasta=None):
    p = doc.add_paragraph(style="List Bullet")
    if negrita_hasta:
        r = p.add_run(negrita_hasta)
        r.bold = True
        p.add_run(texto)
    else:
        p.add_run(texto)
    p.paragraph_format.space_after = Pt(3)
    return p


def tabla(cabeceras, filas, anchos=None, estados=None):
    """Tabla con cabecera sombreada. `estados` pinta la última columna."""
    t = doc.add_table(rows=1, cols=len(cabeceras))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER

    encabezado = t.rows[0].cells
    for i, texto in enumerate(cabeceras):
        encabezado[i].text = ""
        p = encabezado[i].paragraphs[0]
        r = p.add_run(texto)
        r.bold = True
        r.font.size = Pt(9.5)
        r.font.color.rgb = VERDE
        sombrear(encabezado[i], "EEF2EA")

    for fila in filas:
        celdas = t.add_row().cells
        for i, valor in enumerate(fila):
            celdas[i].text = ""
            p = celdas[i].paragraphs[0]
            r = p.add_run(str(valor))
            r.font.size = Pt(9.5)
            if estados and i == len(fila) - 1:
                texto = str(valor).lower()
                if texto.startswith(("completa", "entregado")):
                    r.font.color.rgb = VERDE_OK
                    r.bold = True
                elif texto.startswith(("sin iniciar", "pendiente")):
                    r.font.color.rgb = ROJO
                    r.bold = True
                elif "%" in texto:
                    r.font.color.rgb = AMBAR
                    r.bold = True

    if anchos:
        for fila_t in t.rows:
            for i, ancho in enumerate(anchos):
                fila_t.cells[i].width = Cm(ancho)
    return t


def sombrear(celda, hex_color):
    tc_pr = celda._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tc_pr.append(shd)


def caja(texto, color_borde="3F5C34", relleno="F6F8F4"):
    t = doc.add_table(rows=1, cols=1)
    t.style = "Table Grid"
    celda = t.rows[0].cells[0]
    celda.text = ""
    p = celda.paragraphs[0]
    p.add_run(texto).font.size = Pt(10)
    sombrear(celda, relleno)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def salto():
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


# ── Portada ──────────────────────────────────────────────────────────────────
for _ in range(6):
    doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("CONTROLES EMPRESARIALES")
r.font.size = Pt(10)
r.font.color.rgb = GRIS
r.bold = True

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Plataforma Hacienda Ganadera")
r.font.size = Pt(26)
r.font.color.rgb = VERDE
r.bold = True

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Informe ejecutivo del proyecto")
r.font.size = Pt(14)
r.font.color.rgb = GRIS

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Alcance entregado, pendientes y conclusiones")
r.font.size = Pt(12)
r.font.color.rgb = GRIS

for _ in range(5):
    doc.add_paragraph()

for etiqueta, valor in (
    ("Documento", "INF-HG-2026-01"),
    ("Versión del producto", "v0.5.3"),
    ("Repositorio", "github.com/MrCastilloF/Hacienda_Ganadera (privado)"),
    ("Fecha", "11 de noviembre de 2026"),
    ("Estado", "Fases 0 a 5 en desarrollo; 3 completas"),
):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r1 = p.add_run(f"{etiqueta}: ")
    r1.bold = True
    r1.font.size = Pt(10)
    r2 = p.add_run(valor)
    r2.font.size = Pt(10)

salto()

# ── 1. Resumen ejecutivo ─────────────────────────────────────────────────────
doc.add_heading("1. Resumen ejecutivo", level=1)

parrafo(
    "Se ha construido la base funcional de una plataforma web para la gestión integral de una hacienda "
    "ganadera, orientada a tres problemas concretos del negocio: saber qué animales hay, saber cuánto pesan "
    "y cómo crecen, y saber cuándo se pueden vender con seguridad sanitaria."
)
parrafo(
    "La plataforma está operativa de punta a punta en entorno local y de contenedores: registro e "
    "identificación de animales con genealogía validada, importación del hato existente desde CSV, pesaje "
    "inmutable con deduplicación, crecimiento y ganancia diaria, y tratamientos veterinarios que bloquean la "
    "venta mientras el periodo de retiro esté vigente."
)

doc.add_heading("Indicadores principales del repositorio", level=3)
tabla(
    ["Indicador", "Valor"],
    [
        ("Commits", "36"),
        ("Versiones publicadas", "17 (v0.1.0 a v0.5.3)"),
        ("Rutas de API documentadas", "42"),
        ("Pruebas automatizadas", "155"),
        ("Migraciones de base de datos", "9"),
        ("Líneas de backend", "6.322"),
        ("Líneas de frontend", "2.206"),
        ("Líneas de documentación", "4.377"),
    ],
    anchos=[9.0, 6.5],
)

parrafo(
    "El trabajo se organizó en doce fases. Tres están cerradas (especificación, plataforma base y animales), "
    "dos están muy avanzadas (báscula y crecimiento) y una tercera está a tres cuartas partes (salud). El "
    "resto depende de decisiones de negocio o de hardware que se detallan en la sección 7."
)
caja(
    "MENSAJE CENTRAL: el sistema no inventa datos. Un peso simulado se marca como simulado, un retiro de "
    "medicamento bloquea la venta, un pesaje no se puede editar y toda operación queda en una cadena de "
    "auditoría verificable. Esa disciplina es la diferencia entre un registro útil y un registro que hay que "
    "rehacer."
)

# ── 2. Contexto ──────────────────────────────────────────────────────────────
doc.add_heading("2. Contexto y objetivo", level=1)
parrafo(
    "La operación ganadera se apoya históricamente en cuadernos, hojas de cálculo aisladas y memoria del "
    "personal. Eso produce tres fallos recurrentes: inventarios que no cuadran, decisiones de venta tomadas "
    "sin saber si el animal cumplió el retiro de un medicamento, y pérdida de la trazabilidad cuando cambia "
    "el personal."
)
parrafo("El objetivo del proyecto es sustituir ese esquema por una plataforma que:", espacio_despues=4)
vineta(" mantenga una ficha única por animal con identificación no reutilizable;", "Ficha única:")
vineta(" registre el peso como medición inmutable, no como dato editable;", "Peso confiable:")
vineta(" bloquee operaciones inseguras (vender un animal tratado) en el dominio, no en la pantalla;", "Bloqueo preventivo:")
vineta(" funcione en campo, con conectividad intermitente y equipos modestos;", "Operación rural:")
vineta(" deje evidencia auditable de quién hizo qué y cuándo.", "Trazabilidad:")

# ── 3. Alcance entregado ─────────────────────────────────────────────────────
doc.add_heading("3. Alcance entregado", level=1)

doc.add_heading("3.1 Fase 1 — Plataforma base", level=2)
parrafo(
    "Monorepo con API NestJS y frontend Next.js, PostgreSQL con PostGIS, Docker Compose, autenticación con "
    "JWT de vida corta y refresco rotativo, segundo factor TOTP, control de acceso por roles con alcance "
    "(global, finca, lote, propio) y auditoría encadenada por hash con verificación y detección de "
    "alteraciones."
)
tabla(
    ["Capacidad", "Estado", "Evidencia"],
    [
        ("Autenticación con MFA y bloqueo por intentos", "Entregado", "16 pruebas de integración"),
        ("Roles y permisos por recurso y acción", "Entregado", "72 permisos, 238 asignaciones"),
        ("Auditoría encadenada inalterable", "Entregado", "Trigger + verificación de cadena íntegra"),
        ("Despliegue en contenedores y CI/CD", "Entregado", "4 flujos en GitHub Actions"),
    ],
    anchos=[7.0, 3.2, 6.0],
    estados=True,
)

doc.add_heading("3.2 Fase 2 — Animales e identificación", level=2)
parrafo(
    "Ficha única del animal con arete y código de barras generados según esquema configurable, historial de "
    "identificadores que impide la reutilización de un arete dado de baja, genealogía con validación de sexo, "
    "fechas y detección de ciclos, categoría derivada por edad y sexo calculada con el mismo criterio en base "
    "de datos y en código, búsqueda por arete o nombre, e importación del hato desde CSV con validación previa "
    "obligatoria y escritura todo-o-nada."
)

doc.add_heading("3.3 Fase 3 — Báscula y pesaje", level=2)
parrafo(
    "Contrato de adaptador de báscula versionado, con un adaptador ASCII configurable que interpreta los "
    "formatos habituales de indicadores de ganado. Detección de peso estable por ventana temporal, tolerancia "
    "y número mínimo de muestras. Simulador con cinco escenarios (animal quieto, animal que se mueve, "
    "sobrecarga, trama corrupta, equipo desconectado) que alimenta la misma cadena que un pesaje real y queda "
    "marcado como origen simulado. Pesaje inmutable, idempotente y deduplicado por ventana de sesenta "
    "segundos, con anulación mediante evento compensatorio y motivo."
)

doc.add_heading("3.4 Fase 4 — Crecimiento y reportes", level=2)
parrafo(
    "Ganancia diaria de peso calculada entre pesajes reales, excluyendo duplicados y anulados. Clasificación "
    "por categoría frente a un rango de referencia declarado. Reporte de finca con los animales de crecimiento "
    "bajo primero, curva de peso por animal con sus tramos y proyección lineal siempre acompañada de "
    "advertencia de que es una extrapolación, no un pronóstico validado. Interfaz web con búsqueda, filtros y "
    "gráfico sin dependencias externas."
)

doc.add_heading("3.5 Fase 5 — Salud (primer corte)", level=2)
parrafo(
    "Tratamientos veterinarios inmutables con medicamento, dosis, vía, diagnóstico y días de retiro. El fin de "
    "retiro se calcula al registrar y se guarda, de modo que un cambio futuro de regla no reescribe el pasado. "
    "La máquina de estados rechaza vender o sacrificar un animal con retiro vigente, indicando el medicamento, "
    "los días restantes y la fecha exacta. Catálogo de referencia de ocho medicamentos con retiros para carne "
    "y leche, declarado explícitamente como no oficial."
)

# ── 4. Arquitectura ──────────────────────────────────────────────────────────
doc.add_heading("4. Arquitectura y decisiones técnicas", level=1)
tabla(
    ["Decisión", "Motivo", "Consecuencia"],
    [
        (
            "SQL como fuente de verdad del esquema; Prisma solo como cliente tipado",
            "Las migraciones deben ser revisables y auditables",
            "Nunca se usa db push; toda tabla pasa por migración revisada",
        ),
        (
            "Inmutabilidad en la base, no en el código",
            "Una regla que solo vive en la aplicación se salta con otra aplicación",
            "Pesajes, tratamientos e historiales rechazan UPDATE y DELETE por trigger y por permisos",
        ),
        (
            "Auditoría encadenada por hash",
            "Un registro de auditoría editable no es auditoría",
            "Cada evento depende del anterior; la verificación detecta alteraciones incluso de un superusuario",
        ),
        (
            "Protocolo de báscula como dato, no como código",
            "Agregar una marca no debe obligar a tocar el sistema",
            "Sin adaptador registrado se informa «no soportado» en lugar de inventar soporte",
        ),
        (
            "Origen explícito del dato en toda medición",
            "Confundir un dato simulado con uno real es el peor fallo posible",
            "Pesajes y tratamientos llevan origen: campo, simulado, importado o manual",
        ),
    ],
    anchos=[5.0, 5.5, 5.7],
)

# ── 5. Verificación ──────────────────────────────────────────────────────────
doc.add_heading("5. Verificación y evidencia", level=1)
parrafo(
    "La entrega no se apoya en afirmaciones sino en verificaciones reproducibles. Cada versión publicada pasó "
    "por integración continua, construcción de imágenes de contenedor y una prueba de humo que arranca el "
    "sistema desde cero, aplica las migraciones, siembra los catálogos, inicia sesión y verifica la cadena de "
    "auditoría."
)
tabla(
    ["Verificación", "Resultado"],
    [
        ("Pruebas automatizadas", "155 (62 unitarias, 24 del paquete de básculas, 69 de integración)"),
        ("Integración continua", "En verde en las ramas principal y de desarrollo"),
        ("Construcción de imágenes", "API y web publicadas en el registro de contenedores"),
        ("Prueba de humo en contenedor", "Arranque, migraciones, inicio de sesión y auditoría íntegra"),
        ("Verificación de cadena de auditoría", "Íntegra tras todas las operaciones"),
        ("Dependencias de producción", "Sin vulnerabilidades altas ni críticas"),
        ("Detección de secretos", "Sin secretos en el repositorio"),
    ],
    anchos=[6.5, 9.7],
    estados=True,
)

doc.add_heading("5.1 Defectos encontrados durante la ejecución", level=2)
parrafo("Se documentan porque su naturaleza es más elocuente que el listado de funcionalidades:")
tabla(
    ["Defecto", "Impacto potencial", "Detectado por"],
    [
        ("Dígito de verificación del arete inválido con prefijos alfabéticos", "Arete incorrecto en el alta", "Prueba unitaria"),
        (
            "Edad calculada por días promedio en lugar de meses calendario",
            "Animales clasificados en la categoría equivocada",
            "Prueba de límites (12 y 24 meses)",
        ),
        ("Imagen de contenedor compilaba pero no arrancaba", "Despliegue roto en producción", "Prueba de humo en contenedor"),
        ("Módulo de animales sin registrar en el módulo raíz", "Todas las rutas respondían «no encontrado»", "Pruebas de integración"),
        ("Unidad de peso pegada al número no se detectaba", "Pesos en libras leídos como kilogramos", "Prueba del adaptador"),
        (
            "Trama con campos entrecomillados producía un peso inventado",
            "Registro de un peso que nunca existió",
            "Prueba del adaptador",
        ),
    ],
    anchos=[6.2, 5.5, 4.5],
)
parrafo(
    "La conclusión relevante: los defectos graves fueron de integración y de empaquetado, no de lógica de "
    "negocio. El dominio resistió; el riesgo estuvo en el borde."
)

# ── 6. Estado por fase ───────────────────────────────────────────────────────
doc.add_heading("6. Estado por fase", level=1)
tabla(
    ["Fase", "Contenido", "Estado"],
    [
        ("F0", "Validación de la especificación, arquitectura, repositorio y CI", "Completa"),
        ("F1", "Plataforma base, seguridad, autenticación, roles y auditoría", "Completa"),
        ("F2", "Animales, identificación, genealogía e importación del hato", "Completa"),
        ("F3", "Báscula, protocolos y pesaje", "80 % — falta el agente local (hardware)"),
        ("F4", "Pesajes, crecimiento y reportes", "85 % — falta exportación y costo por kilo"),
        ("F5", "Veterinaria y salud", "75 % — falta vacunas y calendario sanitario"),
        ("F6", "Reproducción, nacimientos y genética", "Sin iniciar"),
        ("F7", "Alimentación, potreros y movimientos", "Sin iniciar"),
        ("F8", "Compras, ventas y finanzas", "Sin iniciar"),
        ("F9", "LoRaWAN, etiquetas y pasarelas", "Sin iniciar"),
        ("F10", "GPS, mapas y geocercas", "Sin iniciar"),
        ("F11", "Panel, notificaciones y analítica", "Sin iniciar"),
        ("F12", "Modo sin conexión, endurecimiento, carga y despliegue", "Sin iniciar"),
    ],
    anchos=[1.6, 9.6, 5.0],
    estados=True,
)
parrafo(
    "Resumen: 3 fases completas, 3 parciales y 6 sin iniciar. En volumen de funcionalidad, la plataforma cubre "
    "el ciclo de trazabilidad básico (identidad del animal, peso, crecimiento y sanidad), que es "
    "aproximadamente un tercio del alcance total definido."
)

# ── 7. Pendientes ────────────────────────────────────────────────────────────
doc.add_heading("7. Pendientes y bloqueos", level=1)
tabla(
    ["Pendiente", "Fase", "Bloqueo", "Responsable"],
    [
        ("Agente local de báscula (conexión física, cola durable, enrolamiento)", "F3", "Marca, modelo y tramas del equipo", "Cliente + desarrollo"),
        ("Verificación con báscula real", "F3", "Ídem anterior", "Cliente"),
        ("Peso en vivo en la pantalla de pesaje", "F3", "Depende del agente local", "Desarrollo"),
        ("Exportación de reportes a Excel y PDF", "F4", "Ninguno", "Desarrollo"),
        ("Costo por kilo producido", "F4", "Depende de compras y ventas (F8)", "Desarrollo"),
        ("Vacunas y calendario sanitario", "F5", "Validación del plan sanitario", "Cliente + desarrollo"),
        ("Catálogo oficial de medicamentos", "F5", "País y autoridad sanitaria", "Cliente"),
        ("Facturación electrónica", "F9", "Proveedor y normativa", "Cliente"),
        ("Sensores y geolocalización", "F9-F10", "Decisión de hardware", "Cliente"),
    ],
    anchos=[5.8, 1.3, 5.0, 4.1],
)
caja(
    "DECISIÓN CRÍTICA: la marca, modelo y protocolo de la báscula es el único bloqueo que impide cerrar la "
    "Fase 3. Todo lo demás de esa fase está construido y probado contra el simulador; el día que se conozca "
    "el equipo, se ajusta la configuración y se valida en campo sin reescribir código.",
    relleno="FFFBEB",
)

# ── 8. Riesgos ───────────────────────────────────────────────────────────────
doc.add_heading("8. Riesgos y deuda técnica", level=1)
tabla(
    ["Riesgo", "Nivel", "Mitigación actual", "Acción recomendada"],
    [
        ("Dependencia de una sola persona con conocimiento del sistema", "Alto", "Documentación extensa y decisiones registradas", "Transferencia formal y revisión de código por un segundo desarrollador"),
        ("Alertas de dependencias de desarrollo sin revisar", "Medio", "Análisis de dependencias de producción limpio", "Habilitar el permiso de alertas de seguridad y revisarlas"),
        ("Sin pruebas de carga", "Medio", "Arquitectura preparada para volumen", "Pruebas de carga antes de producción (F12)"),
        ("Base de datos local distinta a la de producción", "Bajo", "Validación en contenedor en cada versión", "Homologar versiones antes del despliegue"),
        ("Modo sin conexión limitado a la interfaz", "Medio", "Estructura preparada, sincronización pendiente", "Completar en F12 con cola local de operaciones"),
        ("Datos de referencia declarados (retiros, rangos de crecimiento)", "Medio", "Marcados como referencia en API e interfaz", "Reemplazar por fuentes oficiales validadas por el cliente"),
    ],
    anchos=[4.6, 1.4, 4.6, 5.6],
)

# ── 9. Conclusiones ──────────────────────────────────────────────────────────
doc.add_heading("9. Conclusiones", level=1)

for titulo, texto in (
    (
        "Primera.",
        " La plataforma resuelve el núcleo del problema operativo: identidad trazable del animal, peso confiable "
        "y control sanitario que impide vender un animal tratado. Ese conjunto ya tiene valor de uso: puede "
        "reemplazar el cuaderno y la hoja de cálculo en el registro diario.",
    ),
    (
        "Segunda.",
        " La calidad se apoyó en restricciones de base de datos y no en disciplina del programador. Los pesajes, "
        "tratamientos e historiales son inmutables por diseño; la auditoría se encadena por hash. Esto significa "
        "que el sistema puede demostrar lo que afirma, incluso frente al propio administrador.",
    ),
    (
        "Tercera.",
        " El proyecto prefirió declarar sus supuestos antes que esconderlos. Los retiros de medicamentos, los "
        "rangos de crecimiento y el perfil de báscula están marcados como referencia declarada en el código, en la "
        "interfaz y en los registros de auditoría. Un número equivocado visible es corregible; uno equivocado "
        "silencioso, no.",
    ),
    (
        "Cuarta.",
        " El ritmo de entrega fue alto (17 versiones publicadas), y el patrón de errores demuestra dónde está el "
        "riesgo real: no en las reglas del negocio, sino en la integración entre piezas —módulos, contenedores, "
        "empaquetado. La inversión correcta a partir de ahora es en verificación automatizada de extremo a "
        "extremo, no en más funcionalidad.",
    ),
    (
        "Quinta.",
        " El alcance restante es sustancial: seis fases sin iniciar, entre ellas todo el componente financiero y "
        "el de hardware avanzado. Sin decisiones del cliente sobre báscula, país de operación y facturación, el "
        "avance adicional corre el riesgo de construirse sobre supuestos que haya que deshacer.",
    ),
):
    p = doc.add_paragraph()
    r = p.add_run(titulo)
    r.bold = True
    p.add_run(texto)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

# ── 10. Recomendaciones ──────────────────────────────────────────────────────
doc.add_heading("10. Recomendaciones y próximos pasos", level=1)

doc.add_heading("10.1 Inmediato (sin dependencias externas)", level=2)
vineta(" a Excel y PDF, para cerrar la Fase 4 y permitir el trabajo fuera del sistema.", "Exportación de reportes")
vineta(" para cerrar la Fase 5 con un plan validado por el veterinario del cliente.", "Vacunas y calendario sanitario")
vineta(" sobre los flujos críticos: alta, pesaje, venta bloqueada e importación.", "Pruebas de extremo a extremo")

doc.add_heading("10.2 Con decisión del cliente", level=2)
vineta(" confirmar marca, modelo y tramas para construir el agente local y validar en campo.", "Báscula")
vineta(" definir el catálogo oficial de medicamentos y los requisitos de facturación.", "País de operación")
vineta(" decidir si se usan sensores y geolocalización propios o de terceros.", "Hardware de campo")

doc.add_heading("10.3 Antes de la puesta en producción", level=2)
vineta(" con volumen realista de animales y pesajes.", "Pruebas de carga")
vineta(" entre entorno de desarrollo y producción.", "Homologación de versiones")
vineta(" y plan de actualización de dependencias.", "Revisión de alertas de seguridad")
vineta(
    " en las tres pantallas de uso diario: animales, pesaje y salud.",
    "Capacitación del personal de campo",
)
vineta(" con una prueba real de recuperación.", "Respaldo y restauración verificados")

caja(
    "CONCLUSIÓN FINAL. El proyecto entregó una base sólida, verificada y honesta sobre lo que sabe y lo que no "
    "sabe. La recomendación es cerrar las tres fases parciales antes de abrir nuevas: un sistema que hace bien "
    "tres cosas y las declara completas vale más que uno que hace diez a medias."
)

doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run(
    "Informe ejecutivo · Plataforma Hacienda Ganadera · v0.5.3 · 11 de noviembre de 2026\n"
    "Cifras verificadas contra el repositorio: 36 commits, 17 versiones, 42 rutas de API, 155 pruebas."
)
r.font.size = Pt(8.5)
r.font.color.rgb = GRIS

doc.save("Informe-Ejecutivo-Hacienda-Ganadera.docx")
print("DOCX generado")
