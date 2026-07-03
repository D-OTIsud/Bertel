-- test_org_branding.sql
-- Prouve migration_org_branding.sql :
-- A) get_app_branding sans ligne org = valeurs plateforme, orgObjectId = l'ORG du membre.
-- B) superuser upsert_org_branding(orgA, brand+1 couleur) → membre de A voit la surcharge champ
--    par champ (les autres champs restent plateforme, markerStyles reste plateforme) ; membre de
--    B voit 100 % plateforme.
-- C) Gates d'écriture : admin30 de A OK ; manager20 de A 42501 ; admin30 de B sur A 42501.
-- D) reset (p_reset=TRUE) → ligne supprimée → retour au 100 % plateforme.
-- E) get_public_branding INCHANGÉE (pas de clé orgObjectId ; brandName = plateforme).
-- F) anon ne peut PAS lire org_branding_settings en direct (pas de GRANT anon).
-- Contre une base sans la migration : échec immédiat (table/RPCs absentes) — état rouge.
-- Auto-contenu + transactionnel (ROLLBACK). Mécanique calquée sur tests/test_sp4_list_org_members.sql.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
  v_orgA   text := 'ORGRUN9999990903';
  v_orgB   text := 'ORGRUN9999990904';
  v_super  uuid := '00000000-0000-4000-a000-000000000905';
  v_adminA uuid := '00000000-0000-4000-a000-000000000906'; -- admin (rang 30) de A
  v_mgrA   uuid := '00000000-0000-4000-a000-000000000907'; -- manager (rang 20) de A
  v_adminB uuid := '00000000-0000-4000-a000-000000000908'; -- admin (rang 30) de B
  v_pub_role   uuid;
  v_admin_role uuid;
  v_mgr_role   uuid;
  v_mA uuid; v_mMgr uuid; v_mB uuid;
  v_plat_brand   text;
  v_plat_primary text;
  v_payload jsonb;
  v_denied boolean;
BEGIN
  SELECT id INTO v_pub_role   FROM ref_org_business_role WHERE code = 'editor';
  SELECT id INTO v_admin_role FROM ref_org_admin_role    WHERE code = 'org_admin';
  SELECT id INTO v_mgr_role   FROM ref_org_admin_role    WHERE code = 'org_manager';
  SELECT brand_name, primary_color INTO v_plat_brand, v_plat_primary
    FROM app_branding_settings WHERE setting_key = 'default';

  -- Fixtures
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA, 'ORG', 'Org A Branding', 'published'), (v_orgB, 'ORG', 'Org B Branding', 'published');
  INSERT INTO auth.users (id, email) VALUES
    (v_super,'brand-super@test.local'), (v_adminA,'brand-adminA@test.local'),
    (v_mgrA,'brand-mgrA@test.local'), (v_adminB,'brand-adminB@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_super,'super_admin')
    ON CONFLICT (id) DO UPDATE SET role='super_admin';
  INSERT INTO app_user_profile (id, role) VALUES
    (v_adminA,'tourism_agent'), (v_mgrA,'tourism_agent'), (v_adminB,'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role='tourism_agent';

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_adminA, v_orgA, TRUE) RETURNING id INTO v_mA;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_mgrA,   v_orgA, TRUE) RETURNING id INTO v_mMgr;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_adminB, v_orgB, TRUE) RETURNING id INTO v_mB;
  INSERT INTO user_org_business_role (membership_id, role_id, is_active) VALUES
    (v_mA, v_pub_role, TRUE), (v_mMgr, v_pub_role, TRUE), (v_mB, v_pub_role, TRUE);
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active) VALUES
    (v_mA, v_admin_role, TRUE), (v_mMgr, v_mgr_role, TRUE), (v_mB, v_admin_role, TRUE);

  -- ---------- A. Aucune ligne org : plateforme, orgObjectId = ORG du membre ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adminA, 'role','authenticated')::text, true);
  v_payload := api.get_app_branding();
  ASSERT v_payload->>'orgObjectId' = v_orgA, 'orgObjectId doit être l ORG du membre A';
  ASSERT v_payload->>'brandName' = v_plat_brand, 'sans ligne org, brandName = plateforme';
  ASSERT v_payload->>'primaryColor' = v_plat_primary, 'sans ligne org, primaryColor = plateforme';

  -- ---------- C. Gates d'écriture ----------
  -- manager20 de A refusé
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_mgrA, 'role','authenticated')::text, true);
  v_denied := false;
  BEGIN PERFORM api.upsert_org_branding(v_orgA, p_brand_name => 'KO'); EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'manager20 de A ne doit PAS pouvoir écrire le branding de A';
  -- admin30 de B refusé sur A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adminB, 'role','authenticated')::text, true);
  v_denied := false;
  BEGIN PERFORM api.upsert_org_branding(v_orgA, p_brand_name => 'KO'); EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'admin de B ne doit PAS pouvoir écrire le branding de A';

  -- ---------- B. superuser pose une surcharge partielle sur A ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super, 'role','authenticated')::text, true);
  PERFORM api.upsert_org_branding(v_orgA, p_brand_name => 'OTI A', p_primary_color => '#112233');

  -- Membre de A : surcharge champ par champ, reste = plateforme
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adminA, 'role','authenticated')::text, true);
  v_payload := api.get_app_branding();
  ASSERT v_payload->>'brandName' = 'OTI A', 'membre A doit voir la marque surchargée';
  ASSERT v_payload->>'primaryColor' = '#112233', 'membre A doit voir la couleur surchargée';
  ASSERT v_payload->>'accentColor' = (SELECT accent_color FROM app_branding_settings WHERE setting_key='default'),
         'les champs non surchargés restent plateforme';
  ASSERT v_payload ? 'markerStyles', 'markerStyles doit rester présent (plateforme)';

  -- admin30 de A peut écrire (probe OK, pas d'exception)
  PERFORM api.upsert_org_branding(v_orgA, p_brand_name => 'OTI A', p_primary_color => '#112233', p_accent_color => '#445566');
  v_payload := api.get_app_branding();
  ASSERT v_payload->>'accentColor' = '#445566', 'admin30 de A doit pouvoir écrire le branding de A';

  -- Membre de B : aucune ligne → 100 % plateforme, orgObjectId = orgB
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adminB, 'role','authenticated')::text, true);
  v_payload := api.get_app_branding();
  ASSERT v_payload->>'orgObjectId' = v_orgB, 'orgObjectId doit être l ORG du membre B';
  ASSERT v_payload->>'brandName' = v_plat_brand, 'membre B (sans ligne) voit la marque plateforme';

  -- ---------- D. reset ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super, 'role','authenticated')::text, true);
  PERFORM api.upsert_org_branding(v_orgA, p_reset => TRUE);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adminA, 'role','authenticated')::text, true);
  v_payload := api.get_app_branding();
  ASSERT v_payload->>'brandName' = v_plat_brand, 'après reset, retour à la marque plateforme';
  ASSERT NOT EXISTS (SELECT 1 FROM org_branding_settings WHERE org_object_id = v_orgA), 'reset doit supprimer la ligne';

  -- ---------- E. get_public_branding inchangée ----------
  v_payload := api.get_public_branding();
  ASSERT v_payload->>'brandName' = v_plat_brand, 'get_public_branding = marque plateforme';
  ASSERT NOT (v_payload ? 'orgObjectId'), 'get_public_branding ne doit PAS exposer orgObjectId';

  RAISE NOTICE 'test_org_branding: OK';
END $test$;

-- ---------- F. anon n'obtient AUCUNE ligne en lecture directe ----------
-- La RLS « read_org_branding » est TO authenticated : anon n'a aucune policy permissive ⇒
-- 0 ligne (Supabase accorde SELECT par défaut aux nouvelles tables public, comme
-- app_branding_settings — la protection est la RLS, pas un refus de privilège). On pose une
-- ligne RÉELLE (bypass RLS en superuser) puis on prouve qu'anon ne la voit pas — robuste aux
-- deux issues (0 ligne OU refus de privilège si le grant anon était retiré).
DO $anon$
DECLARE v_cnt int; v_blocked boolean := false;
BEGIN
  INSERT INTO org_branding_settings (org_object_id, brand_name)
    VALUES ('ORGRUN9999990904', 'Secret B') ON CONFLICT (org_object_id) DO NOTHING;
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO v_cnt FROM org_branding_settings;
    v_blocked := (v_cnt = 0);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  RESET ROLE;
  ASSERT v_blocked, 'anon ne doit obtenir AUCUNE ligne org_branding_settings (RLS TO authenticated)';
  RAISE NOTICE 'test_org_branding anon gate: OK';
END $anon$;
ROLLBACK;
