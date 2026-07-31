-- Six-family Tourinsoft Reunion export: taxonomy routing, exact profile aliases,
-- service-only extension round-trip and detail/batch parity.
DO $test$
DECLARE
  ids text[] := ARRAY[
    'PCURUN999999R001','HLORUN999999R002','SPURUN999999R003',
    'ACTRUN999999R004','RESRUN999999R005','PSVRUN999999R006',
    'PSVRUN999999R007','PSVRUN999999R008','PSVRUN999999R009',
    'RESRUN999999R010','RESRUN999999R011','ACTRUN999999R012'
  ];
  result jsonb;
  batch jsonb;
  merged jsonb;
  legacy_direct jsonb;
  accommodation_direct jsonb;
BEGIN
  IF (SELECT count(*) FROM public.ref_tourinsoft_reunion_profile WHERE is_active) IS DISTINCT FROM 6
     OR (
       SELECT count(*)
       FROM public.ref_tourinsoft_reunion_profile profile
       JOIN (VALUES
         ('tourinsoft_reunion_decouverte_v1', '39bab676-97bb-4c78-9d7d-28dd43753314'::uuid,
          'https://api-v3.tourinsoft.com/api/syndications/reunion.tourinsoft.com/39BAB676-97BB-4C78-9D7D-28DD43753314'),
         ('tourinsoft_reunion_hebergement_v1', 'b2bc0524-adc3-45d5-8a77-a0d70d2425b3'::uuid,
          'https://api-v3.tourinsoft.com/api/syndications/reunion.tourinsoft.com/B2BC0524-ADC3-45D5-8A77-A0D70D2425B3'),
         ('tourinsoft_reunion_information_service_v1', '5a285c91-d35f-4873-8f3c-a032abb418d3'::uuid,
          'https://api-v3.tourinsoft.com/api/syndications/reunion.tourinsoft.com/5A285C91-D35F-4873-8F3C-A032ABB418D3'),
         ('tourinsoft_reunion_loisir_plein_air_v1', 'c32a0407-a66f-48d5-8db0-618fdf03f49f'::uuid,
          'https://api-v3.tourinsoft.com/api/syndications/reunion.tourinsoft.com/C32A0407-A66F-48D5-8DB0-618FDF03F49F'),
         ('tourinsoft_reunion_restauration_v1', 'cc575ee1-aa90-49bd-b23f-1935c4b151cd'::uuid,
          'https://api-v3.tourinsoft.com/api/syndications/reunion.tourinsoft.com/CC575EE1-AA90-49BD-B23F-1935C4B151CD'),
         ('tourinsoft_reunion_transport_v1', '15dd031a-caac-4e1b-aa75-5f65d7a437e8'::uuid,
          'https://api-v3.tourinsoft.com/api/syndications/reunion.tourinsoft.com/15DD031A-CAAC-4E1B-AA75-5F65D7A437E8')
       ) expected(profile, feed_id, feed_url)
         ON expected.profile = profile.profile
        AND expected.feed_id = profile.feed_id
        AND expected.feed_url = profile.feed_url
       WHERE profile.is_active
     ) IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'expected the six exact active regional feed ids and URLs';
  END IF;
  IF (SELECT count(DISTINCT profile) FROM public.ref_tourinsoft_reunion_extension_field) IS DISTINCT FROM 6
     OR NOT EXISTS (
       SELECT 1 FROM public.ref_tourinsoft_reunion_extension_field
       WHERE profile = 'tourinsoft_reunion_loisir_plein_air_v1'
         AND path = 'PrestationProximites.ThesCode'
         AND canonical_owned IS FALSE
     ) THEN
    RAISE EXCEPTION 'the extension allowlist must cover all six profiles, including Loisir pending fields';
  END IF;
  IF (
       SELECT count(*)
       FROM public.ref_tourinsoft_reunion_route route
       WHERE route.variant = 'reunion-regional-v1'
         AND route.taxonomy_code IS NULL
         AND route.is_active
     ) IS DISTINCT FROM 11
     OR (
       SELECT count(*)
       FROM public.ref_tourinsoft_reunion_route route
       JOIN (VALUES
         ('PCU'::public.object_type, 'tourinsoft_reunion_decouverte_v1'),
         ('PNA'::public.object_type, 'tourinsoft_reunion_decouverte_v1'),
         ('PRD'::public.object_type, 'tourinsoft_reunion_decouverte_v1'),
         ('LOI'::public.object_type, 'tourinsoft_reunion_decouverte_v1'),
         ('HOT'::public.object_type, 'tourinsoft_reunion_hebergement_v1'),
         ('HLO'::public.object_type, 'tourinsoft_reunion_hebergement_v1'),
         ('CAMP'::public.object_type, 'tourinsoft_reunion_hebergement_v1'),
         ('HPA'::public.object_type, 'tourinsoft_reunion_hebergement_v1'),
         ('RVA'::public.object_type, 'tourinsoft_reunion_hebergement_v1'),
         ('RES'::public.object_type, 'tourinsoft_reunion_restauration_v1'),
         ('PSV'::public.object_type, 'tourinsoft_reunion_transport_v1')
       ) expected(object_type, target_profile)
         ON expected.object_type = route.object_type
        AND expected.target_profile = route.target_profile
       WHERE route.variant = 'reunion-regional-v1'
         AND route.taxonomy_code IS NULL
         AND route.is_active
     ) IS DISTINCT FROM 11
     OR EXISTS (
       SELECT 1
       FROM public.ref_tourinsoft_reunion_route route
       WHERE route.variant = 'reunion-regional-v1'
         AND route.object_type IN ('ACT','ASC','SPU')
         AND route.taxonomy_code IS NULL
         AND route.is_active
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.ref_tourinsoft_reunion_route route
       WHERE route.variant = 'reunion-regional-v1'
         AND route.object_type = 'SPU'
         AND route.taxonomy_domain = 'taxonomy_spu'
         AND route.taxonomy_code = 'tourist_info_office'
         AND route.target_profile = 'tourinsoft_reunion_information_service_v1'
         AND route.is_active
     ) THEN
    RAISE EXCEPTION 'regional default routes or fail-closed ACT/ASC/SPU routing changed';
  END IF;
  IF EXISTS (
       SELECT 1
       FROM unnest(ARRAY[
         'public.ref_tourinsoft_reunion_profile',
         'public.ref_tourinsoft_reunion_route',
         'public.object_interop_extension',
         'public.ref_tourinsoft_reunion_extension_field'
       ]) AS secured_table(table_name)
       WHERE to_regclass(secured_table.table_name) IS NULL
          OR NOT COALESCE((
               SELECT relrowsecurity
               FROM pg_class
               WHERE oid = to_regclass(secured_table.table_name)
             ), false)
     ) THEN
    RAISE EXCEPTION 'regional service-only table or RLS missing';
  END IF;
  IF EXISTS (
       SELECT 1
       FROM unnest(ARRAY['anon','authenticated']) AS public_role(role_name)
       CROSS JOIN unnest(ARRAY[
         'public.ref_tourinsoft_reunion_profile',
         'public.ref_tourinsoft_reunion_route',
         'public.object_interop_extension',
         'public.ref_tourinsoft_reunion_extension_field'
       ]) AS secured_table(table_name)
       CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS operation(privilege_name)
       WHERE has_table_privilege(public_role.role_name, secured_table.table_name, operation.privilege_name)
     ) OR EXISTS (
       SELECT 1
       FROM unnest(ARRAY[
         'public.ref_tourinsoft_reunion_profile',
         'public.ref_tourinsoft_reunion_route',
         'public.object_interop_extension',
         'public.ref_tourinsoft_reunion_extension_field'
       ]) AS secured_table(table_name)
       CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS operation(privilege_name)
       WHERE NOT has_table_privilege('service_role', secured_table.table_name, operation.privilege_name)
     ) THEN
    RAISE EXCEPTION 'regional table DML privilege gate wrong';
  END IF;
  IF (
    SELECT count(*)
    FROM pg_trigger
    WHERE tgrelid = ANY(ARRAY[
      'public.ref_tourinsoft_reunion_profile'::regclass,
      'public.ref_tourinsoft_reunion_route'::regclass,
      'public.object_interop_extension'::regclass
    ])
      AND NOT tgisinternal
      AND tgname LIKE 'update_%_updated_at'
  ) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'regional updated_at triggers missing';
  END IF;
  IF (SELECT unit FROM public.ref_capacity_metric WHERE code = 'terrace_seats') IS DISTINCT FROM 'seat' THEN
    RAISE EXCEPTION 'terrace_seats must use the canonical seat unit';
  END IF;
  IF EXISTS (
       SELECT 1
       FROM (VALUES
         ('api.tourinsoft_array_item_key(jsonb)'),
         ('api.jsonb_deep_overlay(jsonb,jsonb)'),
         ('api.jsonb_keep_allowed_paths(jsonb,text[],text)'),
         ('api.jsonb_leaf_paths(jsonb,text)'),
         ('api.jsonb_remove_unbacked_canonical_keys(jsonb,jsonb,text[])'),
         ('api.tourinsoft_reunion_resolve_profile(text,public.object_type)'),
         ('api.tourinsoft_reunion_regional_documents(text[])'),
         ('api.tourinsoft_reunion_documents(text[])'),
         ('api.get_object_tourinsoft(text,text)'),
         ('api.get_objects_tourinsoft_batch(text[],text)'),
         ('api.tourinsoft_reunion_unmapped_values()'),
         ('api.tourinsoft_reunion_regional_unmapped_values()'),
         ('api.tourinsoft_reunion_regional_routing_issues()'),
         ('api.tourinsoft_reunion_regional_extension_issues()')
       ) protected_function(signature)
       CROSS JOIN unnest(ARRAY['anon','authenticated']) AS public_role(role_name)
       WHERE has_function_privilege(public_role.role_name, protected_function.signature, 'EXECUTE')
     ) OR EXISTS (
       SELECT 1
       FROM (VALUES
         ('api.tourinsoft_array_item_key(jsonb)'),
         ('api.jsonb_deep_overlay(jsonb,jsonb)'),
         ('api.jsonb_keep_allowed_paths(jsonb,text[],text)'),
         ('api.jsonb_leaf_paths(jsonb,text)'),
         ('api.jsonb_remove_unbacked_canonical_keys(jsonb,jsonb,text[])'),
         ('api.tourinsoft_reunion_resolve_profile(text,public.object_type)'),
         ('api.tourinsoft_reunion_regional_documents(text[])'),
         ('api.tourinsoft_reunion_documents(text[])'),
         ('api.get_object_tourinsoft(text,text)'),
         ('api.get_objects_tourinsoft_batch(text[],text)'),
         ('api.tourinsoft_reunion_unmapped_values()'),
         ('api.tourinsoft_reunion_regional_unmapped_values()'),
         ('api.tourinsoft_reunion_regional_routing_issues()'),
         ('api.tourinsoft_reunion_regional_extension_issues()')
       ) protected_function(signature)
       WHERE NOT has_function_privilege('service_role', protected_function.signature, 'EXECUTE')
     ) THEN
    RAISE EXCEPTION 'regional serializer privilege gate wrong';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'api'
      AND p.proname IN ('tourinsoft_array_item_key','jsonb_deep_overlay','jsonb_keep_allowed_paths',
                        'jsonb_leaf_paths','jsonb_remove_unbacked_canonical_keys','tourinsoft_reunion_resolve_profile',
                        'tourinsoft_reunion_regional_documents','get_object_tourinsoft',
                        'get_objects_tourinsoft_batch','tourinsoft_reunion_regional_unmapped_values',
                        'tourinsoft_reunion_regional_routing_issues',
                        'tourinsoft_reunion_regional_extension_issues')
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'regional functions must be SECURITY INVOKER';
  END IF;

  INSERT INTO public.object(id, object_type, name, status, published_at) VALUES
    (ids[1], 'PCU', 'Musée régional test', 'published', now()),
    (ids[2], 'HLO', 'Hébergement régional test', 'published', now()),
    (ids[3], 'SPU', 'Office régional test', 'published', now()),
    (ids[4], 'ACT', 'Canyoning régional test', 'published', now()),
    (ids[5], 'RES', 'Restaurant régional test', 'published', now()),
    (ids[6], 'PSV', 'Transfert régional test', 'published', now()),
    (ids[7], 'PSV', 'Agence réceptive régionale test', 'published', now()),
    (ids[8], 'PSV', 'Location vélo régionale test', 'published', now()),
    (ids[9], 'PSV', 'Route régionale ambiguë test', 'published', now()),
    (ids[12], 'ACT', 'Activité sans bordereau confirmé test', 'published', now());

  INSERT INTO public.object(id, object_type, name, status, published_at, commercial_visibility)
  VALUES
    (ids[10], 'RES', 'Restaurant suspendu régional test', 'published', now(), 'lapsed'),
    (ids[11], 'RES', 'Restaurant brouillon régional test', 'draft', NULL, 'active');

  INSERT INTO public.object_taxonomy(object_id, domain, ref_code_id)
  SELECT fixture.object_id, fixture.domain, rc.id
  FROM (VALUES
    (ids[1], 'taxonomy_pcu', 'museum'),
    (ids[3], 'taxonomy_spu', 'tourist_info_office'),
    (ids[4], 'taxonomy_act', 'canyoning'),
    (ids[5], 'taxonomy_res', 'restaurant'),
    (ids[6], 'taxonomy_psv', 'transfer'),
    (ids[7], 'taxonomy_psv', 'receptive_travel_agency'),
    (ids[8], 'taxonomy_psv', 'cycle_scooter_rental'),
    (ids[9], 'taxonomy_psv', 'passenger_car_rental'),
    (ids[10], 'taxonomy_res', 'restaurant'),
    (ids[11], 'taxonomy_res', 'restaurant'),
    (ids[12], 'taxonomy_act', 'fishing')
  ) fixture(object_id, domain, code)
  JOIN public.ref_code rc ON rc.domain = fixture.domain AND rc.code = fixture.code;

  IF (SELECT count(*) FROM public.object_taxonomy WHERE object_id = ANY(ids)) IS DISTINCT FROM 11 THEN
    RAISE EXCEPTION 'all eleven routing taxonomy fixtures, including fishing, must exist';
  END IF;

  -- Simulate a future overlapping ancestor rule: a specific child and its ancestor
  -- must not silently select two different target profiles.
  INSERT INTO public.ref_tourinsoft_reunion_route(
    variant, object_type, taxonomy_domain, taxonomy_code, target_profile, priority, notes
  ) VALUES
    ('reunion-regional-v1', 'PSV', 'taxonomy_psv', 'passenger_car_rental',
     'tourinsoft_reunion_information_service_v1', 10, 'SQL ambiguity child fixture'),
    ('reunion-regional-v1', 'PSV', 'taxonomy_psv', 'location_vehicule',
     'tourinsoft_reunion_transport_v1', 20, 'SQL ambiguity ancestor fixture');

  -- Deliberately attach shared facets to every family: the wire profile must emit
  -- them only when the corresponding Tourinsoft bordereau declares the field.
  INSERT INTO public.object_pet_policy(object_id, accepted, conditions)
  SELECT object_id, true, 'Sur demande'
  FROM unnest(ids) AS fixture(object_id);

  INSERT INTO public.object_group_policy(object_id, min_size, max_size, group_only)
  VALUES (ids[1], 2, 12, false), (ids[3], 2, 12, false),
         (ids[5], 2, 12, false), (ids[6], 2, 12, false);

  INSERT INTO public.object_capacity(object_id, metric_id, value_integer, unit)
  SELECT fixture.object_id, metric.id, fixture.value_integer, metric.unit
  FROM (VALUES
    (ids[5], 'max_capacity', 42),
    (ids[5], 'seats', 30),
    (ids[5], 'terrace_seats', 12),
    (ids[6], 'max_capacity', 99)
  ) fixture(object_id, metric_code, value_integer)
  JOIN public.ref_capacity_metric metric ON metric.code = fixture.metric_code;

  INSERT INTO public.object_payment_method(object_id, payment_method_id)
  SELECT ids[5], method.id
  FROM public.ref_code_payment_method method
  WHERE method.code IN ('cheque', 'especes');

  INSERT INTO public.object_language(object_id, language_id)
  SELECT ids[5], language.id
  FROM public.ref_language language
  WHERE language.code IN ('fr', 'nl');

  INSERT INTO public.object_price(
    object_id, kind_id, amount, amount_max, valid_from, valid_to, conditions
  )
  SELECT fixture.object_id, kind.id, fixture.amount, fixture.amount_max,
         fixture.valid_from, fixture.valid_to, 'Tarif public'
  FROM (VALUES
    (ids[2], 25.00::numeric, 30.00::numeric, '2026-01-01'::date, '2026-12-31'::date),
    (ids[5], 15.50::numeric, 20.00::numeric, '2026-01-01'::date, '2026-12-31'::date)
  ) fixture(object_id, amount, amount_max, valid_from, valid_to)
  JOIN public.ref_code_price_kind kind ON kind.code = 'adulte' AND kind.is_active;

  INSERT INTO public.object_legal(object_id, type_id, value, validity_mode)
  SELECT fixture.object_id, legal_type.id, fixture.value, 'forever'
  FROM (VALUES
    (ids[5], '{"siret":"123 456 789 01234","secret":"must-not-leak-legal-valid"}'::jsonb),
    (ids[1], '{"secret":"must-not-leak-legal-invalid"}'::jsonb)
  ) fixture(object_id, value)
  JOIN public.ref_legal_type legal_type ON legal_type.code = 'siret' AND legal_type.is_public;

  INSERT INTO public.contact_channel(object_id, kind_id, value, is_public, is_primary, position)
  SELECT ids[5], kind.id, fixture.value, fixture.is_public, fixture.is_primary, fixture.position
  FROM (VALUES
    ('phone', '+262262000005', true, true, 1),
    ('phone', '+262262999995', false, false, 2)
  ) fixture(code, value, is_public, is_primary, position)
  JOIN public.ref_code_contact_kind kind ON kind.code = fixture.code;

  INSERT INTO public.media(
    object_id, media_type_id, title, url, is_main, is_published,
    visibility, rights_expires_at, position
  )
  SELECT ids[5], media_type.id, fixture.title, fixture.url, fixture.is_main,
         fixture.is_published, fixture.visibility, fixture.rights_expires_at, fixture.position
  FROM (VALUES
    ('Photo publique', 'https://regional.test/public.jpg', true, true, 'public', NULL::date, 1),
    ('Photo privée', 'https://regional.test/private.jpg', false, true, 'private', NULL::date, 2),
    ('Photo non publiée', 'https://regional.test/unpublished.jpg', false, false, 'public', NULL::date, 3),
    ('Photo expirée', 'https://regional.test/expired.jpg', false, true, 'public', CURRENT_DATE - 1, 4)
  ) fixture(title, url, is_main, is_published, visibility, rights_expires_at, position)
  JOIN public.ref_code_media_type media_type ON media_type.code = 'photo';

  INSERT INTO public.ref_document(url, title, valid_from, valid_to, access_scope)
  VALUES
    ('https://regional.test/current.pdf', 'Document courant', CURRENT_DATE - 1, CURRENT_DATE + 1, 'public'),
    ('https://regional.test/future-link.pdf', 'Lien futur', NULL, NULL, 'public'),
    ('https://regional.test/expired-link.pdf', 'Lien expiré', NULL, NULL, 'public'),
    ('https://regional.test/future-ref.pdf', 'Référentiel futur', CURRENT_DATE + 1, NULL, 'public'),
    ('https://regional.test/expired-ref.pdf', 'Référentiel expiré', NULL, CURRENT_DATE - 1, 'public'),
    ('https://regional.test/private.pdf', 'Document privé', NULL, NULL, 'legal_private');

  INSERT INTO public.object_document(object_id, document_id, valid_from, valid_to, position)
  SELECT ids[5], document.id,
         CASE WHEN document.url LIKE '%future-link.pdf' THEN CURRENT_DATE + 1 END,
         CASE WHEN document.url LIKE '%expired-link.pdf' THEN CURRENT_DATE - 1 END,
         row_number() OVER (ORDER BY document.url)::integer
  FROM public.ref_document document
  WHERE document.url LIKE 'https://regional.test/%';

  INSERT INTO public.object_interop_extension(object_id, profile, external_id, data, source)
  VALUES (ids[5], 'tourinsoft_reunion_restauration_v1',
          'RESREU999999R005',
          '{
            "SyndicObjectName":"must-not-win",
            "RaisonSociale":"must-never-leak",
            "TisTracking":{"Trace":"must-never-leak"},
            "ClassificationType":{"ThesCode":"REST","ThesID":"00000000-0000-0000-0000-000000000001"},
            "ClassificationCategories":[{"ThesCode":"REST","ThesID":"00000000-0000-0000-0000-000000000002"}],
            "ModesPaiements":[
              {"ThesCode":"CHQ","ThesID":"00000000-0000-0000-0000-000000000003"},
              {"ThesCode":"ES","ThesID":"00000000-0000-0000-0000-000000000004"}
            ],
            "Tarifs":[
              {"Datedebutaffichage":"2027-01-01","Datefinvalidite":"2027-12-31","MinimumEuro":15.5,"MaximumEuro":20,"ID":"wrong-price"},
              {"Datedebutaffichage":"2026-01-01","Datefinvalidite":"2026-12-31","MinimumEuro":15.5,"MaximumEuro":20,"ID":"price-roundtrip"}
            ],
            "Moyencommunications":[{"Coordonnees":"private-extension@example.re","Complementdinformations":"privé"}],
            "Photos":[
              {"Photo":{"Url":"https://regional.test/public.jpg","Titre":"stale-title","Credit":"stale-credit"}},
              {"Photo":{"Url":"https://regional.test/extension-private.jpg"},"Licencecreativecommons":"private"}
            ],
            "PrestationProximites":[{"ThesCode":"PPUB","ThesLibelle":"Parking public","Ordre":999}]
          }'::jsonb,
          'SQL test');

  merged := api.jsonb_deep_overlay(
    '[{"ThesCode":"WRONG","ThesID":"00000000-0000-0000-0000-000000000099"}]'::jsonb,
    '[{"ThesCode":"REST","ThesLibelle":"Restaurant"}]'::jsonb
  );
  IF jsonb_array_length(merged) IS DISTINCT FROM 1
     OR merged->0->>'ThesCode' IS DISTINCT FROM 'REST'
     OR merged->0 ? 'ThesID' THEN
    RAISE EXCEPTION 'a mismatched extension item must not contaminate the canonical array: %', merged;
  END IF;
  IF api.tourinsoft_array_item_key('{"Datedebut":"2026-01-01"}'::jsonb)
       IS NOT DISTINCT FROM api.tourinsoft_array_item_key('{"Datefin":"2026-01-01"}'::jsonb)
     OR api.tourinsoft_array_item_key('{"Datedebutaffichage":"2026-01-01","MinimumEuro":15.50}'::jsonb)
       IS DISTINCT FROM api.tourinsoft_array_item_key('{"Datedebutaffichage":"2026-01-01","MinimumEuro":15.5}'::jsonb)
     OR api.tourinsoft_array_item_key('{"Datedebutaffichage":"2026-01-01"}'::jsonb)
       IS NOT DISTINCT FROM api.tourinsoft_array_item_key('{"Datefinvalidite":"2026-01-01"}'::jsonb) THEN
    RAISE EXCEPTION 'opening/price business keys must preserve positions and normalize numeric scale';
  END IF;

  BEGIN
    INSERT INTO public.object_interop_extension(object_id, profile, data)
    VALUES (ids[1], 'tourinsoft_reunion_decouverte_v1', '{"SyndicObjectID":"must-be-rejected"}');
    RAISE EXCEPTION 'SyndicObjectID must use the profile-scoped external_id column';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  SET LOCAL ROLE service_role;
    SELECT jsonb_object_agg(d.object_id, d.document) INTO result
    FROM api.tourinsoft_reunion_regional_documents(ids) d;
    PERFORM count(*) FROM public.ref_tourinsoft_reunion_profile WHERE is_active;
    PERFORM count(*) FROM api.tourinsoft_reunion_regional_extension_issues();
  RESET ROLE;
  IF (SELECT count(*) FROM jsonb_object_keys(result)) IS DISTINCT FROM 8 THEN
    RAISE EXCEPTION 'expected 8 routed documents, got %', result;
  END IF;
  IF result ? ids[9]
     OR NOT EXISTS (
       SELECT 1
       FROM api.tourinsoft_reunion_regional_routing_issues() issue
       WHERE issue.object_id = ids[9]
         AND issue.issue = 'ambiguous_specific_routes'
         AND issue.candidate_profiles @> ARRAY[
           'tourinsoft_reunion_information_service_v1',
           'tourinsoft_reunion_transport_v1'
         ]::text[]
     ) THEN
    RAISE EXCEPTION 'ambiguous taxonomy routes must fail closed and enter the review queue';
  END IF;
  IF result ? ids[10] THEN
    RAISE EXCEPTION 'commercially lapsed published objects must not be syndicated';
  END IF;
  IF result ? ids[11] THEN
    RAISE EXCEPTION 'draft objects must not be syndicated';
  END IF;
  IF result ? ids[12]
     OR NOT EXISTS (
       SELECT 1 FROM api.tourinsoft_reunion_regional_routing_issues() issue
       WHERE issue.object_id = ids[12] AND issue.issue = 'unroutable'
     ) THEN
    RAISE EXCEPTION 'ACT without a taxonomy-confirmed target feed must fail closed';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM api.tourinsoft_reunion_regional_routing_issues() issue
       WHERE issue.object_id = ids[2] AND issue.issue = 'provisional_type_fallback'
     )
     OR NOT EXISTS (
       SELECT 1 FROM api.tourinsoft_reunion_regional_routing_issues() issue
       WHERE issue.object_id = ids[5] AND issue.issue = 'provisional_type_fallback'
     ) THEN
    RAISE EXCEPTION 'HLO/RES type-only routes must stay visible in the CRT review queue';
  END IF;
  IF result->ids[1]->>'ObjectTypeName' IS DISTINCT FROM 'Découverte'
     OR result->ids[1]->'ClassificationSousCategoriePatCulturels'->0->>'ThesCode' IS DISTINCT FROM 'MUSE'
     OR result->ids[1]->>'EnLigne' IS DISTINCT FROM 'true'
     OR result->ids[1]->>'Groupeaccepte' IS DISTINCT FROM 'true'
     OR result->ids[1]->'Animauxs'->0->>'Animauxacceptes' IS DISTINCT FROM 'true'
     OR result->ids[1] ? 'SIRET'
     OR (result->ids[1])::text LIKE '%must-not-leak-legal-invalid%'
     OR result->ids[1] ? 'SyndicObjectID' THEN
    RAISE EXCEPTION 'decouverte routing/taxonomy wrong: %', result->ids[1];
  END IF;
  IF result->ids[2]->>'ObjectTypeName' IS DISTINCT FROM 'Hébergement locatifs'
     OR result->ids[2]->'Classificationcategories'->0->>'ThesCode' IS DISTINCT FROM 'LSAI'
     OR result->ids[2]->'Animauxacceptess'->0->>'Animauxacceptes' IS DISTINCT FROM 'true'
     OR result->ids[2]->'Tarifs'->0->>'Nom' IS DISTINCT FROM 'Adulte'
     OR result->ids[2] ? 'EnLigne' THEN
    RAISE EXCEPTION 'hebergement routing/fallback wrong: %', result->ids[2];
  END IF;
  IF result->ids[3]->>'ObjectTypeName' IS DISTINCT FROM 'Information et service touristique'
     OR result->ids[3]->'ClassificationCategorie'->>'ThesCode' IS DISTINCT FROM 'ACC'
     OR result->ids[3]->'ClassificationSousCategorieInfoServs'->0->>'ThesCode' IS DISTINCT FROM 'OTI'
     OR result->ids[3] ?| ARRAY['Animauxs','EnLigne','Groupeaccepte','Receptiongroupe','Capacites','Tarifs','Reservations'] THEN
    RAISE EXCEPTION 'information routing/scalar category wrong: %', result->ids[3];
  END IF;
  IF result->ids[4]->'ClassificationCategoriesSousCategorieAdrenalines'->0->>'ThesCode' IS DISTINCT FROM 'CANY'
     OR result->ids[4] ?| ARRAY['Animauxs','Animauxacceptess','EnLigne','Groupeaccepte','Receptiongroupe'] THEN
    RAISE EXCEPTION 'loisir taxonomy wrong: %', result->ids[4];
  END IF;
  IF result->ids[5]->>'SyndicObjectName' IS DISTINCT FROM 'Restaurant régional test'
     OR result->ids[5]->>'SyndicObjectID' IS DISTINCT FROM 'RESREU999999R005'
     OR result->ids[5]->>'SIRET' IS DISTINCT FROM '12345678901234'
     OR (result->ids[5])::text LIKE '%must-not-leak-legal-valid%'
     OR result->ids[5]->'Tarifs'->0 ? 'Nom'
     OR (result->ids[5]->'Tarifs'->0->>'MinimumEuro')::numeric IS DISTINCT FROM 15.5
     OR result->ids[5]->'Tarifs'->0->>'ID' IS DISTINCT FROM 'price-roundtrip'
     OR (result->ids[5])::text LIKE '%wrong-price%'
     OR result->ids[5]->'PrestationProximites'->0->>'ThesCode' IS DISTINCT FROM 'PPUB'
     OR result->ids[5]->'PrestationProximites'->0 ? 'Ordre'
     OR result->ids[5]->'ClassificationType'->>'ThesCode' IS DISTINCT FROM 'REST'
     OR result->ids[5]->'ClassificationType'->>'ThesID' IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'
     OR result->ids[5]->'ClassificationCategories'->0->>'ThesCode' IS DISTINCT FROM 'REST'
     OR result->ids[5]->'ClassificationCategories'->0->>'ThesID' IS DISTINCT FROM '00000000-0000-0000-0000-000000000002'
     OR (SELECT item->>'ThesID' FROM jsonb_array_elements(result->ids[5]->'ModesPaiements') item
         WHERE item->>'ThesCode' = 'CHQ') IS DISTINCT FROM '00000000-0000-0000-0000-000000000003'
     OR (SELECT item->>'ThesID' FROM jsonb_array_elements(result->ids[5]->'ModesPaiements') item
         WHERE item->>'ThesCode' = 'ES') IS DISTINCT FROM '00000000-0000-0000-0000-000000000004'
     OR result->ids[5]->>'EnLigne' IS DISTINCT FROM 'true'
     OR result->ids[5]->>'Receptiongroupe' IS DISTINCT FROM 'true'
     OR (result->ids[5]->'Capacites'->0->>'Capaciteenterrasse')::integer IS DISTINCT FROM 12
     OR (result->ids[5])::text LIKE '%must-never-leak%'
     OR (result->ids[5])::text LIKE '%private-extension@example.re%'
     OR (result->ids[5])::text LIKE '%extension-private.jpg%'
     OR (result->ids[5])::text LIKE '%stale-title%'
     OR (result->ids[5])::text LIKE '%stale-credit%' THEN
    RAISE EXCEPTION 'canonical-over-extension or extension round-trip wrong: %', result->ids[5];
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM api.tourinsoft_reunion_regional_extension_issues() issue
    WHERE issue.object_id = ids[5]
      AND issue.profile = 'tourinsoft_reunion_restauration_v1'
      AND issue.paths @> ARRAY['RaisonSociale','TisTracking.Trace']::text[]
  ) THEN
    RAISE EXCEPTION 'excluded/private extension fields must be omitted and reported';
  END IF;
  IF jsonb_array_length(result->ids[5]->'Moyencommunications') IS DISTINCT FROM 1
     OR (result->ids[5])::text LIKE '%+262262999995%'
     OR jsonb_array_length(result->ids[5]->'Photos') IS DISTINCT FROM 1
     OR result->ids[5]->'Photos'->0->'Photo'->>'Url' IS DISTINCT FROM 'https://regional.test/public.jpg'
     OR (result->ids[5])::text LIKE '%private.jpg%'
     OR (result->ids[5])::text LIKE '%unpublished.jpg%'
     OR (result->ids[5])::text LIKE '%expired.jpg%'
     OR jsonb_array_length(result->ids[5]->'Fichiers') IS DISTINCT FROM 1
     OR result->ids[5]->'Fichiers'->0->'DocumentFichier'->>'Url' IS DISTINCT FROM 'https://regional.test/current.pdf'
     OR (result->ids[5])::text LIKE '%future-link.pdf%'
     OR (result->ids[5])::text LIKE '%expired-link.pdf%'
     OR (result->ids[5])::text LIKE '%future-ref.pdf%'
     OR (result->ids[5])::text LIKE '%expired-ref.pdf%'
     OR (result->ids[5])::text LIKE '%private.pdf%' THEN
    RAISE EXCEPTION 'regional public/temporal contact-media-document gate wrong: %', result->ids[5];
  END IF;
  IF jsonb_array_length(result->ids[5]->'LanguesParleess') IS DISTINCT FROM 1
     OR result->ids[5]->'LanguesParleess'->0->>'ThesCode' IS DISTINCT FROM 'FR'
     OR NOT EXISTS (
       SELECT 1 FROM api.tourinsoft_reunion_regional_unmapped_values() missing
       WHERE missing.profile = 'tourinsoft_reunion_common_v1'
         AND missing.domain = 'language'
         AND missing.source_code = 'nl'
         AND missing.object_count >= 1
     ) THEN
    RAISE EXCEPTION 'unknown language must be omitted and reported for mapping review';
  END IF;
  IF result->ids[6]->>'ObjectTypeName' IS DISTINCT FROM 'Transport'
     OR result->ids[6]->'ClassificationSousCategorieServicess'->0->>'ThesCode' IS DISTINCT FROM 'TRAN'
     OR result->ids[6] ?| ARRAY['Animauxs','Animauxacceptess','EnLigne','Groupeaccepte','Receptiongroupe','Capacites'] THEN
    RAISE EXCEPTION 'transport routing/taxonomy wrong: %', result->ids[6];
  END IF;
  IF result->ids[7]->>'ObjectTypeName' IS DISTINCT FROM 'Information et service touristique'
     OR result->ids[7]->'ClassificationCategorie'->>'ThesCode' IS DISTINCT FROM 'ORG'
     OR result->ids[7]->'ClassificationSousCategorieOrgs'->0->>'ThesCode' IS DISTINCT FROM 'AVR' THEN
    RAISE EXCEPTION 'PSV receptive-agency override routing wrong: %', result->ids[7];
  END IF;
  IF result->ids[8]->>'ObjectTypeName' IS DISTINCT FROM 'Loisirs / Plein air'
     OR result->ids[8]->'ClassificationCategoriess'->0->>'ThesCode' IS DISTINCT FROM 'LOC V'
     OR result->ids[8]->'ClassificationCategoriesSousCategorieVehiculeLoisirs'->0->>'ThesCode' IS DISTINCT FROM 'VELO' THEN
    RAISE EXCEPTION 'PSV cycle-rental override routing wrong: %', result->ids[8];
  END IF;

  batch := api.get_objects_tourinsoft_batch(ids || ids[1], 'reunion-regional-v1');
  IF batch IS DISTINCT FROM result
     OR api.get_object_tourinsoft(ids[5], 'reunion-regional-v1') IS DISTINCT FROM result->ids[5] THEN
    RAISE EXCEPTION 'regional detail/batch parity or deduplication wrong';
  END IF;

  SELECT d.document INTO accommodation_direct
  FROM api.tourinsoft_reunion_documents(ARRAY[ids[2]]) d
  WHERE d.object_id = ids[2];
  legacy_direct := api.get_object_interop(ids[2], 'tourinsoft');
  IF api.get_object_tourinsoft(ids[2], 'reunion-hebergement-v1') IS DISTINCT FROM accommodation_direct
     OR api.get_object_tourinsoft(ids[2], 'legacy-v1') IS DISTINCT FROM legacy_direct
     OR api.get_object_tourinsoft(ids[2], NULL) IS DISTINCT FROM legacy_direct
     OR api.get_object_tourinsoft(ids[2]) IS DISTINCT FROM legacy_direct
     OR api.get_objects_tourinsoft_batch(ARRAY[ids[2]])
          IS DISTINCT FROM jsonb_build_object(ids[2], legacy_direct) THEN
    RAISE EXCEPTION 'I4f wrapper redefinition regressed accommodation or legacy variants';
  END IF;

  RAISE EXCEPTION 'ROLLBACK_PROBE';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IS DISTINCT FROM 'ROLLBACK_PROBE' THEN RAISE; END IF;
END;
$test$;

DO $$ BEGIN RAISE NOTICE 'test_tourinsoft_reunion_regional_v1.sql: OK'; END $$;
