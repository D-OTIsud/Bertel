\set ON_ERROR_STOP on

-- LIVE-ONLY §190 evidence after the taxonomy migration and before the leaf-aware
-- DATAtourisme crosswalk. Read-only; targets the frozen cloud corpus.
\ir test_taxonomy_nature_forme_guard.sql

DO $post_taxonomy_live$
DECLARE
  v_count INTEGER;
  v_bad TEXT;
  v_page JSONB;
  v_data JSONB;
  v_cursor TEXT := NULL;
  v_seen TEXT[] := ARRAY[]::TEXT[];
  v_id TEXT;
  x RECORD;
  v_card JSONB;
  v_resource JSONB;
  v_jsonld JSONB;
  v_datatourisme JSONB;
  v_apidae JSONB;
  v_tourinsoft JSONB;
  v_leafaware BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ref_interop_crosswalk'
      AND column_name = 'taxonomy_code'
  ) INTO v_leafaware;

  SELECT count(*)::INTEGER INTO v_count
  FROM object WHERE object_type = 'HLO' AND status = 'published';
  IF v_count <> 476 THEN
    RAISE EXCEPTION 'T0: expected 476 published HLO, got %', v_count;
  END IF;

  SELECT string_agg(o.id, ', ' ORDER BY o.id) INTO v_bad
  FROM object o
  JOIN object_taxonomy ot ON ot.object_id = o.id AND ot.domain = 'taxonomy_hlo'
  JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
  WHERE o.object_type = 'HLO' AND o.status = 'published' AND NOT rc.is_active;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'T2: published HLO assigned to disabled nodes: %', v_bad;
  END IF;

  SELECT string_agg(o.id, ', ' ORDER BY o.id) INTO v_bad
  FROM object o
  WHERE o.object_type = 'HLO' AND o.status = 'published'
    AND NOT EXISTS (
      SELECT 1
      FROM object_taxonomy ot
      JOIN ref_code_taxonomy_closure cl
        ON cl.domain = ot.domain AND cl.descendant_id = ot.ref_code_id
      JOIN ref_code anc ON anc.id = cl.ancestor_id AND anc.domain = cl.domain
      WHERE ot.object_id = o.id AND ot.domain = 'taxonomy_hlo'
        AND anc.is_active AND anc.is_assignable
        AND anc.code IN ('hebergement_locatif', 'hebergement_collectif')
    );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'T4: HLO without active nature ancestor: %', v_bad;
  END IF;

  SELECT string_agg(DISTINCT o.id, ', ' ORDER BY o.id) INTO v_bad
  FROM object o
  JOIN object_taxonomy ot ON ot.object_id = o.id AND ot.domain = 'taxonomy_hlo'
  JOIN ref_code_taxonomy_closure cl
    ON cl.domain = ot.domain AND cl.descendant_id = ot.ref_code_id
  JOIN ref_code anc ON anc.id = cl.ancestor_id AND anc.domain = cl.domain
  WHERE o.object_type = 'HLO' AND o.status = 'published' AND NOT anc.is_active;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'T4: published HLO path traverses a disabled node: %', v_bad;
  END IF;

  SELECT string_agg(o.id, ', ' ORDER BY o.id) INTO v_bad
  FROM object o
  WHERE o.object_type = 'HLO' AND o.status = 'published'
    AND NOT (
      COALESCE(o.cached_taxonomy_codes, ARRAY[]::TEXT[]) &&
      ARRAY['taxonomy_hlo:hebergement_locatif', 'taxonomy_hlo:hebergement_collectif']
    );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'T5: HLO cache missing nature branch: %', v_bad;
  END IF;

  SELECT string_agg(DISTINCT o.id, ', ' ORDER BY o.id) INTO v_bad
  FROM object o
  CROSS JOIN LATERAL unnest(COALESCE(o.cached_taxonomy_codes, ARRAY[]::TEXT[])) cached(code)
  JOIN ref_code rc ON cached.code = rc.domain || ':' || rc.code
  WHERE o.object_type = 'HLO' AND o.status = 'published'
    AND rc.domain = 'taxonomy_hlo' AND NOT rc.is_active;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'T5: disabled taxonomy code remains cached: %', v_bad;
  END IF;

  WITH expected AS (
    SELECT o.id
    FROM object o
    JOIN object_taxonomy ot ON ot.object_id = o.id AND ot.domain = 'taxonomy_hlo'
    JOIN ref_code_taxonomy_closure cl
      ON cl.domain = ot.domain AND cl.descendant_id = ot.ref_code_id
    JOIN ref_code anc ON anc.id = cl.ancestor_id AND anc.domain = cl.domain
    WHERE o.object_type = 'HLO' AND o.status = 'published'
      AND anc.code = 'hebergement_locatif'
  ), actual AS (
    SELECT object_id AS id
    FROM api.get_filtered_object_ids(
      '{"taxonomy_any":[{"domain":"taxonomy_hlo","code":"hebergement_locatif"}]}'::JSONB,
      ARRAY['HLO']::object_type[], ARRAY['published']::object_status[], NULL
    )
  ), diff AS (
    (SELECT id FROM expected EXCEPT SELECT id FROM actual)
    UNION ALL
    (SELECT id FROM actual EXCEPT SELECT id FROM expected)
  )
  SELECT count(*)::INTEGER INTO v_count FROM diff;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T6: locatif subtree filter differs from closure corpus (% ids)', v_count;
  END IF;

  SELECT count(*)::INTEGER INTO v_count
  FROM api.get_filtered_object_ids(
    '{"taxonomy_any":[{"domain":"taxonomy_hlo","code":"hebergement_locatif"}]}'::JSONB,
    ARRAY['HLO']::object_type[], ARRAY['published']::object_status[], NULL
  );
  IF v_count <> 456 THEN
    RAISE EXCEPTION 'T6: expected 456 locatif results, got %', v_count;
  END IF;

  SELECT count(*)::INTEGER INTO v_count
  FROM api.get_filtered_object_ids(
    '{"taxonomy_any":[{"domain":"taxonomy_hlo","code":"hebergement_collectif"}]}'::JSONB,
    ARRAY['HLO']::object_type[], ARRAY['published']::object_status[], NULL
  );
  IF v_count <> 20 THEN
    RAISE EXCEPTION 'T6: expected 20 collectif results, got %', v_count;
  END IF;

  SELECT string_agg(o.id, ', ' ORDER BY o.id) INTO v_bad
  FROM object o
  JOIN object_taxonomy ot ON ot.object_id = o.id AND ot.domain = 'taxonomy_hlo'
  JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain AND rc.code = 'cdh_maison'
  WHERE o.status = 'published'
    AND NOT EXISTS (
      SELECT 1
      FROM api.get_filtered_object_ids(
        '{"search_mode":"global"}'::JSONB,
        ARRAY['HLO']::object_type[], ARRAY['published']::object_status[],
        'chambre d''hôtes'
      ) found
      WHERE found.object_id = o.id
    );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'T7: recoded guest houses missing from global search: %', v_bad;
  END IF;

  WITH expected(code, parent_code) AS (VALUES
    ('hebergement_locatif', 'root'::TEXT),
    ('cdh_maison', 'chambre_d_hotes'),
    ('cdh_bungalow', 'chambre_d_hotes'),
    ('bungalow', 'location_saisonniere'),
    ('chalet', 'location_saisonniere'),
    ('hebergement_collectif', 'root'::TEXT),
    ('auberge_collective', 'hebergement_collectif')
  ), catalog AS (
    SELECT e->>'code' AS code, e->>'parent_code' AS parent_code
    FROM jsonb_array_elements(api.list_catalog('taxonomy_hlo')::JSONB) e
  )
  SELECT string_agg(e.code, ', ' ORDER BY e.code) INTO v_bad
  FROM expected e LEFT JOIN catalog c USING (code)
  WHERE c.code IS NULL OR c.parent_code IS DISTINCT FROM e.parent_code;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'T9: target catalog rows missing or mis-parented: %', v_bad;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(api.list_catalog('taxonomy_hlo')::JSONB) e
    WHERE e->>'code' IN ('gite_villa', 'bungalow_chalet')
  ) THEN
    RAISE EXCEPTION 'T9: disabled legacy nodes leaked into catalog';
  END IF;

  LOOP
    v_page := api.list_object_resources_page_text(
      v_cursor, ARRAY['fr'], 73, ARRAY['HLO'], ARRAY['published'],
      NULL, 'none', NULL, NULL, NULL, 'card'
    )::JSONB;
    v_data := COALESCE(v_page->'data', '[]'::JSONB);
    FOR v_id IN SELECT e->>'id' FROM jsonb_array_elements(v_data) e LOOP
      IF v_id = ANY(v_seen) THEN
        RAISE EXCEPTION 'T11-bis: duplicate id across pages: %', v_id;
      END IF;
      v_seen := array_append(v_seen, v_id);
    END LOOP;
    v_cursor := COALESCE(v_page->'meta', v_page->'info')->>'next_cursor';
    EXIT WHEN v_cursor IS NULL;
  END LOOP;
  IF COALESCE(array_length(v_seen, 1), 0) <> 476 THEN
    RAISE EXCEPTION 'T11-bis: expected 476 unique ids, got %', COALESCE(array_length(v_seen, 1), 0);
  END IF;
  SELECT string_agg(o.id, ', ' ORDER BY o.id) INTO v_bad
  FROM object o
  WHERE o.object_type = 'HLO' AND o.status = 'published' AND NOT (o.id = ANY(v_seen));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'T11-bis: pagination missed ids: %', v_bad;
  END IF;

  FOR x IN
    SELECT * FROM (VALUES
      ('cdh_direct', 'HLORUN00000000NU', 'Guesthouse', '4e3a8b97a9772a4fd61064e23c1c3c77', '22e764e96db1feeafdf1c639def4bbcb', '7a8d14a2db384eacfde12d88d62a76d6', 'b0ff8f48e7c4d4b33f0bfb3c5e2de3b5', '25ae180a7b7c7affe6e549e3b5643e16', 'c41ed82e23721f60c0c0fdd2640d1b91'),
      ('cdh_future_maison', 'HLORUN0000000183', 'Guesthouse', 'd24f4f9bbfac346a27d38209c93dcd0b', '542de0e70a249705026d0208f8eced24', '69c23d5804ae93de1e198732f971d766', 'd2bc51cbecb6577cb94e01ac601940c4', '87661edcebb604d7ee08e24add384931', '990f8cbd2f3e47ae23b9ff7cdb227e63'),
      ('meuble_maison', 'HLORUN00000000NR', 'SelfCateringAccommodation', '802f8e441f8574068286ca5cc4ea2ab0', 'ac6587fdfae2a754d21070d2bb37658a', '8b452ddbc6500484c214106316a82a27', '4de93a12d46cda0211b667e4e99d913a', 'c03b70b674274a9e19fc7a28ded5039d', '14b3c6adc709c1d7f86b37a1378e2376'),
      ('meuble_appartement', 'HLORUN00000000NP', 'SelfCateringAccommodation', '9a1660d460dd051e45824d623ddfcba4', 'cc1e988141dfcdd383ab53f7d27158c8', '7f4897d6877a5188b233c92dc7295438', 'e0447fa84838409c3b57636a32abb7d8', 'f5ec096a50a8192b7414720de8d9aa37', '2ba46d0dbbc8b86cb81088ecfbbc98a8'),
      ('nature_meuble', 'HLORUN00000000QE', 'SelfCateringAccommodation', 'e7fc27dd9ba2e9e7d62109fc917330eb', '9e256c546ac4e705c3adff322ea1ea8c', '0975d2c018cbf164f35df8c9a44c5f85', '6c525d7bf756af8c70b1a70407828559', '8d5da84afb3b89a2ba61c35288b265a7', 'cef52650f6756b4df07c6d96ac94acfe'),
      ('collectif_etape', 'HLORUN00000000OC', 'StopOverOrGroupLodge', '0d4d16776d9b280764d07b629c64af57', '65a806608ce6247ed785f40017a0d91f', 'adbe653e2a5cc4460d121ee8c2a23b46', '6006b60f20e3e479b2277dfb7a59c029', '1aebd6a3eed0f9d53dfe3e7dea821023', '4a2dc582c088d44f64ba2c423f4dfe1e'),
      ('path_only_bulle', 'HLORUN000000015Q', 'Guesthouse', '88acf2a3731a0b6a0ef0aa9bda93f6ca', 'e1e2e5a3ba591c59a334a05d0e30ae1d', '64e1eb1b0bd74b52a5e9f1301aa5e9e0', '3e5deb78f06f0736ae7ea4adb2e2aece', '5c8cd845f6a3f732c75ad2743c7e3d76', '859cc6ab55f14a2ad3e6a2445dab66bf'),
      ('temoin_non_hlo', 'RESRUN00000000NL', 'FoodEstablishment', 'f323e60d290ad0f31501243bab57fecd', '78801da09ec886b260b254ddb4354f90', '28204eb063fb85dddc50ba195b705d91', '61e10a8502e52a0e0b685701dab823f3', '8860115eda0038fe590d0607e7be054d', 'c0eaeff004bebbb7a951fc4f90888334')
    ) AS expected(role, object_id, datatourisme_class, card_core_md5, resource_core_md5, jsonld_md5, datatourisme_core_md5, apidae_md5, tourinsoft_md5)
  LOOP
    v_card := api.get_object_cards_batch(ARRAY[x.object_id], ARRAY['fr'])::JSONB;
    v_resource := api.get_object_resource(x.object_id, ARRAY['fr'], 'none', '{}'::JSONB)::JSONB;
    v_jsonld := api.get_object_jsonld(x.object_id, 'jsonld');
    v_datatourisme := api.get_object_interop(x.object_id, 'datatourisme');
    v_apidae := api.get_object_interop(x.object_id, 'apidae');
    v_tourinsoft := api.get_object_interop(x.object_id, 'tourinsoft');

    IF md5(jsonb_build_array((v_card->0) - 'taxonomy' - 'updated_at')::TEXT) <> x.card_core_md5
       OR md5(jsonb_set(
         v_resource - 'taxonomy' - 'updated_at',
         '{render}', COALESCE((v_resource->'render') - 'taxonomy_lines', '{}'::JSONB), FALSE
       )::TEXT) <> x.resource_core_md5 THEN
      RAISE EXCEPTION 'T8: % changed outside taxonomy/path/render/updated_at', x.role;
    END IF;
    IF md5(v_jsonld::TEXT) <> x.jsonld_md5
       OR md5((v_datatourisme - '@type')::TEXT) <> x.datatourisme_core_md5
       OR v_datatourisme->'@type' <> jsonb_build_array(
         'PointOfInterest',
         CASE
           WHEN x.role = 'temoin_non_hlo' THEN x.datatourisme_class
           WHEN v_leafaware THEN x.datatourisme_class
           ELSE 'Accommodation'
         END
       )
       OR md5(v_apidae::TEXT) <> x.apidae_md5
       OR md5(v_tourinsoft::TEXT) <> x.tourinsoft_md5 THEN
      RAISE EXCEPTION 'T8/F1: % interop baseline or phase-aware DATAtourisme class changed', x.role;
    END IF;
  END LOOP;
END
$post_taxonomy_live$;

DO $$ BEGIN RAISE NOTICE 'test_taxonomy_nature_forme_live_post_taxonomy.sql: OK'; END $$;
