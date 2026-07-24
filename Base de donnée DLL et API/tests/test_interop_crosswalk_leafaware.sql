-- §190 DATAtourisme leaf-aware resolution: nearest mapped ancestor (depth ASC)
-- wins, then object_type fallback. Self-cleaning via ROLLBACK_PROBE.
DO $leafaware_test$
DECLARE
  v_cdh TEXT := 'HLORUN9999990190';
  v_meuble TEXT := 'HLORUN9999990191';
  v_group TEXT := 'HLORUN9999990192';
  v_stop TEXT := 'HLORUN9999990193';
  v_fallback TEXT := 'HLORUN9999990194';
  v_json JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ref_interop_crosswalk'
      AND column_name = 'taxonomy_code'
  ) THEN
    RAISE EXCEPTION 'leaf-aware crosswalk columns missing';
  END IF;

  IF (SELECT count(*) FROM public.ref_interop_crosswalk
      WHERE profile = 'datatourisme' AND object_type = 'HLO'
        AND taxonomy_domain = 'taxonomy_hlo' AND taxonomy_code IS NOT NULL) <> 4 THEN
    RAISE EXCEPTION 'expected 4 DATAtourisme HLO taxonomy mappings';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ref_interop_crosswalk'::regclass
      AND conname = 'fk_ref_interop_crosswalk_taxonomy_code'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ref_interop_crosswalk'::regclass
      AND conname = 'chk_ref_interop_crosswalk_taxonomy_pair'
  ) THEN
    RAISE EXCEPTION 'leaf-aware crosswalk FK/check missing';
  END IF;

  INSERT INTO object(id, object_type, name, status) VALUES
    (v_cdh, 'HLO', 'Fixture maison d''hôtes', 'published'),
    (v_meuble, 'HLO', 'Fixture maison autonome', 'published'),
    (v_group, 'HLO', 'Fixture gîte de groupe', 'published'),
    (v_stop, 'HLO', 'Fixture gîte d''étape', 'published'),
    (v_fallback, 'HLO', 'Fixture sans taxonomie', 'published');

  INSERT INTO object_taxonomy(object_id, domain, ref_code_id, source)
  SELECT fixture.object_id, 'taxonomy_hlo', rc.id, 'test_leafaware'
  FROM (VALUES
    (v_cdh, 'cdh_maison'),
    (v_meuble, 'maison'),
    (v_group, 'gite_de_groupe'),
    (v_stop, 'gite_de_randonnee')
  ) fixture(object_id, code)
  JOIN ref_code rc ON rc.domain = 'taxonomy_hlo' AND rc.code = fixture.code;

  v_json := api.get_object_interop(v_cdh, 'datatourisme');
  IF NOT (v_json->'@type' @> '["Guesthouse"]'::JSONB) THEN
    RAISE EXCEPTION 'cdh descendant should resolve Guesthouse, got %', v_json->'@type';
  END IF;

  v_json := api.get_object_interop(v_meuble, 'datatourisme');
  IF NOT (v_json->'@type' @> '["SelfCateringAccommodation"]'::JSONB) THEN
    RAISE EXCEPTION 'meuble descendant should resolve SelfCateringAccommodation, got %', v_json->'@type';
  END IF;

  v_json := api.get_object_interop(v_group, 'datatourisme');
  IF NOT (v_json->'@type' @> '["GroupLodging"]'::JSONB) THEN
    RAISE EXCEPTION 'collective descendant should resolve GroupLodging, got %', v_json->'@type';
  END IF;

  v_json := api.get_object_interop(v_stop, 'datatourisme');
  IF NOT (v_json->'@type' @> '["StopOverOrGroupLodge"]'::JSONB) THEN
    RAISE EXCEPTION 'nearest gite_de_randonnee mapping should beat collective ancestor, got %', v_json->'@type';
  END IF;

  v_json := api.get_object_interop(v_fallback, 'datatourisme');
  IF NOT (v_json->'@type' @> '["Accommodation"]'::JSONB) THEN
    RAISE EXCEPTION 'unmapped HLO should use type fallback Accommodation, got %', v_json->'@type';
  END IF;

  v_json := api.get_object_interop(v_cdh, 'apidae');
  IF v_json->>'type' <> 'HEBERGEMENT_LOCATIF' THEN
    RAISE EXCEPTION 'APIDAE type-level fallback changed unexpectedly: %', v_json->>'type';
  END IF;

  RAISE EXCEPTION 'ROLLBACK_PROBE';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_PROBE' THEN RAISE; END IF;
END
$leafaware_test$;

DO $$ BEGIN RAISE NOTICE 'test_interop_crosswalk_leafaware.sql: OK'; END $$;
