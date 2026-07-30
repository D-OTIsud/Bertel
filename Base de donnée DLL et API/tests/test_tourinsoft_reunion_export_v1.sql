-- Tourinsoft Réunion accommodation export: version isolation, public-only data,
-- deterministic batch parity, HOT/HLO/CAMP coverage and legacy compatibility.
DO $test$
DECLARE
  v_hot text := 'HOTRUN9999990T10';
  v_hlo text := 'HLORUN9999990T11';
  v_camp text := 'CAMRUN9999990T12';
  v_draft text := 'HOTRUN9999990T13';
  v_phone uuid;
  v_email uuid;
  v_media_type uuid;
  v_lang uuid;
  v_payment uuid;
  v_capacity uuid;
  legacy_direct jsonb;
  legacy_wrapped jsonb;
  doc jsonb;
  batch jsonb;
BEGIN
  IF to_regclass('public.ref_interop_value_crosswalk') IS NULL THEN
    RAISE EXCEPTION 'ref_interop_value_crosswalk missing';
  END IF;
  IF (SELECT count(*) FROM public.ref_interop_crosswalk
      WHERE profile = 'tourinsoft_reunion_hebergement_v1' AND taxonomy_code IS NULL AND is_active) <> 3 THEN
    RAISE EXCEPTION 'expected exactly HOT/HLO/CAMP regional type mappings';
  END IF;
  IF (SELECT target_class FROM public.ref_interop_crosswalk
      WHERE profile = 'tourinsoft_reunion_hebergement_v1' AND object_type = 'CAMP' AND taxonomy_code IS NULL) <> 'CAM' THEN
    RAISE EXCEPTION 'regional CAMP mapping must be CAM';
  END IF;
  IF (SELECT count(*) FROM public.ref_interop_value_crosswalk
      WHERE profile = 'tourinsoft_reunion_hebergement_v1' AND is_active) <> 30 THEN
    RAISE EXCEPTION 'expected the 30 approved runtime value mappings';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ref_interop_value_crosswalk
    WHERE profile = 'tourinsoft_reunion_hebergement_v1'
      AND domain = 'capacity_metric' AND source_code = 'pitches'
      AND target_code = 'Nombredeproduits' AND is_active
  ) THEN
    RAISE EXCEPTION 'capacity mapping must be runtime data, not serializer-only knowledge';
  END IF;

  IF has_function_privilege('anon','api.get_object_tourinsoft(text,text)','EXECUTE')
     OR has_function_privilege('authenticated','api.get_object_tourinsoft(text,text)','EXECUTE')
     OR has_function_privilege('anon','api.get_objects_tourinsoft_batch(text[],text)','EXECUTE') THEN
    RAISE EXCEPTION 'Tourinsoft regional functions must be service-role-only';
  END IF;
  IF NOT has_function_privilege('service_role','api.get_object_tourinsoft(text,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','api.get_objects_tourinsoft_batch(text[],text)','EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute Tourinsoft regional functions';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'api'
      AND p.proname IN ('tourinsoft_reunion_documents','get_object_tourinsoft','get_objects_tourinsoft_batch','tourinsoft_reunion_unmapped_values')
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'Tourinsoft regional functions must be SECURITY INVOKER';
  END IF;

  SELECT id INTO v_phone FROM ref_code_contact_kind WHERE code = 'phone' LIMIT 1;
  SELECT id INTO v_email FROM ref_code_contact_kind WHERE code = 'email' LIMIT 1;
  SELECT id INTO v_media_type FROM ref_code_media_type WHERE code = 'photo' LIMIT 1;
  SELECT id INTO v_lang FROM ref_language WHERE code = 'fr' LIMIT 1;
  SELECT id INTO v_payment FROM ref_code_payment_method WHERE code = 'especes' LIMIT 1;
  SELECT id INTO v_capacity FROM ref_capacity_metric WHERE code = 'max_capacity' LIMIT 1;
  IF v_phone IS NULL OR v_email IS NULL OR v_media_type IS NULL OR v_lang IS NULL
     OR v_payment IS NULL OR v_capacity IS NULL THEN
    RAISE EXCEPTION 'required reference seeds missing';
  END IF;

  INSERT INTO object (id, object_type, name, status, published_at) VALUES
    (v_hot, 'HOT', 'Hôtel régional', 'published', '2026-01-01T00:00:00Z'),
    (v_hlo, 'HLO', 'Gîte régional', 'published', '2026-01-02T00:00:00Z'),
    (v_camp, 'CAMP', 'Camping régional', 'published', '2026-01-03T00:00:00Z'),
    (v_draft, 'HOT', 'Hôtel brouillon', 'draft', NULL);

  INSERT INTO object_description (object_id, org_object_id, description, description_chapo, visibility, position) VALUES
    (v_hot, NULL, '# Description **publique**', 'Accroche publique', 'public', 1);
  INSERT INTO object_location (
    object_id, address1, address2, postcode, city, code_insee, lieu_dit, direction,
    latitude, longitude, is_main_location, position
  ) VALUES (
    v_hot, '12 rue des Palmiers', 'Résidence Corail', '97410', 'Saint-Pierre', '97416',
    'Front de mer', 'Suivre **la route**', -21.34, 55.48, true, 1
  );
  INSERT INTO contact_channel (object_id, kind_id, value, is_public, is_primary, position) VALUES
    (v_hot, v_phone, '+262262000000', true, true, 1),
    (v_hot, v_phone, '+262262999999', false, false, 2),
    (v_hot, v_email, 'hotel@example.re', true, true, 3);
  INSERT INTO media (object_id, media_type_id, title, credit, url, is_main, is_published, visibility, position) VALUES
    (v_hot, v_media_type, 'Façade', 'CRT', 'https://cdn.example.re/public.jpg', true, true, 'public', 1),
    (v_hot, v_media_type, 'Privée', 'Interne', 'https://cdn.example.re/private.jpg', false, true, 'private', 2),
    (v_hot, v_media_type, 'Non publiée', 'Interne', 'https://cdn.example.re/draft.jpg', false, false, 'public', 3);
  INSERT INTO object_language (object_id, language_id) VALUES (v_hot, v_lang);
  INSERT INTO object_payment_method (object_id, payment_method_id) VALUES (v_hot, v_payment);
  INSERT INTO object_pet_policy (object_id, accepted, conditions) VALUES (v_hot, true, 'Sur demande');
  INSERT INTO object_stay_policy (object_id, check_in_from, check_in_until, check_out_until)
    VALUES (v_hot, '14:00', '20:00', '10:00');
  INSERT INTO object_capacity (object_id, metric_id, value_integer, unit)
    VALUES (v_hot, v_capacity, 12, 'pax'), (v_camp, v_capacity, 80, 'pax');
  INSERT INTO opening_period (object_id, date_start, date_end, all_years)
    VALUES (v_hot, '2026-01-01', '2026-12-31', false);

  -- The default and explicit legacy variants remain byte-identical to I4b.
  legacy_direct := api.get_object_interop(v_hot, 'tourinsoft');
  legacy_wrapped := api.get_object_tourinsoft(v_hot, 'legacy-v1');
  IF legacy_wrapped <> legacy_direct OR api.get_object_tourinsoft(v_hot, NULL) <> legacy_direct THEN
    RAISE EXCEPTION 'legacy-v1 must delegate byte-identically to get_object_interop';
  END IF;

  doc := api.get_object_tourinsoft(v_hot, 'reunion-hebergement-v1');
  IF doc->>'SyndicObjectID' <> v_hot OR doc->>'Nometablissement' <> 'Hôtel régional' THEN
    RAISE EXCEPTION 'regional identity fields wrong: %', doc;
  END IF;
  IF doc->>'ObjectTypeName' <> 'Hôtellerie'
     OR doc->>'ObjectTypeFix' <> '25EB2EC5-507B-40A9-A799-2716A0536792' THEN
    RAISE EXCEPTION 'HOT type crosswalk wrong: %', doc;
  END IF;
  IF doc->'Descriptifss'->0->>'Descriptioncommerciale' <> 'Description publique'
     OR doc::text LIKE '%Description privée interdite%' THEN
    RAISE EXCEPTION 'description public/markdown gate wrong: %', doc->'Descriptifss';
  END IF;
  IF doc->'Access'->0->>'Descriptifduplandacces' <> 'Suivre la route' THEN
    RAISE EXCEPTION 'access markdown stripping wrong';
  END IF;
  IF jsonb_array_length(doc->'Moyencommunications') <> 2
     OR doc::text LIKE '%+262262999999%' THEN
    RAISE EXCEPTION 'private contact leaked: %', doc->'Moyencommunications';
  END IF;
  IF jsonb_array_length(doc->'Photos') <> 1
     OR doc->'Photos'->0->'Photo'->>'Url' <> 'https://cdn.example.re/public.jpg'
     OR doc::text LIKE '%private.jpg%' OR doc::text LIKE '%draft.jpg%' THEN
    RAISE EXCEPTION 'media publication/visibility gate wrong: %', doc->'Photos';
  END IF;
  IF doc->'LanguesParleess'->0->>'ThesCode' <> 'FR'
     OR doc->'ModesPaiements'->0->>'ThesCode' <> 'ES' THEN
    RAISE EXCEPTION 'language/payment crosswalk wrong';
  END IF;
  IF (doc->'Capacites'->0->>'Capacitetotalenombredepersonnes')::integer <> 12
     OR doc->'Animauxacceptess'->0->>'Animauxacceptes' <> 'true'
     OR doc->'Horairearriveedeparts'->0->>'Heuredarrivee' NOT LIKE '14:00:%' THEN
    RAISE EXCEPTION 'capacity/policy/stay projection wrong';
  END IF;

  IF api.get_object_tourinsoft(v_hlo, 'reunion-hebergement-v1')->>'ObjectTypeName' <> 'Hébergement locatifs' THEN
    RAISE EXCEPTION 'HLO type mapping wrong';
  END IF;
  doc := api.get_object_tourinsoft(v_camp, 'reunion-hebergement-v1');
  IF doc->>'ObjectTypeName' <> 'Camping'
     OR doc->>'ObjectTypeFix' <> 'EECC37A2-050A-45EB-B288-9D288EC3316F'
     OR (doc->'Capacitecampings'->0->>'Capacite')::integer <> 80 THEN
    RAISE EXCEPTION 'CAMP/CAM projection wrong: %', doc;
  END IF;

  batch := api.get_objects_tourinsoft_batch(ARRAY[v_hot, v_hlo, v_camp, v_draft, v_hot], 'reunion-hebergement-v1');
  IF (SELECT count(*) FROM jsonb_object_keys(batch)) <> 3 THEN
    RAISE EXCEPTION 'batch must dedupe and exclude draft: %', batch;
  END IF;
  IF batch->v_hot <> api.get_object_tourinsoft(v_hot, 'reunion-hebergement-v1') THEN
    RAISE EXCEPTION 'unit/batch parity broken';
  END IF;
  IF api.get_object_tourinsoft(v_draft, 'reunion-hebergement-v1') IS NOT NULL
     OR api.get_object_tourinsoft(v_hot, 'unknown') IS NOT NULL
     OR api.get_objects_tourinsoft_batch(ARRAY[v_hot], 'unknown') <> '{}'::jsonb THEN
    RAISE EXCEPTION 'draft/unknown variant gate wrong';
  END IF;

  RAISE EXCEPTION 'ROLLBACK_PROBE';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_PROBE' THEN RAISE; END IF;
END;
$test$;

DO $$ BEGIN RAISE NOTICE 'test_tourinsoft_reunion_export_v1.sql: OK'; END $$;
