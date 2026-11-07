\set ON_ERROR_STOP on

-- LIVE-ONLY §190 evidence. Run after BOTH persistent migrations.
-- The basket and hashes were captured read-only before deployment in
-- docs/taxonomy-hlo-api-baseline-before-2026-07-24.md.
DO $live_api_evidence$
DECLARE
  x RECORD;
  v_card JSONB;
  v_resource JSONB;
  v_jsonld JSONB;
  v_datatourisme JSONB;
  v_apidae JSONB;
  v_tourinsoft JSONB;
  v_taxonomy JSONB;
  v_domain_taxonomy JSONB;
  v_path_codes JSONB;
BEGIN
  FOR x IN
    SELECT * FROM (VALUES
      ('cdh_direct',          'HLORUN00000000NU', 'taxonomy_hlo', 'chambre_d_hotes',
       '["hebergement_locatif","chambre_d_hotes"]'::JSONB, 'Guesthouse',
       '4e3a8b97a9772a4fd61064e23c1c3c77', '22e764e96db1feeafdf1c639def4bbcb',
       '7a8d14a2db384eacfde12d88d62a76d6', 'b0ff8f48e7c4d4b33f0bfb3c5e2de3b5',
       '25ae180a7b7c7affe6e549e3b5643e16', 'c41ed82e23721f60c0c0fdd2640d1b91'),
      ('cdh_future_maison',   'HLORUN0000000183', 'taxonomy_hlo', 'cdh_maison',
       '["hebergement_locatif","chambre_d_hotes","cdh_maison"]'::JSONB, 'Guesthouse',
       'd24f4f9bbfac346a27d38209c93dcd0b', '542de0e70a249705026d0208f8eced24',
       '69c23d5804ae93de1e198732f971d766', 'd2bc51cbecb6577cb94e01ac601940c4',
       '87661edcebb604d7ee08e24add384931', '990f8cbd2f3e47ae23b9ff7cdb227e63'),
      ('meuble_maison',       'HLORUN00000000NR', 'taxonomy_hlo', 'maison',
       '["hebergement_locatif","location_saisonniere","maison"]'::JSONB, 'SelfCateringAccommodation',
       '802f8e441f8574068286ca5cc4ea2ab0', 'ac6587fdfae2a754d21070d2bb37658a',
       '8b452ddbc6500484c214106316a82a27', '4de93a12d46cda0211b667e4e99d913a',
       'c03b70b674274a9e19fc7a28ded5039d', '14b3c6adc709c1d7f86b37a1378e2376'),
      ('meuble_appartement',  'HLORUN00000000NP', 'taxonomy_hlo', 'appartement',
       '["hebergement_locatif","location_saisonniere","appartement"]'::JSONB, 'SelfCateringAccommodation',
       '9a1660d460dd051e45824d623ddfcba4', 'cc1e988141dfcdd383ab53f7d27158c8',
       '7f4897d6877a5188b233c92dc7295438', 'e0447fa84838409c3b57636a32abb7d8',
       'f5ec096a50a8192b7414720de8d9aa37', '2ba46d0dbbc8b86cb81088ecfbbc98a8'),
      ('nature_meuble',       'HLORUN00000000QE', 'taxonomy_hlo', 'location_saisonniere',
       '["hebergement_locatif","location_saisonniere"]'::JSONB, 'SelfCateringAccommodation',
       'e7fc27dd9ba2e9e7d62109fc917330eb', '9e256c546ac4e705c3adff322ea1ea8c',
       '0975d2c018cbf164f35df8c9a44c5f85', '6c525d7bf756af8c70b1a70407828559',
       '8d5da84afb3b89a2ba61c35288b265a7', 'cef52650f6756b4df07c6d96ac94acfe'),
      ('collectif_etape',     'HLORUN00000000OC', 'taxonomy_hlo', 'gite_de_randonnee',
       '["hebergement_collectif","gite_de_randonnee"]'::JSONB, 'StopOverOrGroupLodge',
       '0d4d16776d9b280764d07b629c64af57', '65a806608ce6247ed785f40017a0d91f',
       'adbe653e2a5cc4460d121ee8c2a23b46', '6006b60f20e3e479b2277dfb7a59c029',
       '1aebd6a3eed0f9d53dfe3e7dea821023', '4a2dc582c088d44f64ba2c423f4dfe1e'),
      ('path_only_bulle',     'HLORUN000000015Q', 'taxonomy_hlo', 'bulle',
       '["hebergement_locatif","chambre_d_hotes","bulle"]'::JSONB, 'Guesthouse',
       '88acf2a3731a0b6a0ef0aa9bda93f6ca', 'e1e2e5a3ba591c59a334a05d0e30ae1d',
       '64e1eb1b0bd74b52a5e9f1301aa5e9e0', '3e5deb78f06f0736ae7ea4adb2e2aece',
       '5c8cd845f6a3f732c75ad2743c7e3d76', '859cc6ab55f14a2ad3e6a2445dab66bf'),
      ('temoin_non_hlo',      'RESRUN00000000NL', 'taxonomy_res', 'restaurant',
       '["restaurant"]'::JSONB, 'FoodEstablishment',
       'f323e60d290ad0f31501243bab57fecd', '78801da09ec886b260b254ddb4354f90',
       '28204eb063fb85dddc50ba195b705d91', '61e10a8502e52a0e0b685701dab823f3',
       '8860115eda0038fe590d0607e7be054d', 'c0eaeff004bebbb7a951fc4f90888334')
    ) AS expected(
      role, object_id, taxonomy_domain, assigned_code, expected_path,
      datatourisme_class, card_core_md5, resource_core_md5, jsonld_md5,
      datatourisme_core_md5, apidae_md5, tourinsoft_md5
    )
  LOOP
    v_card := api.get_object_cards_batch(ARRAY[x.object_id], ARRAY['fr'])::JSONB;
    v_resource := api.get_object_resource(x.object_id, ARRAY['fr'], 'none', '{}'::JSONB)::JSONB;
    v_jsonld := api.get_object_jsonld(x.object_id, 'jsonld');
    v_datatourisme := api.get_object_interop(x.object_id, 'datatourisme');
    v_apidae := api.get_object_interop(x.object_id, 'apidae');
    v_tourinsoft := api.get_object_interop(x.object_id, 'tourinsoft');
    v_taxonomy := api.get_object_taxonomy_compact(x.object_id, ARRAY['fr']);

    IF md5(jsonb_build_array((v_card->0) - 'taxonomy' - 'updated_at')::TEXT) <> x.card_core_md5 THEN
      RAISE EXCEPTION '%: card changed outside taxonomy/updated_at', x.role;
    END IF;
    IF md5(jsonb_set(
        v_resource - 'taxonomy' - 'updated_at',
        '{render}', COALESCE((v_resource->'render') - 'taxonomy_lines', '{}'::JSONB), FALSE
      )::TEXT) <> x.resource_core_md5 THEN
      RAISE EXCEPTION '%: full resource changed outside taxonomy/render.taxonomy_lines/updated_at', x.role;
    END IF;
    IF md5(v_jsonld::TEXT) <> x.jsonld_md5
       OR md5(v_apidae::TEXT) <> x.apidae_md5
       OR md5(v_tourinsoft::TEXT) <> x.tourinsoft_md5 THEN
      RAISE EXCEPTION '%: jsonld/apidae/tourinsoft byte baseline changed', x.role;
    END IF;
    IF md5((v_datatourisme - '@type')::TEXT) <> x.datatourisme_core_md5
       OR v_datatourisme->'@type' <> jsonb_build_array('PointOfInterest', x.datatourisme_class) THEN
      RAISE EXCEPTION '%: DATAtourisme changed beyond expected @type or class is wrong', x.role;
    END IF;

    SELECT item INTO v_domain_taxonomy
    FROM jsonb_array_elements(v_taxonomy) item
    WHERE item->>'domain' = x.taxonomy_domain;
    IF v_domain_taxonomy IS NULL OR v_domain_taxonomy->>'code' <> x.assigned_code THEN
      RAISE EXCEPTION '%: expected assigned code %, got %',
        x.role, x.assigned_code, v_domain_taxonomy->>'code';
    END IF;
    SELECT COALESCE(jsonb_agg(node->>'code'), '[]'::JSONB) INTO v_path_codes
    FROM jsonb_array_elements(v_domain_taxonomy->'path') node;
    IF v_path_codes <> x.expected_path THEN
      RAISE EXCEPTION '%: expected path %, got %', x.role, x.expected_path, v_path_codes;
    END IF;
  END LOOP;
END
$live_api_evidence$;

DO $$ BEGIN RAISE NOTICE 'test_taxonomy_nature_forme_live_api.sql: OK'; END $$;

