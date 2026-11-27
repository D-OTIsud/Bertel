-- Régression noms/statuts des suggestions. Les identités HTTP et les vrais rôles
-- SQL sont éprouvés ensemble ; tous les témoins disparaissent au ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;

DO $test$
DECLARE
  v_org text := 'ORGRUN9999999750';
  v_other_org text := 'ORGRUN9999999760';
  v_test_org text := 'ORGRUN9999999770';
  v_exact text := 'HLORUN9999999751';
  v_prefix text := 'LOIRUN9999999752';
  v_infix text := 'RESRUN9999999753';
  v_draft text := 'HLORUN9999999754';
  v_hidden text := 'HLORUN9999999755';
  v_archived text := 'HLORUN9999999756';
  v_foreign_hidden text := 'HLORUN9999999761';
  v_test_published text := 'HLORUN9999999771';
  v_test_hidden text := 'HLORUN9999999772';
  v_editor uuid := '9e333333-3333-4333-8333-333333333331';
  v_reader uuid := '9e333333-3333-4333-8333-333333333332';
  v_stranger uuid := '9e333333-3333-4333-8333-333333333333';
  v_test_editor uuid := '9e333333-3333-4333-8333-333333333334';
  v_publisher uuid;
  v_admin uuid;
  v_membership uuid;
  v_ids text[];
  v_legacy text[];
  v_empty text[];
  v_oid oid;
  v_before_owner oid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT id INTO STRICT v_publisher FROM public.ref_org_role WHERE code = 'publisher';
  SELECT id INTO STRICT v_admin FROM public.ref_org_admin_role WHERE code = 'org_admin';

  INSERT INTO public.object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'ORG suggestions réelles 27', 'published'),
    (v_other_org, 'ORG', 'ORG suggestions étrangère 27', 'published'),
    (v_test_org, 'ORG', 'ORG suggestions bac à sable 27', 'published'),
    (v_exact, 'HLO', 'Nomst27 Jardin Créole', 'published'),
    (v_prefix, 'LOI', 'Nomst27 Jardin Créole Annexe', 'published'),
    (v_infix, 'RES', 'Kaz Nomst27 Jardin Créole', 'published'),
    (v_draft, 'HLO', 'Nomst27 Jardin Créole Brouillon', 'draft'),
    (v_hidden, 'HLO', 'Nomst27 Jardin Créole Hors ligne', 'hidden'),
    (v_archived, 'HLO', 'Nomst27 Jardin Créole Archive', 'archived'),
    (v_foreign_hidden, 'HLO', 'Nomst27 Jardin Créole Étranger', 'hidden'),
    (v_test_published, 'HLO', 'Nomst27 Jardin Créole Test', 'published'),
    (v_test_hidden, 'HLO', 'Nomst27 Jardin Créole Test Hors ligne', 'hidden'),
    ('HLORUN9999999781', 'HLO', 'Nomst27 100% Réel', 'published'),
    ('HLORUN9999999782', 'HLO', 'Nomst27 1000 Réel', 'published'),
    ('HLORUN9999999783', 'HLO', 'Nomst27 x_y', 'published'),
    ('HLORUN9999999784', 'HLO', 'Nomst27 xay', 'published'),
    ('HLORUN9999999785', 'HLO', E'Nomst27 chemin\\suite', 'published'),
    ('HLORUN9999999786', 'HLO', 'Nomst27 chemin suite', 'published');

  INSERT INTO public.org_config (org_object_id, access_scope, is_test_org) VALUES
    (v_org, 'own_objects_only', false),
    (v_other_org, 'own_objects_only', false),
    (v_test_org, 'own_objects_only', true);

  INSERT INTO public.object_org_link (object_id, org_object_id, role_id, is_primary) VALUES
    (v_exact, v_org, v_publisher, true),
    (v_prefix, v_org, v_publisher, true),
    (v_infix, v_org, v_publisher, true),
    (v_draft, v_org, v_publisher, true),
    (v_hidden, v_org, v_publisher, true),
    (v_archived, v_org, v_publisher, true),
    (v_foreign_hidden, v_other_org, v_publisher, true),
    (v_test_published, v_test_org, v_publisher, true),
    (v_test_hidden, v_test_org, v_publisher, true);

  ASSERT (SELECT is_test FROM public.object WHERE id = v_test_published),
    'le témoin publié du bac à sable doit être réellement marqué is_test';
  ASSERT (SELECT is_test FROM public.object WHERE id = v_test_hidden),
    'le témoin hors ligne du bac à sable doit être réellement marqué is_test';
  ASSERT NOT (SELECT is_test FROM public.object WHERE id = v_hidden),
    'le témoin hors ligne réel ne doit pas être dans le bac à sable';

  INSERT INTO auth.users (id, email) VALUES
    (v_editor, 'suggestion-editor-27@test.local'),
    (v_reader, 'suggestion-reader-27@test.local'),
    (v_stranger, 'suggestion-stranger-27@test.local'),
    (v_test_editor, 'suggestion-sandbox-27@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.app_user_profile (id, role, display_name) VALUES
    (v_editor, 'tourism_agent', 'Éditeur suggestions 27'),
    (v_reader, 'tourism_agent', 'Lecteur suggestions 27'),
    (v_stranger, 'tourism_agent', 'Étranger suggestions 27'),
    (v_test_editor, 'tourism_agent', 'Éditeur bac à sable 27')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
  INSERT INTO public.user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_editor, v_org, true) RETURNING id INTO v_membership;
  INSERT INTO public.user_org_admin_role (membership_id, role_id, is_active)
    VALUES (v_membership, v_admin, true);
  INSERT INTO public.user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_reader, v_org, true);
  INSERT INTO public.user_org_membership (user_id, org_object_id, is_active)
    VALUES (v_test_editor, v_test_org, true) RETURNING id INTO v_membership;
  INSERT INTO public.user_org_admin_role (membership_id, role_id, is_active)
    VALUES (v_membership, v_admin, true);

  -- Suffisamment de noms publics pour éprouver les bornes 8/20 sans dépendre du corpus.
  INSERT INTO public.object (id, object_type, name, status)
  SELECT 'HLORUN99999998' || lpad(g.i::text, 2, '0'), 'HLO',
         'Nomst27 Volume ' || lpad(g.i::text, 2, '0'), 'published'
  FROM generate_series(1, 25) g(i);

  -- Anonyme : normalisation, fragments et tri exact > préfixe > infixe.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  SELECT array_agg(r.id ORDER BY r.ord) INTO v_ids
  FROM api.search_objects_by_name('NOMST27 JARDIN CRÉOLE', 20, NULL::public.object_status[])
       WITH ORDINALITY r(id, name, object_type, status, city, image_url, ord);
  ASSERT v_ids = ARRAY[v_exact, v_prefix, v_infix],
    format('anon : tri ou périmètre publié incorrect : %s', v_ids);
  SELECT array_agg(r.id ORDER BY r.ord) INTO v_ids
  FROM api.search_objects_by_name(E'  nomst27  jardin\t cré  ', 20, NULL::public.object_status[])
       WITH ORDINALITY r(id, name, object_type, status, city, image_url, ord);
  ASSERT v_ids = ARRAY[v_exact, v_prefix, v_infix],
    format('nom partiel multi-mot/espaces : attendu les 3 publiés, vu %s', v_ids);
  ASSERT EXISTS (SELECT 1 FROM api.search_objects_by_name('no', 20, NULL::public.object_status[])),
    'les fragments de deux caractères doivent produire des suggestions';
  ASSERT NOT EXISTS (SELECT 1 FROM api.search_objects_by_name('n', 20, NULL::public.object_status[])),
    'un caractère ne doit pas déclencher de recherche';
  ASSERT NOT EXISTS (SELECT 1 FROM api.search_objects_by_name('  ', 20, NULL::public.object_status[])),
    'les espaces seuls ne doivent pas déclencher de recherche';
  ASSERT NOT EXISTS (SELECT 1 FROM api.search_objects_by_name(NULL, 20, NULL::public.object_status[])),
    'un terme NULL ne doit pas déclencher de recherche';

  -- Les métacaractères ne sont pas des opérateurs de recherche.
  SELECT array_agg(r.id) INTO v_ids
  FROM api.search_objects_by_name('nomst27 100%', 20, NULL::public.object_status[]) r;
  ASSERT v_ids = ARRAY['HLORUN9999999781'], format('%% doit rester littéral : %s', v_ids);
  SELECT array_agg(r.id) INTO v_ids
  FROM api.search_objects_by_name('nomst27 x_', 20, NULL::public.object_status[]) r;
  ASSERT v_ids = ARRAY['HLORUN9999999783'], format('_ doit rester littéral : %s', v_ids);
  SELECT array_agg(r.id) INTO v_ids
  FROM api.search_objects_by_name(E'nomst27 chemin\\', 20, NULL::public.object_status[]) r;
  ASSERT v_ids = ARRAY['HLORUN9999999785'], format('le backslash doit rester littéral : %s', v_ids);
  ASSERT NOT EXISTS (
    SELECT 1 FROM api.search_objects_by_name('nomst27%'' OR TRUE --', 20, NULL::public.object_status[])
  ), 'la saisie ne doit devenir ni SQL ni motif LIKE';

  ASSERT (SELECT count(*) FROM api.search_objects_by_name('nomst27')) = 8,
    'la signature historique à un argument doit garder sa limite par défaut de 8';
  ASSERT (SELECT count(*) FROM api.search_objects_by_name('nomst27', NULL)) = 8,
    'la limite NULL historique doit rester 8';
  ASSERT (SELECT count(*) FROM api.search_objects_by_name('nomst27', 200, NULL::public.object_status[])) = 20,
    'le plafond doit rester 20';
  ASSERT (SELECT count(*) FROM api.search_objects_by_name('nomst27', 0, NULL::public.object_status[])) = 1,
    'une limite nulle doit être bornée à 1';
  ASSERT (SELECT count(*) FROM api.search_objects_by_name('nomst27', -5, NULL::public.object_status[])) = 1,
    'une limite négative doit être bornée à 1';
  RESET ROLE;

  -- Étranger : un statut forgé ne lui donne pas accès à des fiches privées.
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_stranger)::text, true);
  SET LOCAL ROLE authenticated;
  ASSERT NOT COALESCE(api.current_user_can_edit_objects(), false),
    'le témoin étranger ne doit pas être éditeur';
  SELECT array_agg(r.id ORDER BY r.ord) INTO v_ids
  FROM api.search_objects_by_name('nomst27 jardin créole', 20, ARRAY['hidden', 'archived']::public.object_status[])
       WITH ORDINALITY r(id, name, object_type, status, city, image_url, ord);
  ASSERT v_ids = ARRAY[v_exact, v_prefix, v_infix],
    format('étranger : doit rester limité aux publiés malgré les statuts forgés : %s', v_ids);
  RESET ROLE;

  -- Membre lecteur : le périmètre étendu existe, la capacité d'édition manque.
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_reader)::text, true);
  SET LOCAL ROLE authenticated;
  ASSERT NOT COALESCE(api.current_user_can_edit_objects(), false),
    'le témoin membre lecteur ne doit pas être éditeur';
  ASSERT v_hidden IN (SELECT api.current_user_extended_object_ids()),
    'le membre lecteur doit avoir un périmètre étendu pour éprouver la garde éditeur';
  SELECT array_agg(r.id ORDER BY r.ord) INTO v_ids
  FROM api.search_objects_by_name('nomst27 jardin créole', 20, ARRAY['hidden']::public.object_status[])
       WITH ORDINALITY r(id, name, object_type, status, city, image_url, ord);
  ASSERT v_ids = ARRAY[v_exact, v_prefix, v_infix],
    format('lecteur : ne doit pas voir son hors-ligne via une sélection forgée : %s', v_ids);
  RESET ROLE;

  -- Éditeur : les quatre statuts sont disponibles uniquement dans son périmètre.
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_editor)::text, true);
  SET LOCAL ROLE authenticated;
  ASSERT COALESCE(api.current_user_can_edit_objects(), false), 'le témoin éditeur doit être réellement autorisé';
  ASSERT v_hidden IN (SELECT api.current_user_extended_object_ids()), 'le hors-ligne doit appartenir au périmètre';
  ASSERT v_archived IN (SELECT api.current_user_extended_object_ids()), 'l''archive doit appartenir au périmètre';
  ASSERT v_foreign_hidden NOT IN (SELECT api.current_user_extended_object_ids()),
    'le témoin étranger ne doit pas appartenir au périmètre';
  SELECT array_agg(r.id ORDER BY r.ord) INTO v_ids
  FROM api.search_objects_by_name('nomst27 jardin créole', 20, NULL::public.object_status[])
       WITH ORDINALITY r(id, name, object_type, status, city, image_url, ord);
  ASSERT cardinality(v_ids) = 6 AND v_ids @> ARRAY[v_exact, v_prefix, v_infix, v_draft, v_hidden, v_archived],
    format('éditeur : NULL doit inclure les 6 fiches autorisées : %s', v_ids);
  ASSERT v_ids[1] = v_exact, 'une concordance exacte doit rester devant les préfixes';
  SELECT array_agg(r.id ORDER BY r.ord) INTO v_empty
  FROM api.search_objects_by_name('nomst27 jardin créole', 20, ARRAY[]::public.object_status[])
       WITH ORDINALITY r(id, name, object_type, status, city, image_url, ord);
  ASSERT v_empty = v_ids, 'une sélection vide doit être identique à NULL';
  SELECT array_agg(r.id ORDER BY r.ord) INTO v_legacy
  FROM api.search_objects_by_name('nomst27 jardin créole', 20)
       WITH ORDINALITY r(id, name, object_type, status, city, image_url, ord);
  ASSERT v_legacy = v_ids, 'l''entrée historique doit déléguer au même périmètre sans filtre';

  SELECT array_agg(r.id ORDER BY r.ord) INTO v_ids
  FROM api.search_objects_by_name('nomst27 jardin créole', 20, ARRAY['published']::public.object_status[])
       WITH ORDINALITY r(id, name, object_type, status, city, image_url, ord);
  ASSERT v_ids = ARRAY[v_exact, v_prefix, v_infix], 'Publié explicite doit exclure les trois autres statuts';
  SELECT array_agg(r.id) INTO v_ids
  FROM api.search_objects_by_name('nomst27 jardin créole', 1, ARRAY['hidden']::public.object_status[]) r;
  ASSERT v_ids = ARRAY[v_hidden],
    format('Hors ligne doit filtrer AVANT la limite (le nom exact publié ne doit pas le masquer) : %s', v_ids);
  SELECT array_agg(r.id) INTO v_ids
  FROM api.search_objects_by_name('nomst27 jardin créole', 1, ARRAY['archived']::public.object_status[]) r;
  ASSERT v_ids = ARRAY[v_archived], 'Archivé explicite doit retourner l''archive autorisée';
  RESET ROLE;

  -- Le realm de test fonctionne dans les deux sens, y compris pour les publiés.
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_test_editor)::text, true);
  SET LOCAL ROLE authenticated;
  ASSERT api.current_user_test_realm(), 'le témoin test doit être dans le realm test';
  ASSERT COALESCE(api.current_user_can_edit_objects(), false), 'le témoin test doit être éditeur';
  SELECT array_agg(r.id ORDER BY r.ord) INTO v_ids
  FROM api.search_objects_by_name('nomst27 jardin créole', 20, NULL::public.object_status[])
       WITH ORDINALITY r(id, name, object_type, status, city, image_url, ord);
  ASSERT cardinality(v_ids) = 2 AND v_ids @> ARRAY[v_test_published, v_test_hidden],
    format('le testeur doit voir ses deux fiches et aucune fiche réelle : %s', v_ids);
  SELECT array_agg(r.id) INTO v_ids
  FROM api.search_objects_by_name('nomst27 jardin créole', 20, ARRAY['published']::public.object_status[]) r;
  ASSERT v_ids = ARRAY[v_test_published], 'le publié test doit rester visible dans son realm';
  RESET ROLE;

  -- Contrat API, propriétaire et privilèges non ambigus pour PostgREST.
  SELECT p.oid, p.proowner INTO STRICT v_oid, v_before_owner
  FROM pg_proc p WHERE p.oid = 'api.search_objects_by_name(text,integer)'::regprocedure;
  ASSERT (SELECT p.pronargdefaults FROM pg_proc p WHERE p.oid = v_oid) = 1,
    'la signature historique doit conserver un seul défaut (p_limit)';
  SELECT p.oid INTO STRICT v_oid
  FROM pg_proc p WHERE p.oid = 'api.search_objects_by_name(text,integer,public.object_status[])'::regprocedure;
  ASSERT (SELECT p.pronargdefaults FROM pg_proc p WHERE p.oid = v_oid) = 0,
    'la surcharge à trois paramètres ne doit pas introduire de DEFAULT ambigu';
  ASSERT (SELECT p.proowner FROM pg_proc p WHERE p.oid = v_oid) = v_before_owner,
    'la surcharge doit garder le même propriétaire que l''entrée historique';
  ASSERT (SELECT p.prosecdef AND p.provolatile = 's' FROM pg_proc p WHERE p.oid = v_oid),
    'la surcharge doit être STABLE SECURITY DEFINER et auto-autoriser ses résultats';
  ASSERT (SELECT array_to_string(p.proconfig, ',') FROM pg_proc p WHERE p.oid = v_oid) LIKE '%pg_temp',
    'le search_path de la surcharge doit terminer par pg_temp';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid IN ('api.search_objects_by_name(text,integer)'::regprocedure, v_oid)
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ), 'PUBLIC ne doit exécuter aucune des deux signatures';
  ASSERT has_function_privilege('anon', v_oid, 'EXECUTE')
     AND has_function_privilege('authenticated', v_oid, 'EXECUTE')
     AND has_function_privilege('service_role', v_oid, 'EXECUTE'),
    'les rôles API existants doivent pouvoir appeler la nouvelle signature';

  RAISE NOTICE 'suggestions nom/statut : fragments, limites, ordre, rôles, périmètres et realms OK';
END
$test$;

ROLLBACK;
