-- Derive INSEE on every canonical address write, including imports and places.
-- Postal reference verified against geo.api.gouv.fr/departements/974/communes
-- (fields=nom,code,codesPostaux) on 2026-11-27. No network call at save time.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.ref_commune_postcode (
  postcode varchar(5) NOT NULL CHECK (postcode ~ '^[0-9]{5}$'),
  insee_code varchar(5) NOT NULL REFERENCES public.ref_commune(insee_code),
  PRIMARY KEY (postcode, insee_code)
);
CREATE INDEX IF NOT EXISTS idx_ref_commune_postcode_insee
  ON public.ref_commune_postcode(insee_code);
ALTER TABLE public.ref_commune_postcode ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pub_ref_commune_postcode_read ON public.ref_commune_postcode;
CREATE POLICY pub_ref_commune_postcode_read ON public.ref_commune_postcode
  FOR SELECT TO anon, authenticated, service_role USING (true);
REVOKE ALL ON public.ref_commune_postcode FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ref_commune_postcode TO anon, authenticated, service_role;
COMMENT ON TABLE public.ref_commune_postcode IS
  'Official postal code / INSEE correspondence, La Reunion; geo.api.gouv.fr, verified 2026-11-27. A postal code can cover several communes.';

INSERT INTO public.ref_commune_postcode(postcode, insee_code) VALUES
  ('97425','97401'), ('97412','97402'), ('97414','97403'),
  ('97427','97404'), ('97429','97405'), ('97431','97406'),
  ('97420','97407'), ('97419','97408'), ('97440','97409'),
  ('97437','97410'), ('97470','97410'),
  ('97400','97411'), ('97417','97411'), ('97490','97411'),
  ('97480','97412'),
  ('97416','97413'), ('97424','97413'), ('97436','97413'),
  ('97421','97414'), ('97450','97414'),
  ('97411','97415'), ('97422','97415'), ('97423','97415'),
  ('97434','97415'), ('97435','97415'), ('97460','97415'),
  ('97410','97416'), ('97432','97416'),
  ('97442','97417'), ('97438','97418'), ('97439','97419'),
  ('97441','97420'), ('97433','97421'),
  ('97418','97422'), ('97430','97422'), ('97426','97423'), ('97413','97424')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION internal.normalize_commune_name(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
  SELECT replace(regexp_replace(btrim(regexp_replace(
    regexp_replace(regexp_replace(lower(public.immutable_unaccent(coalesce(p_name, ''))),
      '\mste\M', 'sainte', 'g'), '\mst\M', 'saint', 'g'),
    '[^a-z0-9]+', ' ', 'g')), '^(les|le|la|l) +', ''), ' ', '');
$fn$;

CREATE OR REPLACE FUNCTION internal.resolve_location_insee(p_city text, p_postcode text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, internal, pg_temp
AS $fn$
DECLARE
  v_city text := internal.normalize_commune_name(p_city);
  v_postcode text := nullif(btrim(p_postcode), '');
  v_city_codes text[];
  v_postcode_codes text[];
  v_codes text[];
BEGIN
  SELECT array_agg(c.insee_code::text ORDER BY c.insee_code) INTO v_city_codes
  FROM public.ref_commune c
  WHERE c.is_active AND v_city <> ''
    AND internal.normalize_commune_name(c.name) = v_city;
  SELECT array_agg(p.insee_code::text ORDER BY p.insee_code) INTO v_postcode_codes
  FROM public.ref_commune_postcode p JOIN public.ref_commune c USING (insee_code)
  WHERE p.postcode = v_postcode AND c.is_active;

  IF v_city_codes IS NOT NULL AND v_postcode_codes IS NOT NULL THEN
    SELECT array_agg(code ORDER BY code) INTO v_codes
    FROM unnest(v_city_codes) AS t(code) WHERE code = ANY(v_postcode_codes);
    IF v_codes IS NULL THEN
      RAISE EXCEPTION 'INSEE_COMMUNE_CONFLICT: la commune % ne correspond pas au code postal %', p_city, p_postcode
        USING ERRCODE = '23514';
    END IF;
  ELSE
    v_codes := coalesce(v_city_codes, v_postcode_codes);
  END IF;
  -- No fuzzy guess and no arbitrary first match for shared postal codes.
  IF cardinality(v_codes) = 1 THEN RETURN v_codes[1]; END IF;
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION internal.set_location_insee()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, internal, pg_temp
AS $fn$
DECLARE
  v_resolved text;
  v_supplied text := nullif(btrim(NEW.code_insee), '');
  v_stale boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Retain an existing historical assignment when its address is unchanged.
    -- The governed assignment guard below decides whether a NEW one is allowed.
    IF NEW.city IS NOT DISTINCT FROM OLD.city
       AND NEW.postcode IS NOT DISTINCT FROM OLD.postcode
       AND NEW.code_insee IS NOT DISTINCT FROM OLD.code_insee
       AND v_supplied IS NOT NULL THEN
      RETURN NEW;
    END IF;
    v_stale := (NEW.city IS DISTINCT FROM OLD.city OR NEW.postcode IS DISTINCT FROM OLD.postcode)
      AND NEW.code_insee IS NOT DISTINCT FROM OLD.code_insee;
  END IF;
  v_resolved := internal.resolve_location_insee(NEW.city, NEW.postcode);
  IF v_resolved IS NOT NULL THEN
    IF v_supplied IS NOT NULL AND v_supplied <> v_resolved AND NOT v_stale THEN
      RAISE EXCEPTION 'INSEE_CODE_CONFLICT: le code INSEE % ne correspond pas à la commune et au code postal (attendu %)', v_supplied, v_resolved
        USING ERRCODE = '23514';
    END IF;
    NEW.code_insee := v_resolved;
  ELSIF v_supplied IS NOT NULL AND NOT v_stale AND EXISTS (
    SELECT 1 FROM public.ref_commune c WHERE c.insee_code = v_supplied AND c.is_active
  ) AND (
    NOT EXISTS (
      SELECT 1 FROM public.ref_commune_postcode p JOIN public.ref_commune c USING(insee_code)
      WHERE p.postcode = btrim(NEW.postcode) AND c.is_active
    ) OR EXISTS (
      SELECT 1 FROM public.ref_commune_postcode p
      WHERE p.postcode = btrim(NEW.postcode) AND p.insee_code = v_supplied
    )
  ) AND (
    NOT EXISTS (
      SELECT 1 FROM public.ref_commune c WHERE c.is_active
        AND internal.normalize_commune_name(c.name) = internal.normalize_commune_name(NEW.city)
    ) OR EXISTS (
      SELECT 1 FROM public.ref_commune c WHERE c.insee_code = v_supplied
        AND internal.normalize_commune_name(c.name) = internal.normalize_commune_name(NEW.city)
    )
  ) THEN
    NEW.code_insee := v_supplied;
  ELSE
    RAISE EXCEPTION 'INSEE_REQUIRED: renseignez une commune ou un code postal permettant de déterminer un code INSEE unique'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION internal.normalize_commune_name(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION internal.resolve_location_insee(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION internal.set_location_insee() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.normalize_commune_name(text), internal.resolve_location_insee(text,text)
  TO authenticated, service_role;

-- Prepared thesaurus publication runs under its isolated NOLOGIN role. Preserve
-- its existing canonical write path without making the trigger privileged.
DO $publisher$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bertel_thesaurus_publisher') THEN
    GRANT SELECT ON public.ref_commune_postcode TO bertel_thesaurus_publisher;
    GRANT EXECUTE ON FUNCTION internal.normalize_commune_name(text), internal.resolve_location_insee(text,text)
      TO bertel_thesaurus_publisher;
    DROP POLICY IF EXISTS publisher_ref_commune_postcode_read ON public.ref_commune_postcode;
    CREATE POLICY publisher_ref_commune_postcode_read ON public.ref_commune_postcode
      FOR SELECT TO bertel_thesaurus_publisher USING (true);
  END IF;
END;
$publisher$;

DROP TRIGGER IF EXISTS a_set_location_insee ON public.object_location;
-- Run before the mutation journal so it records the final canonical code.
CREATE TRIGGER a_set_location_insee
  BEFORE INSERT OR UPDATE OF city, postcode, code_insee ON public.object_location
  FOR EACH ROW EXECUTE FUNCTION internal.set_location_insee();

-- Repair missing or demonstrably wrong codes. Keep normal audit / ownership /
-- publication guards. Contradictory city/postcode inputs abort instead of guessing.
WITH resolved AS MATERIALIZED (
  SELECT id, internal.resolve_location_insee(city, postcode) AS expected
  FROM public.object_location
)
UPDATE public.object_location l SET code_insee = NULL
FROM resolved r WHERE r.id = l.id AND (
  nullif(btrim(l.code_insee), '') IS NULL
  OR (r.expected IS NOT NULL AND l.code_insee IS DISTINCT FROM r.expected)
);

ALTER TABLE public.object_location ALTER COLUMN code_insee SET NOT NULL;
DO $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.object_location'::regclass AND conname = 'object_location_code_insee_fkey') THEN
    ALTER TABLE public.object_location ADD CONSTRAINT object_location_code_insee_fkey
      FOREIGN KEY (code_insee) REFERENCES public.ref_commune(insee_code) NOT VALID;
  END IF;
END;
$fn$;
ALTER TABLE public.object_location VALIDATE CONSTRAINT object_location_code_insee_fkey;
CREATE INDEX IF NOT EXISTS idx_object_location_code_insee ON public.object_location(code_insee);
-- This FK is an additional governed commune assignment. Match the existing
-- object_zone/trail_commune guards, including immutable published vocabulary.
DROP TRIGGER IF EXISTS thesaurus_assignment_guard ON public.object_location;
CREATE TRIGGER thesaurus_assignment_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.object_location
  FOR EACH ROW EXECUTE FUNCTION thesaurus.guard_assignment(
    '[{"kind":"commune","domain":null,"keys":[{"local":"code_insee","target":"insee_code"}]}]'
  );
COMMENT ON COLUMN public.object_location.code_insee IS
  'Required commune INSEE code, derived from city/postcode on every write; validated against ref_commune. Postal code is not an INSEE code.';

COMMIT;
