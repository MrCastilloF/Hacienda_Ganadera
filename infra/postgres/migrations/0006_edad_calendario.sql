-- =============================================================================
--  0006 · Edad en meses calendario
--
--  La versión anterior dividía días entre 30,4375, lo que desviaba los límites
--  de categoría (12 y 24 meses): un animal nacido el mismo día doce meses atrás
--  daba 11 meses y se clasificaba como ternero. Ahora se usa `age()`, que respeta
--  el calendario y coincide exactamente con el dominio en TypeScript.
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
    ELSE (
      EXTRACT(YEAR FROM age(p_referencia, p_nacimiento)) * 12
      + EXTRACT(MONTH FROM age(p_referencia, p_nacimiento))
    )::integer
  END;
$$;

COMMENT ON FUNCTION app.edad_meses IS
  'Edad en meses calendario. Debe coincidir con apps/api/src/animales/domain/categoria.ts.';

GRANT EXECUTE ON FUNCTION app.edad_meses(date, date) TO app_rw, app_ro;
