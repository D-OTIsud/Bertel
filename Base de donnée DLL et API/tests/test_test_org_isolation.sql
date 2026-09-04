-- test_test_org_isolation.sql
-- Garde permanente du cloisonnement « organisation de test » (migration_test_org_isolation.sql).
--
-- CE QUE CE TEST PROUVE, et pourquoi chaque bloc existe :
--   A. Structure — colonnes, feuille de garde, triggers, et le REVOKE qui empeche
--      PUBLIC d'executer la feuille.
--   B. L'ORG est la SOURCE DE VERITE : is_test n'est jamais ecrit a la main, il
--      descend de org_config.is_test_org par trigger, dans les deux sens.
--   C. SORTIE — une fiche de test PUBLIEE reste invisible de anon et de toute ORG
--      de production. C'est le sens « les donnees de test ne s'echappent pas ».
--   D. ENTREE — un compte de test ne voit PAS le corpus reel. C'est le sens qu'on
--      oublie : access_scope='own_objects_only' existait depuis §172 et ne l'a
--      jamais assure, parce que public_objects_published le contournait.
--   E. LES TABLES FILLES — la fiche est faite de ses enfants (media, descriptions,
--      tarifs, horaires, contacts). 42 policies sur 58 INLINENT le controle de
--      publication au lieu d'appeler can_read_object : patcher la seule fonction
--      aurait laisse la fiche de test grande ouverte tout en faisant passer C.
--   F. L'API PARTENAIRE — la surface qui compte pour la demande initiale. Elle
--      appelle en service_role, qui COURT-CIRCUITE la RLS : aucune des gardes
--      C/D/E ne la protege. C'est un chemin distinct, teste distinctement.
--   G. LES TOMBSTONES — supprimer une fiche de test ne doit pas fuiter son id au
--      flux C-4. object_deletion_log ne portait aucune dimension de test.
--   H. NON-VACUITE — la MEME fiche, basculee en production, DOIT redevenir
--      visible partout. Sans ce bloc, un fixture casse (fiche non publiee, ORG mal
--      liee) ferait passer C a D pour de mauvaises raisons, et le test serait vert
--      en ne gardant rien.
--
-- Sur une base SANS la migration : api.current_user_test_realm() existe en stub
-- (renvoie false) ou pas du tout ; object.is_test est absent -> le fixture echoue
-- des le premier INSERT -> rouge. Auto-porte et transactionnel (ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgTest text := 'ORGRUN8888880001';   -- ORG bac a sable
  v_orgProd text := 'ORGRUN8888880002';   -- ORG de production
  v_objTest text := 'HOTRUN8888880011';   -- fiche de test, PUBLIEE
  v_objProd text := 'HOTRUN8888880012';   -- fiche reelle, PUBLIEE
  v_userTest uuid := '00000000-0000-4000-a000-0000000000c1'::uuid;
  v_userProd uuid := '00000000-0000-4000-a000-0000000000d2'::uuid;
  v_pub_role uuid;
  v_n         integer;
  v_js        jsonb;
BEGIN
  -- ────────── A. Structure ──────────
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='object' AND column_name='is_test'),
         'A: object.is_test absente';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='org_config' AND column_name='is_test_org'),
         'A: org_config.is_test_org absente';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='object_deletion_log' AND column_name='is_test'),
         'A: object_deletion_log.is_test absente — les tombstones fuiteraient a l API partenaire';
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='api' AND p.proname='current_user_test_realm'),
         'A: api.current_user_test_realm() absente';
  ASSERT (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='api' AND p.proname='current_user_test_realm'),
         'A: current_user_test_realm DOIT etre SECURITY DEFINER (elle lit user_org_membership sous RLS)';
  -- pg_temp en dernier : sans lui, un CREATE TEMP TABLE user_org_membership par
  -- n'importe quel authenticated forgerait le realm (§208/R2.1).
  ASSERT (SELECT array_to_string(p.proconfig,',') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='api' AND p.proname='current_user_test_realm') LIKE '%pg_temp',
         'A: search_path de current_user_test_realm DOIT finir par pg_temp (§208/R2.1)';
  ASSERT NOT has_function_privilege('public', 'api.current_user_test_realm()', 'EXECUTE'),
         'A: EXECUTE ne doit pas rester accorde a PUBLIC';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_object_org_link_is_test'),
         'A: trigger de propagation object_org_link absent';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_org_config_is_test'),
         'A: trigger de bascule org_config absent';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_object_deletion_log_is_test'),
         'A: trigger de realm des tombstones absent';

  -- Aucune policy de lecture ne doit tester la publication sans predicat de realm.
  -- C'est la garde qui rend impossible l'oubli d'une table fille — la panne
  -- MUETTE que ce chantier redoutait.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND cmd='SELECT'
     AND qual ILIKE '%status = ''published''%'
     AND qual NOT LIKE '%current_user_test_realm%';
  ASSERT v_n = 0,
         format('A: %s policy(ies) de lecture testent la publication SANS predicat de realm', v_n);

  -- ────────── Fixture (superuser : RLS contournee) ──────────
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code='publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN
    RAISE EXCEPTION 'fixture: ref_org_role[publisher] absent (seeds non appliques)';
  END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgTest, 'ORG', 'ORG Bac a sable', 'published'),
    (v_orgProd, 'ORG', 'ORG Production',  'published'),
    (v_objTest, 'HOT', 'Hotel de test',   'published'),
    (v_objProd, 'HOT', 'Hotel reel',      'published');

  INSERT INTO org_config (org_object_id, access_scope, is_test_org) VALUES
    (v_orgTest, 'own_objects_only', TRUE),
    (v_orgProd, 'all_published',    FALSE);

  INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary) VALUES
    (v_objTest, v_orgTest, v_pub_role, TRUE),
    (v_objProd, v_orgProd, v_pub_role, TRUE);

  INSERT INTO auth.users (id, email) VALUES
    (v_userTest, 'realm_test@test.local'), (v_userProd, 'realm_prod@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userTest, 'tourism_agent'), (v_userProd, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userTest, v_orgTest, TRUE), (v_userProd, v_orgProd, TRUE);

  -- Une fille de chaque cote, pour le bloc E.
  INSERT INTO object_description (object_id, description, visibility) VALUES
    (v_objTest, 'Description de la fiche de test', 'public'),
    (v_objProd, 'Description de la fiche reelle',  'public');

  -- ────────── B. L'ORG est la source de verite ──────────
  ASSERT (SELECT is_test FROM object WHERE id = v_objTest) IS TRUE,
         'B: le trigger n a pas propage is_test depuis l ORG de test';
  ASSERT (SELECT is_test FROM object WHERE id = v_objProd) IS FALSE,
         'B: une fiche d ORG de production ne doit pas etre marquee de test';

  -- Bascule de l'ORG : les fiches suivent, sans qu'on les touche.
  UPDATE org_config SET is_test_org = FALSE WHERE org_object_id = v_orgTest;
  ASSERT (SELECT is_test FROM object WHERE id = v_objTest) IS FALSE,
         'B: la bascule de l ORG vers la production n a pas suivi';
  UPDATE org_config SET is_test_org = TRUE  WHERE org_object_id = v_orgTest;
  ASSERT (SELECT is_test FROM object WHERE id = v_objTest) IS TRUE,
         'B: la bascule de l ORG vers le bac a sable n a pas suivi';

  -- ────────── C. SORTIE : la fiche de test ne s echappe pas ──────────
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM object WHERE id = v_objTest) = 0,
           'C: FUITE — anon voit une fiche de test publiee';
    ASSERT (SELECT count(*) FROM object WHERE id = v_objProd) = 1,
           'C: anon doit continuer a voir le corpus reel (la garde ne casse pas le produit)';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_userProd, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT api.current_user_test_realm()) IS FALSE,
           'C: un membre d ORG de production doit etre en realm production';
    ASSERT (SELECT count(*) FROM object WHERE id = v_objTest) = 0,
           'C: FUITE — une ORG de production voit une fiche de test';
    ASSERT (SELECT count(*) FROM object WHERE id = v_objProd) = 1,
           'C: une ORG de production doit voir sa propre fiche';
  RESET ROLE;

  -- ────────── D. ENTREE : le compte de test ne voit pas la production ──────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_userTest, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT api.current_user_test_realm()) IS TRUE,
           'D: un membre d ORG de test doit etre en realm bac a sable';
    ASSERT (SELECT count(*) FROM object WHERE id = v_objProd) = 0,
           'D: FUITE — un compte de test voit le corpus reel (le sens qu access_scope n a jamais assure)';
    ASSERT (SELECT count(*) FROM object WHERE id = v_objTest) = 1,
           'D: un compte de test DOIT voir sa propre fiche — sinon le bac a sable est inutilisable';
  RESET ROLE;

  -- ────────── E. Les tables filles (42 policies inlinees) ──────────
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM object_description WHERE object_id = v_objTest) = 0,
           'E: FUITE — la DESCRIPTION d une fiche de test est lisible par anon (policy fille inlinee non cloisonnee)';
    ASSERT (SELECT count(*) FROM object_description WHERE object_id = v_objProd) = 1,
           'E: la description d une fiche reelle doit rester lisible';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_userTest, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM object_description WHERE object_id = v_objProd) = 0,
           'E: FUITE — un compte de test lit la description d une fiche reelle';
  RESET ROLE;

  -- ────────── F. L API PARTENAIRE (service_role — la RLS ne s applique PAS) ──────────
  -- C'est la demande initiale : « that data should not go to the partenaire api ».
  -- Le route Next.js appelle ces RPC en service_role ; aucune garde RLS ne joue ici.
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  SET LOCAL ROLE service_role;
    ASSERT (SELECT api.current_user_test_realm()) IS FALSE,
           'F: service_role DOIT etre en realm production';

    -- /api/public/objects/{id}
    ASSERT api.get_object_resource(v_objTest, ARRAY['fr']) IS NULL,
           'F: FUITE PARTENAIRE — get_object_resource sert une fiche de test';
    ASSERT api.get_object_resource(v_objProd, ARRAY['fr']) IS NOT NULL,
           'F: get_object_resource doit continuer a servir le corpus reel';

    -- /api/public/objects (liste paginee).
    --
    -- ATTENTION AU FAUX VERT. Avec p_status = ['published'] seul, la fonction lit
    -- la MATVIEW — un instantane qui ne contient AUCUNE ligne de ce fixture, cree
    -- dans la transaction courante. L'assertion « la fiche de test est absente »
    -- serait alors VRAIE sans rien prouver : elle serait absente parce que RIEN
    -- n'est la. On force donc la branche `FROM object` (celle qui porte le
    -- predicat de realm) en demandant un statut hors du perimetre de la MV.
    ASSERT NOT EXISTS (
      SELECT 1 FROM api.get_filtered_object_ids('{}'::jsonb, NULL,
                                                ARRAY['published','draft']::object_status[], NULL) f
      WHERE f.object_id = v_objTest),
      'F: FUITE PARTENAIRE — la fiche de test est listee par get_filtered_object_ids';
    ASSERT EXISTS (
      SELECT 1 FROM api.get_filtered_object_ids('{}'::jsonb, NULL,
                                                ARRAY['published','draft']::object_status[], NULL) f
      WHERE f.object_id = v_objProd),
      'F: le corpus reel doit rester liste (temoin de non-vacuite de l assertion precedente)';

    -- Et la MV elle-meme ne doit contenir aucune fiche de test : c'est ce qui rend
    -- le chemin chaud sur inconditionnellement, quel que soit son futur appelant.
    ASSERT NOT EXISTS (
      SELECT 1 FROM internal.mv_filtered_objects m
      JOIN object o ON o.id = m.id
      WHERE o.is_test),
      'F: FUITE — la matview de l Explorer contient des fiches de test';

    -- L ensemble « lisible » servant les marqueurs de carte.
    ASSERT NOT EXISTS (SELECT 1 FROM api.current_user_readable_object_ids() s WHERE s = v_objTest),
           'F: FUITE PARTENAIRE — la fiche de test est dans current_user_readable_object_ids';
  RESET ROLE;

  -- ────────── G. Les tombstones (flux C-4) ──────────
  INSERT INTO object_deletion_log (object_id, object_name, object_type, status_at_deletion)
  VALUES (v_objTest, 'Hotel de test', 'HOT', 'published');
  ASSERT (SELECT is_test FROM object_deletion_log WHERE object_id = v_objTest) IS TRUE,
         'G: le tombstone d une fiche de test doit heriter du realm de test';

  INSERT INTO object_deletion_log (object_id, object_name, object_type, status_at_deletion)
  VALUES (v_objProd, 'Hotel reel', 'HOT', 'published');
  ASSERT (SELECT is_test FROM object_deletion_log WHERE object_id = v_objProd) IS FALSE,
         'G: le tombstone d une fiche reelle ne doit pas etre marque de test';

  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  SET LOCAL ROLE service_role;
    v_js := api.list_deleted_objects_since(NULL, 1000);
    ASSERT NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_js->'tombstones') t
      WHERE t->>'object_id' = v_objTest),
      'G: FUITE PARTENAIRE — le tombstone d une fiche de test part au flux C-4';
    ASSERT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_js->'tombstones') t
      WHERE t->>'object_id' = v_objProd),
      'G: le tombstone d une fiche reelle doit continuer a partir (la garde ne casse pas le flux)';
  RESET ROLE;

  -- ────────── H. NON-VACUITE ──────────
  -- Tout ce qui precede serait VERT si le fixture etait simplement casse : fiche non
  -- publiee, ORG mal liee, id inexistant. On bascule la MEME fiche en production et
  -- on exige qu elle redevienne visible PARTOUT. Si ce bloc echoue, les blocs C a G
  -- ne prouvaient rien.
  UPDATE org_config SET is_test_org = FALSE WHERE org_object_id = v_orgTest;
  ASSERT (SELECT is_test FROM object WHERE id = v_objTest) IS FALSE, 'H: la bascule n a pas pris';

  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM object WHERE id = v_objTest) = 1,
           'H: TEST VACANT — la fiche reste invisible de anon une fois repassee en production';
    ASSERT (SELECT count(*) FROM object_description WHERE object_id = v_objTest) = 1,
           'H: TEST VACANT — la description reste invisible une fois repassee en production';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  SET LOCAL ROLE service_role;
    ASSERT api.get_object_resource(v_objTest, ARRAY['fr']) IS NOT NULL,
           'H: TEST VACANT — l API partenaire ne sert pas la fiche une fois repassee en production';
  RESET ROLE;

  RAISE NOTICE 'test_test_org_isolation: OK (A structure, B source de verite, C sortie, D entree, E filles, F API partenaire, G tombstones, H non-vacuite)';
END
$$;
ROLLBACK;
