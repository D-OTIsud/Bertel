-- test_selection_emails.sql
-- Garde permanente de l'export d'e-mails (§211, manifest E2).
--
-- NON VACUITÉ : chaque bloc crée des témoins et exécute le VRAI RPC.
--
-- HARNAIS DE CONTEXTE — le point le plus délicat de ce test, et la raison pour
-- laquelle un harnais naïf ne prouve RIEN :
--
-- 1) api.current_user_can_edit_objects() est à TROIS valeurs (sa chaîne de OR
--    passe par auth.role(), NULL hors contexte HTTP). Un test qui se
--    contenterait de `SET ROLE` n'emprunterait JAMAIS le bras éditeur et
--    n'assertrait que du vide.
-- 2) Mais un contexte {"role":"service_role"} ne vaut pas mieux pour la
--    GARANTIE CENTRALE : is_platform_superuser() y est TRUE, donc le bras
--    `OR api.is_platform_superuser()` court-circuite le périmètre D4 et le test
--    ne prouve rien sur l'isolation entre organisations.
--
-- On monte donc un VRAI ÉDITEUR NON-SUPERUSER :
--    auth.users(id)                              → auth.uid()
--    aucune ligne app_user_profile               → is_platform_superuser() FALSE
--    user_org_membership(is_active) + user_org_admin_role('org_admin')
--                                                → current_user_admin_role_code()
--                                                  non nul ⇒ can_edit TRUE
--    request.jwt.claims {"role":"authenticated","sub":"<uuid>"}
-- et deux ORG, pour que l'isolation soit éprouvée sur une fiche PUBLIÉE d'une
-- ORG étrangère — le cas exact que `readable_object_ids` laissait passer.
--
-- Self-contained + transactionnel (ROLLBACK ; rien ne persiste).
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_user       uuid := gen_random_uuid();
  v_memb       uuid;
  v_role_admin uuid;
  v_role_pub   uuid;
BEGIN
  SELECT id INTO v_role_admin FROM ref_org_admin_role WHERE code = 'org_admin';
  SELECT id INTO v_role_pub   FROM ref_org_role       WHERE code = 'publisher';
  ASSERT v_role_admin IS NOT NULL, 'ref_org_admin_role[org_admin] introuvable';
  ASSERT v_role_pub   IS NOT NULL, 'ref_org_role[publisher] introuvable';

  -- Deux ORG : la mienne et l'étrangère.
  INSERT INTO object (id, object_type, name, status, published_at) VALUES
    ('ORGEML999999990A', 'ORG', 'ORG du testeur', 'published', now()),
    ('ORGEML999999990B', 'ORG', 'ORG etrangere',  'published', now());

  -- `id` est la SEULE colonne NOT NULL sans défaut de auth.users.
  INSERT INTO auth.users (id) VALUES (v_user);

  INSERT INTO user_org_membership (user_id, org_object_id, is_active)
  VALUES (v_user, 'ORGEML999999990A', true)
  RETURNING id INTO v_memb;

  INSERT INTO user_org_admin_role (membership_id, role_id, is_active)
  VALUES (v_memb, v_role_admin, true);

  -- Le sub du JWT doit être CE user : on le mémorise pour les blocs suivants.
  PERFORM set_config('test.user_id', v_user::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_user)::text, true);

  -- Le harnais lui-même est asserté : sans cela, tout le reste serait vacant.
  ASSERT api.is_platform_superuser() = FALSE,
    'le témoin doit être NON-superuser, sinon le périmètre D4 est court-circuité';
  ASSERT COALESCE(api.current_user_can_edit_objects(), FALSE) = TRUE,
    'le témoin doit être éditeur, sinon tous les appels seraient refusés';
END $$;

DO $$
DECLARE
  v_res        json;
  v_kind_email uuid;
  v_role_op    uuid;
  v_role_other uuid;
  v_role_pub   uuid;
  v_actor_a    uuid := gen_random_uuid();
  v_actor_exp  uuid := gen_random_uuid();
  v_actor_priv uuid := gen_random_uuid();
  v_actor_no   uuid := gen_random_uuid();
  v_actor_fut  uuid := gen_random_uuid();
  v_actor_role uuid := gen_random_uuid();
  v_emails     text[];
BEGIN
  SELECT id INTO v_kind_email FROM ref_code_contact_kind WHERE code = 'email';
  SELECT id INTO v_role_op    FROM ref_actor_role        WHERE code = 'operator';
  SELECT id INTO v_role_pub   FROM ref_org_role          WHERE code = 'publisher';
  -- N'importe quel rôle acteur AUTRE qu'operator : c'est la nature du rôle qu'on
  -- éprouve, pas un code particulier.
  SELECT id INTO v_role_other FROM ref_actor_role WHERE code <> 'operator' ORDER BY code LIMIT 1;
  ASSERT v_kind_email IS NOT NULL, 'ref_code_contact_kind[email] introuvable';
  ASSERT v_role_op    IS NOT NULL, 'ref_actor_role[operator] introuvable';
  ASSERT v_role_other IS NOT NULL, 'aucun rôle acteur non-operator dans le catalogue';

  -- ---------- Témoins ----------
  -- EML…01 acteur + e-mail propre → l'acteur gagne
  -- EML…02 e-mail propre seul     → repli
  -- EML…03 rien                   → missing
  -- EML…04 lien operator EXPIRÉ   → repli
  -- EML…05 lien visibility private→ repli
  -- EML…06 acteur refusant (consent FALSE) → repli
  -- EML…07 is_primary NULL vs TRUE→ le TRUE gagne
  -- EML…08 archived               → exclu (D9)
  -- EML…09 PUBLIÉE mais publisher = ORG ÉTRANGÈRE → hors périmètre (D4)
  -- EML…10 lien operator FUTUR    → repli
  -- EML…11 lien de rôle NON-operator → repli
  -- EML…12 hidden (naît hidden) → exclu (D9)
  INSERT INTO object (id, object_type, name, status, published_at) VALUES
    ('EMLSEL9999999901', 'HLO', 'Emails acteur gagne',  'published', now()),
    ('EMLSEL9999999902', 'HLO', 'Emails repli fiche',   'published', now()),
    ('EMLSEL9999999903', 'HLO', 'Emails muette',        'published', now()),
    ('EMLSEL9999999904', 'HLO', 'Emails lien expire',   'published', now()),
    ('EMLSEL9999999905', 'HLO', 'Emails lien prive',    'published', now()),
    ('EMLSEL9999999906', 'HLO', 'Emails refus consent', 'published', now()),
    ('EMLSEL9999999907', 'HLO', 'Emails primary null',  'published', now()),
    ('EMLSEL9999999908', 'HLO', 'Emails archivee',      'archived',  now()),
    ('EMLSEL9999999909', 'HLO', 'Emails org etrangere', 'published', now()),
    ('EMLSEL9999999910', 'HLO', 'Emails lien futur',    'published', now()),
    ('EMLSEL9999999911', 'HLO', 'Emails role non op',   'published', now()),
    ('EMLSEL9999999912', 'HLO', 'Emails masquee',       'hidden',    now());

  -- Publisher : 01→08 chez moi, 09 chez l'ORG étrangère.
  INSERT INTO object_org_link (object_id, org_object_id, role_id)
  SELECT o.id,
         CASE WHEN o.id = 'EMLSEL9999999909'
              THEN 'ORGEML999999990B' ELSE 'ORGEML999999990A' END,
         v_role_pub
  FROM object o WHERE o.id LIKE 'EMLSEL99999999%';

  INSERT INTO actor (id, display_name) VALUES
    (v_actor_a,    'Gerant A'),
    (v_actor_exp,  'Ancien gerant'),
    (v_actor_priv, 'Gerant prive'),
    (v_actor_no,   'Gerant refusant'),
    (v_actor_fut,  'Futur gerant'),
    (v_actor_role, 'Moniteur');

  INSERT INTO actor_channel (actor_id, kind_id, value, is_primary) VALUES
    (v_actor_a,    v_kind_email, 'gerant.a@example.test',    true),
    (v_actor_exp,  v_kind_email, 'ancien@example.test',      true),
    (v_actor_priv, v_kind_email, 'prive@example.test',       true),
    (v_actor_no,   v_kind_email, 'refusant@example.test',    true),
    (v_actor_fut,  v_kind_email, 'futur@example.test',       true),
    (v_actor_role, v_kind_email, 'moniteur@example.test',    true);

  INSERT INTO actor_object_role (actor_id, object_id, role_id, visibility, valid_from, valid_to) VALUES
    (v_actor_a,    'EMLSEL9999999901', v_role_op,    'partners', NULL, NULL),
    (v_actor_exp,  'EMLSEL9999999904', v_role_op,    'partners', NULL, CURRENT_DATE - 1),
    (v_actor_priv, 'EMLSEL9999999905', v_role_op,    'private',  NULL, NULL),
    (v_actor_no,   'EMLSEL9999999906', v_role_op,    'partners', NULL, NULL),
    (v_actor_fut,  'EMLSEL9999999910', v_role_op,    'partners', CURRENT_DATE + 1, NULL),
    (v_actor_role, 'EMLSEL9999999911', v_role_other, 'partners', NULL, NULL);

  INSERT INTO actor_consent (actor_id, channel, consent_given)
  VALUES (v_actor_no, 'email', false);

  INSERT INTO contact_channel (object_id, kind_id, value, is_primary) VALUES
    ('EMLSEL9999999901', v_kind_email, 'fiche01@example.test', true),
    ('EMLSEL9999999902', v_kind_email, 'fiche02@example.test', true),
    ('EMLSEL9999999904', v_kind_email, 'fiche04@example.test', true),
    ('EMLSEL9999999905', v_kind_email, 'fiche05@example.test', true),
    ('EMLSEL9999999906', v_kind_email, 'fiche06@example.test', true),
    ('EMLSEL9999999908', v_kind_email, 'fiche08@example.test', true),
    ('EMLSEL9999999909', v_kind_email, 'etrangere09@example.test', true),
    ('EMLSEL9999999910', v_kind_email, 'fiche10@example.test', true),
    ('EMLSEL9999999911', v_kind_email, 'fiche11@example.test', true),
    ('EMLSEL9999999912', v_kind_email, 'fiche12@example.test', true);

  -- 07 : le drapeau NULL ne doit PAS passer devant le TRUE (garde du NULLS LAST).
  INSERT INTO contact_channel (object_id, kind_id, value, is_primary, position) VALUES
    ('EMLSEL9999999907', v_kind_email, 'secondaire07@example.test', NULL, 0),
    ('EMLSEL9999999907', v_kind_email, 'principal07@example.test',  true, 1);

  -- ---------- A. Cascade ----------
  v_res := api.list_selection_emails(ARRAY[
    'EMLSEL9999999901','EMLSEL9999999902','EMLSEL9999999903','EMLSEL9999999904',
    'EMLSEL9999999905','EMLSEL9999999906','EMLSEL9999999907','EMLSEL9999999908',
    'EMLSEL9999999909','EMLSEL9999999910','EMLSEL9999999911']);

  SELECT array_agg(r->>'email' ORDER BY (r->>'ord')::int)
    INTO v_emails
  FROM json_array_elements(v_res->'rows') r;

  ASSERT v_emails = ARRAY[
      'gerant.a@example.test',      -- 01 : l'acteur gagne
      'fiche02@example.test',       -- 02 : repli
      'fiche04@example.test',       -- 04 : lien expiré ignoré
      'fiche05@example.test',       -- 05 : lien private ignoré
      'fiche06@example.test',       -- 06 : refus de consentement ⇒ repli
      'principal07@example.test',   -- 07 : is_primary TRUE devant NULL
      'fiche10@example.test',       -- 10 : lien pas encore valide ignoré
      'fiche11@example.test'],      -- 11 : rôle non-operator ignoré
    format('cascade inattendue : %s', v_emails);

  -- Aucune des adresses écartées ne doit avoir fui, quelle qu'en soit la raison.
  ASSERT NOT (v_emails && ARRAY[
      'ancien@example.test', 'prive@example.test', 'refusant@example.test',
      'futur@example.test',  'moniteur@example.test']),
    'une adresse d un lien expiré / privé / refusé / futur / non-operator a fui';

  -- LA garantie centrale : une fiche PUBLIÉE d'une ORG étrangère n'apporte
  -- AUCUNE adresse, alors même qu'elle est parfaitement lisible.
  ASSERT NOT (v_emails @> ARRAY['etrangere09@example.test']),
    'FUITE : l e-mail d une fiche publiée d une ORG étrangère est sorti (D4)';

  -- 03 est muette ; 08 (archivée) et 09 (ORG étrangère) sont hors éligibles.
  ASSERT (v_res->'missing')::jsonb @> '[{"object_id":"EMLSEL9999999903"}]'::jsonb,
    'la fiche sans e-mail doit figurer dans missing';
  ASSERT NOT ((v_res->'missing')::jsonb @> '[{"object_id":"EMLSEL9999999908"}]'::jsonb),
    'une fiche archivée ne doit PAS figurer dans missing — elle est exclue (D9)';
  ASSERT NOT ((v_res->'missing')::jsonb @> '[{"object_id":"EMLSEL9999999909"}]'::jsonb),
    'une fiche hors périmètre ne doit PAS figurer dans missing — elle est comptée dans excluded_count';
  ASSERT (v_res->>'requested_count')::int = 11,
    'requested_count doit compter les ids demandés';
  ASSERT (v_res->>'eligible_count')::int = 9,
    'eligible_count doit écarter l archivée ET l ORG étrangère';
  ASSERT (v_res->>'excluded_count')::int = 2,
    'excluded_count doit valoir requested - eligible, et être RENDU (jamais absorbé)';

  -- ---------- B. Ids dupliqués : une seule ligne, ordre STABLE ----------
  -- Deux exécutions successives doivent rendre la MÊME chose : c'est cela, un
  -- ordre déterministe. Une seule exécution ne prouve rien — un plan instable
  -- passerait une fois sur deux.
  v_res := api.list_selection_emails(ARRAY[
    'EMLSEL9999999902','EMLSEL9999999902','EMLSEL9999999901']);
  SELECT array_agg(r->>'email' ORDER BY (r->>'ord')::int) INTO v_emails
  FROM json_array_elements(v_res->'rows') r;
  ASSERT v_emails = ARRAY['fiche02@example.test','gerant.a@example.test'],
    format('les doublons doivent être réduits en conservant la PREMIÈRE ordinalité : %s', v_emails);

  v_res := api.list_selection_emails(ARRAY[
    'EMLSEL9999999902','EMLSEL9999999902','EMLSEL9999999901']);
  ASSERT (SELECT array_agg(r->>'email' ORDER BY (r->>'ord')::int)
          FROM json_array_elements(v_res->'rows') r) = v_emails,
    'deux exécutions identiques doivent rendre exactement le même ordre';

  -- ---------- C. Tableau vide = demande valide ----------
  v_res := api.list_selection_emails(ARRAY[]::text[]);
  ASSERT json_array_length(v_res->'rows') = 0, 'un tableau vide rend un résultat vide';
END $$;

-- ---------- D. Contrats d'erreur ----------
DO $$
DECLARE v_state text;
BEGIN
  BEGIN
    PERFORM api.list_selection_emails(NULL, NULL);
    ASSERT false, 'deux paramètres NULL doivent lever PT400';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    ASSERT v_state = 'PT400', format('attendu PT400, obtenu %s', v_state);
  END;

  BEGIN
    PERFORM api.list_selection_emails(
      ARRAY(SELECT 'X' || lpad(g::text, 15, '0') FROM generate_series(1, 2001) g));
    ASSERT false, '2001 ids doivent lever PT413';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    ASSERT v_state = 'PT413', format('attendu PT413, obtenu %s', v_state);
  END;

  BEGIN
    PERFORM api.list_selection_emails(ARRAY['EMLSEL9999999901'], gen_random_uuid());
    ASSERT false, 'fournir les DEUX paramètres doit lever PT400';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    ASSERT v_state = 'PT400', format('attendu PT400, obtenu %s', v_state);
  END;

  -- Liste inexistante, appelée par un NON-superuser : c'est ici que l'ordre
  -- « charger PUIS autoriser » se prouve. Dans l'ordre inverse,
  -- api.user_can_read_list rendrait FALSE (pas d'EXISTS) et on obtiendrait 42501.
  BEGIN
    PERFORM api.list_selection_emails(NULL, gen_random_uuid());
    ASSERT false, 'une liste inexistante doit lever PT404';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    ASSERT v_state = 'PT404',
      format('attendu PT404, obtenu %s — 42501 signale l ordre autoriser-puis-charger', v_state);
  END;
END $$;

-- ---------- G. Liste inexistante vue par un SUPERUSER ----------
-- L'autre moitié du piège : user_can_read_list rend TRUE pour un superuser sur
-- un id inexistant, donc l'ordre inverse laisserait passer une ligne NULL.
DO $$
DECLARE v_state text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    PERFORM api.list_selection_emails(NULL, gen_random_uuid());
    ASSERT false, 'un superuser aussi doit obtenir PT404, pas une ligne NULL en aval';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    ASSERT v_state = 'PT404', format('attendu PT404, obtenu %s', v_state);
  END;
  -- On rend la main au témoin non-superuser pour la suite.
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated',
                      'sub', current_setting('test.user_id'))::text, true);
END $$;

-- ---------- H. Entrée par LISTE ----------
DO $$
DECLARE
  v_list_static  uuid;
  v_list_dynamic uuid;
  v_res          json;
  v_n            int;
  v_role_pub     uuid;
BEGIN
  SELECT id INTO v_role_pub FROM ref_org_role WHERE code = 'publisher';

  -- H1. Liste STATIQUE contenant une fiche archivée : elle doit être exclue (D9).
  INSERT INTO object_list (org_object_id, created_by, kind, name)
  VALUES ('ORGEML999999990A', current_setting('test.user_id')::uuid, 'static', 'Liste statique test')
  RETURNING id INTO v_list_static;

  INSERT INTO object_list_item (list_id, object_id, position) VALUES
    (v_list_static, 'EMLSEL9999999902', 1),
    (v_list_static, 'EMLSEL9999999908', 2);   -- archivée

  v_res := api.list_selection_emails(NULL, v_list_static);
  ASSERT json_array_length(v_res->'rows') = 1,
    'une liste statique portant une fiche archivée ne doit rendre que la vivante (D9)';
  ASSERT (v_res->'rows')::jsonb @> '[{"email":"fiche02@example.test"}]'::jsonb,
    'la fiche vivante de la liste statique doit sortir';

  -- H2. Liste DYNAMIQUE de plus de 200 membres : 205 témoins dans une commune
  -- inventée. `city_any` est une clé « vive » : sans elle, le résolveur lirait le
  -- MV et ne verrait aucun témoin transactionnel (le test serait vacant).
  INSERT INTO object (id, object_type, name, status, published_at)
  SELECT 'EMLBIG' || lpad(g::text, 10, '0'), 'HLO', 'Gros lot ' || g, 'published', now()
  FROM generate_series(1, 205) g;

  INSERT INTO object_location (object_id, city, is_main_location)
  SELECT 'EMLBIG' || lpad(g::text, 10, '0'), 'Zzgroslot', true
  FROM generate_series(1, 205) g;

  INSERT INTO object_org_link (object_id, org_object_id, role_id)
  SELECT 'EMLBIG' || lpad(g::text, 10, '0'), 'ORGEML999999990A', v_role_pub
  FROM generate_series(1, 205) g;

  INSERT INTO contact_channel (object_id, kind_id, value, is_primary)
  SELECT 'EMLBIG' || lpad(g::text, 10, '0'),
         (SELECT id FROM ref_code_contact_kind WHERE code = 'email'),
         'gros' || g || '@example.test', true
  FROM generate_series(1, 205) g;

  INSERT INTO object_list (org_object_id, created_by, kind, name, filters)
  VALUES ('ORGEML999999990A', current_setting('test.user_id')::uuid, 'dynamic',
          'Liste dynamique test',
          '{"buckets":[{"filters":{"city_any":["Zzgroslot"]}}]}'::jsonb)
  RETURNING id INTO v_list_dynamic;

  v_res := api.list_selection_emails(NULL, v_list_dynamic);
  ASSERT json_array_length(v_res->'rows') = 205,
    format('l export doit dépasser le plafond de 200 des listes (obtenu %s)',
           json_array_length(v_res->'rows'));

  -- H3. NON-RÉGRESSION : le module Listes, lui, reste à 200 sur la MÊME liste.
  -- On interroge le VRAI RPC consommateur `api.get_list` — pas le helper interne
  -- list_effective_object_ids. Le helper pourrait rester plafonné alors qu'un
  -- futur get_list contournerait le plafond : c'est le comportement de la
  -- surface réelle qu'on garde, pas celui d'un rouage.
  SELECT json_array_length((api.get_list(v_list_dynamic))->'items') INTO v_n;
  ASSERT v_n = 200,
    format('api.get_list doit rester plafonné à 200 sur une liste dynamique (obtenu %s)', v_n);

  -- H4. Liste statique portant une fiche `hidden` : exclue comme `archived` (D9).
  -- Le témoin NAÎT `hidden` (INSERT direct, plus haut) au lieu d'être basculé par
  -- UPDATE : `trg_guard_object_status_change` est BEFORE UPDATE OF status et
  -- refuse toute bascule de statut à un appelant sans la permission
  -- `publish_object` (notre témoin n'est qu'org_admin) — un UPDATE ici lèverait
  -- 42501 « Object status changes require the publish_object permission ».
  INSERT INTO object_list_item (list_id, object_id, position)
  VALUES (v_list_static, 'EMLSEL9999999912', 3);

  v_res := api.list_selection_emails(NULL, v_list_static);
  ASSERT json_array_length(v_res->'rows') = 1,
    'une fiche `hidden` doit être exclue au même titre qu une archivée (D9)';
END $$;

-- ---------- I. Contexte LECTEUR : refus, pas ensemble vide ----------
DO $$
DECLARE v_state text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000ff"}', true);
  ASSERT COALESCE(api.current_user_can_edit_objects(), FALSE) = FALSE,
    'le contexte lecteur du harnais doit donner can_edit=FALSE, sinon I ne prouve rien';
  BEGIN
    PERFORM api.list_selection_emails(ARRAY['EMLSEL9999999901']);
    ASSERT false, 'un lecteur doit être refusé, pas servi avec un ensemble vide';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    ASSERT v_state = '42501', format('attendu 42501, obtenu %s', v_state);
  END;
END $$;

-- ---------- F. Privilèges ----------
DO $$
DECLARE v_ok boolean;
BEGIN
  SELECT has_function_privilege('anon',
    'api.list_selection_emails(text[], uuid)', 'EXECUTE') INTO v_ok;
  ASSERT v_ok = FALSE, 'anon ne doit PAS pouvoir exécuter list_selection_emails';

  SELECT has_function_privilege('authenticated',
    'api.list_selection_emails(text[], uuid)', 'EXECUTE') INTO v_ok;
  ASSERT v_ok = TRUE, 'authenticated doit pouvoir exécuter list_selection_emails';
END $$;

ROLLBACK;
