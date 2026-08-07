-- =====================================================================
-- test_actor_contacts_org_gate.sql — garde 16u (§208), personas réelles
-- =====================================================================
-- Ce que ce fichier protège, en une phrase : les coordonnées ET l'identité
-- civile d'une PERSONNE PHYSIQUE rattachée à une fiche ne sortent que vers un
-- membre de l'ORG éditrice (ou un superuser plateforme), par une voie
-- JOURNALISÉE — et jamais vers `anon`, vers un authentifié étranger, ni vers
-- une clé `service_role` (une clé de service n'est pas une personne).
--
-- Dépendances d'exécution : le manifeste complet, PUIS
-- `migration_actor_contacts_org_gate.sql` (créneau 16u — le « 16t » du plan
-- §208 est périmé, pris par §209). Le bloc S0 le dit en clair plutôt que de
-- laisser un 42883 illisible tomber au milieu du fichier.
--
-- HARNAIS — pourquoi `request.jwt.claims` ET `SET LOCAL ROLE`, jamais l'un sans
-- l'autre :
--   · `SET ROLE` SEUL ne peut pas éprouver ces chemins. Hors contexte HTTP,
--     `auth.uid()`/`auth.role()` rendent NULL : chaque persona s'effondre sur la
--     même branche fail-closed, toutes les assertions deviennent vraies sur des
--     ensembles vides, et le fichier est parfaitement VACANT (vert pour rien).
--   · `set_config('request.jwt.claims', …)` SEUL ne suffit pas non plus : le
--     rôle de connexion du harnais est superuser/BYPASSRLS, donc la RLS ne
--     s'appliquerait pas et les EXECUTE ne seraient pas contrôlés (or plusieurs
--     assertions portent précisément sur des GRANT retirés à `anon`/`service_role`).
--   · La garde court-circuite sur `auth.uid() IS NULL` : un persona
--     `authenticated` SANS claim `sub` serait refusé pour la MAUVAISE raison.
--     Les deux personas humains portent donc un `sub` réel.
--
-- TÉMOINS — ils respectent la logique métier de leur type :
--   · OBJ1 = HOT publié, rattaché à ORG1 par un lien `publisher` ⇒ périmètre CRM
--     (donc la garde) pour un membre d'ORG1.
--   · OBJ2 = HOT publié, rattaché à ORG1 par un lien `reader` ⇒ périmètre ÉTENDU
--     pour le même membre, mais PAS le périmètre CRM. C'est ce témoin qui rend
--     l'assertion d'équivalence M2 non vacante (cf. son en-tête).
--   · Le lien acteur naît en `partners` : la visibilité du LIEN est la seule
--     garde de ligne, et `partners` est le cas qui distingue réellement les
--     personas. Les blocs qui ont besoin d'un lien `public` le basculent
--     explicitement et le REMETTENT.
-- On interroge toujours la fiche par `api.get_object_resource` (lecture vive) :
--   un chemin `published`-only passerait par `internal.mv_filtered_objects`, qui
--   ne contient PAS les témoins insérés dans la transaction de ce test.
--
-- Auto-portant + transactionnel : ROLLBACK final, rien ne persiste.
\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------
-- S0. Le test peut-il seulement échouer ? (anti-vacuité du harnais lui-même)
-- ---------------------------------------------------------------------
-- Tout ce fichier s'appuie sur ASSERT. Si `plpgsql.check_asserts` est à `off`,
-- chaque ASSERT devient un no-op et le fichier rend « OK » sans rien vérifier.
-- On refuse de tourner dans cette configuration.
DO $$
BEGIN
  IF lower(coalesce(current_setting('plpgsql.check_asserts', true), 'on')) = 'off' THEN
    RAISE EXCEPTION 'harnais VACANT: plpgsql.check_asserts = off — tous les ASSERT de ce fichier seraient ignores';
  END IF;
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'api' AND p.proname = 'can_read_actor_contacts'),
    'api.can_read_actor_contacts absente — appliquer migration_actor_contacts_org_gate.sql (16u) AVANT ce test';
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'api' AND p.proname = 'export_actor_contacts'),
    'api.export_actor_contacts absente — appliquer migration_actor_contacts_org_gate.sql (16u) AVANT ce test';
  ASSERT to_regclass('public.actor_contact_export_log') IS NOT NULL,
    'public.actor_contact_export_log absente — appliquer migration_actor_contacts_org_gate.sql (16u) AVANT ce test';
END$$;

-- ---------------------------------------------------------------------
-- S1. `pg_temp` EN DERNIER sur toute la chaîne d'autorisation (R2.1)
-- ---------------------------------------------------------------------
-- Assertion STRUCTURELLE, complément permanent du sabotage comportemental J.
-- Sans `pg_temp` explicitement en dernier, PostgreSQL cherche le schéma
-- temporaire EN PREMIER pour les RELATIONS : n'importe quel `authenticated`
-- masque alors la table qui décide de l'autorisation. Les 3 surfaces neuves ET
-- les 3 feuilles qu'elles consultent doivent porter la forme durcie ; une seule
-- feuille laissée en forme faible rouvre le trou par en dessous.
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(n.nspname || '.' || p.proname || ' → ' ||
                    COALESCE(array_to_string(p.proconfig, ' | '), '(aucun search_path)'), ', ' ORDER BY p.proname)
    INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'api'
     AND p.proname IN ('can_read_actor_contacts', 'export_actor_capabilities', 'export_actor_contacts',
                       'current_user_crm_object_ids', 'current_user_extended_object_ids',
                       'current_user_readable_object_ids')
     AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c
                      WHERE c LIKE 'search_path=%' AND rtrim(c) LIKE '%pg\_temp');
  ASSERT v_bad IS NULL,
    format('§208/R2.1: search_path sans pg_temp EN DERNIER sur la chaine d autorisation: %s', v_bad);

  -- Les trois surfaces neuves sont DEFINER et n'ont pas d'EXECUTE implicite PUBLIC.
  ASSERT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'api' AND p.prosecdef
             AND p.proname IN ('can_read_actor_contacts','export_actor_capabilities','export_actor_contacts')) = 3,
    '§208: les 3 surfaces neuves doivent etre SECURITY DEFINER';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     CROSS JOIN LATERAL aclexplode(p.proacl) a
     WHERE n.nspname = 'api'
       AND p.proname IN ('can_read_actor_contacts','export_actor_capabilities','export_actor_contacts')
       AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) = 'anon')),
    '§208: PUBLIC ou anon a EXECUTE sur une surface PII — REVOKE ALL … FROM PUBLIC, anon manquant';
  -- proacl NULL = EXECUTE implicite a PUBLIC : le REVOKE n a jamais ete ecrit.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'api' AND p.proacl IS NULL
       AND p.proname IN ('can_read_actor_contacts','export_actor_capabilities','export_actor_contacts')),
    '§208: proacl NULL sur une surface PII = EXECUTE implicite a PUBLIC';
  -- Un export de PII est imputable a une PERSONNE : service_role ne doit pas pouvoir exporter.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     CROSS JOIN LATERAL aclexplode(p.proacl) a
     WHERE n.nspname = 'api' AND p.proname IN ('export_actor_contacts','export_actor_capabilities')
       AND pg_get_userbyid(a.grantee) = 'service_role'),
    '§208: service_role a EXECUTE sur l export/le preflight — un export de PII est imputable a une personne';

  -- Journal : aucune FK (il survit a rpc_delete_object et a l effacement RGPD),
  -- et aucun role client ne peut y ecrire (l immuabilite est un PRIVILEGE, pas un mot).
  ASSERT (SELECT count(*) FROM pg_constraint
           WHERE conrelid = 'public.actor_contact_export_log'::regclass AND contype = 'f') = 0,
    '§208: le journal porte une FK — il ne survivrait pas a la suppression de son sujet';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     CROSS JOIN LATERAL aclexplode(c.relacl) a
     WHERE n.nspname = 'public' AND c.relname = 'actor_contact_export_log'
       AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon','authenticated','service_role'))
       AND a.privilege_type <> 'SELECT'),
    '§208: le journal est encore inscriptible par un role client — le REVOKE n a pas pris';
  RAISE NOTICE '16u S1: chaine d autorisation durcie (pg_temp en dernier), ACL des 3 surfaces, journal ferme.';
END$$;

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_org        text := 'ORGRUN00000016U1';
  v_obj1       text := 'HOTRUN00000016U1';   -- ORG1 est PUBLISHER  ⇒ perimetre CRM
  v_obj2       text := 'HOTRUN00000016U2';   -- ORG1 est READER     ⇒ perimetre ETENDU seulement
  v_u1         uuid := '16000000-0000-4000-8000-000000000001';  -- membre d ORG1
  v_u2         uuid := '16000000-0000-4000-8000-000000000002';  -- authentifie sans membership
  v_u3         uuid := '16000000-0000-4000-8000-000000000003';  -- superuser plateforme, SANS membership
  v_actor      uuid := '16000000-0000-4000-8000-00000000000a';
  v_role_op    uuid;
  v_role_pub   uuid;
  v_role_read  uuid;
BEGIN
  SELECT id INTO v_role_op   FROM ref_actor_role WHERE code = 'operator'  LIMIT 1;
  SELECT id INTO v_role_pub  FROM ref_org_role   WHERE code = 'publisher' LIMIT 1;
  SELECT id INTO v_role_read FROM ref_org_role   WHERE code = 'reader'    LIMIT 1;
  ASSERT v_role_op   IS NOT NULL, 'fixture: ref_actor_role[operator] manquant (seeds non appliques)';
  ASSERT v_role_pub  IS NOT NULL, 'fixture: ref_org_role[publisher] manquant (seeds non appliques)';
  ASSERT v_role_read IS NOT NULL, 'fixture: ref_org_role[reader] manquant (seeds non appliques)';

  -- Claims service_role pendant la pose des fixtures : `api.enforce_app_user_profile_role_change`
  -- n autorise le role `owner` qu a un demandeur owner/service_role.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org,  'ORG', 'ORG temoin 16u',   'published'),
    (v_obj1, 'HOT', 'Hotel temoin 16u', 'published'),
    (v_obj2, 'HOT', 'Hotel voisin 16u', 'published');
  INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary) VALUES
    (v_obj1, v_org, v_role_pub,  TRUE),
    (v_obj2, v_org, v_role_read, TRUE);

  INSERT INTO auth.users (id, email) VALUES
    (v_u1, 'membre16u@test.local'),
    (v_u2, 'etranger16u@test.local'),
    (v_u3, 'super16u@test.local')
  ON CONFLICT (id) DO NOTHING;
  -- Le trigger `on_auth_user_created_app_user_profile` a deja cree les 3 profils.
  INSERT INTO app_user_profile (id, role, display_name) VALUES
    (v_u1, 'tourism_agent', 'Membre 16u'),
    (v_u2, 'tourism_agent', 'Etranger 16u'),
    (v_u3, 'owner',         'Superuser 16u')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
  -- SEUL u1 est membre. u3 est superuser SANS membership : c est ce qui fait que son
  -- acces passe par le bras `app_user_profile.role`, pas par le perimetre CRM.
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_u1, v_org, TRUE);

  INSERT INTO actor (id, display_name, first_name, last_name, gender)
    VALUES (v_actor, 'Jean Temoin', 'Jean', 'Temoin', 'M.');
  -- Lien `partners` : ni anon ni un authentifie etranger ne doit voir la LIGNE.
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, note) VALUES
    (v_actor, v_obj1, v_role_op, TRUE, 'partners', 'NOTE CRM SENSIBLE 16u'),
    (v_actor, v_obj2, v_role_op, TRUE, 'partners', 'NOTE CRM SENSIBLE 16u');
  -- Deux coordonnees a valeur SENTINELLE : leur chaine exacte ne doit apparaitre
  -- NULLE PART dans le journal (bloc E) ni dans un payload non autorise.
  INSERT INTO actor_channel (actor_id, kind_id, value, is_primary)
  SELECT v_actor, k.id, v.value, v.is_primary
    FROM (VALUES ('email',  'jean.sentinelle16u@exemple-16u.test', TRUE),
                 ('mobile', '0692SENTINELLE16U',                   FALSE)) AS v(kind, value, is_primary)
    JOIN ref_code_contact_kind k ON k.code = v.kind;

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE '16u fixtures: 1 ORG, 2 fiches (publisher/reader), 3 users, 1 acteur, 2 canaux.';
END$$;

-- ---------------------------------------------------------------------
-- A. MEMBRE de l'ORG publisher : garde TRUE, leg `actors` complet, export + journal
-- ---------------------------------------------------------------------
DO $$
DECLARE v jsonb; e jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16000000-0000-4000-8000-000000000001"}', true);
  SET LOCAL ROLE authenticated;

  ASSERT COALESCE(api.can_read_actor_contacts('HOTRUN00000016U1'), FALSE),
    'A1 FAIL: le membre d une ORG publisher doit passer la garde';

  SELECT (api.get_object_resource('HOTRUN00000016U1', ARRAY['fr'], 'none',
          '{"render":false,"fields":["actors"]}'::jsonb)::jsonb)->'actors'->0 INTO v;
  ASSERT v IS NOT NULL, 'A2a FAIL: le membre ne voit meme pas la ligne acteur (lien partners + perimetre etendu)';
  ASSERT v->>'contacts_restricted' = 'false',
    format('A2b FAIL: contacts_restricted doit etre false pour un membre, recu %s', v);
  ASSERT jsonb_array_length(v->'contacts') = 2,
    format('A2c FAIL: le membre doit recevoir les 2 canaux, recu %s', v->'contacts');
  ASSERT v->>'first_name' = 'Jean' AND v->>'last_name' = 'Temoin' AND v->>'gender' IS NOT NULL,
    format('A2d FAIL: la PII doit etre servie au membre, recu %s', v);
  ASSERT v->>'note' = 'NOTE CRM SENSIBLE 16u',
    format('A2e FAIL: la note du lien doit etre servie au membre, recu %s', v->>'note');
  -- Non-vacuite de la sentinelle : la VALEUR est bien la pour un appelant autorise.
  -- Sans cette ligne, l assertion E2 (« aucune valeur au journal ») pourrait passer
  -- simplement parce que la valeur n existe nulle part.
  ASSERT v::text LIKE '%jean.sentinelle16u@exemple-16u.test%',
    'A2f FAIL: la valeur de coordonnee n est pas servie au membre — les assertions de non-fuite seraient vacantes';

  e := api.export_actor_contacts(ARRAY['HOTRUN00000016U1'], 'Test CI 16u', 'xlsx');
  ASSERT (e->>'actor_count')::int = 1 AND jsonb_array_length(e->'rows') = 1,
    format('A3a FAIL: export membre vide ou surcompte, recu %s', e);
  ASSERT e::text LIKE '%0692SENTINELLE16U%',
    'A3b FAIL: l export n emet pas les coordonnees a un appelant autorise (il ne teste alors rien)';

  RESET ROLE;
  RAISE NOTICE '16u A: membre publisher = garde, PII, canaux, note, export non vide.';
END$$;

-- ---------------------------------------------------------------------
-- B. AUTHENTIFIÉ SANS membership : ni la ligne, ni la garde, ni l'export
-- ---------------------------------------------------------------------
DO $$
DECLARE r jsonb; ok boolean := FALSE;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16000000-0000-4000-8000-000000000002"}', true);
  SET LOCAL ROLE authenticated;

  ASSERT COALESCE(api.can_read_actor_contacts('HOTRUN00000016U1'), FALSE) IS FALSE,
    'B1 FAIL: un authentifie sans membership ne doit pas passer la garde';

  r := api.get_object_resource('HOTRUN00000016U1', ARRAY['fr'], 'none',
        '{"render":false,"fields":["actors"]}'::jsonb)::jsonb;
  ASSERT jsonb_array_length(COALESCE(r->'actors', '[]'::jsonb)) = 0,
    format('B2 FAIL: un etranger voit une ligne acteur a lien partners, recu %s', r->'actors');

  BEGIN
    PERFORM api.export_actor_contacts(ARRAY['HOTRUN00000016U1'], 'tentative etrangere', 'xlsx');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE;
  END;
  ASSERT ok, 'B3 FAIL: l export d un non-membre devait lever FORBIDDEN (42501)';

  RESET ROLE;
  RAISE NOTICE '16u B: authentifie etranger = 0 ligne, garde fermee, export FORBIDDEN.';
END$$;

-- ---------------------------------------------------------------------
-- C. ANON : aucune ligne acteur, NI dans le leg structuré NI dans render.actor_lines
-- ---------------------------------------------------------------------
-- `render.actor_lines` est une projection en TEXTE des mêmes faits : avant §208
-- elle n'avait AUCUNE garde et livrait à `anon` les noms de personnes physiques
-- rattachées par un lien `private`/`partners`. Deux surfaces qui rendent le même
-- fait portent la même garde — d'où les deux assertions.
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;

  r := api.get_object_resource('HOTRUN00000016U1', ARRAY['fr'], 'none', '{}'::jsonb)::jsonb;
  ASSERT r IS NOT NULL, 'C0 FAIL: anon ne lit meme pas la fiche PUBLIEE — le test serait vacant';
  ASSERT jsonb_array_length(COALESCE(r->'actors', '[]'::jsonb)) = 0,
    format('C1 FAIL: anon voit une ligne acteur a lien partners, recu %s', r->'actors');
  ASSERT jsonb_array_length(COALESCE(r->'render'->'actor_lines', '[]'::jsonb)) = 0,
    format('C2 FAIL: render.actor_lines fuit encore des noms de personnes a anon (classe §49), recu %s',
           r->'render'->'actor_lines');
  ASSERT r::text NOT LIKE '%Jean Temoin%' AND r::text NOT LIKE '%SENTINELLE16U%',
    'C3 FAIL: une identite ou une coordonnee d acteur apparait quelque part dans le payload anon';

  RESET ROLE;
  RAISE NOTICE '16u C: anon = 0 ligne structuree, 0 actor_line, aucune trace d identite.';
END$$;

-- ---------------------------------------------------------------------
-- D. Lien PUBLIC : la ligne sort, la PII et les CANAUX restent fermés
-- ---------------------------------------------------------------------
-- LA non-régression du contrat partenaire, et le cœur du gate de CHAMP.
-- `service_role` est le chemin des routes partenaires : il obtient la ligne et le
-- nom d'affichage (le lien est public), mais JAMAIS prénom/nom/genre/note ni les
-- canaux — `api.can_read_actor_contacts` répond FALSE à une clé de service
-- (`auth.uid()` NULL), délibérément, parce qu'un accès à de la PII est imputable
-- à une personne. `anon` est éprouvé dans le même état pour la même raison.
-- On bascule le lien d'OBJ1 en `public` le temps de ce bloc, puis on le REMET.
UPDATE actor_object_role SET visibility = 'public'
 WHERE actor_id = '16000000-0000-4000-8000-00000000000a' AND object_id = 'HOTRUN00000016U1';
DO $$
DECLARE v jsonb; r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;

  r := api.get_object_resource('HOTRUN00000016U1', ARRAY['fr'], 'none', '{}'::jsonb)::jsonb;
  v := r->'actors'->0;
  ASSERT v IS NOT NULL,
    'D1 FAIL: service_role doit voir la ligne acteur d un lien PUBLIC (sinon D2 est vacante)';
  ASSERT v->>'display_name' = 'Jean Temoin',
    format('D1b FAIL: le nom d affichage d un lien public doit sortir, recu %s', v);
  ASSERT v->>'contacts_restricted' = 'true'
     AND jsonb_array_length(v->'contacts') = 0
     AND v->>'first_name' IS NULL AND v->>'last_name' IS NULL
     AND v->>'gender' IS NULL AND v->>'note' IS NULL,
    format('D2 FAIL: service_role = ligne SANS PII ni canaux (une cle de service n est pas une personne), recu %s', v);
  ASSERT r::text NOT LIKE '%SENTINELLE16U%',
    'D2b FAIL: une valeur de coordonnee apparait dans le payload service_role (render compris)';
  -- Le nom PUBLIC, lui, doit bien sortir en render : la garde de ligne ne doit pas
  -- devenir plus stricte que la visibilite du lien (sur-fermeture = regression aussi).
  ASSERT jsonb_array_length(COALESCE(r->'render'->'actor_lines', '[]'::jsonb)) = 1,
    format('D3 FAIL: render.actor_lines doit rendre le lien PUBLIC, recu %s', r->'render'->'actor_lines');
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  r := api.get_object_resource('HOTRUN00000016U1', ARRAY['fr'], 'none', '{}'::jsonb)::jsonb;
  v := r->'actors'->0;
  ASSERT v IS NOT NULL, 'D4 FAIL: anon doit voir la ligne d un lien PUBLIC';
  ASSERT v->>'contacts_restricted' = 'true'
     AND jsonb_array_length(v->'contacts') = 0
     AND v->>'first_name' IS NULL AND v->>'note' IS NULL,
    format('D5 FAIL: anon = ligne SANS PII ni canaux sur un lien public, recu %s', v);
  ASSERT r::text NOT LIKE '%SENTINELLE16U%',
    'D5b FAIL: une valeur de coordonnee apparait dans le payload anon d un lien public';
  RESET ROLE;
  RAISE NOTICE '16u D: lien public = ligne + nom d affichage, PII et canaux fermes (service_role ET anon).';
END$$;

-- ---------------------------------------------------------------------
-- I3 / M5. Le préflight OFFRE exactement ce que la fiche MONTRE
-- ---------------------------------------------------------------------
-- M5 (dette nommée dans `migration_actor_contacts_org_gate.sql`) : la clé
-- `actor_identity_available` est une RETRANSCRIPTION À LA MAIN du prédicat de
-- LIGNE du leg `actors` (`v_can_read_extended OR aor.visibility = 'public'`),
-- qui n'a aucune source appelable. Rien ne lève si les deux divergent : l'offre
-- de colonnes devient simplement fausse. On les épingle donc l'une à l'autre.
-- PÉRIMÈTRE de l'assertion : on ne compare que sur des fiches qui PORTENT au
-- moins un lien acteur (sinon « capacité » et « présence de données » divergent
-- légitimement), et seulement là où la garde des coordonnées est FALSE (quand
-- elle est TRUE, l'identité est vraie *a fortiori*, par un bras explicite).
-- Ici le lien d'OBJ1 est encore PUBLIC (bloc D) : c'est le cas « offert ».
DO $$
DECLARE c jsonb; n int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16000000-0000-4000-8000-000000000002"}', true);
  SET LOCAL ROLE authenticated;

  c := api.export_actor_capabilities(ARRAY['HOTRUN00000016U1']);
  ASSERT c->>'actor_identity_available' = 'true' AND c->>'actor_contacts_available' = 'false',
    format('I3 FAIL: lien public = identite oui, coordonnees non, recu %s', c);

  SELECT jsonb_array_length(COALESCE((api.get_object_resource('HOTRUN00000016U1', ARRAY['fr'], 'none',
          '{"render":false,"fields":["actors"]}'::jsonb)::jsonb)->'actors', '[]'::jsonb)) INTO n;
  ASSERT COALESCE(api.can_read_actor_contacts('HOTRUN00000016U1'), FALSE) IS FALSE,
    'M5 harnais: ce persona doit echouer la garde, sinon la comparaison ci-dessous est hors perimetre';
  ASSERT (c->>'actor_identity_available')::boolean = (n > 0),
    format('M5 FAIL (lien public): le preflight offre %s alors que la fiche montre %s ligne(s) — la transcription du predicat de ligne a derive',
           c->>'actor_identity_available', n);
  RESET ROLE;
  RAISE NOTICE '16u M5 (lien public): offre = %, lignes montrees = % — accordees.', c->>'actor_identity_available', n;
END$$;

-- On REMET le lien en `partners` : tous les blocs suivants repartent de l'état de la fixture.
UPDATE actor_object_role SET visibility = 'partners'
 WHERE actor_id = '16000000-0000-4000-8000-00000000000a' AND object_id = 'HOTRUN00000016U1';

-- ---------------------------------------------------------------------
-- I1 / I2 / M5-bis. Préflight sur le lien `partners`
-- ---------------------------------------------------------------------
DO $$
DECLARE c jsonb; n int;
BEGIN
  -- I1 : membre publisher ⇒ les DEUX capacités vraies.
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16000000-0000-4000-8000-000000000001"}', true);
  SET LOCAL ROLE authenticated;
  c := api.export_actor_capabilities(ARRAY['HOTRUN00000016U1']);
  ASSERT c->>'actor_identity_available' = 'true' AND c->>'actor_contacts_available' = 'true',
    format('I1 FAIL: membre publisher = identite ET coordonnees disponibles, recu %s', c);

  -- M5-bis, le cas qui compte : sur OBJ2, ce membre est ÉTENDU mais PAS publisher.
  -- Le préflight doit offrir l'identité (bras `extended`) et REFUSER les coordonnées,
  -- exactement comme la fiche : elle montre la ligne, pas la PII.
  c := api.export_actor_capabilities(ARRAY['HOTRUN00000016U2']);
  SELECT jsonb_array_length(COALESCE((api.get_object_resource('HOTRUN00000016U2', ARRAY['fr'], 'none',
          '{"render":false,"fields":["actors"]}'::jsonb)::jsonb)->'actors', '[]'::jsonb)) INTO n;
  ASSERT COALESCE(api.can_read_actor_contacts('HOTRUN00000016U2'), FALSE) IS FALSE,
    'M5-bis harnais: un lien ORG `reader` ne doit pas ouvrir la garde des coordonnees';
  ASSERT c->>'actor_contacts_available' = 'false',
    format('M5-bis FAIL: le preflight offre les coordonnees hors ORG publisher, recu %s', c);
  ASSERT (c->>'actor_identity_available')::boolean = (n > 0),
    format('M5-bis FAIL (lien partners + perimetre etendu): offre %s vs %s ligne(s) montree(s)',
           c->>'actor_identity_available', n);
  ASSERT n = 1, 'M5-bis harnais: le membre etendu doit voir la LIGNE sur OBJ2, sinon la comparaison est vacante';
  RESET ROLE;

  -- I2 : authentifié sans membership sur un lien `partners` ⇒ les deux false,
  --      et la fiche ne montre rien non plus.
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16000000-0000-4000-8000-000000000002"}', true);
  SET LOCAL ROLE authenticated;
  c := api.export_actor_capabilities(ARRAY['HOTRUN00000016U1']);
  SELECT jsonb_array_length(COALESCE((api.get_object_resource('HOTRUN00000016U1', ARRAY['fr'], 'none',
          '{"render":false,"fields":["actors"]}'::jsonb)::jsonb)->'actors', '[]'::jsonb)) INTO n;
  ASSERT c->>'actor_identity_available' = 'false' AND c->>'actor_contacts_available' = 'false',
    format('I2 FAIL: lecteur sans acces acteur = aucune capacite offerte, recu %s', c);
  ASSERT (c->>'actor_identity_available')::boolean = (n > 0),
    format('M5-ter FAIL (lien partners, etranger): offre %s vs %s ligne(s) montree(s)',
           c->>'actor_identity_available', n);
  RESET ROLE;
  RAISE NOTICE '16u I/M5: preflight aligne sur ce que la fiche montre, sur les 3 combinaisons.';
END$$;

-- ---------------------------------------------------------------------
-- E. Le journal : une ligne pour l'export A, SANS aucune valeur de coordonnée
-- ---------------------------------------------------------------------
DO $$
DECLARE n int; l record;
BEGIN
  SELECT count(*) INTO n FROM actor_contact_export_log
   WHERE 'HOTRUN00000016U1' = ANY(object_ids) AND reason = 'Test CI 16u';
  ASSERT n = 1, format('E1 FAIL: attendu 1 ligne de journal pour l export A, trouve %s', n);

  SELECT * INTO l FROM actor_contact_export_log WHERE reason = 'Test CI 16u';
  ASSERT l.performed_by = '16000000-0000-4000-8000-000000000001',
    format('E2 FAIL: l export doit etre imputable a la PERSONNE appelante, recu %s', l.performed_by);
  ASSERT l.org_object_ids @> ARRAY['ORGRUN00000016U1'],
    format('E3 FAIL: org_object_ids doit porter l ORG publisher qui a autorise, recu %s', l.org_object_ids);
  ASSERT l.channel_kinds @> ARRAY['email'] AND l.channel_kinds @> ARRAY['mobile'],
    format('E4 FAIL: le journal doit consigner les TYPES de canaux emis, recu %s', l.channel_kinds);

  -- La ligne ENTIÈRE (pas seulement `report`) ne doit contenir aucune VALEUR de
  -- coordonnée : le journal dit qui/quand/combien/quels types, jamais quoi.
  SELECT count(*) INTO n FROM actor_contact_export_log t
   WHERE t::text LIKE '%jean.sentinelle16u@exemple-16u.test%'
      OR t::text LIKE '%0692SENTINELLE16U%';
  ASSERT n = 0, 'E5 FAIL: une VALEUR de coordonnee est entree au journal';
  RAISE NOTICE '16u E: 1 ligne, imputable, ORG attribuee, types de canaux, aucune valeur.';
END$$;

-- ---------------------------------------------------------------------
-- F. Gardes d'entrée du RPC, validées SERVEUR (la modale n'est pas une protection)
-- ---------------------------------------------------------------------
DO $$
DECLARE ok boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16000000-0000-4000-8000-000000000001"}', true);
  SET LOCAL ROLE authenticated;

  ok := FALSE;
  BEGIN PERFORM api.export_actor_contacts(ARRAY['HOTRUN00000016U1'], '  ', 'xlsx');
  EXCEPTION WHEN invalid_parameter_value THEN ok := TRUE; END;
  ASSERT ok, 'F1 FAIL: une finalite vide devait etre refusee SERVEUR';

  ok := FALSE;
  BEGIN PERFORM api.export_actor_contacts(ARRAY['HOTRUN00000016U1'], 'abc', 'xlsx');
  EXCEPTION WHEN invalid_parameter_value THEN ok := TRUE; END;
  ASSERT ok, 'F2 FAIL: une finalite de moins de 5 caracteres devait etre refusee SERVEUR';

  ok := FALSE;
  BEGIN PERFORM api.export_actor_contacts(ARRAY['HOTRUN00000016U1'], repeat('x', 501), 'xlsx');
  EXCEPTION WHEN invalid_parameter_value THEN ok := TRUE; END;
  ASSERT ok, 'F3 FAIL: une finalite de plus de 500 caracteres devait etre refusee';

  ok := FALSE;
  BEGIN PERFORM api.export_actor_contacts(ARRAY['HOTRUN00000016U1'], 'finalite valide', 'pdf');
  EXCEPTION WHEN invalid_parameter_value THEN ok := TRUE; END;
  ASSERT ok, 'F4 FAIL: un format hors liste blanche devait etre refuse';

  ok := FALSE;
  BEGIN PERFORM api.export_actor_contacts(ARRAY(SELECT 'X' || g::text FROM generate_series(1, 501) g),
                                          'finalite valide', 'xlsx');
  EXCEPTION WHEN invalid_parameter_value THEN ok := TRUE; END;
  ASSERT ok, 'F5 FAIL: 501 ids devait lever BATCH_TOO_LARGE';

  -- Le PRÉFLIGHT porte le MÊME plafond : c'est lui, et non l'ordre des bras du OR,
  -- qui borne le fan-out 2N d'une selection integralement refusee (classe §210).
  ok := FALSE;
  BEGIN PERFORM api.export_actor_capabilities(ARRAY(SELECT 'X' || g::text FROM generate_series(1, 501) g));
  EXCEPTION WHEN invalid_parameter_value THEN ok := TRUE; END;
  ASSERT ok, 'F6 FAIL: le preflight doit porter le meme plafond de 500 ids que l export';

  ok := FALSE;
  BEGIN PERFORM api.export_actor_contacts(ARRAY[]::text[], 'finalite valide', 'xlsx');
  EXCEPTION WHEN invalid_parameter_value THEN ok := TRUE; END;
  ASSERT ok, 'F7 FAIL: une selection vide devait etre refusee';

  RESET ROLE;
  RAISE NOTICE '16u F: finalite (vide/courte/longue), format, plafond export ET preflight, selection vide.';
END$$;

-- ---------------------------------------------------------------------
-- G. Multi-lots (R1) : run_id partagé, sélection MIXTE, attribution ORG
-- ---------------------------------------------------------------------
DO $$
DECLARE run_id uuid := gen_random_uuid(); r1 jsonb; r2 jsonb; n int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16000000-0000-4000-8000-000000000001"}', true);
  SET LOCAL ROLE authenticated;

  r1 := api.export_actor_contacts(ARRAY['HOTRUN00000016U1'], 'Test multi-lots 16u', 'xlsx', run_id, 1, 2);
  -- lot 2 : sélection MIXTE — une fiche autorisée + une hors périmètre.
  r2 := api.export_actor_contacts(ARRAY['HOTRUN00000016U1', 'ZZZRUN00000016U9'],
                                  'Test multi-lots 16u', 'xlsx', run_id, 2, 2);
  ASSERT (r1->>'export_run_id') = run_id::text AND (r2->>'export_run_id') = run_id::text,
    'G1 FAIL: les deux lots doivent partager export_run_id';
  ASSERT r2->'denied_object_ids' ? 'ZZZRUN00000016U9',
    format('G2 FAIL: la fiche hors perimetre doit etre NOMMEE dans denied_object_ids, recu %s', r2->'denied_object_ids');
  ASSERT r2->'authorized_object_ids' ? 'HOTRUN00000016U1',
    'G3 FAIL: la fiche autorisee doit etre servie malgre le refus voisin (selection mixte)';
  RESET ROLE;

  SELECT count(*) INTO n FROM actor_contact_export_log WHERE export_run_id = run_id;
  ASSERT n = 2, format('G4 FAIL: attendu 2 lignes de journal pour ce run, trouve %s', n);
  SELECT count(*) INTO n FROM actor_contact_export_log
   WHERE export_run_id = run_id AND 'ORGRUN00000016U1' = ANY(org_object_ids);
  ASSERT n = 2, format('G5 FAIL: org_object_ids doit porter l ORG publisher qui a autorise, trouve %s', n);
  RAISE NOTICE '16u G: run_id partage, refus nomme, autorise servi, 2 lignes attribuees.';
END$$;

-- ---------------------------------------------------------------------
-- M2. La garde ↔ la forme ENSEMBLISTE de l'export : la paire qui peut diverger
-- ---------------------------------------------------------------------
-- `api.can_read_actor_contacts` est la SOURCE AUTORITAIRE ; le bloc
-- `IF v_super … ELSE …` de `api.export_actor_contacts` en est la forme
-- ENSEMBLISTE (duplication délibérée §204 : un scalaire DEFINER par ligne sur
-- 500 ids est un coût réel). Ajouter un bras à l'une sans l'autre ne lève AUCUNE
-- erreur — la réponse est simplement fausse. C'est cette paire-là qu'il faut
-- asserter : comparer la garde au PRÉFLIGHT serait tautologique, puisque le
-- préflight APPELLE la garde.
--
-- PÉRIMÈTRE (§1 et §3 du fichier de migration le disent tous deux) : les deux
-- formes s'accordent SUR LES IDS QUI EXISTENT dans `object`. Le bras superuser de
-- l'export exige EN PLUS l'existence, que la garde ne porte pas — écart
-- DÉLIBÉRÉ et fail-closed, épinglé par M2-bis plus bas. Une assertion d'égalité
-- NON BORNÉE rougirait pour cette seule raison et pousserait à « réparer » la
-- garde en lui ajoutant un contrôle d'existence qu'elle ne doit pas porter.
--
-- NON-VACUITÉ : la matrice contient 4 couples TRUE/TRUE et 5 FALSE/FALSE. Le
-- témoin OBJ2 (lien ORG `reader`) est là exprès : le membre u1 y est ÉTENDU mais
-- pas publisher, donc ajouter le bras `extended` à la garde — le sabotage qui
-- avait échoué en tâche 12 faute d'un témoin non subsumé — fait diverger ce
-- couple et rougir cette assertion.
DO $$
DECLARE
  v_sub    text;
  v_obj    text;
  v_guard  boolean;
  v_export boolean;
BEGIN
  FOREACH v_sub IN ARRAY ARRAY['16000000-0000-4000-8000-000000000001',   -- membre publisher
                               '16000000-0000-4000-8000-000000000002',   -- etranger
                               '16000000-0000-4000-8000-000000000003']   -- superuser sans membership
  LOOP
    FOREACH v_obj IN ARRAY ARRAY['HOTRUN00000016U1','HOTRUN00000016U2','ORGRUN00000016U1']
    LOOP
      PERFORM set_config('request.jwt.claims',
        json_build_object('role','authenticated','sub',v_sub)::text, true);
      SET LOCAL ROLE authenticated;
      v_guard := COALESCE(api.can_read_actor_contacts(v_obj), FALSE);
      v_export := TRUE;
      BEGIN
        PERFORM api.export_actor_contacts(ARRAY[v_obj], 'Equivalence garde/export 16u', 'xlsx');
      EXCEPTION WHEN insufficient_privilege THEN v_export := FALSE;
      END;
      RESET ROLE;
      ASSERT v_guard = v_export,
        format('M2 FAIL: la garde et la forme ensembliste de l export divergent (user=%s obj=%s garde=%s export=%s)',
               v_sub, v_obj, v_guard, v_export);
    END LOOP;
  END LOOP;

  -- Non-vacuité de la matrice : elle DOIT contenir des vrais ET des faux.
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16000000-0000-4000-8000-000000000001"}', true);
  SET LOCAL ROLE authenticated;
  ASSERT COALESCE(api.can_read_actor_contacts('HOTRUN00000016U1'), FALSE) IS TRUE
     AND COALESCE(api.can_read_actor_contacts('HOTRUN00000016U2'), FALSE) IS FALSE,
    'M2 harnais VACANT: la matrice doit contenir au moins un TRUE et un FALSE pour un meme persona';
  RESET ROLE;
  RAISE NOTICE '16u M2: 9 couples persona x fiche EXISTANTE — garde et forme ensembliste accordees.';
END$$;

-- M2-bis. L'écart DÉLIBÉRÉ, épinglé pour qu'on ne le « corrige » pas.
-- Sur un id qui n'existe PAS, un superuser passe la garde (elle répond « cette
-- règle autorise-t-elle ? », pas « cette fiche existe-t-elle ? ») mais l'export
-- refuse (son bras superuser exige l'existence). L'écart est du côté FAIL-CLOSED :
-- c'est la forme qui laisse RÉELLEMENT sortir la PII qui est la plus stricte.
DO $$
DECLARE ok boolean := FALSE;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16000000-0000-4000-8000-000000000003"}', true);
  SET LOCAL ROLE authenticated;
  ASSERT COALESCE(api.can_read_actor_contacts('ZZZRUN00000016U9'), FALSE) IS TRUE,
    'M2-bis FAIL: la garde ne doit PAS porter de controle d existence — ne pas la « reparer »';
  BEGIN
    PERFORM api.export_actor_contacts(ARRAY['ZZZRUN00000016U9'], 'Ecart delibere 16u', 'xlsx');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE;
  END;
  ASSERT ok, 'M2-bis FAIL: l export doit refuser un id inexistant meme a un superuser (fail-closed)';
  RESET ROLE;
  RAISE NOTICE '16u M2-bis: ecart garde/export sur un id INEXISTANT — delibere et fail-closed.';
END$$;

-- ---------------------------------------------------------------------
-- H (R1). Les fonctions « deep » sont HORS PÉRIMÈTRE — et le restent
-- ---------------------------------------------------------------------
-- Complément PERMANENT de la preuve d'identité one-shot de la tâche 13
-- (comparaison des définitions complètes HEAD↔arbre). On lit `prosrc`, c'est-à-
-- dire le CORPS ENTIER : une modification en PLEIN MILIEU du corps est donc
-- détectée, pas seulement un changement de signature. Deux moitiés :
--   · NÉGATIVE — aucun marqueur §208 n'a migré dans ces fonctions ;
--   · POSITIVE — elles ÉMETTENT TOUJOURS les champs que §208 caviarde ailleurs.
--     Sans cette moitié, quelqu'un pourrait « harmoniser » ces fonctions en
--     supprimant la PII sans qu'aucune assertion ne bouge.
-- Et `get_objects_with_deep_data` doit rester SECURITY INVOKER : sa seule
-- protection est la RLS ; la passer en DEFINER l'évaporerait en silence, sans
-- changer sa signature.
DO $$
DECLARE v_src text; v_wrapper text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'api' AND p.proname = 'get_objects_with_deep_data';
  SELECT p.prosrc INTO v_wrapper FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'api' AND p.proname = 'get_object_with_deep_data';
  ASSERT v_src IS NOT NULL AND v_wrapper IS NOT NULL,
    'H0 FAIL: une fonction deep a disparu';

  ASSERT v_src NOT LIKE '%can_read_actor_contacts%' AND v_wrapper NOT LIKE '%can_read_actor_contacts%',
    'H1 FAIL: une fonction deep reference la garde 16u — elles sont HORS PERIMETRE (R1)';
  ASSERT v_src NOT LIKE '%contacts_restricted%' AND v_src NOT LIKE '%v_actor_contacts%',
    'H2 FAIL: un marqueur du contrat 16u a migre dans une fonction deep (R1)';

  ASSERT v_src LIKE '%''first_name'', a.first_name%'
     AND v_src LIKE '%''last_name'', a.last_name%'
     AND v_src LIKE '%''gender'', a.gender%'
     AND v_src LIKE '%''note'', aor.note%'
     AND v_src LIKE '%FROM actor_channel ac%',
    'H3 FAIL: le corps de get_objects_with_deep_data a change en son MILIEU — la PII acteur ou les canaux ne sont plus emis inconditionnellement (R1: cette fonction ne devait pas etre touchee)';
  ASSERT v_wrapper LIKE '%get_objects_with_deep_data%',
    'H4 FAIL: le wrapper deep ne delegue plus a get_objects_with_deep_data';

  ASSERT NOT (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'api' AND p.proname = 'get_objects_with_deep_data'),
    'H5 FAIL: get_objects_with_deep_data est passee SECURITY DEFINER — sa seule protection est la RLS, elle vient de disparaitre';
  RAISE NOTICE '16u H: fonctions deep intouchees (aucun marqueur 16u, PII toujours emise, INVOKER preserve).';
END$$;

-- ---------------------------------------------------------------------
-- J (R2.1). SABOTAGE PAR TABLE TEMPORAIRE — le search_path doit être sûr
-- ---------------------------------------------------------------------
-- Un `authenticated` crée deux relations temporaires HOMONYMES de celles qui
-- décident de l'autorisation. Sans `pg_temp` explicitement EN DERNIER dans le
-- `search_path` d'une fonction DEFINER, PostgreSQL cherche le schéma temporaire
-- EN PREMIER pour les relations : le faux `app_user_profile` ferait passer
-- l'appelant pour un superuser, et le faux `user_org_membership` lui accorderait
-- le périmètre CRM sur tout le corpus.
--
-- CE BLOC DOIT ÊTRE VÉRIFIÉ ROUGE en retirant `, pg_temp` du search_path de
-- `api.can_read_actor_contacts` ET en y remettant `app_user_profile` non
-- qualifiée. S'il reste vert sous ce sabotage, il est VACANT — vérifier alors
-- que le rôle peut créer des tables temporaires (assertion J0 ci-dessous) et que
-- la table temporaire existe bien AVANT l'appel.
--
-- `DISCARD PLANS` : les personas précédents ont déjà appelé la garde, donc son
-- plan est en cache dans cette session, lié à `public.app_user_profile`. Sans
-- purge, le sabotage pourrait rester invisible pour une raison de CACHE et non
-- de sécurité — le test « passerait » sans rien prouver.
DISCARD PLANS;
DO $$
DECLARE c jsonb; ok boolean := FALSE;
BEGIN
  -- J0 — anti-vacuité : si `authenticated` ne peut pas créer de table temporaire,
  -- tout ce bloc est vrai pour une raison qui n'a rien à voir avec le search_path.
  ASSERT has_database_privilege('authenticated', current_database(), 'TEMP'),
    'J0 FAIL: le role authenticated ne peut pas creer de table temporaire — ce bloc serait VACANT';

  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"16000000-0000-4000-8000-000000000002"}', true);
  SET LOCAL ROLE authenticated;

  -- Faux profil : « je suis owner ».
  CREATE TEMP TABLE app_user_profile (id uuid, role text, display_name text) ON COMMIT DROP;
  INSERT INTO pg_temp.app_user_profile VALUES
    ('16000000-0000-4000-8000-000000000002', 'owner', 'Usurpateur 16u');
  -- Faux membership : « je publie tout ».
  CREATE TEMP TABLE user_org_membership (id uuid, user_id uuid, org_object_id text, is_active boolean)
    ON COMMIT DROP;
  INSERT INTO pg_temp.user_org_membership VALUES
    (gen_random_uuid(), '16000000-0000-4000-8000-000000000002', 'ORGRUN00000016U1', TRUE);

  -- J0-bis — anti-vacuité : les leurres doivent réellement exister et être
  -- visibles AVANT l'appel (sinon le vert ne prouve rien).
  ASSERT (SELECT count(*) FROM pg_temp.app_user_profile) = 1
     AND (SELECT count(*) FROM pg_temp.user_org_membership) = 1,
    'J0-bis FAIL: les relations temporaires leurres ne sont pas en place — ce bloc serait VACANT';

  ASSERT COALESCE(api.can_read_actor_contacts('HOTRUN00000016U1'), FALSE) IS FALSE,
    'J1 FAIL: une table TEMP a fait passer la garde — search_path non sur (pg_temp doit etre EN DERNIER + relations schema-qualifiees)';

  c := api.export_actor_capabilities(ARRAY['HOTRUN00000016U1']);
  ASSERT c->>'actor_contacts_available' = 'false',
    format('J2 FAIL: une table TEMP a ouvert les capacites, recu %s', c);

  BEGIN
    PERFORM api.export_actor_contacts(ARRAY['HOTRUN00000016U1'], 'Tentative usurpation 16u', 'xlsx');
  EXCEPTION WHEN insufficient_privilege THEN ok := TRUE;
  END;
  ASSERT ok, 'J3 FAIL: l export a servi des coordonnees a un usurpateur par table TEMP';

  RESET ROLE;
  RAISE NOTICE '16u J: usurpation par relation temporaire refusee (garde, preflight, export).';
END$$;
DROP TABLE IF EXISTS pg_temp.app_user_profile;
DROP TABLE IF EXISTS pg_temp.user_org_membership;

SELECT 'test_actor_contacts_org_gate: OK' AS result;
ROLLBACK;
