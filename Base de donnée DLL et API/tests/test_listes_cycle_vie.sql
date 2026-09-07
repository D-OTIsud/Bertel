-- test_listes_cycle_vie.sql
-- Prouve supabase/migrations/20260907044528_listes_personnelles_une_cycle_vie.sql
-- (module Listes — cycle de vie + revue architecte 2026-09-07), APRÈS
-- migration_object_list.sql + migration_list_resolver_internal.sql +
-- migration_list_write_creator_only.sql (17k) + migration_list_create_superuser_only.sql (17l).
--
-- Cas DISCRIMINANTS exigés par la revue architecte (pas de test qui passerait
-- aussi bien sur l'ancien code) :
--   §1 ancien membre / compte supprimé (créateur ET sender de mark_list_sent) ;
--   §2 admin rang >= 30 dans une AUTRE org ne doit RIEN administrer ici ;
--   §3 admin ne publie pas directement la personnelle d'un collègue (doit
--      passer par review_list_feature) ; retrait répété = no-op ; restore_list
--      no-op sur une liste active ;
--   §4 fuite photo/contacts d'un objet BROUILLON (item historique inséré hors
--      RPC) : absente de la grille, du détail, du lien public, ET de toute
--      duplication ;
--   §7 ACL ancienne (supprimée) et nouvelle signature de mark_list_sent.
-- Auto-portant + transactionnel (ROLLBACK final ; rien ne persiste).
\set ON_ERROR_STOP on
BEGIN;

-- =====================================================================
-- S0. Anti-vacuité du harnais + présence de la migration
-- =====================================================================
DO $$
BEGIN
  IF lower(coalesce(current_setting('plpgsql.check_asserts', true), 'on')) = 'off' THEN
    RAISE EXCEPTION 'harnais VACANT: plpgsql.check_asserts = off';
  END IF;
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='object_list' AND column_name='is_featured'),
    'object_list.is_featured absente — migration listes cycle de vie non appliquée';
  ASSERT to_regprocedure('api.list_featured_lists()') IS NOT NULL, 'api.list_featured_lists manquante';
  ASSERT to_regprocedure('api.list_list_proposals()') IS NOT NULL, 'api.list_list_proposals manquante';
  ASSERT to_regprocedure('api.request_list_feature(uuid)') IS NOT NULL, 'api.request_list_feature manquante';
  ASSERT to_regprocedure('api.review_list_feature(uuid,boolean)') IS NOT NULL, 'api.review_list_feature manquante';
  ASSERT to_regprocedure('api.set_list_featured(uuid,boolean)') IS NOT NULL, 'api.set_list_featured manquante';
  ASSERT to_regprocedure('api.restore_list(uuid)') IS NOT NULL, 'api.restore_list manquante';
  ASSERT to_regprocedure('api.duplicate_list(uuid)') IS NOT NULL, 'api.duplicate_list manquante';
  ASSERT to_regprocedure('api.ensure_list_share_link(uuid)') IS NOT NULL, 'api.ensure_list_share_link manquante';
  ASSERT to_regprocedure('api.mark_list_sent(uuid,uuid)') IS NOT NULL, 'api.mark_list_sent(uuid,uuid) manquante';
  ASSERT to_regprocedure('internal.purge_expired_lists()') IS NOT NULL, 'internal.purge_expired_lists manquante';
  ASSERT to_regprocedure('internal.org_is_admin(uuid,text)') IS NOT NULL, 'internal.org_is_admin manquante (revue §2)';
  ASSERT to_regprocedure('internal.org_membership_active(uuid,text)') IS NOT NULL, 'internal.org_membership_active manquante (revue §1)';
  RAISE NOTICE 'S0 OK';
END$$;

-- =====================================================================
-- S1. Verrouillage : anon/authenticated bloqués, ancienne signature disparue
-- =====================================================================
DO $$
BEGIN
  ASSERT to_regprocedure('api.mark_list_sent(uuid)') IS NULL,
    'REGRESSION §7: l''ancienne signature api.mark_list_sent(uuid) existe encore';

  ASSERT NOT has_function_privilege('anon','api.create_list(text,text,text[],jsonb,text)','execute'), 'LOCK: anon create_list';
  ASSERT NOT has_function_privilege('anon','api.get_list(uuid)','execute'), 'LOCK: anon get_list';
  ASSERT NOT has_function_privilege('anon','api.list_my_lists()','execute'), 'LOCK: anon list_my_lists';
  ASSERT NOT has_function_privilege('anon','api.list_featured_lists()','execute'), 'LOCK: anon list_featured_lists';
  ASSERT NOT has_function_privilege('anon','api.list_list_proposals()','execute'), 'LOCK: anon list_list_proposals';
  ASSERT NOT has_function_privilege('anon','api.duplicate_list(uuid)','execute'), 'LOCK: anon duplicate_list';
  ASSERT NOT has_function_privilege('anon','api.ensure_list_share_link(uuid)','execute'), 'LOCK: anon ensure_list_share_link';
  ASSERT NOT has_function_privilege('anon','api.request_list_feature(uuid)','execute'), 'LOCK: anon request_list_feature';
  ASSERT NOT has_function_privilege('anon','api.review_list_feature(uuid,boolean)','execute'), 'LOCK: anon review_list_feature';
  ASSERT NOT has_function_privilege('anon','api.set_list_featured(uuid,boolean)','execute'), 'LOCK: anon set_list_featured';
  ASSERT NOT has_function_privilege('anon','api.restore_list(uuid)','execute'), 'LOCK: anon restore_list';
  ASSERT NOT has_function_privilege('anon','api.delete_list(uuid)','execute'), 'LOCK: anon delete_list';
  ASSERT NOT has_function_privilege('anon','api.share_list(uuid,boolean,timestamptz)','execute'), 'LOCK: anon share_list';

  ASSERT NOT has_function_privilege('anon','api.mark_list_sent(uuid,uuid)','execute'), 'LOCK: anon mark_list_sent(2)';
  ASSERT NOT has_function_privilege('authenticated','api.mark_list_sent(uuid,uuid)','execute'),
    'REGRESSION §7: authenticated peut encore appeler mark_list_sent — un client pourrait se déclarer envoyé sans preuve';
  ASSERT has_function_privilege('service_role','api.mark_list_sent(uuid,uuid)','execute'), 'service_role DOIT pouvoir marquer envoyé';

  ASSERT NOT has_function_privilege('authenticated','internal.org_is_admin(uuid,text)','execute'), 'LOCK: authenticated internal.org_is_admin';
  ASSERT NOT has_function_privilege('authenticated','internal.purge_expired_lists()','execute'), 'LOCK: authenticated purge';
  ASSERT NOT has_function_privilege('service_role','internal.purge_expired_lists()','execute'),
    'purge_expired_lists doit être inaccessible même à service_role (REVOKE ALL FROM PUBLIC, aucun GRANT)';

  ASSERT NOT has_table_privilege('anon','object_list','select'), 'LOCK: anon SELECT direct object_list';
  ASSERT NOT has_table_privilege('authenticated','object_list','insert'), 'LOCK: authenticated INSERT direct object_list';
  RAISE NOTICE 'S1 OK';
END$$;

-- =====================================================================
-- S2. Fixtures
-- =====================================================================
DO $$
DECLARE
  v_orgA text := 'ORGLST0000000001';
  v_orgB text := 'ORGLST0000000002';
  v_role30 uuid; v_role10 uuid;
  v_kind_email uuid; v_kind_phone uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT id INTO v_role30 FROM ref_org_admin_role WHERE code = 'org_admin' LIMIT 1;
  SELECT id INTO v_role10 FROM ref_org_admin_role WHERE code = 'team_lead' LIMIT 1;
  ASSERT v_role30 IS NOT NULL AND v_role10 IS NOT NULL, 'fixture: ref_org_admin_role org_admin/team_lead manquants';

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA, 'ORG', 'Org LST A', 'published'),
    (v_orgB, 'ORG', 'Org LST B', 'published'),
    ('HOTLST0000000001', 'HOT', 'Publié sans image', 'published'),
    ('HOTLST0000000003', 'HOT', 'Brouillon fuite (hors admission)', 'draft');
  INSERT INTO object (id, object_type, name, status, cached_main_image_url) VALUES
    ('HOTLST0000000002', 'HOT', 'Publié avec image', 'published', 'https://img.example/published.jpg'),
    ('HOTLST0000000003', 'HOT', 'INTENTIONNELLEMENT DUPLIQUÉ', 'draft', 'https://img.example/DRAFT-LEAK.jpg')
    ON CONFLICT (id) DO UPDATE SET cached_main_image_url = EXCLUDED.cached_main_image_url;

  SELECT id INTO v_kind_email FROM ref_code_contact_kind WHERE code='email'   LIMIT 1;
  SELECT id INTO v_kind_phone FROM ref_code_contact_kind WHERE code='phone'   LIMIT 1;
  ASSERT v_kind_email IS NOT NULL AND v_kind_phone IS NOT NULL, 'fixture: ref_code_contact_kind email/phone manquants';
  INSERT INTO contact_channel (object_id, kind_id, value, is_public) VALUES
    ('HOTLST0000000001', v_kind_phone, '+262 262 00 00 09', TRUE),
    ('HOTLST0000000003', v_kind_email, 'DRAFT-LEAK-SENTINEL@exemple.test', TRUE),
    ('HOTLST0000000003', v_kind_phone, '+262 692 DRAFTLEAK', TRUE);

  -- Personas org A
  INSERT INTO auth.users (id, email) VALUES
    ('10000000-0000-4000-a000-000000000001', 'owner@lst.test'),
    ('10000000-0000-4000-a000-000000000002', 'formermember@lst.test'),
    ('10000000-0000-4000-a000-000000000003', 'colleague@lst.test'),
    ('10000000-0000-4000-a000-000000000004', 'admin30@lst.test'),
    ('10000000-0000-4000-a000-000000000005', 'rank10@lst.test'),
    ('10000000-0000-4000-a000-000000000006', 'admin30-otherorg@lst.test'),
    ('10000000-0000-4000-a000-000000000007', 'super@lst.test'),
    ('10000000-0000-4000-a000-000000000008', 'deletedsender@lst.test')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO app_user_profile (id, role, display_name) VALUES
    ('10000000-0000-4000-a000-000000000001', 'tourism_agent', 'Owner'),
    ('10000000-0000-4000-a000-000000000002', 'tourism_agent', 'FormerMember'),
    ('10000000-0000-4000-a000-000000000003', 'tourism_agent', 'Colleague'),
    ('10000000-0000-4000-a000-000000000004', 'tourism_agent', 'Admin30'),
    ('10000000-0000-4000-a000-000000000005', 'tourism_agent', 'Rank10'),
    ('10000000-0000-4000-a000-000000000006', 'tourism_agent', 'Admin30OtherOrg'),
    ('10000000-0000-4000-a000-000000000007', 'owner', 'Super'),
    ('10000000-0000-4000-a000-000000000008', 'tourism_agent', 'DeletedSender')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    ('10000000-0000-4000-a000-000000000001', v_orgA, TRUE),
    ('10000000-0000-4000-a000-000000000002', v_orgA, TRUE),
    ('10000000-0000-4000-a000-000000000003', v_orgA, TRUE),
    ('10000000-0000-4000-a000-000000000004', v_orgA, TRUE),
    ('10000000-0000-4000-a000-000000000005', v_orgA, TRUE),
    ('10000000-0000-4000-a000-000000000006', v_orgB, TRUE),   -- PAS membre de orgA
    ('10000000-0000-4000-a000-000000000008', v_orgA, TRUE);

  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
  SELECT m.id, v_role30, TRUE FROM user_org_membership m
   WHERE m.user_id = '10000000-0000-4000-a000-000000000004' AND m.org_object_id = v_orgA;
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
  SELECT m.id, v_role10, TRUE FROM user_org_membership m
   WHERE m.user_id = '10000000-0000-4000-a000-000000000005' AND m.org_object_id = v_orgA;
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
  SELECT m.id, v_role30, TRUE FROM user_org_membership m
   WHERE m.user_id = '10000000-0000-4000-a000-000000000006' AND m.org_object_id = v_orgB;

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'S2 OK: 2 orgs, 3 objets (1 brouillon-fuite), 8 users';
END$$;

-- =====================================================================
-- S3/S4. Création (lecteur), admission published-only, fuite historique, couverture
-- =====================================================================
DO $$
DECLARE
  v_owner uuid := '10000000-0000-4000-a000-000000000001';
  v_main uuid;
  j jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- §4 : le lecteur tente d'admettre le brouillon (fuite potentielle) — doit
    -- être silencieusement écarté à l'ADMISSION (published-only).
    v_main := api.create_list('static', 'Liste principale',
                ARRAY['HOTLST0000000001','HOTLST0000000002','HOTLST0000000003'], NULL, NULL);
    j := api.get_list(v_main)::jsonb;
    ASSERT jsonb_array_length(j->'items') = 2,
      format('§4 FAIL admission: 2 items publiés attendus, reçu %s', jsonb_array_length(j->'items'));
    ASSERT j->>'effective_cover_url' = 'https://img.example/published.jpg',
      format('cover fallback: 1er lieu sans image doit céder au 2e, reçu %s', j->>'effective_cover_url');
    ASSERT j->>'cover_url' IS NULL, 'cover_url explicite doit rester NULL tant que non choisi';
  RESET ROLE;

  -- §4 : simule une ligne HISTORIQUE (insérée hors RPC, avant cette migration)
  -- référençant le brouillon — doit rester invisible à la LECTURE.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO object_list_item(list_id, object_id, position)
    VALUES (v_main, 'HOTLST0000000003', 99);
  PERFORM set_config('request.jwt.claims', NULL, true);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    j := api.get_list(v_main)::jsonb;
    ASSERT jsonb_array_length(j->'items') = 2,
      format('§4 FAIL lecture historique: la ligne brouillon insérée hors RPC doit rester invisible, reçu %s items', jsonb_array_length(j->'items'));
    ASSERT NOT (j::text ILIKE '%DRAFT-LEAK%'),
      'FUITE §4: sentinelle du brouillon (image/contact) présente dans le détail';
    ASSERT j->>'effective_cover_url' <> 'https://img.example/DRAFT-LEAK.jpg',
      'FUITE §4: la couverture effective pointe vers le brouillon';

    -- Même vérification côté GRILLE (list_my_lists), qui résout désormais
    -- l'ensemble effectif via internal.list_grid_summary (§6).
    j := (SELECT elem FROM jsonb_array_elements((api.list_my_lists())::jsonb) elem WHERE elem->>'id' = v_main::text);
    ASSERT (j->>'item_count')::int = 2, format('§4/§6 FAIL grille: item_count doit exclure le brouillon, reçu %s', j->>'item_count');
    ASSERT NOT (j::text ILIKE '%DRAFT-LEAK%'), 'FUITE §4: sentinelle du brouillon présente dans la grille Mes listes';
  RESET ROLE;
  RAISE NOTICE 'S3/S4 OK: admission published-only + protection lecture historique + couverture';
END$$;

-- =====================================================================
-- S5. Isolation collègue (pas de grille générale)
-- =====================================================================
DO $$
DECLARE
  v_main uuid; v_colleague uuid := '10000000-0000-4000-a000-000000000003';
  v_ok boolean; j jsonb;
BEGIN
  SELECT id INTO v_main FROM object_list WHERE name = 'Liste principale' LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_colleague, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_ok := false;
    BEGIN PERFORM api.get_list(v_main); v_ok := true; EXCEPTION WHEN OTHERS THEN NULL; END;
    ASSERT NOT v_ok, 'ISOLATION FAIL: un collègue lit la liste personnelle non proposée d''un autre';

    j := api.list_my_lists()::jsonb;
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE e->>'id' = v_main::text),
      'ISOLATION FAIL: list_my_lists() du collègue contient la liste d''un autre';
  RESET ROLE;
  RAISE NOTICE 'S5 OK';
END$$;

-- =====================================================================
-- S6. §1 — ancien membre : perd l'accès à SA PROPRE liste ; admin la reprend ;
--          rank10 ne peut pas
-- =====================================================================
DO $$
DECLARE
  v_former uuid := '10000000-0000-4000-a000-000000000002';
  v_admin30 uuid := '10000000-0000-4000-a000-000000000004';
  v_rank10 uuid := '10000000-0000-4000-a000-000000000005';
  v_orgA text := 'ORGLST0000000001';
  v_formerList uuid; v_ok boolean; j jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_former, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_formerList := api.create_list('static', 'Liste de l''ancien membre', ARRAY['HOTLST0000000001'], NULL, NULL);
    ASSERT api.user_can_write_list(v_formerList), 'témoin: doit pouvoir écrire tant qu''actif';
  RESET ROLE;

  -- Désactivation de l'adhésion (départ de l'ORG) — created_by n'a AUCUNE FK,
  -- la ligne survit intacte.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    UPDATE user_org_membership SET is_active = FALSE
     WHERE user_id = v_former AND org_object_id = v_orgA;
  PERFORM set_config('request.jwt.claims', NULL, true);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_former, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_ok := false;
    BEGIN PERFORM api.get_list(v_formerList); v_ok := true; EXCEPTION WHEN OTHERS THEN NULL; END;
    ASSERT NOT v_ok, '§1 FAIL: un ancien membre lit encore SA PROPRE liste après désactivation';
    ASSERT NOT COALESCE(api.user_can_write_list(v_formerList), FALSE),
      '§1 FAIL: un ancien membre écrit encore SA PROPRE liste après désactivation';
    j := api.list_my_lists()::jsonb;
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE e->>'id' = v_formerList::text),
      '§1 FAIL: list_my_lists() de l''ancien membre contient encore sa liste devenue orpheline';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_rank10, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT NOT COALESCE(api.user_can_write_list(v_formerList), FALSE),
      '§2 FAIL: rank10 (team_lead) ne doit PAS reprendre une orpheline (seuil 30)';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin30, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT COALESCE(api.user_can_write_list(v_formerList), FALSE),
      '§1 FAIL: admin30 (rang >= 30) doit reprendre une liste orpheline';
    PERFORM api.update_list(v_formerList, jsonb_build_object('name','Reprise par admin'));
  RESET ROLE;
  RAISE NOTICE 'S6 OK: ancien membre exclu, reprise d''orpheline réservée au rang >= 30';
END$$;

-- =====================================================================
-- S7. §2 — admin rang >= 30 dans une AUTRE org n'administre rien ici, y
--      compris pour un utilisateur RÉELLEMENT multi-org. Seule voie réelle
--      vers 2 adhésions actives : un superuser (exempté de la contrainte
--      1-ORG) rétrogradé APRÈS coup — la rétrogradation ne rejoue pas
--      enforce_single_active_org_membership, les 2 adhésions SURVIVENT.
-- =====================================================================
DO $$
DECLARE
  v_owner uuid := '10000000-0000-4000-a000-000000000001';
  v_multiOrg uuid := '10000000-0000-4000-a000-000000000009';
  v_role30 uuid;
  v_orgA text := 'ORGLST0000000001';
  v_orgB text := 'ORGLST0000000002';
  v_main uuid; v_ownList uuid; v_activeOrg text; v_legacyRank int; j jsonb;
BEGIN
  SELECT id INTO v_main FROM object_list WHERE name = 'Liste principale' LIMIT 1;
  SELECT id INTO v_role30 FROM ref_org_admin_role WHERE code = 'org_admin' LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.request_list_feature(v_main);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO auth.users (id, email) VALUES (v_multiOrg, 'multiorg@lst.test') ON CONFLICT (id) DO NOTHING;
    INSERT INTO app_user_profile (id, role, display_name) VALUES (v_multiOrg, 'owner', 'MultiOrg')
      ON CONFLICT (id) DO UPDATE SET role = 'owner';
    -- orgA en premier, orgB en second : l'ordre d'insertion est vérifié par
    -- la précondition ci-dessous, pas supposé silencieusement.
    INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
      (v_multiOrg, v_orgA, TRUE), (v_multiOrg, v_orgB, TRUE);
    INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
    SELECT m.id, v_role30, TRUE FROM user_org_membership m
     WHERE m.user_id = v_multiOrg AND m.org_object_id = v_orgB;
    -- Rétrogradation : rôle plateforme ordinaire, adhésions INCHANGÉES —
    -- c'est l'état qu'un vrai utilisateur ne pourrait jamais atteindre en
    -- passant par les seuls chemins RPC (create_list/team admin), mais qui
    -- existe réellement en base une fois ce raccourci emprunté.
    UPDATE app_user_profile SET role = 'tourism_agent' WHERE id = v_multiOrg;
  PERFORM set_config('request.jwt.claims', NULL, true);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_multiOrg, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- Préconditions : sans elles, l'ancien bug (current_user_admin_rank
    -- global, indépendant de l'ORG active) ne serait PAS exercé et les
    -- assertions suivantes seraient vacantes.
    SELECT api.current_user_org_id() INTO v_activeOrg;
    SELECT api.current_user_admin_rank() INTO v_legacyRank;
    ASSERT v_activeOrg = v_orgA,
      format('précondition §2 non remplie: current_user_org_id() = %s (attendu orgA=%s) — ajuster l''ordre des adhésions', v_activeOrg, v_orgA);
    ASSERT COALESCE(v_legacyRank, 0) >= 30,
      format('précondition §2 non remplie: current_user_admin_rank() = %s — l''ancien bug ne serait pas exercé', v_legacyRank);

    ASSERT NOT COALESCE(api.user_is_list_org_admin(v_main), FALSE),
      '§2 FAIL: admin rang 30 sur orgB, mais connecté sur orgA, est reconnu admin ICI (liste orgA)';
    j := api.list_list_proposals()::jsonb;
    ASSERT jsonb_array_length(j) = 0,
      format('§2 FAIL: connecté sur orgA, voit des propositions d''orgA malgré un rang scopé à orgB, reçu %s', j);
    ASSERT NOT COALESCE(api.user_can_manage_list_feature_action(v_main), FALSE),
      '§2/§3 FAIL: can_manage_feature accordé alors que le rang admin ne porte que sur orgB';
    BEGIN
      PERFORM api.review_list_feature(v_main, true);
      RAISE EXCEPTION 'ne devrait jamais arriver';
    EXCEPTION WHEN OTHERS THEN
      ASSERT SQLSTATE = '42501', format('§2 FAIL: review_list_feature aurait dû FORBIDDEN (42501), SQLSTATE=%s', SQLSTATE);
    END;

    -- list_my_lists() ne mélange pas les deux ORG : une liste créée dans le
    -- contexte actif (orgA) apparaît, aucune liste d'orgB ne fuite.
    v_ownList := api.create_list('static', 'Liste multiorg en orgA', ARRAY['HOTLST0000000001'], NULL, NULL);
    j := api.list_my_lists()::jsonb;
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE e->>'id' = v_ownList::text AND e->>'org_object_id' = v_orgA),
      '§1/§2 FAIL: list_my_lists() ne retrouve pas la liste créée sous le contexte org actif';
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j) e WHERE e->>'org_object_id' = v_orgB),
      '§1/§2 FAIL: list_my_lists() mélange une liste d''orgB alors que le contexte actif est orgA';
  RESET ROLE;
  RAISE NOTICE 'S7 OK: rang admin scopé à l''ORG, y compris pour un utilisateur réellement multi-org';
END$$;

-- =====================================================================
-- S8b. §4 — fuite absente du LIEN PUBLIC (item historique planté en S3/S4,
--      surface distincte de get_list/list_my_lists déjà couvertes)
-- =====================================================================
DO $$
DECLARE
  v_owner uuid := '10000000-0000-4000-a000-000000000001';
  v_main uuid; v_tok text; j jsonb;
BEGIN
  SELECT id INTO v_main FROM object_list WHERE name = 'Liste principale' LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    j := api.ensure_list_share_link(v_main)::jsonb;
    v_tok := j->>'share_token';
    ASSERT length(v_tok) >= 32, 'token trop court';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
    j := api.get_public_list_by_token(v_tok)::jsonb;
    ASSERT j IS NOT NULL, 'lien public valide doit rendre un payload';
    ASSERT jsonb_array_length(j->'items') = 2, '§4 FAIL public: le brouillon fuite sur le lien public';
    ASSERT NOT (j::text ILIKE '%DRAFT-LEAK%'), 'FUITE §4: sentinelle du brouillon présente sur le lien PUBLIC';
    ASSERT NOT (j ? 'recipient_label'), 'PII LEAK: recipient_label sur le lien public';
  RESET ROLE;
  RAISE NOTICE 'S8b OK: lien public protégé contre la fuite du brouillon historique';
END$$;

-- =====================================================================
-- S8. §3 — circuit proposition strict : admin ne publie pas une personnelle
--          non proposée d'un collègue ; review_list_feature seul le peut ;
--          set_list_featured direct réservé aux propres listes de l'admin
-- =====================================================================
DO $$
DECLARE
  v_owner uuid := '10000000-0000-4000-a000-000000000001';
  v_admin30 uuid := '10000000-0000-4000-a000-000000000004';
  v_main uuid; v_ownList uuid; j jsonb; v_ok boolean;
BEGIN
  SELECT id INTO v_main FROM object_list WHERE name = 'Liste principale' LIMIT 1;
  -- v_main est déjà en attente (feature_requested_at posé en S7 par le créateur).

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin30, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- §3 : direct set_list_featured(TRUE) sur la liste d'un COLLÈGUE (même en
    -- attente) doit être REFUSÉ — la voie est review_list_feature.
    v_ok := false;
    BEGIN PERFORM api.set_list_featured(v_main, true); v_ok := true; EXCEPTION WHEN OTHERS THEN NULL; END;
    ASSERT NOT v_ok, '§3 FAIL: set_list_featured(TRUE) direct a mis à la une la liste d''un collègue';
    ASSERT NOT (api.get_list(v_main)::jsonb->>'is_featured')::boolean,
      '§3 FAIL: is_featured est passé à TRUE malgré le refus attendu';

    -- La voie correcte : review_list_feature sur la proposition en attente.
    j := api.review_list_feature(v_main, true)::jsonb;
    ASSERT (j->>'is_featured')::boolean, '§3 FAIL: review_list_feature(accept) n''a pas mis à la une';
    ASSERT j->>'feature_requested_at' IS NULL, '§3 FAIL: feature_requested_at non nettoyé après acceptation';

    -- L'admin peut featurer DIRECTEMENT sa PROPRE liste, sans proposition.
    v_ownList := api.create_list('static', 'Liste de l''admin', ARRAY['HOTLST0000000001'], NULL, NULL);
    j := api.set_list_featured(v_ownList, true)::jsonb;
    ASSERT (j->>'is_featured')::boolean, '§3 FAIL: un admin doit pouvoir featurer directement SA PROPRE liste';
  RESET ROLE;

  -- Un simple membre (non-admin) ne peut appeler ni set_list_featured ni
  -- review_list_feature, quelle que soit la liste.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_ok := false;
    BEGIN PERFORM api.set_list_featured(v_ownList, false); v_ok := true; EXCEPTION WHEN OTHERS THEN NULL; END;
    ASSERT NOT v_ok, '§3 FAIL: le créateur non-admin peut retirer une liste à la une';
  RESET ROLE;
  RAISE NOTICE 'S8 OK: circuit proposition strict respecté';
END$$;

-- =====================================================================
-- S9. §3 — retrait répété = no-op (ne relance pas la rétention). now() est
-- FIGÉ pour toute la transaction (§ revue tests) : sans sentinelle distincte,
-- un no-op et un vrai bump produiraient la MÊME valeur observée, et
-- pg_sleep() ne change rien à now(). La sentinelle est posée ICI puis
-- réutilisée sans re-prouver la technique dans S10/S10b (pas de test miroir).
-- =====================================================================
DO $$
DECLARE
  v_admin30 uuid := '10000000-0000-4000-a000-000000000004';
  v_ownList uuid; v_sentinel timestamptz := now() - interval '1 day'; v_check timestamptz;
BEGIN
  SELECT id INTO v_ownList FROM object_list WHERE name = 'Liste de l''admin' LIMIT 1;

  -- Transition RÉELLE (true -> false) : doit bumper à now().
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin30, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.set_list_featured(v_ownList, false);
  RESET ROLE;
  SELECT last_activity_at INTO v_check FROM object_list WHERE id = v_ownList;
  ASSERT v_check = now(),
    format('§3 FAIL: le retrait RÉEL (true->false) n''a pas bumpé l''horloge (reçu %s, attendu %s)', v_check, now());

  UPDATE object_list SET last_activity_at = v_sentinel WHERE id = v_ownList;

  -- SABOTAGE (preuve rouge, une seule fois) : simule le bug qu'on veut
  -- détecter — un bump manuel — et vérifie que la comparaison à la
  -- sentinelle le détecte AVANT de faire confiance à cette même comparaison
  -- sur le VRAI appel censé ne rien faire, juste après.
  UPDATE object_list SET last_activity_at = now() WHERE id = v_ownList;
  SELECT last_activity_at INTO v_check FROM object_list WHERE id = v_ownList;
  ASSERT v_check <> v_sentinel,
    'harnais §3 FAIL: la technique sentinelle ne détecte pas un bump manuel simulé — le test serait vacant';
  UPDATE object_list SET last_activity_at = v_sentinel WHERE id = v_ownList;  -- restaure la sentinelle

  -- Retrait RÉPÉTÉ : la liste n'est déjà PLUS à la une → NO-OP attendu.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin30, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.set_list_featured(v_ownList, false);
  RESET ROLE;
  SELECT last_activity_at INTO v_check FROM object_list WHERE id = v_ownList;
  ASSERT v_check = v_sentinel,
    format('§3 FAIL: un retrait répété a bumpé l''horloge (sentinelle=%s, reçu=%s)', v_sentinel, v_check);

  RAISE NOTICE 'S9 OK: retrait répété = no-op (sentinelle non vacante, prouvée par sabotage)';
END$$;

-- =====================================================================
-- S10. §3 — restore_list : NO-OP actif, REFUS non-admin sur une à-la-une,
--      NO-OP admin sur une à-la-une (jamais archivée), réactivation RÉELLE
-- =====================================================================
DO $$
DECLARE
  v_owner uuid := '10000000-0000-4000-a000-000000000001';
  v_admin30 uuid := '10000000-0000-4000-a000-000000000004';
  v_active uuid; v_main uuid;
  v_sentinel timestamptz := now() - interval '1 day';
  v_check timestamptz; v_ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_active := api.create_list('static', 'Liste active témoin', ARRAY['HOTLST0000000001'], NULL, NULL);
  RESET ROLE;

  -- (a) NO-OP sur une liste active (déjà active, jamais archivée).
  UPDATE object_list SET last_activity_at = v_sentinel WHERE id = v_active;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.restore_list(v_active);
  RESET ROLE;
  SELECT last_activity_at INTO v_check FROM object_list WHERE id = v_active;
  ASSERT v_check = v_sentinel,
    format('§3 FAIL: restore_list a bumpé une liste déjà active (sentinelle=%s, reçu=%s)', v_sentinel, v_check);

  -- (b) REFUS explicite : le créateur NON-ADMIN d'une liste À LA UNE ne peut
  -- plus l'écrire — la garde doit refuser avant même d'atteindre le no-op
  -- structurel (c'est pourquoi l'ancien test, qui utilisait le créateur, a
  -- échoué en FORBIDDEN plutôt que de prouver un no-op).
  SELECT id INTO v_main FROM object_list WHERE name = 'Liste principale' LIMIT 1;
  ASSERT (SELECT is_featured FROM object_list WHERE id = v_main), 'témoin: v_main doit être à la une à ce stade (S8)';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_ok := false;
    BEGIN PERFORM api.restore_list(v_main); v_ok := true; EXCEPTION WHEN OTHERS THEN NULL; END;
    ASSERT NOT v_ok, '§3 FAIL: le créateur non-admin d''une liste À LA UNE peut appeler restore_list';
  RESET ROLE;

  -- (c) Admin : NO-OP structurel sur la MÊME liste à la une (jamais archivée).
  UPDATE object_list SET last_activity_at = v_sentinel WHERE id = v_main;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin30, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.restore_list(v_main);
  RESET ROLE;
  SELECT last_activity_at INTO v_check FROM object_list WHERE id = v_main;
  ASSERT v_check = v_sentinel,
    format('§3 FAIL: restore_list (admin) a bumpé une liste à la une (sentinelle=%s, reçu=%s)', v_sentinel, v_check);

  -- (d) Réactivation RÉELLE : une liste ARCHIVÉE (>= 21j) doit repasser active.
  UPDATE object_list SET last_activity_at = now() - interval '22 days' WHERE id = v_active;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (api.get_list(v_active)::jsonb->>'is_archived')::boolean, 'témoin: doit être archivée avant restore';
    PERFORM api.restore_list(v_active);
  RESET ROLE;
  SELECT last_activity_at INTO v_check FROM object_list WHERE id = v_active;
  ASSERT v_check = now(),
    format('§3 FAIL: restore_list n''a pas réactivé une liste réellement archivée (reçu=%s, attendu %s)', v_check, now());

  RAISE NOTICE 'S10 OK: restore_list — no-op actif/featured, refus non-admin, réactivation réelle';
END$$;

-- =====================================================================
-- S10b. No-op sur lecture / partage / proposition / méta / items identiques
--      (même sentinelle, technique déjà prouvée non vacante en S9)
-- =====================================================================
DO $$
DECLARE
  v_owner uuid := '10000000-0000-4000-a000-000000000001';
  v_list uuid; v_sentinel timestamptz := now() - interval '1 day'; v_check timestamptz; j jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_list := api.create_list('static', 'Liste no-op lecture/partage/proposition', ARRAY['HOTLST0000000001'], NULL, NULL);
  RESET ROLE;
  UPDATE object_list SET last_activity_at = v_sentinel WHERE id = v_list;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.get_list(v_list);
  RESET ROLE;
  SELECT last_activity_at INTO v_check FROM object_list WHERE id = v_list;
  ASSERT v_check = v_sentinel, 'FAIL: une simple LECTURE (get_list) a touché l''horloge';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.ensure_list_share_link(v_list);
  RESET ROLE;
  SELECT last_activity_at INTO v_check FROM object_list WHERE id = v_list;
  ASSERT v_check = v_sentinel, 'FAIL: ensure_list_share_link (premier lien) a touché l''horloge';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.request_list_feature(v_list);
  RESET ROLE;
  SELECT last_activity_at INTO v_check FROM object_list WHERE id = v_list;
  ASSERT v_check = v_sentinel, 'FAIL: request_list_feature a touché l''horloge';

  -- update_list avec un patch STRICTEMENT IDENTIQUE (no-op méta).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    j := api.get_list(v_list)::jsonb;
    PERFORM api.update_list(v_list, jsonb_build_object('name', j->>'name'));
  RESET ROLE;
  SELECT last_activity_at INTO v_check FROM object_list WHERE id = v_list;
  ASSERT v_check = v_sentinel, 'FAIL: update_list avec un patch identique a touché l''horloge';

  -- set_list_items : 1er appel = changement RÉEL (position 1 -> 0, posée par
  -- create_list via WITH ORDINALITY qui numérote à partir de 1), 2e appel
  -- IDENTIQUE = no-op réel (§4 : cible normalisée comparée à l'état final).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.set_list_items(v_list, jsonb_build_array(jsonb_build_object('object_id','HOTLST0000000001','position',0)));
  RESET ROLE;
  UPDATE object_list SET last_activity_at = v_sentinel WHERE id = v_list;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.set_list_items(v_list, jsonb_build_array(jsonb_build_object('object_id','HOTLST0000000001','position',0)));
  RESET ROLE;
  SELECT last_activity_at INTO v_check FROM object_list WHERE id = v_list;
  ASSERT v_check = v_sentinel, 'FAIL: set_list_items avec les mêmes items (2e appel identique) a touché l''horloge';

  RAISE NOTICE 'S10b OK: lecture/partage/proposition/méta/items identiques ne touchent jamais l''horloge';
END$$;

-- =====================================================================
-- S11. §1 — sender de mark_list_sent : ancien membre / compte supprimé refusés ;
--           orpheline (admin) et propriétaire actif acceptés
-- =====================================================================
DO $$
DECLARE
  v_former uuid := '10000000-0000-4000-a000-000000000002';
  v_admin30 uuid := '10000000-0000-4000-a000-000000000004';
  v_owner uuid := '10000000-0000-4000-a000-000000000001';
  v_deleted uuid := '10000000-0000-4000-a000-000000000008';
  v_formerList uuid; v_deletedList uuid; v_main uuid;
  v_ok boolean;
BEGIN
  SELECT id INTO v_formerList FROM object_list WHERE name = 'Reprise par admin' LIMIT 1;
  SELECT id INTO v_main FROM object_list WHERE name = 'Liste principale' LIMIT 1;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
    -- (a) sender = ancien membre, créateur de la liste orpheline : refusé.
    v_ok := false;
    BEGIN PERFORM api.mark_list_sent(v_formerList, v_former); v_ok := true; EXCEPTION WHEN OTHERS THEN NULL; END;
    ASSERT NOT v_ok, '§1 FAIL: mark_list_sent accepte un sender ancien membre (créateur devenu inactif)';

    -- (b) sender = admin (rang >= 30, actif) sur la liste orpheline : accepté.
    PERFORM api.mark_list_sent(v_formerList, v_admin30);
    ASSERT (SELECT status FROM object_list WHERE id = v_formerList) = 'sent',
      '§1 FAIL: mark_list_sent doit accepter l''admin sur une orpheline';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- (c) sender = compte réellement SUPPRIMÉ : créé actif, puis retiré de
  -- auth.users (cascade sur user_org_membership — aucune FK sur created_by).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_deleted, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_deletedList := api.create_list('static', 'Liste du compte supprimé', ARRAY['HOTLST0000000001'], NULL, NULL);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    DELETE FROM auth.users WHERE id = v_deleted;
  PERFORM set_config('request.jwt.claims', NULL, true);

  ASSERT NOT EXISTS (SELECT 1 FROM user_org_membership WHERE user_id = v_deleted),
    'fixture: la suppression du compte doit avoir emporté son adhésion (cascade)';
  ASSERT EXISTS (SELECT 1 FROM object_list WHERE id = v_deletedList AND created_by = v_deleted),
    'fixture: created_by doit survivre à la suppression du compte (aucune FK)';

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
    v_ok := false;
    BEGIN PERFORM api.mark_list_sent(v_deletedList, v_deleted); v_ok := true; EXCEPTION WHEN OTHERS THEN NULL; END;
    ASSERT NOT v_ok, '§1 FAIL: mark_list_sent accepte un sender dont le COMPTE a été supprimé';

    -- (d) sender = propriétaire ACTIF sur SA PROPRE liste (toujours featured
    -- depuis S8) : accepté via le bras "membre actif + à la une".
    PERFORM api.mark_list_sent(v_main, v_owner);
    ASSERT (SELECT status FROM object_list WHERE id = v_main) = 'sent',
      '§1 FAIL: mark_list_sent doit accepter le propriétaire actif';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'S11 OK: sender ancien membre/compte supprimé refusés, orpheline/propriétaire acceptés';
END$$;

-- =====================================================================
-- S12. §4/§6 — duplication indépendante (statique+dynamique, sentinelles
--      NON NULLES sur la source) ; masquage share_token/recipient_label
--      pour l'admin qui examine SEULEMENT une proposition en attente.
-- =====================================================================
DO $$
DECLARE
  v_owner uuid := '10000000-0000-4000-a000-000000000001';
  v_admin30 uuid := '10000000-0000-4000-a000-000000000004';
  v_srcStatic uuid; v_srcDynamic uuid; v_dupStatic uuid; v_dupDynamic uuid;
  j jsonb; jSrc jsonb; jAdmin jsonb;
  v_filters jsonb := '{"buckets":[{"filters":{},"search":null}]}'::jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_srcStatic := api.create_list('static', 'Source statique à dupliquer',
                     ARRAY['HOTLST0000000002','HOTLST0000000001'], NULL, NULL);
    -- Ordre non trivial (0 puis 1, alors que create_list numérote via
    -- WITH ORDINALITY à partir de 1) + notes fr/en réelles, AVANT duplication.
    PERFORM api.set_list_items(v_srcStatic, jsonb_build_array(
      jsonb_build_object('object_id','HOTLST0000000002','position',0,'note_fr','Coup de coeur FR','note_en','Highlight EN'),
      jsonb_build_object('object_id','HOTLST0000000001','position',1,'note_fr','Deuxieme FR','note_en','Second EN')));
    PERFORM api.update_list(v_srcStatic, jsonb_build_object('recipient_label','SENTINELLE-DESTINATAIRE-STATIC'));
    PERFORM api.ensure_list_share_link(v_srcStatic);

    v_srcDynamic := api.create_list('dynamic', 'Source dynamique à dupliquer', NULL, v_filters, '/explorer?sentinel=1');
    PERFORM api.update_list(v_srcDynamic, jsonb_build_object('recipient_label','SENTINELLE-DESTINATAIRE-DYN'));
    PERFORM api.ensure_list_share_link(v_srcDynamic);

    -- Propose la statique (masquage §6 pour l'admin en simple revue).
    PERFORM api.request_list_feature(v_srcStatic);
  RESET ROLE;

  -- Admin en REVUE SEULE (proposition en attente, PAS encore acceptée) :
  -- lit via le bras "proposition", mais n'a PAS de droit d'usage — le
  -- token (lien-capacité) ET le destinataire (PII) doivent être NULL.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin30, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT NOT COALESCE(api.user_can_use_list(v_srcStatic), FALSE),
      'témoin §6: l''admin en simple revue ne doit PAS avoir de droit d''usage';
    jAdmin := api.get_list(v_srcStatic)::jsonb;
    ASSERT jAdmin->>'share_token' IS NULL,
      format('§6 FAIL: share_token exposé à l''admin en simple revue, reçu %s', jAdmin->>'share_token');
    ASSERT jAdmin->>'recipient_label' IS NULL,
      format('§6 FAIL: recipient_label exposé à l''admin en simple revue, reçu %s', jAdmin->>'recipient_label');
  RESET ROLE;

  -- Le PROPRIÉTAIRE, lui, continue de voir les deux (précondition non
  -- vacante : les sentinelles ont bien été posées ci-dessus).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    jSrc := api.get_list(v_srcStatic)::jsonb;
    ASSERT jSrc->>'share_token' IS NOT NULL, '§6 FAIL: le propriétaire ne voit plus son propre share_token';
    ASSERT jSrc->>'recipient_label' = 'SENTINELLE-DESTINATAIRE-STATIC', '§6 FAIL: le propriétaire ne voit plus son propre recipient_label';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- Duplication STATIQUE.
    v_dupStatic := api.duplicate_list(v_srcStatic);
    j := api.get_list(v_dupStatic)::jsonb;
    ASSERT (j->>'created_by')::uuid = v_owner, 'duplication: le nouveau propriétaire doit être le duplicateur';
    ASSERT NOT (j->>'is_featured')::boolean, 'duplication: ne doit jamais être à la une';
    ASSERT j->>'feature_requested_at' IS NULL, 'duplication: ne doit jamais hériter d''une proposition en cours';
    ASSERT j->>'share_token' IS NULL, 'duplication: ne doit jamais hériter du token';
    ASSERT j->>'recipient_label' IS NULL, 'duplication: ne doit jamais hériter du destinataire';
    ASSERT j->>'status' = 'draft', 'duplication: statut doit repartir à draft (pas "shared" hérité)';
    ASSERT jsonb_array_length(j->'items') = 2, 'duplication statique: doit conserver les 2 items';
    ASSERT (j->'items'->0->>'note_fr') = 'Coup de coeur FR' AND (j->'items'->0->>'position')::int = 0,
      format('duplication statique: ordre/notes du 1er item non conservés, reçu %s', j->'items'->0);
    ASSERT (j->'items'->1->>'note_fr') = 'Deuxieme FR' AND (j->'items'->1->>'position')::int = 1,
      format('duplication statique: ordre/notes du 2e item non conservés, reçu %s', j->'items'->1);

    -- La SOURCE reste inchangée après duplication.
    jSrc := api.get_list(v_srcStatic)::jsonb;
    ASSERT jSrc->>'recipient_label' = 'SENTINELLE-DESTINATAIRE-STATIC', 'duplication: a modifié le destinataire de la SOURCE';
    ASSERT jSrc->>'share_token' IS NOT NULL, 'duplication: a effacé le token de la SOURCE';
    ASSERT jsonb_array_length(jSrc->'items') = 2, 'duplication: a modifié les items de la SOURCE';

    -- Duplication DYNAMIQUE : conserve filtres/URL, jamais token/destinataire.
    v_dupDynamic := api.duplicate_list(v_srcDynamic);
    j := api.get_list(v_dupDynamic)::jsonb;
    ASSERT j->>'kind' = 'dynamic', 'duplication dynamique: doit rester dynamic';
    ASSERT j->>'resolved_from' = 'filters', 'duplication dynamique: doit résoudre via les filtres';
    ASSERT j->'filters' = v_filters, format('duplication dynamique: filtres non conservés, reçu %s', j->'filters');
    ASSERT j->>'filters_url' = '/explorer?sentinel=1', 'duplication dynamique: filters_url non conservée';
    ASSERT j->>'share_token' IS NULL, 'duplication dynamique: ne doit pas hériter du token';
    ASSERT j->>'recipient_label' IS NULL, 'duplication dynamique: ne doit pas hériter du destinataire';
  RESET ROLE;
  RAISE NOTICE 'S12 OK: duplication statique+dynamique indépendante, source inchangée, masquage revue admin';
END$$;

-- =====================================================================
-- S13. Concurrence — ensure_list_share_link : vérifiée par INSPECTION du
-- code (FOR UPDATE avant décision), PAS par une exécution multi-session
-- réelle : aucun environnement multi-connexion jetable disponible dans ce
-- harnais transactionnel. Le lien déjà actif est simplement réutilisé sans
-- changer son expiration, ce que ce test peut vérifier en séquentiel — via
-- les retours JSON des RPC, JAMAIS par un SELECT direct sous authenticated
-- (aucun grant table, cf. S1).
-- =====================================================================
DO $$
DECLARE
  v_owner uuid := '10000000-0000-4000-a000-000000000001';
  v_list uuid; v_tok1 text; v_tok2 text; v_exp1 timestamptz; v_exp2 timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_list := api.create_list('static', 'Liste partage témoin', ARRAY['HOTLST0000000001'], NULL, NULL);
    v_exp1 := (api.share_list(v_list, true, now() + interval '10 days')::jsonb)->>'share_expires_at';

    v_tok1 := (api.ensure_list_share_link(v_list)::jsonb)->>'share_token';
    v_tok2 := (api.ensure_list_share_link(v_list)::jsonb)->>'share_token';
    v_exp2 := (api.ensure_list_share_link(v_list)::jsonb)->>'share_expires_at';
    ASSERT v_tok1 = v_tok2, 'ensure_list_share_link doit réutiliser le MÊME token';
    ASSERT v_exp2 = v_exp1,
      'ensure_list_share_link ne doit jamais changer une expiration existante';
  RESET ROLE;
  RAISE NOTICE 'S13 OK (concurrence réelle non exécutée — vérifiée par inspection, voir rapport)';
END$$;

-- =====================================================================
-- S14. Rétention 21 jours / purge 1 an — FRONTIÈRES EXACTES (<=)
-- =====================================================================
DO $$
DECLARE
  v_owner uuid := '10000000-0000-4000-a000-000000000001';
  v_almost21 uuid; v_exact21 uuid; v_almost1y uuid; v_exact1y uuid;
  v_veryOldFeatured uuid; v_sharedArchived uuid;
  j jsonb; v_ok boolean; v_count int; v_tok text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_almost21 := api.create_list('static','21j moins 1s', ARRAY['HOTLST0000000001'], NULL, NULL);
    v_exact21  := api.create_list('static','21j exact', ARRAY['HOTLST0000000001'], NULL, NULL);
    v_almost1y := api.create_list('static','1an moins 1s', ARRAY['HOTLST0000000001'], NULL, NULL);
    v_exact1y  := api.create_list('static','1an exact', ARRAY['HOTLST0000000001'], NULL, NULL);
    v_veryOldFeatured := api.create_list('static','trèsancienne featured', ARRAY['HOTLST0000000001'], NULL, NULL);
    v_sharedArchived  := api.create_list('static','archivée avec lien', ARRAY['HOTLST0000000001'], NULL, NULL);
    v_tok := (api.ensure_list_share_link(v_sharedArchived)::jsonb)->>'share_token';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    UPDATE object_list SET last_activity_at = now() - interval '21 days' + interval '1 second' WHERE id = v_almost21;
    UPDATE object_list SET last_activity_at = now() - interval '21 days'                        WHERE id = v_exact21;
    UPDATE object_list SET last_activity_at = now() - interval '1 year' + interval '1 second'    WHERE id = v_almost1y;
    UPDATE object_list SET last_activity_at = now() - interval '1 year'                          WHERE id = v_exact1y;
    UPDATE object_list SET last_activity_at = now() - interval '10 years', is_featured = TRUE     WHERE id = v_veryOldFeatured;
    UPDATE object_list SET last_activity_at = now() - interval '22 days'                          WHERE id = v_sharedArchived;
  PERFORM set_config('request.jwt.claims', NULL, true);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT NOT (api.get_list(v_almost21)::jsonb->>'is_archived')::boolean, '21j-1s: ne doit PAS être archivée';
    ASSERT (api.get_list(v_exact21)::jsonb->>'is_archived')::boolean, '21j EXACT: DOIT être archivée (seuil <=)';
  RESET ROLE;

  -- Lien public d'une liste archivée : encore valide (règle 4 du cadrage).
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
    ASSERT api.get_public_list_by_token(v_tok)::jsonb IS NOT NULL,
      'archivage: le lien public doit rester valide (règle 4 du cadrage)';
  RESET ROLE;

  -- Rôles client bloqués sur la purge — anon INCLUS (revue §5 : vérifier les
  -- 3 rôles, pas seulement PUBLIC).
  SET LOCAL ROLE anon;
    v_ok := false;
    BEGIN PERFORM internal.purge_expired_lists(); v_ok := true; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    ASSERT NOT v_ok, 'LOCK: anon peut appeler internal.purge_expired_lists';
  RESET ROLE;
  SET LOCAL ROLE authenticated;
    v_ok := false;
    BEGIN PERFORM internal.purge_expired_lists(); v_ok := true; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    ASSERT NOT v_ok, 'LOCK: authenticated peut appeler internal.purge_expired_lists';
  RESET ROLE;
  SET LOCAL ROLE service_role;
    v_ok := false;
    BEGIN PERFORM internal.purge_expired_lists(); v_ok := true; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    ASSERT NOT v_ok, 'LOCK: service_role peut appeler internal.purge_expired_lists';
  RESET ROLE;

  -- 1er passage : seule v_exact1y (>= 1 an, <=) est éligible à ce stade —
  -- v_almost1y (1 an moins 1s) et les 21j (hors sujet purge) ne le sont pas.
  SELECT internal.purge_expired_lists() INTO v_count;
  ASSERT v_count = 1, format('1an EXACT: exactement 1 ligne éligible attendue au 1er passage, reçu %s', v_count);
  ASSERT NOT EXISTS (SELECT 1 FROM object_list WHERE id = v_exact1y), '1an EXACT: doit être purgée (seuil <=)';
  ASSERT EXISTS (SELECT 1 FROM object_list WHERE id = v_almost1y), '1an-1s: ne doit PAS être purgée';
  ASSERT EXISTS (SELECT 1 FROM object_list WHERE id = v_veryOldFeatured), 'featured très ancienne: doit survivre à la purge';
  ASSERT EXISTS (SELECT 1 FROM object WHERE id = 'HOTLST0000000001'), 'purge: la FICHE touristique ne doit jamais disparaître';

  -- v_sharedArchived (22j, < 1 an) n'est PAS purgée : lien encore lisible,
  -- MÊME token.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
    ASSERT api.get_public_list_by_token(v_tok)::jsonb IS NOT NULL,
      'archivée à 22j (pas 1 an) : le lien public doit rester lisible après le 1er passage de purge';
  RESET ROLE;

  -- Double purge : idempotente, 0 ligne au second passage.
  SELECT internal.purge_expired_lists() INTO v_count;
  ASSERT v_count = 0, format('double purge: doit retourner 0 au second passage, reçu %s', v_count);

  -- Fait vieillir v_sharedArchived au-delà d'un an : purgée, et le MÊME
  -- token devient alors inutilisable (règle 5 du cadrage).
  UPDATE object_list SET last_activity_at = now() - interval '400 days' WHERE id = v_sharedArchived;
  SELECT internal.purge_expired_lists() INTO v_count;
  ASSERT v_count = 1, format('purge de v_sharedArchived après 400j: attendu 1, reçu %s', v_count);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
    ASSERT api.get_public_list_by_token(v_tok) IS NULL,
      'règle 5: après purge, l''ancien token doit devenir inutilisable';
  RESET ROLE;

  RAISE NOTICE 'S14 OK: frontières 21j/1an exactes, featured protégée, double purge idempotente, lien archivé puis purgé';
END$$;

DO $$ BEGIN RAISE NOTICE '=== test_listes_cycle_vie.sql : toutes les assertions ont passe ==='; END $$;
ROLLBACK;
