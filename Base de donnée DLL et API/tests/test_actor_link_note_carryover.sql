-- test_actor_link_note_carryover.sql
-- §208 / T13b — `api.save_object_relations` ne doit JAMAIS effacer `actor_object_role.note`.
--
-- LE DÉFAUT COUVERT (destruction de donnée silencieuse, pas simple saisie ignorée) :
--   T13 rédige la PII des liens acteur dans `api.get_object_resource` — pour un appelant qui échoue
--   `api.can_read_actor_contacts`, chaque lien sort avec `note: null` (+ `contacts_restricted: true`).
--   Or la branche `actors` du writer est un DELETE-ALL + RE-INSERT depuis le payload. Un rédacteur
--   canonique du bras hérité `is_object_owner` charge donc `note: null`, enregistre la fiche, et
--   EFFACE la note de TOUS les liens acteur — sans erreur, sans signal, sans avoir vu le champ.
--   Correctif : quand la garde est fausse, `note` est REPORTÉE depuis un instantané pris AVANT le
--   DELETE, clé (actor_id, role_id) = la PK (actor_id, object_id, role_id) moins object_id (constant).
--
-- DEUX TÉMOINS, dans les deux sens (une garde qui ne teste qu'un sens ne prouve rien) :
--   A. appelant qui NE PEUT PAS lire les coordonnées  ⇒ la note préexistante SURVIT ;
--   B. appelant qui PEUT les lire                     ⇒ une note MODIFIÉE est bien ÉCRITE.
--
-- HARNAIS — pourquoi les personas passent par `request.jwt.claims` ET par `SET LOCAL ROLE` :
--   `SET ROLE` seul ne suffit pas : hors contexte HTTP, `auth.uid()`/`auth.role()` sont NULL, tous
--   les personas s'effondrent sur la même branche fail-closed et les assertions deviennent vraies
--   sur des ensembles vides (vacuité parfaite). Et `SET LOCAL ROLE authenticated` est nécessaire
--   pour que la RLS s'applique VRAIMENT (le rôle de connexion du harnais est superuser/BYPASSRLS) —
--   c'est ce qui prouve que l'instantané pré-DELETE est bien LISIBLE par l'appelant concerné.
--
--   Persona A = claims `{"role":"service_role"}` (sans `sub`) sous le rôle SQL `authenticated` :
--     · écrit    — `api.is_object_owner` a le bras `auth.role() IN ('service_role','admin')` ;
--     · lit      — `ext_actor_object_role_read` a le MÊME bras (instantané non vacant) ;
--     · NE LIT PAS les coordonnées — `api.can_read_actor_contacts` court-circuite sur
--       `auth.uid() IS NULL` ⇒ FALSE. C'est le persona réellement atteignable aujourd'hui
--       (toute route serveur utilisant la clé de service).
--   Persona B = claims `{"role":"authenticated","sub":<superadmin membre de l'ORG publisher>}` :
--     · écrit    — `api.is_platform_superuser()` via `app_user_profile.role='owner'` ;
--     · lit      — `ext_actor_object_role_read` via le périmètre étendu (l'objet est rattaché à
--       l'ORG dont il est membre actif) ;
--     · lit les coordonnées — `api.current_user_crm_object_ids()` (ORG publisher) ET le bras
--       superuser de la garde.
--   ⚠ Le membership n'est PAS décoratif : `ext_actor_object_role_read` n'a AUCUN bras superuser,
--     et une politique SELECT filtre aussi les lignes vues par un DELETE. Un superadmin SANS
--     membership supprime donc 0 ligne puis viole la PK au ré-INSERT — §17 lui est déjà
--     inaccessible aujourd'hui, indépendamment de ce correctif (défaut préexistant, hors périmètre,
--     signalé dans le rapport T13b). Le témoin choisit donc un persona réellement capable d'écrire.
--
-- Contre une base SANS le correctif, le témoin A passe au ROUGE (« note effacee »).
-- Exécuter APRÈS le manifeste complet (dépend de 8r ET de 16u = migration_actor_contacts_org_gate.sql).
-- Auto-portant + transactionnel (ROLLBACK ; rien ne persiste).
\set ON_ERROR_STOP on
BEGIN;

-- ============================ DO #1 — structurel ============================
-- La dépendance et la forme du correctif, avant tout comportement : si la garde n'existe pas, le
-- message doit le dire ici plutôt que de laisser le témoin A échouer sur un 42883 illisible.
DO $$
DECLARE
  v_def text;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'api' AND p.proname = 'can_read_actor_contacts'
  ), 'api.can_read_actor_contacts absente — appliquer migration_actor_contacts_org_gate.sql (16u) AVANT ce test';

  v_def := pg_get_functiondef('api.save_object_relations(text,jsonb)'::regprocedure);
  ASSERT position('can_read_actor_contacts' IN v_def) > 0,
    '§208/T13b: save_object_relations ne consulte pas la garde — la branche actors peut encore effacer note';
  -- La sonde est prise UNE fois dans une variable, jamais réévaluée par lien (§35/§204).
  ASSERT position('v_actor_notes_writable := COALESCE(api.can_read_actor_contacts(p_object_id), FALSE)' IN v_def) > 0,
    '§208/T13b: la sonde doit etre evaluee UNE fois dans une variable, avec COALESCE(..., FALSE)';
  RAISE NOTICE 'T13b structurel: garde presente, sondee une seule fois, COALESCE en place.';
END$$;

-- ============================ DO #2 — les deux témoins ============================
DO $$
DECLARE
  v_obj      text  := 'ACTRUN9999999813';
  v_org      text  := 'ORGRUN9999999813';
  v_actor    uuid  := 'bbbbbbbb-9913-4913-8913-bbbbbbbbbbbb';
  v_super    uuid  := 'bbbbbbbb-9913-4913-8913-cccccccccccc';
  v_role     uuid;
  v_pub_role uuid;
  v_note     text;
  v_result   jsonb;
  v_payload  jsonb;
BEGIN
  SELECT id INTO v_role     FROM ref_actor_role WHERE code = 'operator'  LIMIT 1;
  SELECT id INTO v_pub_role FROM ref_org_role   WHERE code = 'publisher' LIMIT 1;
  ASSERT v_role     IS NOT NULL, 'fixture: ref_actor_role[operator] manquant (seeds non appliques)';
  ASSERT v_pub_role IS NOT NULL, 'fixture: ref_org_role[publisher] manquant (seeds non appliques)';

  -- ---------- fixtures, posées par le rôle de connexion (superuser) ----------
  -- Le témoin respecte la logique métier du type : un ACT porte légitimement un lien `operator`,
  -- et son ORG publisher est ce qui ouvre le périmètre CRM (donc la garde des coordonnées).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'ORG temoin T13b',      'published'),
    (v_obj, 'ACT', 'note carry-over test', 'draft');
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES (v_obj, v_org, v_pub_role);
  INSERT INTO actor (id, display_name) VALUES (v_actor, 'Prestataire temoin');
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary, visibility, note)
    VALUES (v_actor, v_obj, v_role, TRUE, 'public', 'NOTE CRM SENSIBLE');
  -- persona B (le trigger sur auth.users crée le profil ; on force le rôle) + son membership actif
  INSERT INTO auth.users (id, email) VALUES (v_super, 'note_carryover_super@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_super, 'owner')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_super, v_org, TRUE);

  -- Le payload est celui que le FRONT construit (buildActorLinksPayload) : `note` y arrive à NULL
  -- parce que la fiche a été chargée rédigée. C'est exactement ce qui détruisait la donnée.
  v_payload := jsonb_build_object('actors', jsonb_build_array(jsonb_build_object(
    'actor_id', v_actor, 'role_code', 'operator', 'is_primary', true, 'visibility', 'public', 'note', NULL
  )));

  -- ================= TÉMOIN A — ne peut PAS lire les coordonnées ⇒ la note SURVIT =================
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE authenticated;                                   -- RLS réellement appliquée
    ASSERT COALESCE(api.can_read_actor_contacts(v_obj), FALSE) IS FALSE,
      'harnais vacant: le persona A DOIT echouer la garde, sinon il ne teste pas le report';
    -- Non-vacuité de l'INSTANTANÉ : s'il ne voyait aucune ligne, le report serait vide et le
    -- test « passerait » pour une raison sans rapport avec le correctif.
    ASSERT (SELECT count(*) FROM actor_object_role WHERE object_id = v_obj) = 1,
      'harnais vacant: le persona A ne VOIT pas la ligne — l instantane pre-DELETE serait vide';
    v_result := api.save_object_relations(v_obj, v_payload);
    ASSERT (v_result->>'success')::boolean, 'temoin A: le save a echoue';
  RESET ROLE;

  SELECT note INTO v_note FROM actor_object_role WHERE object_id = v_obj AND actor_id = v_actor;
  ASSERT (SELECT count(*) FROM actor_object_role WHERE object_id = v_obj) = 1,
    'temoin A: le lien acteur lui-meme a disparu';
  ASSERT v_note = 'NOTE CRM SENSIBLE',
    format('temoin A: note effacee par un appelant qui ne pouvait pas la lire (attendu "NOTE CRM SENSIBLE", obtenu %L)', v_note);

  -- ================= TÉMOIN B — peut lire les coordonnées ⇒ une note MODIFIÉE est ÉCRITE ==========
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', v_super)::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT COALESCE(api.can_read_actor_contacts(v_obj), FALSE) IS TRUE,
      'harnais vacant: le persona B DOIT passer la garde, sinon il ne teste pas l ecriture normale';
    ASSERT (SELECT count(*) FROM actor_object_role WHERE object_id = v_obj) = 1,
      'harnais vacant: le persona B ne VOIT pas la ligne — son DELETE porterait sur 0 ligne (cf. en-tete)';
    v_result := api.save_object_relations(v_obj, jsonb_build_object('actors', jsonb_build_array(jsonb_build_object(
      'actor_id', v_actor, 'role_code', 'operator', 'is_primary', true, 'visibility', 'public',
      'note', 'NOTE REECRITE PAR UN LECTEUR AUTORISE'
    ))));
    ASSERT (v_result->>'success')::boolean, 'temoin B: le save a echoue';
  RESET ROLE;

  SELECT note INTO v_note FROM actor_object_role WHERE object_id = v_obj AND actor_id = v_actor;
  ASSERT v_note = 'NOTE REECRITE PAR UN LECTEUR AUTORISE',
    format('temoin B: un lecteur autorise ne peut plus ecrire la note (obtenu %L)', v_note);

  -- ================= TÉMOIN A bis — le report ne RESSUSCITE pas un lien retiré ====================
  -- Le report porte sur la VALEUR d'une colonne, jamais sur l'existence de la ligne : un appelant
  -- restreint qui retire le lien doit bien le retirer (et non le voir revenir avec sa note).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE authenticated;
    v_result := api.save_object_relations(v_obj, jsonb_build_object('actors', '[]'::jsonb));
  RESET ROLE;
  ASSERT (SELECT count(*) FROM actor_object_role WHERE object_id = v_obj) = 0,
    'temoin A bis: le report a ressuscite un lien retire — il ne doit porter que la colonne note';

  RAISE NOTICE 'T13b: note preservee pour un appelant restreint, ecrite pour un appelant autorise, suppression de lien intacte.';
END$$;

ROLLBACK;
