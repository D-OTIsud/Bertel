-- test_actor_links_editor.sql
-- Proves migration_actor_links_editor.sql (§48 / manifest 8r): per-command canonical write triple
-- on actor_object_role (legacy admin FOR ALL retired), §39-wrapped read policy, the
-- save_object_relations `actors` branch, and the gated api.search_actors picker.
-- Behavior block uses the service-role claims mechanics of test_object_fma_rls.sql (set_config on
-- request.jwt.claims so auth.role() resolves; fixtures inserted as the connecting superuser).
-- DO #4 (ajoute le 2026-08-09, audit post-mise en production de §208/§211 — cf. §213) prouve par le
-- COMPORTEMENT, sur 4 personas portes par `request.jwt.claims`, que la colonne `email` du selecteur
-- est bornee au perimetre de l'ORG editrice. C'est ce bloc qui refermait une fuite REELLE : mesure
-- en production, un editeur d'une ORG sans aucune fiche publisher recevait 18 e-mails sur 20 lignes.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
-- Against a DB WITHOUT 8r, the structural asserts go red (FOR ALL still present, search_actors missing).
-- DO #4 exige EN PLUS le creneau 8z (`api.current_user_crm_object_ids`, migration_crm_module.sql) —
-- deja garanti par « run AFTER the full manifest », rappele ici parce qu'un 42883 au milieu du
-- fichier serait illisible.
\set ON_ERROR_STOP on
BEGIN;

-- ============================ DO #1 — structural ============================
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='actor_object_role' AND policyname='canonical_ins_actor_object_role' AND cmd='INSERT'), 'canonical_ins missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='actor_object_role' AND policyname='canonical_upd_actor_object_role' AND cmd='UPDATE'), 'canonical_upd missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='actor_object_role' AND policyname='canonical_del_actor_object_role' AND cmd='DELETE'), 'canonical_del missing';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='actor_object_role' AND cmd='ALL'), 'FOR ALL must be retired on actor_object_role (P0.3 gotcha class)';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='actor_object_role' AND policyname='ext_actor_object_role_read' AND cmd='SELECT'), 'ext_actor_object_role_read (rewritten §38/§39 form) missing';
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='api' AND p.proname='search_actors'), 'api.search_actors missing';
  ASSERT NOT has_function_privilege('anon', 'api.search_actors(text)', 'EXECUTE'), 'anon must not execute search_actors';
  ASSERT has_function_privilege('authenticated', 'api.search_actors(text)', 'EXECUTE'), 'authenticated must be able to execute search_actors (gate is in-function)';
END$$;

-- ============================ DO #2 — behavior: actors branch round-trip ============================
-- (persona fixture per test_object_fma_rls.sql; service-role claims so the SECURITY INVOKER RPC's
--  workspace gate passes via api.is_object_owner's auth.role() arm)
DO $$
DECLARE
  v_obj    text := 'ACTRUN9999999801';
  v_actor  uuid := 'aaaaaaaa-9999-4999-8999-aaaaaaaaaaaa';
  v_role   uuid;
  v_result jsonb;
BEGIN
  SELECT id INTO v_role FROM ref_actor_role WHERE code='operator' LIMIT 1;
  ASSERT v_role IS NOT NULL, 'fixture ref missing (operator role -- seeds not applied)';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO object (id, object_type, name, status) VALUES (v_obj, 'ACT', 'actor link test', 'draft');
  INSERT INTO actor (id, display_name) VALUES (v_actor, 'Test Operator');
  v_result := api.save_object_relations(v_obj, jsonb_build_object('actors', jsonb_build_array(
    jsonb_build_object('actor_id', v_actor, 'role_code', 'operator', 'is_primary', true, 'visibility', 'public', 'note', 't')
  )));
  ASSERT (SELECT count(*) FROM actor_object_role WHERE object_id = v_obj) = 1, 'actors branch did not insert';
  ASSERT (SELECT is_primary FROM actor_object_role WHERE object_id = v_obj), 'is_primary lost';
  v_result := api.save_object_relations(v_obj, jsonb_build_object('actors', '[]'::jsonb));
  ASSERT (SELECT count(*) FROM actor_object_role WHERE object_id = v_obj) = 0, 'actors branch did not clear';
  RAISE NOTICE 'actor links editor assertions passed (per-command structural + read policy + gated picker + actors round-trip).';
END$$;

-- ============================ DO #3 — §95: any editor may associate any actor ============================
-- Regression guard for the 2026-06-17 bug: save_object_relations is SECURITY INVOKER, so an EXISTS over
-- public.actor for the existence check was RLS-filtered by ext_actor_read and HID not-yet-linked actors,
-- raising "Unknown actor_id" for any non-admin editor (and the superadmin, whose read policy had no
-- superuser arm). These are STRUCTURAL asserts (the behavior is RLS-role dependent; the live persona
-- reproduction is in the session log). They go red if the RLS-gated probe is reintroduced.
DO $$
DECLARE
  v_save_def   text := pg_get_functiondef('api.save_object_relations(text,jsonb)'::regprocedure);
  v_search_def text := pg_get_functiondef('api.search_actors(text)'::regprocedure);
  -- Même définition, commentaires de ligne retirés — voir (2b) pour la raison.
  v_search_code text := regexp_replace(pg_get_functiondef('api.search_actors(text)'::regprocedure), '--[^\n]*', '', 'g');
  v_read_using text;
BEGIN
  -- (1) actors arm must NOT probe public.actor existence (FK actor_object_role.actor_id -> actor(id) enforces it).
  ASSERT position('FROM public.actor WHERE id' IN v_save_def) = 0,
    '§95 regression: save_object_relations still RLS-probes public.actor existence in the actors arm';
  -- (2) ASSERTION RETOURNÉE le 2026-08-09 (audit post-mise en production de §208/§211, cf. §213).
  -- CE QU'ELLE DISAIT, ET POURQUOI ELLE A EXISTÉ : « le sélecteur n'a AUCUN périmètre par appelant »
  -- (`current_user_extended_object_ids` absent). §95 (2026-06-17) venait de RETIRER un périmètre
  -- étendu qui cassait le rattachement d'un prestataire pas-encore-lié : un éditeur ne trouvait pas
  -- l'acteur qu'il voulait associer. L'assertion épinglait ce retrait pour qu'il ne soit pas défait.
  -- POURQUOI ELLE DEVIENT FAUSSE : §208 a arbitré APRÈS coup que les coordonnées d'acteur sont
  -- RÉSERVÉES aux membres de l'ORG éditrice. Or §95b avait ajouté une colonne `email` au sélecteur.
  -- Lue littéralement, l'assertion restait verte — `current_user_crm_object_ids` n'est pas
  -- `current_user_extended_object_ids` — mais lue pour ce qu'elle PROTÉGEAIT (« aucun périmètre »)
  -- elle épinglait la fuite : mesuré en production, un éditeur d'une ORG sans fiche publisher
  -- recevait 18 e-mails sur 20 lignes. Le contrat correct SÉPARE les deux plans :
  --   · la LIGNE (nom) reste sans périmètre — §95 tient, et le bras (2a) le garde ;
  --   · la COLONNE `email` prend le périmètre CRM de §211/D4 — et le bras (2b) l'exige.
  -- (2a) §95 tient : le périmètre ÉTENDU ne doit pas revenir gater les lignes du sélecteur.
  ASSERT position('current_user_extended_object_ids' IN v_search_code) = 0,
    '§95 regression: search_actors still scopes the picker by current_user_extended_object_ids';
  -- (2b) §208/§211 : la colonne e-mail DOIT être bornée au périmètre publisher.
  -- On assertе sur le CODE, commentaires de ligne RETIRÉS. Piège vécu le 2026-08-09 : le corps de
  -- `search_actors` est délibérément commenté en détail, et `pg_get_functiondef` rend les
  -- commentaires. La première rédaction de cette assertion a rougi sur… la prose qui explique le
  -- correctif. Pire, la faute existe aussi dans le sens FAIL-OPEN : une assertion de PRÉSENCE
  -- resterait verte si l'on supprimait le code en laissant le commentaire — exactement la garde
  -- vacante qu'on prétend poser. (Limite connue et acceptée : le retrait naïf des `--` casserait un
  -- littéral contenant `--` ; il n'y en a aucun ici, et l'assertion n'est qu'un filet — la VRAIE
  -- preuve est comportementale, c'est le bloc DO #4.)
  ASSERT position('current_user_crm_object_ids' IN v_search_code) > 0,
    '§208/§211 regression: search_actors n a plus le perimetre CRM sur la colonne email (fuite: tout editeur lit l e-mail de tout acteur)';
  -- (2c) §95b: picker returns the primary e-mail (actor_channel) for the rich result card.
  -- La colonne SURVIT au gate : la refermer serait une décision produit (carte du sélecteur), et
  -- l'arbitrage rendu est de GATER, pas de supprimer.
  ASSERT position('actor_channel' IN v_search_code) > 0,
    '§95b regression: search_actors lost the actor_channel email subquery';
  -- (3) ext_actor_read gained the is_platform_superuser arm (matches the picker scope for direct reads).
  SELECT pg_get_expr(polqual, polrelid) INTO v_read_using
  FROM pg_policy WHERE polrelid='public.actor'::regclass AND polname='ext_actor_read';
  ASSERT v_read_using ILIKE '%is_platform_superuser%',
    '§95: ext_actor_read missing the is_platform_superuser arm';
  RAISE NOTICE '§95 assertions passed (FK-only actor existence, full-directory picker, superuser read arm).';
END$$;

-- ============================ DO #4 — §208/§211 : la colonne `email` du selecteur est bornee au perimetre publisher ============================
-- CE QUE CE BLOC PROTEGE, EN UNE PHRASE : `api.search_actors` continue de rendre TOUT le repertoire
-- par NOM (arbitrage §95, sans quoi on ne peut plus rattacher un prestataire pas-encore-lie), mais
-- l'e-mail ajoute par §95b ne sort que vers un membre de l'ORG editrice de l'acteur, ou vers un
-- superuser plateforme — la meme regle que `api.can_read_actor_contacts` (§208), transposee au
-- selecteur qui, lui, n'a AUCUN contexte objet.
--
-- HARNAIS — `request.jwt.claims`, jamais `SET ROLE` seul (§204) : hors contexte HTTP `auth.uid()`
-- rend NULL, tous les personas s'effondrent sur la meme branche fail-closed, chaque assertion
-- devient vraie sur un ensemble vide et le bloc est parfaitement VACANT. `SET ROLE authenticated`
-- est pose EN PLUS, autour des seuls appels au RPC, pour rester fidele au chemin reel ; il est
-- rendu tout de suite apres, sinon les assertions de fixture seraient elles-memes filtrees par RLS
-- et rougiraient pour la mauvaise raison.
--
-- POURQUOI DEUX ACTEURS SYMETRIQUES plutot qu'un acteur et un persona aveugle : avec un seul
-- acteur, un persona hors perimetre a un perimetre CRM VIDE, et « ne rien rendre » suffirait a
-- passer. Ici chaque persona a un perimetre NON VIDE qui contient l'un des deux acteurs : la garde
-- doit DISCRIMINER. Une implementation « tout rendre » rougit sur le persona oppose, une
-- implementation « ne rien rendre » rougit sur les deux, et P3 couvre le bras superuser que la
-- symetrie ne peut pas atteindre.
--
-- NON-VACUITE VERIFIEE (2026-08-09, base de production, chaque variante en BEGIN/ROLLBACK) —
-- temoin non sabote VERT, et les QUATRE sabotages ROUGES, chacun sur l'assertion qui le vise :
--   S1  gate toujours ouvert (`CASE WHEN TRUE`)        -> ROUGE P1 « fuite: e-mail d un prestataire
--                                                          de l ORG B » ;
--   S2  bras superuser neutralise (`:= FALSE`)         -> ROUGE P3 (rows=2 mails=0) ;
--   S3  bras superuser via `is_platform_superuser()`   -> ROUGE P4 (la cle de service lit 2 e-mails) ;
--   S4  ligne masquee au lieu de colonne NULLee        -> ROUGE P1 (1 ligne au lieu de 2).
-- Le fichier a par ailleurs ete joue TEL QUEL contre la production d'avant correctif : ROUGE sur
-- l'assertion structurelle (2b). Aucun de ces rouges n'est un effet de bord : ils tombent tous sur
-- le message qui nomme le defaut.
DO $$
DECLARE
  v_org_a   text := 'ORGRUN9999999SA1';
  v_org_b   text := 'ORGRUN9999999SB1';
  v_obj_a   text := 'HOTRUN9999999SA1';
  v_obj_b   text := 'HOTRUN9999999SB1';
  v_u1      uuid := '9a000000-0000-4000-8000-0000000000a1';  -- membre ORG A
  v_u2      uuid := '9a000000-0000-4000-8000-0000000000b1';  -- membre ORG B
  v_u3      uuid := '9a000000-0000-4000-8000-0000000000c1';  -- superuser plateforme, SANS membership
  v_act_a   uuid := '9a000000-0000-4000-8000-00000000000a';  -- prestataire de l ORG A
  v_act_b   uuid := '9a000000-0000-4000-8000-00000000000b';  -- prestataire de l ORG B
  v_role_op uuid; v_role_pub uuid; v_perm uuid; v_kind uuid;
  v_rows int; v_mails int; v_a text; v_b text; v_edit boolean;
BEGIN
  SELECT id INTO v_role_op  FROM public.ref_actor_role       WHERE code = 'operator'      LIMIT 1;
  SELECT id INTO v_role_pub FROM public.ref_org_role         WHERE code = 'publisher'     LIMIT 1;
  SELECT id INTO v_perm     FROM public.ref_permission       WHERE code = 'create_object' AND is_active LIMIT 1;
  SELECT id INTO v_kind     FROM public.ref_code_contact_kind WHERE code = 'email'        LIMIT 1;
  ASSERT v_role_op IS NOT NULL AND v_role_pub IS NOT NULL AND v_perm IS NOT NULL AND v_kind IS NOT NULL,
    'fixture: seeds manquants (ref_actor_role[operator] / ref_org_role[publisher] / ref_permission[create_object] / ref_code_contact_kind[email])';

  -- Claims service_role pendant la pose des fixtures : `api.enforce_app_user_profile_role_change`
  -- n autorise le role `owner` qu a un demandeur owner/service_role.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.object (id, object_type, name, status) VALUES
    (v_org_a, 'ORG', 'ORG A temoin search_actors',   'published'),
    (v_org_b, 'ORG', 'ORG B temoin search_actors',   'published'),
    (v_obj_a, 'HOT', 'Hotel A temoin search_actors', 'published'),
    (v_obj_b, 'HOT', 'Hotel B temoin search_actors', 'published');
  -- Chaque ORG est PUBLISHER de sa fiche : les deux personas ont un perimetre CRM NON VIDE.
  INSERT INTO public.object_org_link (object_id, org_object_id, role_id, is_primary) VALUES
    (v_obj_a, v_org_a, v_role_pub, TRUE),
    (v_obj_b, v_org_b, v_role_pub, TRUE);

  INSERT INTO auth.users (id, email) VALUES
    (v_u1, 'sa-p1@test.local'), (v_u2, 'sa-p2@test.local'), (v_u3, 'sa-p3@test.local')
  ON CONFLICT (id) DO NOTHING;
  -- Le trigger `on_auth_user_created_app_user_profile` a deja cree les 3 profils.
  INSERT INTO public.app_user_profile (id, role, display_name) VALUES
    (v_u1, 'tourism_agent', 'P1 membre ORG A'),
    (v_u2, 'tourism_agent', 'P2 membre ORG B'),
    (v_u3, 'owner',         'P3 superuser sans membership')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name;
  -- u3 n a PAS de membership : son acces passe donc par le bras `app_user_profile.role`, jamais
  -- par le perimetre CRM. C est exactement le bras que P3 eprouve.
  INSERT INTO public.user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_u1, v_org_a, TRUE), (v_u2, v_org_b, TRUE);
  -- P1 et P2 doivent FRANCHIR la garde editeur, sinon search_actors leve 42501 et le bloc
  -- n eprouve rien (« pas d e-mail » serait vrai pour la mauvaise raison).
  INSERT INTO public.user_permission (user_id, permission_id, is_active) VALUES
    (v_u1, v_perm, TRUE), (v_u2, v_perm, TRUE);

  -- Meme prefixe de nom pour les deux acteurs : UNE seule recherche rend les deux lignes.
  INSERT INTO public.actor (id, display_name, first_name, last_name) VALUES
    (v_act_a, 'Zzsearchactors Temoin Alpha', 'Alpha', 'Zzsearchactors'),
    (v_act_b, 'Zzsearchactors Temoin Beta',  'Beta',  'Zzsearchactors');
  INSERT INTO public.actor_object_role (actor_id, object_id, role_id, is_primary, visibility) VALUES
    (v_act_a, v_obj_a, v_role_op, TRUE, 'partners'),
    (v_act_b, v_obj_b, v_role_op, TRUE, 'partners');
  INSERT INTO public.actor_channel (actor_id, kind_id, value, is_primary) VALUES
    (v_act_a, v_kind, 'alpha.sentinelle@exemple-sa.test', TRUE),
    (v_act_b, v_kind, 'beta.sentinelle@exemple-sa.test',  TRUE);
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ANTI-VACUITE 1 : les deux acteurs PORTENT bien un e-mail. Une fixture muette rendrait
  -- « email IS NULL » vrai partout et le bloc passerait en ne prouvant rien.
  ASSERT (SELECT count(*) FROM public.actor_channel WHERE actor_id IN (v_act_a, v_act_b)) = 2,
    'fixture: les 2 acteurs temoins n ont pas recu leur e-mail — le bloc serait VACANT';

  -- ---- P1 : membre de l ORG A, publisher de la fiche ou vit l acteur Alpha ----
  PERFORM set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', v_u1), true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT api.current_user_can_edit_objects() INTO v_edit;
  SELECT count(*), count(email),
         max(email) FILTER (WHERE id = v_act_a),
         max(email) FILTER (WHERE id = v_act_b)
    INTO v_rows, v_mails, v_a, v_b
    FROM api.search_actors('zzsearchactors');
  PERFORM set_config('role', 'none', true);
  -- ANTI-VACUITE 2 : P1 franchit bien la garde editeur (sinon 42501, donc aucune ligne du tout).
  ASSERT COALESCE(v_edit, FALSE),
    'P1 ne franchit pas current_user_can_edit_objects — le bloc serait VACANT (42501 avant toute lecture)';
  ASSERT v_rows = 2,
    format('P1: le selecteur doit rendre les 2 LIGNES — la garde porte sur la COLONNE, jamais sur la ligne (§95: le rattachement d un prestataire en depend) — recu %s', v_rows);
  ASSERT v_a = 'alpha.sentinelle@exemple-sa.test',
    format('P1: e-mail de SON propre prestataire manquant — garde trop stricte, elle casserait la carte du selecteur — recu %s', COALESCE(v_a, 'NULL'));
  ASSERT v_b IS NULL,
    format('§208 FUITE: P1 (ORG A) lit l e-mail d un prestataire de l ORG B — recu %s', COALESCE(v_b, 'NULL'));
  ASSERT v_mails = 1, format('P1: exactement 1 e-mail attendu — recu %s', v_mails);

  -- ---- P2 : MIROIR exact de P1 sur l ORG B ----
  PERFORM set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', v_u2), true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT api.current_user_can_edit_objects() INTO v_edit;
  SELECT count(*), count(email),
         max(email) FILTER (WHERE id = v_act_a),
         max(email) FILTER (WHERE id = v_act_b)
    INTO v_rows, v_mails, v_a, v_b
    FROM api.search_actors('zzsearchactors');
  PERFORM set_config('role', 'none', true);
  ASSERT COALESCE(v_edit, FALSE),
    'P2 ne franchit pas current_user_can_edit_objects — le bloc serait VACANT';
  ASSERT v_rows = 2, format('P2: le selecteur doit rendre les 2 LIGNES — recu %s', v_rows);
  ASSERT v_b = 'beta.sentinelle@exemple-sa.test',
    format('P2: e-mail de SON propre prestataire manquant — recu %s', COALESCE(v_b, 'NULL'));
  ASSERT v_a IS NULL,
    format('§208 FUITE: P2 (ORG B) lit l e-mail d un prestataire de l ORG A — recu %s', COALESCE(v_a, 'NULL'));
  ASSERT v_mails = 1, format('P2: exactement 1 e-mail attendu — recu %s', v_mails);

  -- ---- P3 : superuser plateforme SANS membership (perimetre CRM vide) ----
  -- Seul bras que la symetrie P1/P2 ne couvre pas : sans P3, neutraliser le bras superuser
  -- laisserait ce fichier VERT (verifie rouge par sabotage, cf. en-tete du bloc).
  PERFORM set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', v_u3), true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*), count(email) INTO v_rows, v_mails FROM api.search_actors('zzsearchactors');
  PERFORM set_config('role', 'none', true);
  ASSERT v_rows = 2, format('P3: 2 lignes attendues — recu %s', v_rows);
  ASSERT v_mails = 2,
    format('§208: un superuser plateforme (app_user_profile.role owner/super_admin) doit lire les 2 e-mails, comme api.can_read_actor_contacts — recu %s', v_mails);

  -- ---- P4 : CLE DE SERVICE (claims `service_role`, aucun `sub`) ----
  -- §208 a arbitré qu'une CLÉ DE SERVICE N'EST PAS UNE PERSONNE et ne lit pas de PII d'acteur.
  -- Ce persona est le detecteur du seul raccourci tentant du correctif : ecrire le bras superuser
  -- avec `api.is_platform_superuser()` (deja disponible, deja utilise partout ailleurs) au lieu de
  -- relire `app_user_profile` comme `api.can_read_actor_contacts`. is_platform_superuser porte en
  -- plus le bras `auth.role() IN ('service_role','admin')` : la substitution rendrait ici les 2
  -- e-mails et rouvrirait, par une AUTRE fonction, la porte que §208 a fermee.
  -- Il franchit la garde editeur (is_platform_superuser est dans current_user_can_edit_objects) :
  -- les LIGNES sortent donc bien, et l'assertion porte reellement sur la colonne, pas sur un vide.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT api.current_user_can_edit_objects() INTO v_edit;
  SELECT count(*), count(email) INTO v_rows, v_mails FROM api.search_actors('zzsearchactors');
  PERFORM set_config('role', 'none', true);
  ASSERT COALESCE(v_edit, FALSE),
    'P4: la cle de service ne franchit meme pas la garde editeur — l assertion suivante serait VACANTE';
  ASSERT v_rows = 2, format('P4: 2 lignes attendues (le gate porte sur la colonne) — recu %s', v_rows);
  ASSERT v_mails = 0,
    format('§208: une cle de service n est pas une personne — elle ne doit lire AUCUN e-mail d acteur (bras is_platform_superuser reintroduit ?) — recu %s', v_mails);

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE '§208/§211 assertions passed (colonne email bornee au perimetre publisher, lignes jamais masquees, bras superuser vivant, cle de service exclue).';
END$$;
ROLLBACK;
