-- test_org_smtp_settings.sql — prouve migration_org_smtp_settings.sql (manifest 18g).
-- Spec : docs/superpowers/specs/2026-09-04-org-smtp-settings-design.md
--
-- A) Table + RLS + AUCUN grant à authenticated (deny-all PostgREST : la ligne nomme un hôte
--    de relais et un identifiant, contrairement au branding qui est public).
-- B) Le lecteur déchiffrant get_org_smtp_secret est service_role SEUL.
-- C) Gates : manager20 de A refusé ; admin30 de B refusé sur A ; admin30 de A OK ; superuser OK.
-- D) Le mot de passe ne sort JAMAIS de get_org_smtp — seulement hasPassword.
-- E) Il ne sort QUE par get_org_smtp_secret, et SEULEMENT si is_enabled.
-- F) Rotation : même pointeur Vault, nouvelle valeur. Vide ⇒ conservé. clear ⇒ retiré + purgé.
-- G) from_name vide ⇒ replie sur la marque de l'ORG puis la marque plateforme.
-- H) CHECKs : port hors liste refusé ; incohérence port/secure refusée ; hôte en URL refusé.
-- I) delete_org_smtp supprime la ligne ET le secret Vault.
-- Contre une base sans la migration : échec immédiat (table/RPCs absentes) — état rouge.
-- Auto-contenu + transactionnel (ROLLBACK). Mécanique calquée sur tests/test_org_branding.sql.
BEGIN;

-- ---------- A. Table, RLS, absence de grant ----------
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='org_smtp_settings'),
    'table public.org_smtp_settings manquante';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.org_smtp_settings'::regclass),
    'RLS doit être activée sur org_smtp_settings';
  -- Deny-all PostgREST : pas de policy ET pas de grant. L'un sans l'autre ne ferme rien.
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='org_smtp_settings'),
    'org_smtp_settings ne doit porter AUCUNE policy (tout accès passe par RPC)';
  ASSERT NOT has_table_privilege('authenticated', 'public.org_smtp_settings', 'SELECT'),
    'authenticated ne doit PAS lire org_smtp_settings en direct';
  ASSERT NOT has_table_privilege('anon', 'public.org_smtp_settings', 'SELECT'),
    'anon ne doit PAS lire org_smtp_settings en direct';
END$$;

-- ---------- B. Le lecteur déchiffrant est service_role SEUL ----------
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'api.get_org_smtp_secret(text)', 'execute'),
    'anon ne doit PAS exécuter get_org_smtp_secret';
  ASSERT NOT has_function_privilege('authenticated', 'api.get_org_smtp_secret(text)', 'execute'),
    'authenticated ne doit PAS exécuter get_org_smtp_secret — ce grant EST la frontière';
  ASSERT has_function_privilege('service_role', 'api.get_org_smtp_secret(text)', 'execute'),
    'service_role doit exécuter get_org_smtp_secret';
  ASSERT NOT has_function_privilege('authenticated', 'api.record_org_smtp_test(text,boolean,text)', 'execute'),
    'authenticated ne doit PAS consigner un résultat de test';
END$$;

DO $test$
DECLARE
  v_orgA   text := 'ORGRUN9999991801';
  v_orgB   text := 'ORGRUN9999991802';
  v_obj    text := 'HOTRUN9999991803';
  v_super  uuid := '00000000-0000-4000-a000-000000001804';
  v_adminA uuid := '00000000-0000-4000-a000-000000001805'; -- admin (rang 30) de A
  v_mgrA   uuid := '00000000-0000-4000-a000-000000001806'; -- manager (rang 20) de A
  v_adminB uuid := '00000000-0000-4000-a000-000000001807'; -- admin (rang 30) de B
  v_agentA uuid := '00000000-0000-4000-a000-000000001808'; -- destinataire de la notification
  v_pub_role   uuid;
  v_org_role   uuid;
  v_admin_role uuid;
  v_mgr_role   uuid;
  v_mA uuid; v_mMgr uuid; v_mB uuid; v_mAgent uuid;
  v_task uuid := '00000000-0000-4000-b000-000000001809';
  v_notif uuid := '00000000-0000-4000-b000-000000001810';
  v_payload jsonb;
  v_denied  boolean;
  v_secret1 uuid;
  v_secret2 uuid;
  v_pass    text;
  v_from    text;
BEGIN
  SELECT id INTO v_pub_role   FROM ref_org_business_role WHERE code = 'editor';
  SELECT id INTO v_org_role   FROM ref_org_role          WHERE code = 'publisher';
  SELECT id INTO v_admin_role FROM ref_org_admin_role    WHERE code = 'org_admin';
  SELECT id INTO v_mgr_role   FROM ref_org_admin_role    WHERE code = 'org_manager';
  ASSERT v_org_role IS NOT NULL, 'fixture: ref_org_role[publisher] manquant (seeds non appliqués)';

  -- ---------- Fixtures ----------
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA, 'ORG', 'Org A SMTP', 'published'),
    (v_orgB, 'ORG', 'Org B SMTP', 'published'),
    (v_obj,  'HOT', 'Fiche A SMTP', 'published');
  INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary)
    VALUES (v_obj, v_orgA, v_org_role, TRUE);

  INSERT INTO auth.users (id, email) VALUES
    (v_super,'smtp-super@test.local'), (v_adminA,'smtp-adminA@test.local'),
    (v_mgrA,'smtp-mgrA@test.local'), (v_adminB,'smtp-adminB@test.local'),
    (v_agentA,'smtp-agentA@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_super,'super_admin')
    ON CONFLICT (id) DO UPDATE SET role='super_admin';
  INSERT INTO app_user_profile (id, role) VALUES
    (v_adminA,'tourism_agent'), (v_mgrA,'tourism_agent'),
    (v_adminB,'tourism_agent'), (v_agentA,'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role='tourism_agent';

  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_adminA, v_orgA, TRUE) RETURNING id INTO v_mA;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_mgrA,   v_orgA, TRUE) RETURNING id INTO v_mMgr;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_adminB, v_orgB, TRUE) RETURNING id INTO v_mB;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_agentA, v_orgA, TRUE) RETURNING id INTO v_mAgent;
  INSERT INTO user_org_business_role (membership_id, role_id, is_active) VALUES
    (v_mA, v_pub_role, TRUE), (v_mMgr, v_pub_role, TRUE), (v_mB, v_pub_role, TRUE), (v_mAgent, v_pub_role, TRUE);
  INSERT INTO user_org_admin_role (membership_id, role_id, is_active) VALUES
    (v_mA, v_admin_role, TRUE), (v_mMgr, v_mgr_role, TRUE), (v_mB, v_admin_role, TRUE);

  -- ---------- C. Gates ----------
  -- manager rang 20 de A : refusé (le seuil est 30, pas « porteur d'un rôle admin »)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_mgrA, 'role','authenticated')::text, true);
  v_denied := false;
  BEGIN PERFORM api.upsert_org_smtp(v_orgA, 'smtp.ko.test', 587, false, 'ko@a.test');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'manager rang 20 de A ne doit PAS régler le relais de A';
  v_denied := false;
  BEGIN PERFORM api.get_org_smtp(v_orgA);
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'manager rang 20 de A ne doit PAS lire le relais de A';

  -- admin rang 30 de B : refusé sur A (le rang ne vaut que dans SON ORG)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adminB, 'role','authenticated')::text, true);
  v_denied := false;
  BEGIN PERFORM api.upsert_org_smtp(v_orgA, 'smtp.ko.test', 587, false, 'ko@a.test');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'admin de B ne doit PAS régler le relais de A';

  -- ---------- H. CHECKs de saisie (avant la ligne valide) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adminA, 'role','authenticated')::text, true);
  v_denied := false;
  BEGIN PERFORM api.upsert_org_smtp(v_orgA, 'smtp.a.test', 8080, false, 'no-reply@a.test');
  EXCEPTION WHEN check_violation THEN v_denied := true; END;
  ASSERT v_denied, 'un port hors 25/465/587/2525 doit être refusé (sinon le formulaire sonde des ports)';

  v_denied := false;
  BEGIN PERFORM api.upsert_org_smtp(v_orgA, 'smtp.a.test', 465, false, 'no-reply@a.test');
  EXCEPTION WHEN check_violation THEN v_denied := true; END;
  ASSERT v_denied, '465 sans TLS implicite doit être refusé (handshake opaque sinon)';

  v_denied := false;
  BEGIN PERFORM api.upsert_org_smtp(v_orgA, 'smtp://smtp.a.test:587', 587, false, 'no-reply@a.test');
  EXCEPTION WHEN check_violation THEN v_denied := true; END;
  ASSERT v_denied, 'un hôte saisi en URL doit être refusé à l écriture, pas au premier envoi';

  v_denied := false;
  BEGIN PERFORM api.upsert_org_smtp(v_orgA, 'smtp.a.test', 587, false, 'pas-une-adresse');
  EXCEPTION WHEN check_violation THEN v_denied := true; END;
  ASSERT v_denied, 'une from_email malformée doit être refusée';

  -- ---------- C (suite) + D. admin30 de A écrit, et le mot de passe ne revient pas ----------
  v_payload := api.upsert_org_smtp(v_orgA, 'smtp.a.test', 587, false, 'No-Reply@A.test',
                                   p_from_name => NULL, p_username => 'userA',
                                   p_password => 'p4ss-A', p_is_enabled => false);
  ASSERT v_payload->>'configured' = 'true', 'admin30 de A doit pouvoir régler le relais de A';
  ASSERT v_payload->>'host' = 'smtp.a.test', 'host non enregistré';
  ASSERT v_payload->>'fromEmail' = 'no-reply@a.test', 'from_email doit être normalisée en minuscules';
  ASSERT v_payload->>'hasPassword' = 'true', 'hasPassword doit être vrai après pose du mot de passe';
  ASSERT (v_payload::text NOT LIKE '%p4ss-A%'), 'get_org_smtp a laissé fuir le mot de passe';
  ASSERT (SELECT password_secret_id IS NOT NULL FROM org_smtp_settings WHERE org_object_id = v_orgA),
    'un mot de passe fourni doit produire un pointeur Vault';

  -- ---------- E. is_enabled FALSE ⇒ le lecteur d'exécution ne rend RIEN ----------
  ASSERT NOT EXISTS (SELECT 1 FROM api.get_org_smtp_secret(v_orgA)),
    'relais non activé ⇒ get_org_smtp_secret ne doit rien rendre (is_enabled EST la bascule)';

  -- Activation, puis le secret circule
  PERFORM api.upsert_org_smtp(v_orgA, 'smtp.a.test', 587, false, 'no-reply@a.test',
                              p_username => 'userA', p_password => NULL, p_is_enabled => true);
  SELECT password INTO v_pass FROM api.get_org_smtp_secret(v_orgA);
  ASSERT v_pass = 'p4ss-A',
    'un mot de passe VIDE à l upsert doit CONSERVER l ancien (le formulaire ne le relit jamais), got '||coalesce(v_pass,'NULL');

  -- ---------- G. from_name vide ⇒ marque ORG, puis marque plateforme ----------
  SELECT from_name INTO v_from FROM api.get_org_smtp_secret(v_orgA);
  ASSERT v_from = (SELECT brand_name FROM app_branding_settings WHERE setting_key='default'),
    'sans marque ORG, from_name replie sur la marque plateforme, got '||coalesce(v_from,'NULL');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super, 'role','authenticated')::text, true);
  PERFORM api.upsert_org_branding(v_orgA, p_brand_name => 'OTI A');
  SELECT from_name INTO v_from FROM api.get_org_smtp_secret(v_orgA);
  ASSERT v_from = 'OTI A', 'from_name doit replier sur la marque de l ORG, got '||coalesce(v_from,'NULL');

  -- ---------- F. Rotation : MÊME pointeur Vault, nouvelle valeur ----------
  SELECT password_secret_id INTO v_secret1 FROM org_smtp_settings WHERE org_object_id = v_orgA;
  PERFORM api.upsert_org_smtp(v_orgA, 'smtp.a.test', 587, false, 'no-reply@a.test',
                              p_username => 'userA', p_password => 'p4ss-A2', p_is_enabled => true);
  SELECT password_secret_id INTO v_secret2 FROM org_smtp_settings WHERE org_object_id = v_orgA;
  ASSERT v_secret1 = v_secret2, 'une rotation doit réutiliser le même pointeur Vault, pas en créer un second';
  SELECT password INTO v_pass FROM api.get_org_smtp_secret(v_orgA);
  ASSERT v_pass = 'p4ss-A2', 'la rotation doit changer la valeur, got '||coalesce(v_pass,'NULL');

  -- clear ⇒ pointeur retiré ET ligne Vault purgée (sinon le secret survit sans voie de lecture)
  PERFORM api.upsert_org_smtp(v_orgA, 'smtp.a.test', 587, false, 'no-reply@a.test',
                              p_username => NULL, p_password => NULL, p_is_enabled => true,
                              p_clear_password => true);
  ASSERT (SELECT password_secret_id IS NULL FROM org_smtp_settings WHERE org_object_id = v_orgA),
    'p_clear_password doit retirer le pointeur';
  ASSERT NOT EXISTS (SELECT 1 FROM vault.secrets WHERE id = v_secret1),
    'p_clear_password doit AUSSI purger la ligne Vault';
  SELECT password INTO v_pass FROM api.get_org_smtp_secret(v_orgA);
  ASSERT v_pass IS NULL, 'relais sans mot de passe (autorisé par IP) ⇒ password NULL, pas une erreur';

  -- ---------- I. delete supprime la ligne ET le secret ----------
  PERFORM api.upsert_org_smtp(v_orgA, 'smtp.a.test', 587, false, 'no-reply@a.test',
                              p_password => 'p4ss-A3', p_is_enabled => true);
  SELECT password_secret_id INTO v_secret1 FROM org_smtp_settings WHERE org_object_id = v_orgA;
  PERFORM api.delete_org_smtp(v_orgA);
  ASSERT NOT EXISTS (SELECT 1 FROM org_smtp_settings WHERE org_object_id = v_orgA),
    'delete_org_smtp doit supprimer la ligne';
  ASSERT NOT EXISTS (SELECT 1 FROM vault.secrets WHERE id = v_secret1),
    'delete_org_smtp doit AUSSI supprimer le secret Vault';

  -- ---------- Garde type ORG ----------
  -- EN SUPERUSER : pour un non-superuser le gate refuserait d abord (42501) et le trigger
  -- ne serait jamais atteint — le cas prouverait le gate une seconde fois, pas la garde.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super, 'role','authenticated')::text, true);
  v_denied := false;
  BEGIN PERFORM api.upsert_org_smtp(v_obj, 'smtp.a.test', 587, false, 'no-reply@a.test');
  EXCEPTION WHEN raise_exception THEN v_denied := true; END;
  ASSERT v_denied, 'un relais ne peut pas être posé sur une fiche qui n est pas une ORG';
  ASSERT NOT EXISTS (SELECT 1 FROM org_smtp_settings WHERE org_object_id = v_obj),
    'la garde de type doit empêcher la LIGNE, pas seulement lever';

  RAISE NOTICE 'test_org_smtp_settings: OK';
END $test$;

ROLLBACK;
