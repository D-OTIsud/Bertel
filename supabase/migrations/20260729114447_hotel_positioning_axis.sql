-- =============================================================================
-- Axe « Positionnement hôtelier » — multi-valué et indépendant de la nature.
--
-- `object_taxonomy` impose UNIQUE (object_id, domain). Les nœuds
-- taxonomy_hot d'axe `positionnement` ne peuvent donc pas y cohabiter avec
-- Hôtel / Hôtel-restaurant. Cette migration leur donne une table de liaison
-- dédiée et branche un filtre RPC combiné en ET avec `taxonomy_any`.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- -----------------------------------------------------------------------------
-- 1. Garde de vocabulaire : les huit valeurs doivent être explicitement
--    déclarées comme positionnements, jamais déduites de leur profondeur.
-- -----------------------------------------------------------------------------
DO $positioning_prereq$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM ref_code
   WHERE domain = 'taxonomy_hot'
     AND code = ANY (ARRAY[
       'boutique_hotel','business_hotel','eco_hotel','family_hotel',
       'heritage_hotel','modern_hotel','romantic_hotel','traditional_hotel'
     ])
     AND metadata->>'axis' = 'positionnement'
     AND is_active
     AND is_assignable;

  IF v_count <> 8 THEN
    RAISE EXCEPTION
      'hotel-positioning: 8 positionnements taxonomy_hot actifs attendus, % trouvé(s)',
      v_count;
  END IF;
END
$positioning_prereq$;

-- « Hôtel » est la nature englobante. « Hôtel-restaurant » décrit une offre
-- complémentaire : il rejoint l'axe Positionnement afin que le filtre Hôtel
-- continue d'englober tous les hôtels, restaurant ou non.
UPDATE ref_code child
   SET parent_id = hotel.id,
       metadata = COALESCE(child.metadata, '{}'::jsonb)
                  || '{"axis":"positionnement","famille":"hotellerie","source":"hotel_positioning_axis_20260729"}'::jsonb,
       updated_at = now()
  FROM ref_code hotel
 WHERE child.domain = 'taxonomy_hot'
   AND child.code = 'hotel_with_restaurant'
   AND hotel.domain = 'taxonomy_hot'
   AND hotel.code = 'hotel'
   AND (
     child.parent_id IS DISTINCT FROM hotel.id
     OR child.metadata->>'axis' IS DISTINCT FROM 'positionnement'
   );

SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_hot');

-- -----------------------------------------------------------------------------
-- 2. Table de liaison. La FK composite verrouille le domaine taxonomy_hot ;
--    le trigger verrouille l'axe metadata.positionnement et le type HOT.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS object_hotel_positioning (
  object_id           text NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  positioning_id      uuid NOT NULL,
  positioning_domain  text NOT NULL DEFAULT 'taxonomy_hot'
    CHECK (positioning_domain = 'taxonomy_hot'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (object_id, positioning_id),
  CONSTRAINT fk_object_hotel_positioning_ref
    FOREIGN KEY (positioning_id, positioning_domain)
    REFERENCES ref_code(id, domain) ON DELETE CASCADE
);

COMMENT ON TABLE object_hotel_positioning IS
  'Positionnements commerciaux multi-valués des hôtels. Indépendants de la nature exclusive portée par object_taxonomy.';

CREATE INDEX IF NOT EXISTS idx_object_hotel_positioning_positioning_id
  ON object_hotel_positioning(positioning_id);

CREATE OR REPLACE FUNCTION api.validate_object_hotel_positioning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_axis text;
  v_type text;
BEGIN
  SELECT rc.metadata->>'axis'
    INTO v_axis
    FROM public.ref_code rc
   WHERE rc.id = NEW.positioning_id
     AND rc.domain = NEW.positioning_domain
     AND rc.is_active
     AND rc.is_assignable;

  IF v_axis IS DISTINCT FROM 'positionnement' THEN
    RAISE EXCEPTION
      'La référence % n''est pas un positionnement hôtelier actif',
      NEW.positioning_id;
  END IF;

  SELECT o.object_type::text INTO v_type
    FROM public.object o
   WHERE o.id = NEW.object_id;

  IF v_type IS DISTINCT FROM 'HOT' THEN
    RAISE EXCEPTION
      'Le positionnement hôtelier ne s''applique qu''aux objets HOT (% est %)',
      NEW.object_id, COALESCE(v_type, 'introuvable');
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_validate_object_hotel_positioning
  ON object_hotel_positioning;
CREATE TRIGGER trg_validate_object_hotel_positioning
BEFORE INSERT OR UPDATE ON object_hotel_positioning
FOR EACH ROW EXECUTE FUNCTION api.validate_object_hotel_positioning();

ALTER TABLE object_hotel_positioning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_object_hotel_positioning ON object_hotel_positioning;
CREATE POLICY read_object_hotel_positioning ON object_hotel_positioning
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM object o
       WHERE o.id = object_hotel_positioning.object_id
         AND o.status = 'published'::object_status
    )
    OR object_id IN (SELECT api.current_user_extended_object_ids())
  );

DROP POLICY IF EXISTS canonical_ins_object_hotel_positioning ON object_hotel_positioning;
CREATE POLICY canonical_ins_object_hotel_positioning ON object_hotel_positioning
  FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS canonical_upd_object_hotel_positioning ON object_hotel_positioning;
CREATE POLICY canonical_upd_object_hotel_positioning ON object_hotel_positioning
  FOR UPDATE USING (api.user_can_write_object_canonical(object_id))
         WITH CHECK (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS canonical_del_object_hotel_positioning ON object_hotel_positioning;
CREATE POLICY canonical_del_object_hotel_positioning ON object_hotel_positioning
  FOR DELETE USING (api.user_can_write_object_canonical(object_id));

REVOKE ALL ON TABLE object_hotel_positioning FROM anon, authenticated;
GRANT SELECT                         ON TABLE object_hotel_positioning TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE object_hotel_positioning TO authenticated;
GRANT ALL                            ON TABLE object_hotel_positioning TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Répare les éventuelles fiches éditées avec l'ancien contrôle exclusif :
--    le positionnement est conservé dans la liaison, puis la nature redevient
--    Hôtel. L'ordre empêche toute perte d'information.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE migrated_hotel_positioning_objects (
  object_id text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO migrated_hotel_positioning_objects(object_id)
SELECT DISTINCT ot.object_id
  FROM object_taxonomy ot
  JOIN ref_code rc
    ON rc.id = ot.ref_code_id
   AND rc.domain = ot.domain
 WHERE ot.domain = 'taxonomy_hot'
   AND rc.metadata->>'axis' = 'positionnement';

INSERT INTO object_hotel_positioning(object_id, positioning_id)
SELECT ot.object_id, ot.ref_code_id
  FROM object_taxonomy ot
  JOIN ref_code rc
    ON rc.id = ot.ref_code_id
   AND rc.domain = ot.domain
 WHERE ot.domain = 'taxonomy_hot'
   AND rc.metadata->>'axis' = 'positionnement'
ON CONFLICT (object_id, positioning_id) DO NOTHING;

UPDATE object_taxonomy ot
   SET ref_code_id = hotel.id,
       source = 'hotel_positioning_axis_20260729',
       note = concat_ws(
         E'\n',
         NULLIF(ot.note, ''),
         'Ancien choix exclusif déplacé vers Positionnement ; nature restaurée à Hôtel.'
       ),
       updated_at = now()
  FROM ref_code hotel
 WHERE hotel.domain = 'taxonomy_hot'
   AND hotel.code = 'hotel'
   AND ot.object_id IN (SELECT object_id FROM migrated_hotel_positioning_objects)
   AND ot.domain = 'taxonomy_hot';

DO $refresh_migrated$
DECLARE r record;
BEGIN
  FOR r IN SELECT object_id FROM migrated_hotel_positioning_objects LOOP
    PERFORM api.refresh_object_filter_caches(r.object_id);
  END LOOP;
END
$refresh_migrated$;

-- -----------------------------------------------------------------------------
-- 4. Filtre Explorer. On conserve la signature publique et injecte un prédicat
--    dédié dans la définition courante : OR entre positionnements demandés,
--    ET avec tous les autres axes (dont taxonomy_any).
-- -----------------------------------------------------------------------------
DO $patch_filter$
DECLARE
  v_oid oid;
  v_definition text;
  -- Ancre volontairement sans fin de ligne : pg_get_functiondef normalise le
  -- corps, et sa représentation des retours ne doit pas rendre la migration
  -- dépendante du client qui l'exécute.
  v_anchor text := '    AND (params.tags_any IS NULL OR EXISTS (';
  v_clause text := E'    -- Positionnements hôteliers : axe multi-valué, AND avec la nature.\n'
    || E'    AND (\n'
    || E'      NOT (params.filters ? ''accommodation_positionings_any'')\n'
    || E'      OR jsonb_array_length(params.filters->''accommodation_positionings_any'') = 0\n'
    || E'      OR EXISTS (\n'
    || E'        SELECT 1\n'
    || E'          FROM object_hotel_positioning ohp\n'
    || E'          JOIN ref_code rc\n'
    || E'            ON rc.id = ohp.positioning_id\n'
    || E'           AND rc.domain = ohp.positioning_domain\n'
    || E'         WHERE ohp.object_id = src.object_id\n'
    || E'           AND rc.code IN (\n'
    || E'             SELECT jsonb_array_elements_text(params.filters->''accommodation_positionings_any'')\n'
    || E'           )\n'
    || E'      )\n'
    || E'    )\n';
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'api'
     AND p.proname = 'get_filtered_object_ids'
     AND p.pronargs = 4;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'hotel-positioning: api.get_filtered_object_ids/4 introuvable';
  END IF;

  SELECT pg_get_functiondef(v_oid) INTO v_definition;

  IF v_definition LIKE '%accommodation_positionings_any%' THEN
    RAISE NOTICE 'hotel-positioning: filtre déjà branché';
  ELSIF strpos(v_definition, v_anchor) = 0 THEN
    RAISE EXCEPTION
      'hotel-positioning: ancre tags_any absente de api.get_filtered_object_ids ; patch manuel requis';
  ELSE
    EXECUTE replace(v_definition, v_anchor, v_clause || v_anchor);
  END IF;
END
$patch_filter$;

-- -----------------------------------------------------------------------------
-- 5. Assertions fail-closed.
-- -----------------------------------------------------------------------------
DO $positioning_asserts$
DECLARE
  v_bad text;
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.object_hotel_positioning'::regclass
       AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'hotel-positioning: RLS désactivée';
  END IF;

  SELECT string_agg(policyname, ', ') INTO v_bad
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'object_hotel_positioning'
     AND cmd = 'ALL';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'hotel-positioning: policy FOR ALL interdite: %', v_bad;
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'object_hotel_positioning'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_count <> 3 THEN
    RAISE EXCEPTION
      'hotel-positioning: % policies d''écriture au lieu de 3',
      v_count;
  END IF;

  SELECT string_agg(ot.object_id, ', ') INTO v_bad
    FROM object_taxonomy ot
    JOIN ref_code rc
      ON rc.id = ot.ref_code_id
     AND rc.domain = ot.domain
   WHERE ot.domain = 'taxonomy_hot'
     AND rc.metadata->>'axis' = 'positionnement';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'hotel-positioning: positionnement encore stocké comme nature sur %',
      v_bad;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM ref_code child
      JOIN ref_code hotel
        ON hotel.id = child.parent_id
       AND hotel.domain = child.domain
     WHERE child.domain = 'taxonomy_hot'
       AND child.code = 'hotel_with_restaurant'
       AND child.metadata->>'axis' = 'positionnement'
       AND hotel.code = 'hotel'
  ) THEN
    RAISE EXCEPTION
      'hotel-positioning: Hôtel-restaurant n''est pas un positionnement d''Hôtel';
  END IF;

  SELECT count(*) INTO v_count
    FROM ref_code
   WHERE domain = 'taxonomy_hot'
     AND metadata->>'axis' = 'positionnement'
     AND is_active
     AND is_assignable;
  IF v_count <> 9 THEN
    RAISE EXCEPTION
      'hotel-positioning: 9 positionnements hôteliers attendus, % trouvé(s)',
      v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'api'
       AND p.proname = 'get_filtered_object_ids'
       AND p.pronargs = 4
       AND pg_get_functiondef(p.oid) LIKE '%accommodation_positionings_any%'
  ) THEN
    RAISE EXCEPTION 'hotel-positioning: filtre RPC non branché';
  END IF;
END
$positioning_asserts$;

COMMIT;

-- Après application live :
--   NOTIFY pgrst, 'reload schema';
-- Aucun refresh de MV n'est requis : le filtre lit la liaison directement.
