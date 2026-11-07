-- test_crm_directory_search.sql
-- Prouve migration_crm_directory_search.sql (p_search sur api.list_crm_directory) :
-- A) SIGNATURE : une seule surcharge (pas d'ambiguïté PostgREST) + `extensions` dans le
--    search_path (sans quoi word_similarity() est introuvable à l'exécution — gotcha §29).
-- B) CALIBRATION : les scores trigrammes qui justifient le seuil 0.45 sont figés ici. Si une
--    version de pg_trgm déplace le scoring, ce test tombe AVANT que la recherche ne dérive.
-- C) PÉRIMÈTRE DE RECHERCHE : nom · prénom · nom de famille · établissement rattaché ·
--    e-mail · téléphone (avec ET sans espaces — la base mélange les deux formats).
-- D) FLOU : fautes de frappe sur identité et sur établissement ; accents/casse indifférents.
-- E) CLASSEMENT : un match exact est rendu AVANT un match flou.
-- F) NON-RÉGRESSIONS : échappement LIKE ; < 2 caractères ≡ pas de filtre ; un acteur SANS
--    interaction reste trouvable ; téléphone/e-mail ne déclenchent aucun flou ; sans p_search
--    l'ordre reste strictement last_at DESC NULLS LAST (l'ordre historique de l'annuaire).
-- G) PÉRIMÈTRE D'ACCÈS (persona, obligatoire) : un SECURITY DEFINER contourne la RLS des
--    tables lues — seul un test « en tant que » prouve qu'aucun acteur hors ORG ne remonte.
-- Contre une base sans la migration : échec immédiat (p_search inconnu) — état rouge.
-- Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste).
-- Plage de fixtures dédiée 09xx (08xx = test_crm_module).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA   text := 'ORGRUN9999990901';
  v_orgB   text := 'ORGRUN9999990902';
  v_objA1  text := 'HOTRUN9999990911';  -- « Dimitile Hôtel Test » (sonde établissement)
  v_objA2  text := 'HOTRUN9999990912';  -- « Atelier de Coccinelle Test »
  v_objB   text := 'HOTRUN9999990913';  -- établissement de l'ORG B (hors périmètre de A)
  v_userA  uuid := '00000000-0000-4000-a000-000000000901'; -- membre ORG A
  v_userB  uuid := '00000000-0000-4000-a000-000000000902'; -- membre ORG B (étranger)
  -- Acteurs de l'ORG A
  v_a1 uuid := '00000000-0000-4000-a000-000000000921'; -- Mme Aline HOAREAU (+ e-mail + tél.)
  v_a2 uuid := '00000000-0000-4000-a000-000000000922'; -- « Bruno (gerant) », last_name Rivière
  v_a3 uuid := '00000000-0000-4000-a000-000000000923'; -- Zoé Bidule — AUCUNE interaction
  v_a4 uuid := '00000000-0000-4000-a000-000000000924'; -- Mr Denis Hoarau (flou vs « hoareau »)
  -- Acteur de l'ORG B — homonyme volontaire : il ne doit JAMAIS remonter pour userA.
  v_b1 uuid := '00000000-0000-4000-a000-000000000931'; -- Mme Carla Hoareau (ORG B)
  v_pub_role   uuid;
  v_actor_role uuid;
  v_email_kind uuid;
  v_phone_kind uuid;
  v_n_all   int;
  v_n_short int;
  v_pos_exact int;
  v_pos_fuzzy int;
  v_order_ok  boolean;
  v_failed    boolean;
BEGIN
  -- ---------- A. Signature + search_path ----------
  ASSERT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='api' AND p.proname='list_crm_directory') = 1,
         'signature: il doit rester exactement 1 surcharge de list_crm_directory (ambiguite PostgREST)';
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
                      unnest(p.proconfig) c
                 WHERE n.nspname='api' AND p.proname='list_crm_directory'
                   AND c LIKE 'search_path=%extensions%'),
         'search_path: `extensions` requis (pg_trgm) — sinon word_similarity introuvable a l execution (§29)';

  -- ---------- B. Calibration du seuil 0.45 (mesurée live 2026-07-27) ----------
  -- Vrais positifs : tous >= 0.45. `rivere→riviere` (0.500) est le plus faible : un seuil de
  -- 0.55 le perdrait (mesuré : plus AUCUN résultat pour « rivere »).
  ASSERT word_similarity('rivere','riviere')   >= 0.45, 'calibration: rivere→riviere sous le seuil';
  ASSERT word_similarity('hoareu','hoareau')   >= 0.45, 'calibration: hoareu→hoareau sous le seuil';
  ASSERT word_similarity('hoareu','hoarau')    >= 0.45, 'calibration: hoareu→hoarau sous le seuil';
  ASSERT word_similarity('grondain','grondin') >= 0.45, 'calibration: grondain→grondin sous le seuil';
  ASSERT word_similarity('hor','hoareau')      >= 0.45, 'calibration: hor→hoareau sous le seuil';
  ASSERT word_similarity('dimtile','dimitile hotel')        >= 0.45, 'calibration: dimtile→dimitile sous le seuil';
  ASSERT word_similarity('coccinele','atelier de coccinelle') >= 0.45, 'calibration: coccinele→coccinelle sous le seuil';
  -- Plancher de bruit : « bequ » ramenait 38 acteurs sans rapport a 0.40. Doit rester exclu.
  ASSERT word_similarity('bequ','beaudemoulin') < 0.45, 'calibration: le bruit (bequ→beaudemoulin) repasse au-dessus du seuil';
  -- Le garde `length >= 3` est un garde de COÛT, pas de sémantique : une requête de 2
  -- caractères non-sous-chaîne score de toute façon sous le seuil (mesuré : or/ar/re = 0.000,
  -- au = 0.333). On assert le fait, pas un comportement qui passerait garde ou non.
  ASSERT word_similarity('or','hoareau') < 0.45 AND word_similarity('au','hoareau') < 0.45,
         'calibration: une requete de 2 caracteres non-sous-chaine devrait rester sous le seuil';

  -- ---------- Fixture (superuser, RLS bypass) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code='publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant (seeds non appliques)'; END IF;
  SELECT id INTO v_actor_role FROM ref_actor_role WHERE code='operator' LIMIT 1;
  IF v_actor_role IS NULL THEN
    v_actor_role := gen_random_uuid();
    INSERT INTO ref_actor_role (id, code, name) VALUES (v_actor_role,'operator','Exploitant');
  END IF;
  SELECT id INTO v_email_kind FROM ref_code_contact_kind WHERE code='email'  AND is_active LIMIT 1;
  SELECT id INTO v_phone_kind FROM ref_code_contact_kind WHERE code='mobile' AND is_active LIMIT 1;
  IF v_email_kind IS NULL OR v_phone_kind IS NULL THEN
    RAISE EXCEPTION 'fixture: ref_code_contact_kind[email|mobile] manquant (seeds non appliques)';
  END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_userA,'crm_search_a@test.local'), (v_userB,'crm_search_b@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userA,'tourism_agent'), (v_userB,'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA,'ORG','ORG A recherche CRM','published'),
    (v_orgB,'ORG','ORG B recherche CRM','published'),
    (v_objA1,'HOT','Dimitile Hôtel Test','draft'),
    (v_objA2,'HOT','Atelier de Coccinelle Test','draft'),
    (v_objB, 'HOT','Villa Hors Perimetre','draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_objA1,v_orgA,v_pub_role), (v_objA2,v_orgA,v_pub_role), (v_objB,v_orgB,v_pub_role)
    ON CONFLICT DO NOTHING;
  -- a2 : le nom de famille est le SEUL champ qui porte « Rivière » (le display ne le contient
  -- pas) ⇒ une correspondance prouve bien la branche last_name.
  INSERT INTO actor (id, display_name, first_name, last_name) VALUES
    (v_a1,'Mme Aline HOAREAU','Aline','Hoareau'),
    (v_a2,'Bruno (gerant)','Bruno','Rivière'),
    (v_a3,'Zoé Bidule',NULL,NULL),
    (v_a4,'Mr Denis Hoarau','Denis','Hoarau'),
    (v_b1,'Mme Carla Hoareau','Carla','Hoareau')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary) VALUES
    (v_a1,v_objA1,v_actor_role,TRUE),
    (v_a2,v_objA2,v_actor_role,TRUE),
    (v_a3,v_objA1,v_actor_role,FALSE),
    (v_a4,v_objA2,v_actor_role,FALSE),
    (v_b1,v_objB, v_actor_role,TRUE)
    ON CONFLICT DO NOTHING;
  -- Canaux de a1 : e-mail + mobile SAISI AVEC ESPACES (c'est la forme mélangée de la base).
  -- a4 reçoit un e-mail SANS AUCUN RAPPORT avec son nom : c'est la seule façon d'isoler la
  -- branche canal. Avec l'e-mail de a1 (qui contient « aline.hoareau »), une adresse fautive
  -- retombe sur la similarité du NOM (mesuré 0.560) — l'acteur est alors retrouvé à juste
  -- titre, mais on ne teste plus les canaux.
  INSERT INTO actor_channel (actor_id, kind_id, value, is_primary) VALUES
    (v_a1, v_email_kind, 'aline.hoareau@exemple.re', TRUE),
    (v_a1, v_phone_kind, '06 92 11 22 33', TRUE),
    (v_a4, v_email_kind, 'resa@kazvanille.re', TRUE)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA,v_orgA,TRUE), (v_userB,v_orgB,TRUE)
    ON CONFLICT DO NOTHING;
  -- Interactions : a1 (ancienne) et a2 (récente) — sonde de l'ordre par défaut (last_at DESC).
  -- a3 et a4 n'en ont AUCUNE : ils doivent rester trouvables par la recherche (« lien seul »).
  INSERT INTO crm_interaction (id, actor_id, object_id, interaction_type, body, occurred_at, status)
  VALUES (gen_random_uuid(), v_a1, v_objA1, 'call', 'ancienne', NOW() - interval '30 days', 'new'),
         (gen_random_uuid(), v_a2, v_objA2, 'call', 'recente',  NOW() - interval '1 day',   'new');

  -- ---------- Recherche EN TANT QUE userA (persona — le périmètre est le sujet) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

    -- C. Périmètre de recherche demandé par le PO
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'hoareau')) d
                   WHERE (d->>'actor_id')::uuid = v_a1),
           'C1 nom: « hoareau » doit remonter Mme Aline HOAREAU';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'aline')) d
                   WHERE (d->>'actor_id')::uuid = v_a1),
           'C2 prenom: « aline » doit remonter Mme Aline HOAREAU';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'riviere')) d
                   WHERE (d->>'actor_id')::uuid = v_a2),
           'C3 nom de famille: « riviere » doit remonter Bruno (gerant) via last_name seul';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'dimitile')) d
                   WHERE (d->>'actor_id')::uuid = v_a1),
           'C4 etablissement: « dimitile » doit remonter l acteur rattache a Dimitile Hotel Test';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'aline.hoareau@exemple.re')) d
                   WHERE (d->>'actor_id')::uuid = v_a1),
           'C5a e-mail exact: adresse complete non trouvee';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'exemple.re')) d
                   WHERE (d->>'actor_id')::uuid = v_a1),
           'C5b e-mail partiel: le domaine doit suffire';
    -- Le canal est stocké « 06 92 11 22 33 » : les DEUX saisies doivent le retrouver.
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := '0692112233')) d
                   WHERE (d->>'actor_id')::uuid = v_a1),
           'C6a telephone sans espaces: la normalisation en chiffres ne fonctionne pas';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := '06 92 11 22 33')) d
                   WHERE (d->>'actor_id')::uuid = v_a1),
           'C6b telephone avec espaces: la normalisation en chiffres ne fonctionne pas';

    -- D. Flou (fautes de frappe) + insensibilité accents/casse
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'hoareu')) d
                   WHERE (d->>'actor_id')::uuid = v_a1),
           'D1 flou identite: « hoareu » doit retrouver « Hoareau »';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'dimtile')) d
                   WHERE (d->>'actor_id')::uuid = v_a1),
           'D2 flou etablissement: « dimtile » (transposition) doit retrouver « Dimitile Hotel Test »';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'HOARÉAU')) d
                   WHERE (d->>'actor_id')::uuid = v_a1),
           'D3 accents/casse: « HOARÉAU » doit etre equivalent a « hoareau »';
    -- Un nom réellement différent ne doit rien ramener (le seuil ne part pas en vrille).
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'bidule')) d
                       WHERE (d->>'actor_id')::uuid IN (v_a1, v_a2, v_a4)),
           'D4 discrimination: « bidule » ne doit remonter que Zoe Bidule';

    -- E. Classement : « hoareau » = exact sur a1, flou sur a4 (Hoarau, 0.571). a1 D ABORD.
    -- Les deux ont un last_at différent (a1 en a un, a4 non) — c'est bien le rank qui tranche :
    -- sans rank, a1 passerait aussi devant, donc on verifie l inverse ci-dessous avec a3/a4.
    SELECT t.ord INTO v_pos_exact
    FROM jsonb_array_elements(api.list_crm_directory(p_search := 'hoareau')) WITH ORDINALITY t(d, ord)
    WHERE (t.d->>'actor_id')::uuid = v_a1;
    SELECT t.ord INTO v_pos_fuzzy
    FROM jsonb_array_elements(api.list_crm_directory(p_search := 'hoareau')) WITH ORDINALITY t(d, ord)
    WHERE (t.d->>'actor_id')::uuid = v_a4;
    ASSERT v_pos_exact IS NOT NULL AND v_pos_fuzzy IS NOT NULL,
           'E1 classement: les deux acteurs (exact + flou) doivent etre presents';
    ASSERT v_pos_exact < v_pos_fuzzy,
           'E2 classement: le match EXACT doit preceder le match FLOU';

    -- F. Non-régressions
    -- F1 échappement LIKE : '%_' ne doit pas se comporter comme un joker.
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := '%_')) d),
           'F1 echappement: « %_ » enumere l annuaire (jokers LIKE non echappes)';
    -- F2 sous 2 caractères ≡ aucun filtre (et donc AUCUNE requête inutile côté front).
    SELECT count(*) INTO v_n_all   FROM jsonb_array_elements(api.list_crm_directory());
    SELECT count(*) INTO v_n_short FROM jsonb_array_elements(api.list_crm_directory(p_search := 'a'));
    ASSERT v_n_all = v_n_short,
           'F2 seuil: une recherche de moins de 2 caracteres doit equivaloir a aucun filtre';
    -- F3 un acteur SANS aucune interaction reste trouvable (la recherche n exige pas d interaction).
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'bidule')) d
                   WHERE (d->>'actor_id')::uuid = v_a3),
           'F3 lien seul: un acteur sans interaction doit rester trouvable par son nom';
    -- F4 téléphone/e-mail : aucun flou. Un chiffre faux ⇒ pas de résultat.
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := '0692112299')) d
                       WHERE (d->>'actor_id')::uuid = v_a1),
           'F4a telephone: un numero different ne doit PAS matcher (aucun flou sur les canaux)';
    -- F4b/F4c e-mail : sonde SUR a4, dont l'adresse (resa@kazvanille.re) n'a aucun rapport
    -- avec son nom — sinon une adresse fautive retombe sur la similarité du NOM et la branche
    -- canal n'est pas testée. Contrôle positif PUIS négatif : l'adresse exacte matche, la
    -- fautive non (mesures : la fautive score 0.000 contre le nom, le prénom et l'objet lié).
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'resa@kazvanille.re')) d
                   WHERE (d->>'actor_id')::uuid = v_a4),
           'F4b e-mail (controle positif): l adresse exacte doit matcher via le canal';
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'resa@kazvanizz.re')) d
                       WHERE (d->>'actor_id')::uuid = v_a4),
           'F4c e-mail: une adresse fautive ne doit PAS matcher (aucun flou sur les canaux)';
    -- F5 sans p_search, l ordre reste strictement last_at DESC NULLS LAST : a2 (recente)
    -- avant a1 (ancienne), et les acteurs sans interaction (last_at NULL) en dernier.
    SELECT bool_and(ok) INTO v_order_ok FROM (
      SELECT (max(CASE WHEN (t.d->>'actor_id')::uuid = v_a2 THEN t.ord END)
              < max(CASE WHEN (t.d->>'actor_id')::uuid = v_a1 THEN t.ord END)) AS ok
      FROM jsonb_array_elements(api.list_crm_directory()) WITH ORDINALITY t(d, ord)
    ) s;
    ASSERT v_order_ok,
           'F5 ordre par defaut: hors recherche l annuaire doit rester trie last_at DESC (a2 avant a1)';

    -- G. Périmètre d'accès : l homonyme de l ORG B ne doit JAMAIS remonter pour userA.
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'hoareau')) d
                       WHERE (d->>'actor_id')::uuid = v_b1),
           'G1 perimetre: la recherche remonte un acteur d une AUTRE ORG (fuite via SECURITY DEFINER)';
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'carla')) d),
           'G2 perimetre: un prenom hors perimetre ne doit rien remonter';

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ---------- G3. Symétrie : userB ne voit pas les acteurs de l ORG A ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'aline')) d
                       WHERE (d->>'actor_id')::uuid = v_a1),
           'G3 perimetre symetrique: userB ne doit pas trouver un acteur de l ORG A';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory(p_search := 'hoareau')) d
                   WHERE (d->>'actor_id')::uuid = v_b1),
           'G4 perimetre symetrique: userB doit trouver SON propre acteur';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ---------- H. Contrat d erreur préservé (les filtres historiques valident toujours) ----------
  v_failed := false;
  BEGIN
    PERFORM api.list_crm_directory(p_status := 'bidon', p_search := 'hoareau');
  EXCEPTION WHEN OTHERS THEN
    v_failed := (SQLSTATE = '22023');
  END;
  ASSERT v_failed, 'H1 contrat: p_status hors vocabulaire doit toujours lever 22023, meme avec p_search';

  RAISE NOTICE 'test_crm_directory_search: OK';
END;
$$;
ROLLBACK;
