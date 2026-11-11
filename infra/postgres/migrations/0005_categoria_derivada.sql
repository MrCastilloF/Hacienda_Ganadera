-- =============================================================================
--  0005 · Categoría derivada del animal
--
--  La categoría del hato no es un campo editable: se calcula (AMB-07). Se
--  implementa en SQL para poder filtrar y ordenar en la base sin traer todo el
--  hato a memoria, y para que la regla sea la misma en todos los consumidores.
-- =============================================================================

SET search_path = app, public;

CREATE OR REPLACE FUNCTION app.edad_meses(
  p_nacimiento date,
  p_referencia date DEFAULT CURRENT_DATE
) RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app AS $$
  SELECT CASE
    WHEN p_nacimiento IS NULL THEN NULL
    WHEN p_nacimiento > p_referencia THEN NULL
    ELSE floor((p_referencia - p_nacimiento)::numeric / 30.4375)::integer
  END;
$$;

CREATE OR REPLACE FUNCTION app.categoria_de(
  p_sexo text,
  p_nacimiento date,
  p_estado_productivo text DEFAULT NULL,
  p_referencia date DEFAULT CURRENT_DATE
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app AS $$
  WITH datos AS (
    SELECT app.edad_meses(p_nacimiento, p_referencia) AS meses,
           upper(coalesce(p_estado_productivo, '')) AS productivo
  )
  SELECT CASE
    WHEN meses IS NULL THEN 'SIN_CATEGORIA'
    WHEN p_sexo = 'HEMBRA' AND meses < 12 THEN 'TERNERA'
    WHEN p_sexo = 'HEMBRA' AND meses < 24 THEN 'NOVILLA'
    WHEN p_sexo = 'HEMBRA' THEN 'VACA'
    WHEN p_sexo = 'MACHO' AND meses < 12 THEN 'TERNERO'
    WHEN p_sexo = 'MACHO' AND meses < 24 THEN 'NOVILLO'
    WHEN p_sexo = 'MACHO' AND productivo IN ('REPRODUCTOR','TORO','REPRODUCCION') THEN 'TORO'
    ELSE 'CEBA'
  END
  FROM datos;
$$;

COMMENT ON FUNCTION app.categoria_de IS
  'Categoría derivada del animal (sexo + edad + estado productivo). Una sola definición para toda la plataforma.';

CREATE OR REPLACE VIEW app.v_animal_resumen AS
SELECT
  a.id,
  a.finca_id,
  a.arete,
  a.codigo_barras,
  a.rfid,
  a.nombre,
  a.sexo,
  a.fecha_nacimiento,
  app.edad_meses(a.fecha_nacimiento) AS edad_meses,
  app.categoria_de(a.sexo, a.fecha_nacimiento, a.estado_productivo) AS categoria_codigo,
  a.estado,
  a.estado_productivo,
  a.condicion_corporal,
  a.lote_id,
  l.nombre AS lote_nombre,
  a.raza_id,
  r.nombre AS raza_nombre,
  a.madre_id,
  a.padre_id,
  a.deleted_at,
  a.created_at,
  a.updated_at
FROM app.animal a
LEFT JOIN app.lote l ON l.id = a.lote_id
LEFT JOIN app.raza r ON r.id = a.raza_id;

COMMENT ON VIEW app.v_animal_resumen IS
  'Vista de lectura para listados: incluye edad y categoría derivadas. No se escribe sobre ella.';

GRANT SELECT ON app.v_animal_resumen TO app_rw, app_ro;
GRANT EXECUTE ON FUNCTION app.categoria_de(text, date, text, date) TO app_rw, app_ro;
GRANT EXECUTE ON FUNCTION app.edad_meses(date, date) TO app_rw, app_ro;
