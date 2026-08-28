-- =====================================================================
-- test_org_link_reconcile_editor.sql — garde 16x, personas réelles
-- =====================================================================
-- Ce que ce fichier protège, en une phrase : **une fonction d'écriture ne doit
-- jamais détruire la ligne qui PORTE le droit d'écrire de son appelant.**
--
-- Le défaut refermé (reproduit en production le 2026-08-26) : la branche
-- `org_links` de `api.save_object_relations` faisait `DELETE FROM
-- object_org_link WHERE object_id = …` puis ré-insérait. Or pour un ÉDITEUR
-- (non superuser, non propriétaire), le droit d'écrire EST ce lien :
--   api.user_can_write_canonical = user_has_permission('edit_canonical_when_publisher')
--                                  AND EXISTS(object_org_link publisher → mon ORG)
-- Après le DELETE, cet EXISTS est faux à l'instruction SUIVANTE, donc le
-- `WITH CHECK` de `canonical_ins_object_org_link` refuse la ré-insertion :
--   42501 new row violates row-level security policy for table "object_org_link"
-- Toute la transaction est annulée — y compris le rattachement de prestataire
-- (§19) que l'utilisateur venait de faire, puisque §15/§17/§19 partagent le
-- MÊME module `relationships` et donc le même appel RPC.
-- Un superuser ne le voyait pas : il passe par `api.is_object_owner`, qui ne
-- lit pas `object_org_link`. D'où le symptôme exact rapporté — « moi
-- administrateur je peux, les éditeurs ne peuvent pas ».
--
-- Dépendances d'exécution : le manifeste complet (step 7 + 8r pour le corps de
-- `api.save_object_relations`, 8b pour `user_can_write_object_canonical`, 16u
-- pour `can_read_actor_contacts` que la branche `actors` appelle), PUIS
-- `migration_org_link_reconcile.sql` (créneau 16x). Le bloc S0 le dit en clair
-- plutôt que de laisser un 42883 illisible tomber au milieu du fichier.
--
-- HARNAIS — pourquoi `request.jwt.claims` ET `SET LOCAL ROLE`, jamais l'un sans
-- l'autre (invariant §204, repris de test_actor_contacts_org_gate.sql) :
--   · `SET ROLE` SEUL : hors contexte HTTP `auth.uid()` rend NULL, le persona
--     éditeur s'effondre sur la branche fail-closed et le fichier devient
--     VACANT (il n'éprouverait plus que « superuser ≠ NULL »).
--   · `set_config` SEUL : le rôle de connexion du harnais est superuser /
--     BYPASSRLS — or c'est PRÉCISÉMENT la RLS de `object_org_link` qui est
--     l'objet du test. Sans `SET LOCAL ROLE authenticated`, le bloc B passerait
--     même avec le corps fautif.
--
-- LA GARDE SE MESURE DES DEUX CÔTÉS (invariant §213) : le bloc B prouve que
-- l'éditeur écrit de nouveau, le bloc C que le superuser écrit TOUJOURS, et le
-- bloc D que la réconciliation n'a pas ouvert la porte à un étranger. Un
-- correctif qui laisserait tout le monde écrire passerait B et échouerait D.
--
-- Auto-portant + transactionnel : ROLLBACK final, rien ne persiste.
\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------
-- S0. Le test peut-il seulement échouer ? (anti-vacuité du harnais lui-même)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF lower(coalesce(current_setting('plpgsql.check_asserts', true), 'on')) = 'off' THEN
    RAISE EXCEPTION 'harnais VACANT: plpgsql.check_asserts = off — tous les ASSERT de ce fichier seraient ignores';
  END IF;
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'api' AND p.proname = 'save_object_relations'),
    'api.save_object_relations absente — appliquer object_workspace_safe_write_rpcs.sql (7) + migration_actor_links_editor.sql (8r) AVANT ce test';
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'api' AND p.proname = 'user_can_write_canonical'),
    'api.user_can_write_canonical absente — appliquer migration_permission_write_paths.sql (8b) AVANT ce test';
  -- Les 3 policies par commande de 8o/8p doivent exister : sans le WITH CHECK de
  -- canonical_ins_object_org_link, le bloc B passerait par ABSENCE de garde.
  ASSERT (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'object_org_link'
             AND policyname IN ('canonical_ins_object_org_link',
                                'canonical_upd_object_org_link',
                                'canonical_del_object_org_link')) = 3,
    '16x: la famille d ecriture par commande de object_org_link est incomplete — le test serait vacant';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.object_org_link'::regclass),
    '16x: RLS desactivee sur object_org_link — le test serait vacant';
END$$;

-- ---------------------------------------------------------------------
-- S1. Fixtures — un ÉDITEUR au sens strict, pas un admin déguisé
-- ---------------------------------------------------------------------
-- L'éditeur témoin n'a QUE `edit_canonical_when_publisher`. Il n'a
-- DÉLIBÉRÉMENT ni rôle plateforme privilégié, ni rôle admin d'ORG, ni lien
-- acteur primaire : chacun de ces trois lui donnerait le droit d'écrire par un
-- AUTRE chemin (`is_object_owner`) et masquerait le défaut — le test
-- passerait alors pour la mauvaise raison.
DO $$
DECLARE
  v_org      text := 'ORGRUN00000016V1';
  v_obj      text := 'HOTRUN00000016V1';
  v_editor   uuid := '16b00000-0000-4000-8000-000000000001';
  v_stranger uuid := '16b00000-0000-4000-8000-000000000002';
  v_super    uuid := '16b00000-0000-4000-8000-000000000003';
  v_actor    uuid := '16b00000-0000-4000-8000-00000000000a';
  v_role_pub uuid;
  v_role_op  uuid;
  v_perm     uuid;
BEGIN
  SELECT id INTO v_role_pub FROM ref_org_role   WHERE code = 'publisher' LIMIT 1;
  SELECT id INTO v_role_op  FROM ref_actor_role WHERE code = 'operator'  LIMIT 1;
  SELECT id INTO v_perm     FROM ref_permission WHERE code = 'edit_canonical_when_publisher' AND is_active LIMIT 1;
  ASSERT v_role_pub IS NOT NULL, 'fixture: ref_org_role[publisher] manquant (seeds non appliques)';
  ASSERT v_role_op  IS NOT NULL, 'fixture: ref_actor_role[operator] manquant (seeds non appliques)';
  ASSERT v_perm     IS NOT NULL, 'fixture: ref_permission[edit_canonical_when_publisher] manquante — le persona editeur serait un simple lecteur et le test VACANT';

  -- Claims service_role pendant la pose des fixtures (meme raison qu en 16u :
  -- api.enforce_app_user_profile_role_change n autorise `owner` qu a un
  -- demandeur owner/service_role).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'ORG temoin 16x',   'published'),
    (v_obj, 'HOT', 'Hotel temoin 16x', 'published');
  INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary, note) VALUES
    (v_obj, v_org, v_role_pub, TRUE, 'note publisher 16x');

  INSERT INTO auth.users (id, email) VALUES
    (v_editor,   'editeur16x@test.local'),
    (v_stranger, 'etranger16x@test.local'),
    (v_super,    'super16x@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role, display_name) VALUES
    (v_editor,   'tourism_agent', 'Editeur 16x'),
    (v_stranger, 'tourism_agent', 'Etranger 16x'),
    (v_super,    'owner',         'Superuser 16x')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;

  -- SEUL l editeur est membre de l ORG publisher. L etranger est membre de RIEN :
  -- c est ce qui rend le bloc D non vacant.
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_editor, v_org, TRUE);
  INSERT INTO user_permission (user_id, permission_id, is_active) VALUES (v_editor, v_perm, TRUE)
  ON CONFLICT (user_id, permission_id) DO UPDATE SET is_active = TRUE;

  INSERT INTO actor (id, display_name) VALUES (v_actor, 'Prestataire temoin 16x');

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE '16x fixtures: 1 ORG publisher, 1 fiche, 3 users (editeur/etranger/superuser), 1 acteur.';
END$$;

-- ---------------------------------------------------------------------
-- S2. Le persona éditeur est bien un ÉDITEUR — et rien de plus
-- ---------------------------------------------------------------------
-- Sans ce bloc, un correctif qui aurait (par erreur) promu le témoin en
-- propriétaire ferait passer B en silence. On EXIGE que son droit vienne
-- exclusivement du bras `user_can_write_canonical`.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16b00000-0000-4000-8000-000000000001"}', true);
  SET LOCAL ROLE authenticated;

  ASSERT COALESCE(api.user_has_permission('edit_canonical_when_publisher'), FALSE),
    'S2a FAIL: le temoin doit porter edit_canonical_when_publisher';
  ASSERT NOT COALESCE(api.is_object_owner('HOTRUN00000016V1'), FALSE),
    'S2b FAIL: le temoin NE DOIT PAS etre proprietaire — sinon le test ne teste plus le bras editeur';
  ASSERT COALESCE(api.user_can_write_canonical('HOTRUN00000016V1'), FALSE),
    'S2c FAIL: le temoin doit pouvoir ecrire par le bras publisher+permission';
  ASSERT COALESCE(api.user_can_write_object_canonical('HOTRUN00000016V1'), FALSE),
    'S2d FAIL: la garde composee doit rendre TRUE pour le temoin';
END$$;
RESET ROLE;

-- ---------------------------------------------------------------------
-- B. L'ÉDITEUR enregistre le module `relationships` — le cas rapporté
-- ---------------------------------------------------------------------
-- Payload EXACTEMENT de la forme que le front envoie : `buildRelationshipsRpcPayload`
-- émet TOUJOURS `object_relations`, et ajoute `org_links` dès que le chargeur a
-- pu les lire (c'est le cas nominal). Rattacher un prestataire en §19 passe donc
-- par un appel qui porte AUSSI `org_links` — c'est ce qui rendait le défaut si
-- déroutant : l'utilisateur touche les prestataires, c'est le lien ORG qui casse.
DO $$
DECLARE v jsonb; v_role_pub uuid; v_n int;
BEGIN
  SELECT id INTO v_role_pub FROM ref_org_role WHERE code = 'publisher' LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16b00000-0000-4000-8000-000000000001"}', true);
  SET LOCAL ROLE authenticated;

  v := api.save_object_relations('HOTRUN00000016V1', jsonb_build_object(
        'object_relations', '[]'::jsonb,
        'org_links', jsonb_build_array(jsonb_build_object(
          'org_object_id', 'ORGRUN00000016V1',
          'role_id',       v_role_pub::text,
          'role_code',     'publisher',
          'is_primary',    true,
          'note',          'note publisher 16x')),
        'actors', jsonb_build_array(jsonb_build_object(
          'actor_id',   '16b00000-0000-4000-8000-00000000000a',
          'role_code',  'operator',
          'is_primary', true,
          'visibility', 'public',
          'note',       ''))));
  ASSERT v->>'success' = 'true', format('B1 FAIL: l editeur doit pouvoir enregistrer le module relationships, recu %s', v);

  RESET ROLE;
  -- Le lien publisher est TOUJOURS là (c est lui le droit d ecrire) …
  SELECT count(*) INTO v_n FROM object_org_link
   WHERE object_id = 'HOTRUN00000016V1' AND org_object_id = 'ORGRUN00000016V1' AND is_primary;
  ASSERT v_n = 1, format('B2 FAIL: le lien publisher doit survivre a l enregistrement, trouve %s', v_n);
  -- … et le prestataire du MEME appel a bien ete rattache (le vrai geste metier).
  SELECT count(*) INTO v_n FROM actor_object_role
   WHERE object_id = 'HOTRUN00000016V1' AND actor_id = '16b00000-0000-4000-8000-00000000000a';
  ASSERT v_n = 1, format('B3 FAIL: le prestataire du meme appel doit etre rattache, trouve %s', v_n);
END$$;
RESET ROLE;

-- ---------------------------------------------------------------------
-- B2. Deux enregistrements de suite — le droit n'est pas consommé
-- ---------------------------------------------------------------------
-- Un correctif qui ne ferait que « survivre au premier appel » (p. ex. en
-- réinsérant avant de supprimer) laisserait la base dans un état où le
-- deuxième enregistrement casse. On rejoue donc l'appel à l'identique.
DO $$
DECLARE v jsonb; v_role_pub uuid;
BEGIN
  SELECT id INTO v_role_pub FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16b00000-0000-4000-8000-000000000001"}', true);
  SET LOCAL ROLE authenticated;
  v := api.save_object_relations('HOTRUN00000016V1', jsonb_build_object(
        'object_relations', '[]'::jsonb,
        'org_links', jsonb_build_array(jsonb_build_object(
          'org_object_id', 'ORGRUN00000016V1',
          'role_id',       v_role_pub::text,
          'role_code',     'publisher',
          'is_primary',    true,
          'note',          'note publisher 16x modifiee')),
        'actors', '[]'::jsonb));
  ASSERT v->>'success' = 'true', format('B4 FAIL: le second enregistrement doit passer aussi, recu %s', v);
  RESET ROLE;
  ASSERT (SELECT note FROM object_org_link
           WHERE object_id = 'HOTRUN00000016V1' AND org_object_id = 'ORGRUN00000016V1')
         = 'note publisher 16x modifiee',
    'B5 FAIL: la reconciliation doit METTRE A JOUR la ligne conservee (note), pas l ignorer';
END$$;
RESET ROLE;

-- ---------------------------------------------------------------------
-- C. Le SUPERUSER écrit toujours (la garde se mesure des deux côtés)
-- ---------------------------------------------------------------------
DO $$
DECLARE v jsonb; v_role_pub uuid;
BEGIN
  SELECT id INTO v_role_pub FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16b00000-0000-4000-8000-000000000003"}', true);
  SET LOCAL ROLE authenticated;
  v := api.save_object_relations('HOTRUN00000016V1', jsonb_build_object(
        'object_relations', '[]'::jsonb,
        'org_links', jsonb_build_array(jsonb_build_object(
          'org_object_id', 'ORGRUN00000016V1',
          'role_id',       v_role_pub::text,
          'role_code',     'publisher',
          'is_primary',    true,
          'note',          'note publisher 16x'))));
  ASSERT v->>'success' = 'true', format('C1 FAIL: le superuser doit continuer a enregistrer, recu %s', v);
END$$;
RESET ROLE;

-- ---------------------------------------------------------------------
-- D. L'ÉTRANGER reste dehors (le correctif n'ouvre rien)
-- ---------------------------------------------------------------------
-- Sans ce bloc, un « correctif » qui passerait la fonction en SECURITY DEFINER
-- sans garde, ou qui relâcherait la policy, ferait passer B et C sans que rien
-- ne rougisse.
DO $$
DECLARE v_role_pub uuid; v_raised boolean := FALSE;
BEGIN
  SELECT id INTO v_role_pub FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16b00000-0000-4000-8000-000000000002"}', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM api.save_object_relations('HOTRUN00000016V1', jsonb_build_object(
      'org_links', jsonb_build_array(jsonb_build_object(
        'org_object_id', 'ORGRUN00000016V1',
        'role_id',       v_role_pub::text,
        'role_code',     'publisher',
        'is_primary',    true))));
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := TRUE;
  END;
  ASSERT v_raised,
    'D1 FAIL: un authentifie SANS membership ni permission doit etre refuse (42501) — la reconciliation ne doit rien ouvrir';
END$$;
RESET ROLE;

-- ---------------------------------------------------------------------
-- E. Le retrait délibéré d'un lien reste possible (pas de sur-correction)
-- ---------------------------------------------------------------------
-- La réconciliation ne doit pas devenir « on n'enlève plus jamais rien » : un
-- lien ABSENT du payload doit disparaître. On ajoute un second lien (reader)
-- puis on l'omet, et on exige qu'il parte — le publisher, lui, reste.
DO $$
DECLARE v jsonb; v_role_pub uuid; v_role_read uuid; v_n int;
BEGIN
  SELECT id INTO v_role_pub  FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  SELECT id INTO v_role_read FROM ref_org_role WHERE code = 'reader'    LIMIT 1;
  ASSERT v_role_read IS NOT NULL, 'fixture E: ref_org_role[reader] manquant';

  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16b00000-0000-4000-8000-000000000001"}', true);
  SET LOCAL ROLE authenticated;

  v := api.save_object_relations('HOTRUN00000016V1', jsonb_build_object(
        'org_links', jsonb_build_array(
          jsonb_build_object('org_object_id','ORGRUN00000016V1','role_id',v_role_pub::text,
                             'role_code','publisher','is_primary',true),
          jsonb_build_object('org_object_id','ORGRUN00000016V1','role_id',v_role_read::text,
                             'role_code','reader','is_primary',false))));
  ASSERT v->>'success' = 'true', format('E1 FAIL: ajout d un second lien refuse, recu %s', v);
  RESET ROLE;
  SELECT count(*) INTO v_n FROM object_org_link WHERE object_id = 'HOTRUN00000016V1';
  ASSERT v_n = 2, format('E2 FAIL: les 2 liens doivent exister, trouve %s', v_n);

  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16b00000-0000-4000-8000-000000000001"}', true);
  SET LOCAL ROLE authenticated;
  v := api.save_object_relations('HOTRUN00000016V1', jsonb_build_object(
        'org_links', jsonb_build_array(
          jsonb_build_object('org_object_id','ORGRUN00000016V1','role_id',v_role_pub::text,
                             'role_code','publisher','is_primary',true))));
  ASSERT v->>'success' = 'true', format('E3 FAIL: retrait du lien reader refuse, recu %s', v);
  RESET ROLE;
  SELECT count(*) INTO v_n FROM object_org_link WHERE object_id = 'HOTRUN00000016V1';
  ASSERT v_n = 1, format('E4 FAIL: le lien reader omis du payload doit etre supprime, trouve %s lien(s)', v_n);
  ASSERT EXISTS (SELECT 1 FROM object_org_link
                  WHERE object_id = 'HOTRUN00000016V1' AND role_id = v_role_pub),
    'E5 FAIL: c est le lien publisher qui doit rester';
END$$;
RESET ROLE;

-- ---------------------------------------------------------------------
-- F. Bascule du drapeau « principal » — l'unique partiel tient
-- ---------------------------------------------------------------------
-- uq_object_primary_org est un UNIQUE partiel sur (object_id) WHERE is_primary :
-- déplacer le principal d un lien à l autre EXIGE de retirer l ancien drapeau
-- AVANT de poser le nouveau. Sans cet ordre, la réconciliation lèverait 23505
-- là où le delete-all ne le faisait pas — une régression introduite par le
-- correctif lui-même.
DO $$
DECLARE v jsonb; v_role_pub uuid; v_role_read uuid;
BEGIN
  SELECT id INTO v_role_pub  FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  SELECT id INTO v_role_read FROM ref_org_role WHERE code = 'reader'    LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16b00000-0000-4000-8000-000000000001"}', true);
  SET LOCAL ROLE authenticated;
  v := api.save_object_relations('HOTRUN00000016V1', jsonb_build_object(
        'org_links', jsonb_build_array(
          jsonb_build_object('org_object_id','ORGRUN00000016V1','role_id',v_role_pub::text,
                             'role_code','publisher','is_primary',false),
          jsonb_build_object('org_object_id','ORGRUN00000016V1','role_id',v_role_read::text,
                             'role_code','reader','is_primary',true))));
  ASSERT v->>'success' = 'true', format('F1 FAIL: bascule du principal refusee, recu %s', v);
  RESET ROLE;
  ASSERT (SELECT count(*) FROM object_org_link
           WHERE object_id = 'HOTRUN00000016V1' AND is_primary) = 1,
    'F2 FAIL: il doit rester exactement UN lien principal';
  ASSERT EXISTS (SELECT 1 FROM object_org_link
                  WHERE object_id = 'HOTRUN00000016V1' AND role_id = v_role_read AND is_primary),
    'F3 FAIL: le principal doit avoir bascule sur le lien reader';
END$$;
RESET ROLE;

-- ---------------------------------------------------------------------
-- G. Un doublon (org, rôle) dans le payload échoue FORT, jamais en silence
-- ---------------------------------------------------------------------
-- L ancien corps levait 23505 (violation de PK). La réconciliation ne doit pas
-- transformer cela en « dernière ligne gagne » silencieux : une saisie jetée
-- sans bruit est un piege d ecriture (invariant §212).
DO $$
DECLARE v_role_pub uuid; v_raised boolean := FALSE;
BEGIN
  SELECT id INTO v_role_pub FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16b00000-0000-4000-8000-000000000001"}', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM api.save_object_relations('HOTRUN00000016V1', jsonb_build_object(
      'org_links', jsonb_build_array(
        jsonb_build_object('org_object_id','ORGRUN00000016V1','role_id',v_role_pub::text,
                           'role_code','publisher','is_primary',true,'note','A'),
        jsonb_build_object('org_object_id','ORGRUN00000016V1','role_id',v_role_pub::text,
                           'role_code','publisher','is_primary',false,'note','B'))));
  EXCEPTION WHEN unique_violation THEN
    v_raised := TRUE;
  END;
  ASSERT v_raised,
    'G1 FAIL: un doublon (org, role) dans le payload doit lever 23505, jamais etre absorbe en silence';
END$$;
RESET ROLE;

-- ---------------------------------------------------------------------
-- H. LE JUMEAU `actors` — un appelant dont le SEUL titre est un lien acteur
-- ---------------------------------------------------------------------
-- `api.is_object_owner` est vrai pour qui detient sur la fiche un lien acteur PRIMAIRE dont
-- l'e-mail est le sien (api.user_actor_ids fait le pont par actor_channel[email]). La branche
-- `actors` etant elle aussi un delete-all + re-insert, un tel appelant voyait son propre droit
-- disparaitre avec le DELETE, puis le WITH CHECK de canonical_ins_actor_object_role refuser la
-- re-insertion : le MEME 42501 que sur `org_links`, dans une autre table.
-- Le persona porte un claim `email` : `api.current_user_email()` le lit dans le JWT, pas dans
-- auth.users — sans lui, `user_actor_ids()` rend vide et le bloc serait VACANT.
-- Il n'a NI membership NI permission : son unique titre est ce lien (asserte en H1).
DO $$
DECLARE
  v_owner uuid := '16b00000-0000-4000-8000-000000000004';
  v_act_b uuid := '16b00000-0000-4000-8000-00000000000b';
  v_role  uuid;
  v_kind  uuid;
  v jsonb;
BEGIN
  SELECT id INTO v_role FROM ref_actor_role WHERE code = 'operator' LIMIT 1;
  SELECT id INTO v_kind FROM ref_code_contact_kind WHERE code = 'email' LIMIT 1;
  ASSERT v_kind IS NOT NULL, 'fixture H: ref_code_contact_kind[email] manquant — le pont user_actor_ids serait vacant';

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO auth.users (id, email) VALUES (v_owner, 'proprio16x@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role, display_name) VALUES (v_owner, 'tourism_agent', 'Proprio 16x')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
  INSERT INTO actor (id, display_name) VALUES (v_act_b, 'Exploitant temoin 16x');
  INSERT INTO actor_channel (actor_id, kind_id, value, is_primary)
    VALUES (v_act_b, v_kind, 'proprio16x@test.local', TRUE);
  -- Son lien PRIMAIRE sur la fiche : c'est TOUT son droit d'ecrire.
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility)
    VALUES (v_act_b, 'HOTRUN00000016V1', v_role, TRUE, 'public');
  PERFORM set_config('request.jwt.claims', NULL, true);
END$$;

DO $$
DECLARE v jsonb; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16b00000-0000-4000-8000-000000000004","email":"proprio16x@test.local"}', true);
  SET LOCAL ROLE authenticated;

  ASSERT COALESCE(api.is_object_owner('HOTRUN00000016V1'), FALSE),
    'H1a FAIL: le pont e-mail -> acteur -> lien primaire ne fonctionne pas — le bloc serait VACANT';
  ASSERT NOT COALESCE(api.user_can_write_canonical('HOTRUN00000016V1'), FALSE),
    'H1b FAIL: le temoin ne doit avoir AUCUN autre titre que son lien acteur';

  -- Il conserve son propre lien et rattache un second prestataire, non principal.
  v := api.save_object_relations('HOTRUN00000016V1', jsonb_build_object(
        'actors', jsonb_build_array(
          jsonb_build_object('actor_id','16b00000-0000-4000-8000-00000000000b',
                             'role_code','operator','is_primary',true,'visibility','public'),
          jsonb_build_object('actor_id','16b00000-0000-4000-8000-00000000000a',
                             'role_code','operator','is_primary',false,'visibility','public'))));
  ASSERT v->>'success' = 'true',
    format('H2 FAIL: un proprietaire par lien acteur doit pouvoir enregistrer ses prestataires, recu %s', v);

  RESET ROLE;
  ASSERT EXISTS (SELECT 1 FROM actor_object_role
                  WHERE object_id = 'HOTRUN00000016V1'
                    AND actor_id = '16b00000-0000-4000-8000-00000000000b' AND is_primary),
    'H3 FAIL: le lien qui PORTE son droit doit avoir survecu a l enregistrement';
  SELECT count(*) INTO v_n FROM actor_object_role WHERE object_id = 'HOTRUN00000016V1';
  ASSERT v_n = 2, format('H4 FAIL: les 2 liens acteur doivent exister, trouve %s', v_n);
END$$;
RESET ROLE;

-- ---------------------------------------------------------------------
-- I. Le report de note §208/T13b survit au reconcile
-- ---------------------------------------------------------------------
-- La garde dediee est tests/test_actor_link_note_carryover.sql (16u-test2) et elle reste la
-- reference. On re-asserte ici le seul point que le RECONCILE aurait pu casser en silence : une
-- ligne CONSERVEE ne doit pas perdre sa note quand l'appelant ne peut pas la lire. Sans DELETE,
-- « reporter » se reduit a NE PAS ECRIRE la colonne — encore faut-il que le DO UPDATE ne l'ecrase
-- pas avec le NULL du payload.
DO $$
DECLARE v jsonb; v_note text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE actor_object_role SET note = 'NOTE 16x A PRESERVER'
   WHERE object_id = 'HOTRUN00000016V1' AND actor_id = '16b00000-0000-4000-8000-00000000000b';
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- Persona service_role : ECRIT (bras auth.role() de is_object_owner) et LIT les lignes, mais
  -- ECHOUE api.can_read_actor_contacts (elle court-circuite sur auth.uid() IS NULL). C'est
  -- exactement l'appelant que T13b protege.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE authenticated;
  ASSERT NOT COALESCE(api.can_read_actor_contacts('HOTRUN00000016V1'), FALSE),
    'I1 FAIL: le persona doit ECHOUER la garde des coordonnees — sinon le bloc ne teste rien';
  v := api.save_object_relations('HOTRUN00000016V1', jsonb_build_object(
        'actors', jsonb_build_array(
          jsonb_build_object('actor_id','16b00000-0000-4000-8000-00000000000b',
                             'role_code','operator','is_primary',true,'visibility','public',
                             'note', NULL))));
  ASSERT v->>'success' = 'true', format('I2 FAIL: enregistrement refuse, recu %s', v);
  RESET ROLE;
  SELECT note INTO v_note FROM actor_object_role
   WHERE object_id = 'HOTRUN00000016V1' AND actor_id = '16b00000-0000-4000-8000-00000000000b';
  ASSERT v_note = 'NOTE 16x A PRESERVER',
    format('I3 FAIL: la note a ete EFFACEE par le reconcile (regression §208/T13b), valeur = %s', COALESCE(v_note, '(null)'));
END$$;
RESET ROLE;

ROLLBACK;
\echo '== test_org_link_reconcile_editor.sql OK =='
