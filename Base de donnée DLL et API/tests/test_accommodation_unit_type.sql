-- =============================================================================
-- test_accommodation_unit_type.sql
-- Garde permanente §200 lot 5 — axe « Type d'unité d'hébergement », multi-valué.
-- Manifest : immédiatement après taxo6.
--
-- Prouve, sur des fixtures réelles et par PERSONA (anon / propriétaire /
-- étranger), que la nouvelle table :
--   * accepte plusieurs unités par fiche et refuse le doublon exact ;
--   * est lisible par anon UNIQUEMENT sur un objet publié ;
--   * n'est écrivable que par qui a le droit canonique — les quatre commandes
--     sont testées séparément, parce qu'un GRANT trop large ou une policy
--     `FOR ALL` ne se voit pas en lisant le SELECT ;
--   * disparaît avec son objet (CASCADE) ;
--   * est réellement branchée au filtre de l'Explorateur.
--
-- Auto-contenu et transactionnel : BEGIN … ROLLBACK, rien ne persiste.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $unit_guard$
DECLARE
  v_orgA     text := 'ORGRUN9999992001';
  v_orgB     text := 'ORGRUN9999992002';
  v_pub      text := 'HPARUN9999992011';   -- publié, ORG-A
  v_draft    text := 'HPARUN9999992012';   -- brouillon, ORG-A
  v_userA    uuid := '00000000-0000-4000-a000-00000000f201';
  v_userB    uuid := '00000000-0000-4000-a000-00000000f202';
  v_mailA    text := 'unit_a@test.local';
  v_actorA   uuid := '00000000-0000-4000-a000-00000000f203';
  v_kind     uuid;
  v_role     uuid;
  v_pub_role uuid;
  v_bubble   uuid;
  v_lodge    uuid;
  v_cabin    uuid;
  v_n        int;
  v_bad      text;
  v_ok       boolean;
BEGIN
  -- ---------- Structure ----------
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.object_accommodation_unit_type'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'lot5: RLS désactivée sur object_accommodation_unit_type';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.ref_code_accommodation_unit_type'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'lot5: RLS désactivée sur la partition de référence (elle n''hérite pas du parent)';
  END IF;

  -- Une policy FOR ALL s'appliquerait AUSSI au SELECT et court-circuiterait la
  -- lecture gardée : c'est la classe de bug P0.3, invisible en lisant le SELECT.
  SELECT string_agg(policyname, ', ') INTO v_bad
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'object_accommodation_unit_type' AND cmd = 'ALL';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'lot5: policy FOR ALL sur la table de liaison: %', v_bad;
  END IF;

  -- FK indexée du côté référençant (PostgreSQL ne le fait pas tout seul).
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND tablename='object_accommodation_unit_type' AND indexdef LIKE '%(unit_type_id)%'
  ) THEN
    RAISE EXCEPTION 'lot5: FK unit_type_id non indexée';
  END IF;

  -- `anon` ne doit jamais avoir plus que SELECT au niveau du GRANT : la policy
  -- RLS ne rattraperait pas un privilège accordé par erreur si une policy
  -- future s'ouvrait.
  SELECT string_agg(privilege_type, ', ') INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='object_accommodation_unit_type'
     AND grantee='anon' AND privilege_type <> 'SELECT';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'lot5: anon dispose de privilèges au-delà de SELECT: %', v_bad;
  END IF;

  -- ---------- Fixtures (superuser : RLS contournée) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] absent (seeds non appliqués)'; END IF;

  SELECT id INTO v_bubble FROM ref_code WHERE domain='accommodation_unit_type' AND code='bubble';
  SELECT id INTO v_lodge  FROM ref_code WHERE domain='accommodation_unit_type' AND code='lodge';
  SELECT id INTO v_cabin  FROM ref_code WHERE domain='accommodation_unit_type' AND code='cabin';
  IF v_bubble IS NULL OR v_lodge IS NULL OR v_cabin IS NULL THEN
    RAISE EXCEPTION 'lot5: vocabulaire accommodation_unit_type incomplet';
  END IF;

  -- Le droit d'écriture canonique ne vient PAS de `object.created_by` mais d'un
  -- lien acteur PRIMAIRE, résolu depuis l'e-mail du JWT (api.is_object_owner).
  -- Une fixture qui se contenterait de `created_by` testerait un droit que la
  -- policy n'accorde pas — et passerait au vert pour la mauvaise raison.
  SELECT id INTO v_kind FROM ref_code_contact_kind WHERE code = 'email';
  SELECT id INTO v_role FROM ref_actor_role WHERE code = 'operator' LIMIT 1;
  IF v_kind IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'fixture: ref_code_contact_kind[email] ou ref_actor_role[operator] absent (seeds non appliqués)';
  END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_userA, v_mailA), (v_userB, 'unit_b@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userA, 'tourism_agent'), (v_userB, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO object (id, object_type, name, status, created_by) VALUES
    (v_orgA,  'ORG', 'Org unités A', 'published', NULL),
    (v_orgB,  'ORG', 'Org unités B', 'published', NULL),
    (v_pub,   'HPA', 'Aire témoin publiée',   'published', v_userA),
    (v_draft, 'HPA', 'Aire témoin brouillon', 'draft',     v_userA);

  INSERT INTO actor (id, display_name) VALUES (v_actorA, 'Unit Owner');
  INSERT INTO actor_channel (actor_id, kind_id, value) VALUES (v_actorA, v_kind, v_mailA);
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary) VALUES
    (v_actorA, v_pub,   v_role, TRUE),
    (v_actorA, v_draft, v_role, TRUE);

  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_pub,   v_orgA, v_pub_role),
    (v_draft, v_orgA, v_pub_role);

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA, v_orgA, TRUE), (v_userB, v_orgB, TRUE);

  -- ---------- Multi-valeur : Bulle ET Lodge sur la MÊME fiche ----------
  INSERT INTO object_accommodation_unit_type (object_id, unit_type_id) VALUES
    (v_pub, v_bubble), (v_pub, v_lodge);
  INSERT INTO object_accommodation_unit_type (object_id, unit_type_id) VALUES
    (v_draft, v_cabin);

  SELECT count(*) INTO v_n FROM object_accommodation_unit_type WHERE object_id = v_pub;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'lot5: une fiche doit pouvoir porter 2 unités, trouvé %', v_n;
  END IF;

  -- ---------- Doublon exact refusé ----------
  BEGIN
    INSERT INTO object_accommodation_unit_type (object_id, unit_type_id) VALUES (v_pub, v_bubble);
    RAISE EXCEPTION 'lot5: le doublon (object_id, unit_type_id) aurait dû être refusé';
  EXCEPTION WHEN unique_violation THEN
    NULL;  -- attendu
  END;

  -- ---------- ANON : ne voit que l'objet publié ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;

  SELECT count(*) INTO v_n FROM object_accommodation_unit_type WHERE object_id = v_pub;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'lot5[anon]: % unité(s) lisible(s) sur l''objet publié au lieu de 2', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM object_accommodation_unit_type WHERE object_id = v_draft;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'lot5[anon]: % unité(s) d''un objet BROUILLON lisible(s) — fuite', v_n;
  END IF;

  -- anon n'écrit jamais : le GRANT le refuse avant même la policy.
  BEGIN
    INSERT INTO object_accommodation_unit_type (object_id, unit_type_id) VALUES (v_pub, v_cabin);
    RESET ROLE;
    RAISE EXCEPTION 'lot5[anon]: INSERT accepté — anon ne doit pas écrire';
  EXCEPTION WHEN insufficient_privilege OR sqlstate '42501' THEN
    NULL;  -- attendu
  END;
  RESET ROLE;

  -- ---------- MEMBRE DE L'ORG PROPRIÉTAIRE : lit tout, écrit les 4 commandes ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_userA, 'role','authenticated', 'email', v_mailA)::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM object_accommodation_unit_type WHERE object_id = v_draft;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'lot5[propriétaire]: l''unité de son propre brouillon devrait être lisible (trouvé %)', v_n;
  END IF;

  INSERT INTO object_accommodation_unit_type (object_id, unit_type_id) VALUES (v_pub, v_cabin);
  UPDATE object_accommodation_unit_type SET updated_at = now()
   WHERE object_id = v_pub AND unit_type_id = v_cabin;
  DELETE FROM object_accommodation_unit_type
   WHERE object_id = v_pub AND unit_type_id = v_cabin;
  SELECT count(*) INTO v_n FROM object_accommodation_unit_type WHERE object_id = v_pub;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'lot5[propriétaire]: les 4 commandes devraient laisser 2 unités, trouvé %', v_n;
  END IF;
  RESET ROLE;

  -- ---------- MEMBRE D'UNE AUTRE ORG : lit le publié, n'écrit rien ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO v_n FROM object_accommodation_unit_type WHERE object_id = v_draft;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'lot5[étranger]: % unité(s) d''un brouillon d''une AUTRE org lisible(s)', v_n;
  END IF;

  v_ok := FALSE;
  BEGIN
    INSERT INTO object_accommodation_unit_type (object_id, unit_type_id) VALUES (v_pub, v_cabin);
  EXCEPTION WHEN insufficient_privilege OR sqlstate '42501' THEN
    v_ok := TRUE;
  END;
  IF NOT v_ok THEN
    RESET ROLE;
    RAISE EXCEPTION 'lot5[étranger]: INSERT accepté sur un objet qui ne lui appartient pas';
  END IF;

  -- UPDATE et DELETE d'un étranger doivent être des NO-OP (la policy filtre les
  -- lignes visées) — jamais une modification silencieuse.
  UPDATE object_accommodation_unit_type SET updated_at = now() WHERE object_id = v_pub;
  DELETE FROM object_accommodation_unit_type WHERE object_id = v_pub;
  RESET ROLE;

  SELECT count(*) INTO v_n FROM object_accommodation_unit_type WHERE object_id = v_pub;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'lot5[étranger]: UPDATE/DELETE ont touché des lignes (reste % au lieu de 2)', v_n;
  END IF;

  -- ---------- Filtre Explorer : une puis plusieurs unités ----------
  PERFORM api.refresh_object_filter_caches(v_pub);
  PERFORM api.refresh_object_filter_caches(v_draft);

  SELECT count(*) INTO v_n
    FROM api.get_filtered_object_ids(
           '{"accommodation_unit_types_any":["bubble"]}'::jsonb,
           ARRAY['HPA']::object_type[], ARRAY['published']::object_status[])
   WHERE object_id = v_pub;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'lot5: filtrer « bubble » ne remonte pas la fiche témoin';
  END IF;

  SELECT count(*) INTO v_n
    FROM api.get_filtered_object_ids(
           '{"accommodation_unit_types_any":["cabin"]}'::jsonb,
           ARRAY['HPA']::object_type[], ARRAY['published']::object_status[])
   WHERE object_id = v_pub;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'lot5: filtrer « cabin » remonte une fiche qui ne le porte pas';
  END IF;

  -- Plusieurs valeurs = OU (comme les autres filtres `_any`).
  SELECT count(*) INTO v_n
    FROM api.get_filtered_object_ids(
           '{"accommodation_unit_types_any":["cabin","lodge"]}'::jsonb,
           ARRAY['HPA']::object_type[], ARRAY['published']::object_status[])
   WHERE object_id = v_pub;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'lot5: le filtre multi-valeurs devrait matcher « lodge »';
  END IF;

  -- ---------- CASCADE : supprimer l'objet supprime ses liens ----------
  DELETE FROM object WHERE id = v_draft;
  SELECT count(*) INTO v_n FROM object_accommodation_unit_type WHERE object_id = v_draft;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'lot5: % lien(s) survivent à la suppression de leur objet', v_n;
  END IF;

  RAISE NOTICE 'lot5: structure, personas, filtre et cascade vérifiés';
END
$unit_guard$;

-- -----------------------------------------------------------------------------
-- Reprise historique — uniquement quand le corpus importé est présent.
-- -----------------------------------------------------------------------------
DO $unit_corpus$
DECLARE v_n INT; v_bad TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM object WHERE id = 'HLORUN000000015Q') THEN
    RAISE NOTICE 'lot5: base sans corpus importé — contrôles de reprise IGNORÉS';
    RETURN;
  END IF;

  SELECT count(*) INTO v_n FROM object_accommodation_unit_type
   WHERE object_id IN ('HLORUN000000015Q','HLORUN000000013Y','HLORUN000000017V',
                       'HLORUN00000000UW','HLORUN000000018Q','CAMRUN000000013G','CAMRUN00000000PH');
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'lot5: % reprise(s) de type d''unité au lieu de 7', v_n;
  END IF;

  -- Chaque reprise existe EXACTEMENT une fois.
  SELECT string_agg(object_id, ', ') INTO v_bad
    FROM (SELECT object_id FROM object_accommodation_unit_type
           WHERE object_id IN ('HLORUN000000015Q','HLORUN000000013Y','HLORUN000000017V',
                               'HLORUN00000000UW','HLORUN000000018Q','CAMRUN000000013G','CAMRUN00000000PH')
           GROUP BY object_id HAVING count(*) <> 1) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'lot5: reprise dupliquée ou manquante sur %', v_bad;
  END IF;

  -- Les natures des quatre fiches non recodées n'ont PAS bougé : une reprise de
  -- forme ne doit jamais déplacer l'établissement.
  SELECT string_agg(t.object_id, ', ') INTO v_bad
    FROM (VALUES
            ('HLORUN00000000UW','chambre_d_hotes'),
            ('HLORUN000000018Q','location_saisonniere'),
            ('CAMRUN000000013G','camping'),
            ('CAMRUN00000000PH','homestay_camping')
         ) AS t(object_id, expected)
   WHERE NOT EXISTS (
     SELECT 1 FROM object_taxonomy ot
       JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
      WHERE ot.object_id = t.object_id AND rc.code = t.expected);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'lot5: nature déplacée par une reprise de FORME sur %', v_bad;
  END IF;

  -- Les anciennes feuilles sont retirées ET sans porteur.
  SELECT string_agg(rc.domain || '.' || rc.code, ', ') INTO v_bad
    FROM ref_code rc
   WHERE (rc.domain, rc.code) IN (
           ('taxonomy_hlo','bulle'), ('taxonomy_hlo','lodges'),
           ('taxonomy_hlo','hebergement_insolite'), ('taxonomy_hpa','outdoor_glamping'))
     AND (rc.is_active OR rc.is_assignable
          OR EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'lot5: ancienne feuille encore active/assignable/portée: %', v_bad;
  END IF;

  RAISE NOTICE 'lot5: reprise des 7 unités historiques vérifiée sur corpus live';
END
$unit_corpus$;

ROLLBACK;

DO $$ BEGIN RAISE NOTICE 'test_accommodation_unit_type.sql: OK'; END $$;
