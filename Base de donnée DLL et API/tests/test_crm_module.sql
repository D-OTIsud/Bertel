-- test_crm_module.sql
-- Prouve §61 (migration_crm_module.sql, 8z) :
-- A) VOCABULAIRES : domaine demand_topic = sujets OTI uniquement ; crm_demand_topic_oti vide ;
--    demand_subtopic vide ; partition crm_sentiment = 6 codes ; colonnes *_sentiment_id + FK.
-- B) ACCÈS : membre ORG publisher lit via RPC ; étranger lit zéro ; écriture refusée sans
--    write_crm_notes, acceptée avec ; PostgREST direct refusé (RLS) même pour le membre.
-- C) ÉCRITURE : save_crm_interaction résout topic/sentiment par code ; save_crm_task upsert + move ;
--    delete_crm_interaction supprime (membre autorisé) et refuse (membre sans permission).
-- D) ACTEUR-CENTRÉ (correction design 2026-06-11, v2) : ancrage acteur OU objet (CHECK
--    chk_crm_interaction_anchor + object_id nullable) ; interaction acteur-seul créée, listée
--    (fiche acteur list_actor_crm + arme acteur de la timeline) puis supprimée ; annuaire
--    list_crm_directory ré-écrit PAR ACTEUR ; acteurs liés exposés par list_object_crm ;
--    ajout de contexte objet NULL→valeur permis, re-parentage objet→objet refusé (22023) ;
--    cross-ORG acteur : list_actor_crm refuse l'étranger (42501), l'annuaire de B contient
--    son acteur lié mais jamais celui de A.
-- E) RECTIFS PO (2026-06-11) : authoring acteur (save_crm_actor INSERT lié à un objet +
--    UPDATE partiel) ; canaux (save_actor_channel / delete_actor_channel + clé 'channels'
--    de list_actor_crm) ; tâche rattachée à un acteur (actor_id accepté par save_crm_task,
--    actor_name exposé par list_crm_tasks) ; annuaire list_crm_directory filtrable
--    (sujet/statut/période) avec KPI recalculés sur l'ensemble FILTRÉ — les acteurs
--    « lien seul » disparaissent sous filtre ; p_status hors contrat → 22023 ; refus 42501
--    membre sans permission (C) et cross-ORG (B).
-- F) ASSIGNATION DE TÂCHE (demande PO 2026-06-12) : list_crm_assignees liste les membres
--    actifs de l'ORG du caller (userA + userC, jamais userB) avec un display_name garanti ;
--    save_crm_task accepte owner = membre de la MÊME ORG (userC) et refuse 22023 un owner
--    d'une autre ORG (userB).
-- G) PHOTO ACTEUR + SUGGESTIONS CONTACTS + TIMELINE FILTRÉE (demande PO 2026-06-12) :
--    save_crm_actor accepte photo_url (set puis effacement clé+vide), re-lu par list_actor_crm ;
--    list_object_contact_suggestions(objA) renvoie un tableau JSON, contient le contact email
--    de l'établissement (fixture contact_channel), refuse l'étranger (42501) ;
--    list_crm_timeline gagne p_status (active/done, 'bidon'→22023) + p_from.
-- Contre une base sans 8z : échec immédiat (RPCs api.* absentes / vocabulaires non fusionnés) — état rouge.
-- Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste).
-- Mécanique de fixture calquée sur test_room_type_read_gate.sql / test_sp2_permission_behavior.sql.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  -- Plage de fixtures dédiée (08xx) : 06xx = test_object_review_read_gate, 07xx = test_media_visibility_gate.
  v_orgA   text := 'ORGRUN9999990801';
  v_orgB   text := 'ORGRUN9999990802';
  v_objA   text := 'HOTRUN9999990811';
  v_objB   text := 'HOTRUN9999990812'; -- objet de l'ORG B (probes cross-ORG acteur-centrées)
  v_userA  uuid := '00000000-0000-4000-a000-000000000101'; -- membre ORG A, AVEC write_crm_notes
  v_userB  uuid := '00000000-0000-4000-a000-000000000102'; -- membre ORG B (étranger à l'objet)
  v_userC  uuid := '00000000-0000-4000-a000-000000000103'; -- membre ORG A, SANS permission
  v_actorA uuid := '00000000-0000-4000-a000-000000000821'; -- acteur lié à objA (ORG A)
  v_actorB uuid := '00000000-0000-4000-a000-000000000822'; -- acteur lié à objB (ORG B)
  v_pub_role uuid;
  v_actor_role uuid;
  v_perm uuid;
  v_payload jsonb;
  v_int_id uuid;
  v_actor_int_id uuid; -- interaction acteur-seul (sans contexte objet)
  v_ctx_id uuid;       -- interaction acteur-seul contextualisée ensuite (NULL → objA)
  v_task_id uuid;
  v_denied boolean;
  -- Rectifs PO (2026-06-11) :
  v_kind_code text;    -- code contact_kind réel (fixture-guard ; 'email' préféré)
  v_new_actor uuid;    -- acteur créé via save_crm_actor
  v_chan_id uuid;      -- canal créé via save_actor_channel
  v_task2_id uuid;     -- tâche rattachée à l'acteur
  v_po_int_id uuid;    -- interaction topique de l'acteur PO (filtres annuaire)
  -- Assignation de tâche (demande PO 2026-06-12) :
  v_assignees jsonb;   -- retour de api.list_crm_assignees()
  v_task3_id uuid;     -- tâche assignée à un autre membre de l'ORG A
  -- Photo acteur + suggestions de contacts (demande PO 2026-06-12) :
  v_email_kind uuid;   -- kind_id 'email' réel (fixture contact_channel établissement)
  v_suggestions jsonb; -- retour de api.list_object_contact_suggestions(objA)
BEGIN
  -- ---------- A. Vocabulaires / renommages (état post-migration ; superuser, RLS bypass) ----------
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'crm_demand_topic_oti') = 0,
         'fusion: il reste des codes sous crm_demand_topic_oti';
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'demand_topic') = 20,
         'fusion: demand_topic doit contenir exactement les 20 sujets OTI';
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'demand_subtopic') = 0,
         'retrait: demand_subtopic doit être vide';
  ASSERT (SELECT count(*) FROM ref_code WHERE domain = 'crm_sentiment') = 6,
         'sentiment: 6 codes attendus';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='crm_interaction' AND column_name='request_sentiment_id'),
         'renommage: request_sentiment_id absent';
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='crm_interaction' AND column_name='request_mood_id'),
         'renommage: request_mood_id ne doit plus exister';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='crm_interaction' AND column_name='response_sentiment_id'),
         'renommage: response_sentiment_id absent';
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='crm_interaction' AND column_name='response_mood_id'),
         'renommage: response_mood_id ne doit plus exister';
  -- FK re-pointées vers ref_code_crm_sentiment (et plus ref_code_mood)
  ASSERT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'crm_interaction_request_sentiment_id_fkey'
                   AND confrelid = 'ref_code_crm_sentiment'::regclass),
         'FK: crm_interaction_request_sentiment_id_fkey doit cibler ref_code_crm_sentiment';
  ASSERT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'crm_interaction_response_sentiment_id_fkey'
                   AND confrelid = 'ref_code_crm_sentiment'::regclass),
         'FK: crm_interaction_response_sentiment_id_fkey doit cibler ref_code_crm_sentiment';
  -- Ancrage acteur-centré : au moins un ancrage requis, contexte objet OPTIONNEL.
  ASSERT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_crm_interaction_anchor'),
         'ancrage: contrainte chk_crm_interaction_anchor absente';
  ASSERT (SELECT c.is_nullable FROM information_schema.columns c
          WHERE c.table_schema='public' AND c.table_name='crm_interaction'
            AND c.column_name='object_id') = 'YES',
         'ancrage: crm_interaction.object_id doit être NULLABLE (contexte objet optionnel)';

  -- ---------- Fixture (superuser, RLS bypass) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant (seeds non appliqués)'; END IF;
  SELECT id INTO v_perm FROM ref_permission WHERE code = 'write_crm_notes' LIMIT 1;
  IF v_perm IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[write_crm_notes] manquant (seeds non appliqués)'; END IF;
  -- Canal de contact : code réel fixture-guardé. 'email' préféré (la value de test est un
  -- e-mail valide pour les triggers de forme/anti-doublon) ; sinon premier code actif.
  SELECT code INTO v_kind_code FROM ref_code_contact_kind
  WHERE is_active ORDER BY (code = 'email') DESC, position NULLS LAST, code LIMIT 1;
  IF v_kind_code IS NULL THEN RAISE EXCEPTION 'fixture: aucun ref_code_contact_kind actif (seeds non appliqués)'; END IF;

  -- users d'abord : le trigger on_auth_user_created_app_user_profile auto-crée le profil ;
  -- l'UPSERT absorbe les lignes créées par le trigger ('tourism_agent' = rôle non-superuser).
  INSERT INTO auth.users (id, email) VALUES
    (v_userA, 'crm_a@test.local'), (v_userB, 'crm_b@test.local'), (v_userC, 'crm_c@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_userA, 'tourism_agent'), (v_userB, 'tourism_agent'), (v_userC, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA, 'ORG', 'ORG A CRM test', 'published'),
    (v_orgB, 'ORG', 'ORG B CRM test', 'published'),
    (v_objA, 'HOT', 'Hôtel CRM test', 'draft'),
    (v_objB, 'HOT', 'Hôtel CRM test B', 'draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_objA, v_orgA, v_pub_role),
    (v_objB, v_orgB, v_pub_role)
    ON CONFLICT DO NOTHING;
  -- Acteurs (modèle acteur-centré) : rôle 'operator' fixture-guardé (normalement seedé par
  -- seeds_data.sql) ; un acteur lié par ORG via actor_object_role.
  SELECT id INTO v_actor_role FROM ref_actor_role WHERE code = 'operator' LIMIT 1;
  IF v_actor_role IS NULL THEN
    v_actor_role := gen_random_uuid();
    INSERT INTO ref_actor_role (id, code, name) VALUES (v_actor_role, 'operator', 'Exploitant');
  END IF;
  INSERT INTO actor (id, display_name, first_name, last_name) VALUES
    (v_actorA, 'Acteur CRM Test A', 'Alice', 'Hoarau'),
    (v_actorB, 'Acteur CRM Test B', 'Bruno', 'Payet')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary) VALUES
    (v_actorA, v_objA, v_actor_role, TRUE),
    (v_actorB, v_objB, v_actor_role, TRUE)
    ON CONFLICT DO NOTHING;
  -- 1 membership actif par user (trigger « 1 tourism_agent = 1 ORG active » respecté)
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA, v_orgA, TRUE), (v_userB, v_orgB, TRUE), (v_userC, v_orgA, TRUE)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at) VALUES
    (v_userA, v_perm, TRUE, v_userA, NOW(), NOW(), NOW())
    ON CONFLICT DO NOTHING;
  -- Contact d'établissement (§03) pour prouver list_object_contact_suggestions (demande PO
  -- 2026-06-12) : 'email' fixture-guardé (sinon premier kind actif, mais l'assertion email est
  -- alors sautée — voir bloc G). value e-mail valide pour les triggers de forme.
  SELECT id INTO v_email_kind FROM ref_code_contact_kind WHERE code = 'email' AND is_active LIMIT 1;
  IF v_email_kind IS NOT NULL THEN
    INSERT INTO contact_channel (object_id, kind_id, value, is_public, is_primary)
    VALUES (v_objA, v_email_kind, 'contact@objA.local', TRUE, TRUE)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ---------- B/C. USER A (membre + permission) : écrit puis lit ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_payload := api.save_crm_interaction(jsonb_build_object(
      'object_id', v_objA, 'interaction_type', 'call', 'body', 'Appel de test',
      'topic_code', 'demande_de_visite', 'sentiment_code', 'positif'));
    v_int_id := (v_payload->>'id')::uuid;
    ASSERT v_int_id IS NOT NULL, 'save_crm_interaction: pas d''id retourné';

    v_payload := api.save_crm_task(jsonb_build_object(
      'object_id', v_objA, 'title', 'Tâche de test', 'priority', 'high'));
    v_task_id := (v_payload->>'id')::uuid;
    ASSERT v_task_id IS NOT NULL, 'save_crm_task: pas d''id retourné';
    v_payload := api.save_crm_task(jsonb_build_object('id', v_task_id, 'status', 'in_progress'));
    ASSERT (v_payload->>'id')::uuid = v_task_id, 'save_crm_task: move de lane échoué';
    ASSERT (SELECT t->>'status' FROM jsonb_array_elements(api.list_crm_tasks()) AS t
            WHERE (t->>'id')::uuid = v_task_id) = 'in_progress',
           'save_crm_task: status non écrit (move de lane)';

    -- ----- Assignation de tâche (demande PO 2026-06-12) -----
    -- list_crm_assignees : le membre se voit lui-même (et userC, même ORG A) dans le select.
    v_assignees := api.list_crm_assignees();
    ASSERT jsonb_array_length(v_assignees) >= 1,
           'list_crm_assignees: au moins un assignataire (le membre lui-même) attendu';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_assignees) e
                   WHERE (e->>'user_id')::uuid = v_userA),
           'list_crm_assignees: le membre courant (userA) doit être assignable';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_assignees) e
                   WHERE (e->>'user_id')::uuid = v_userC),
           'list_crm_assignees: userC (même ORG A) doit être assignable';
    -- Toute entrée porte une étiquette (display_name NULL ⇒ fallback dérivé de l'uuid).
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_assignees) e
                       WHERE NULLIF(e->>'display_name','') IS NULL),
           'list_crm_assignees: chaque assignataire doit porter un display_name (fallback inclus)';
    -- userB (ORG B) n'est PAS assignable depuis A.
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_assignees) e
                       WHERE (e->>'user_id')::uuid = v_userB),
           'list_crm_assignees: userB (ORG B) ne doit PAS être assignable depuis A';

    -- save_crm_task avec owner = userC (autre membre de l'ORG A) : accepté.
    v_payload := api.save_crm_task(jsonb_build_object(
      'object_id', v_objA, 'title', 'Tâche assignée PO', 'owner', v_userC));
    v_task3_id := (v_payload->>'id')::uuid;
    ASSERT v_task3_id IS NOT NULL, 'save_crm_task: assignation à un membre de l''ORG A doit réussir';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_tasks()) AS t
                   WHERE (t->>'id')::uuid = v_task3_id AND t->>'title' = 'Tâche assignée PO'),
           'save_crm_task: la tâche assignée doit apparaître dans list_crm_tasks';
    -- save_crm_task avec owner = userB (membre de l'ORG B, hors ORG A) : refusé 22023.
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_task(jsonb_build_object(
        'object_id', v_objA, 'title', 'Tâche hors-ORG', 'owner', v_userB));
    EXCEPTION WHEN SQLSTATE '22023' THEN v_denied := true;
    END;
    ASSERT v_denied, 'save_crm_task: owner hors de l''ORG du caller doit lever 22023';

    ASSERT jsonb_array_length(api.list_crm_timeline(p_object_id := v_objA)->'items') >= 1,
           'list_crm_timeline: le membre doit lire son interaction';
    -- ----- Timeline filtrée (demande PO 2026-06-12) : statut + période (vocabulaire PO) -----
    -- L'interaction ci-dessus est 'done' (défaut save_crm_interaction) ⇒ done renvoie ≥1.
    ASSERT jsonb_array_length(api.list_crm_timeline(p_object_id := v_objA, p_status := 'done')->'items') >= 1,
           'list_crm_timeline (done): l''interaction done doit remonter';
    ASSERT jsonb_typeof(api.list_crm_timeline(p_object_id := v_objA, p_status := 'active')->'items') = 'array',
           'list_crm_timeline (active=planned): items doit être un tableau (≥0)';
    -- p_from futur ⇒ aucune interaction passée ne remonte.
    ASSERT jsonb_array_length(api.list_crm_timeline(p_object_id := v_objA, p_from := NOW() + interval '1 day')->'items') = 0,
           'list_crm_timeline (p_from futur): aucune interaction passée ne doit remonter';
    ASSERT jsonb_typeof(api.list_crm_timeline(p_object_id := v_objA, p_from := NOW() - interval '1 day')->'items') = 'array',
           'list_crm_timeline (p_from passé): items doit être un tableau';
    -- p_status hors contrat (NULL | active | done) → 22023.
    v_denied := false;
    BEGIN
      PERFORM api.list_crm_timeline(p_object_id := v_objA, p_status := 'bidon');
    EXCEPTION WHEN invalid_parameter_value THEN v_denied := true;
    END;
    ASSERT v_denied, 'list_crm_timeline: p_status invalide doit lever 22023';
    v_payload := api.list_object_crm(v_objA);
    ASSERT jsonb_array_length(v_payload->'interactions') >= 1,
           'list_object_crm: interactions vides pour le membre';
    ASSERT jsonb_array_length(v_payload->'topics') >= 1,
           'list_object_crm: distribution sujets vide';
    -- topic/sentiment résolus par code (et pas perdus en route)
    ASSERT v_payload->'interactions'->0->>'topic_code' = 'demande_de_visite',
           'save_crm_interaction: topic_code non résolu/persisté';
    ASSERT v_payload->'interactions'->0->>'sentiment_code' = 'positif',
           'save_crm_interaction: sentiment_code non résolu/persisté';
    -- Défense en profondeur : le PostgREST direct reste refusé même pour le membre.
    ASSERT (SELECT count(*) FROM crm_interaction WHERE object_id = v_objA) = 0,
           'RLS: un membre ne doit PAS lire crm_interaction en direct (RPC-only)';
    ASSERT (SELECT count(*) FROM crm_task WHERE object_id = v_objA) = 0,
           'RLS: un membre ne doit PAS lire crm_task en direct (RPC-only)';

    -- ----- Acteur-centré : interaction SANS contexte objet (ancrage acteur seul) -----
    v_payload := api.save_crm_interaction(jsonb_build_object(
      'actor_id', v_actorA, 'body', 'Vœux annuels', 'interaction_type', 'note'));
    v_actor_int_id := (v_payload->>'id')::uuid;
    ASSERT v_actor_int_id IS NOT NULL, 'save_crm_interaction (acteur-seul): pas d''id retourné';
    ASSERT (SELECT count(*) FROM crm_interaction WHERE actor_id = v_actorA) = 0,
           'RLS: un membre ne doit PAS lire crm_interaction en direct (acteur-seul inclus)';
    -- Fiche acteur : objets liés + interactions tous contextes (la générale porte object_id NULL).
    v_payload := api.list_actor_crm(v_actorA);
    ASSERT v_payload->'actor'->>'display_name' = 'Acteur CRM Test A',
           'list_actor_crm: identité acteur absente/incorrecte';
    ASSERT jsonb_array_length(v_payload->'objects') = 1
           AND v_payload->'objects'->0->>'object_id' = v_objA
           AND v_payload->'objects'->0->>'role_name' IS NOT NULL,
           'list_actor_crm: le lien actor_object_role vers objA (avec role_name) doit remonter';
    ASSERT jsonb_array_length(v_payload->'interactions') >= 1,
           'list_actor_crm: au moins l''interaction acteur-seul attendue';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload->'interactions') i
                   WHERE (i->>'id')::uuid = v_actor_int_id AND i->'object_id' = 'null'::jsonb),
           'list_actor_crm: l''interaction générale doit porter object_id NULL';
    -- Timeline org-wide : l'interaction acteur-seul remonte via l'arme acteur du périmètre.
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_timeline()->'items') i
                   WHERE (i->>'id')::uuid = v_actor_int_id),
           'list_crm_timeline: l''interaction acteur-seul doit remonter via l''arme acteur';
    -- Annuaire acteur-centré : une ligne par acteur du périmètre, avec volumes et objets liés.
    v_payload := api.list_crm_directory();
    ASSERT jsonb_array_length(v_payload) >= 1,
           'annuaire acteur-centré: au moins une ligne attendue';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload) d
                   WHERE (d->>'actor_id')::uuid = v_actorA
                     AND (d->>'interaction_count')::int >= 1
                     AND jsonb_array_length(d->'objects') >= 1),
           'annuaire acteur-centré: actorA avec interaction_count>=1 et objets liés attendu';
    -- Navigation objet → acteurs liés (clé ''actors'' de list_object_crm).
    v_payload := api.list_object_crm(v_objA);
    ASSERT jsonb_array_length(v_payload->'actors') >= 1,
           'list_object_crm: la clé actors doit lister les acteurs liés';
    ASSERT (v_payload->'actors'->0->>'actor_id')::uuid = v_actorA
           AND v_payload->'actors'->0->>'role_name' IS NOT NULL,
           'list_object_crm: actorA (avec role_name) attendu en tête des acteurs liés';
  RESET ROLE;

  -- ---------- USER C (membre SANS permission) : lit mais n'écrit pas ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userC, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT jsonb_array_length(api.list_crm_timeline(p_object_id := v_objA)->'items') >= 1,
           'lecture: le membre sans permission doit voir la timeline de son ORG';
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_interaction(jsonb_build_object('object_id', v_objA, 'body', 'refusé'));
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'écriture: le membre sans write_crm_notes doit être refusé (42501)';
    v_denied := false;
    BEGIN
      PERFORM api.delete_crm_interaction(v_int_id);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'suppression: le membre sans write_crm_notes doit être refusé (42501)';
    -- Acteur-centré : l'écriture ancrée acteur exige la même permission (arme acteur).
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_interaction(jsonb_build_object('actor_id', v_actorA, 'body', 'refusé'));
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'écriture acteur-seul: le membre sans write_crm_notes doit être refusé (42501)';
  RESET ROLE;

  -- ---------- USER B (autre ORG) : ne lit rien ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT jsonb_array_length(api.list_crm_tasks()) = 0,
           'cross-ORG: l''étranger ne doit voir aucune tâche';
    ASSERT jsonb_array_length(api.list_crm_timeline()->'items') = 0,
           'cross-ORG: l''étranger ne doit voir aucune interaction (timeline org-wide)';
    v_denied := false;
    BEGIN
      PERFORM api.list_object_crm(v_objA);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'cross-ORG: list_object_crm doit refuser l''étranger (42501)';
    -- Acteur-centré : la fiche d'un acteur hors périmètre est refusée ; l'annuaire de B
    -- contient son propre acteur lié (lien sans interaction) mais jamais celui de A.
    v_denied := false;
    BEGIN
      PERFORM api.list_actor_crm(v_actorA);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'cross-ORG: list_actor_crm doit refuser l''étranger (42501)';
    -- Suggestions de contacts : l'étranger ne doit pas pré-remplir l'authoring sous objA.
    v_denied := false;
    BEGIN
      PERFORM api.list_object_contact_suggestions(v_objA);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'cross-ORG: list_object_contact_suggestions doit refuser l''étranger (42501)';
    v_payload := api.list_crm_directory();
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload) d
                   WHERE (d->>'actor_id')::uuid = v_actorB),
           'annuaire: l''acteur lié de l''ORG B doit apparaître (lien sans interaction)';
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload) d
                       WHERE (d->>'actor_id')::uuid = v_actorA),
           'cross-ORG: l''annuaire de B ne doit pas contenir l''acteur de l''ORG A';
  RESET ROLE;

  -- ---------- USER A : suppression autorisée (6e RPC) + cycle de contexte acteur-centré ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_payload := api.delete_crm_interaction(v_int_id);
    ASSERT (v_payload->>'deleted')::boolean, 'delete_crm_interaction: deleted=true attendu';
    -- Suppression de l'interaction acteur-seul : exerce la branche object_id NULL du delete.
    v_payload := api.delete_crm_interaction(v_actor_int_id);
    ASSERT (v_payload->>'deleted')::boolean, 'delete (acteur-seul): deleted=true attendu';
    -- Ajout d'un contexte objet sur une interaction acteur-seul (NULL → valeur) : PERMIS.
    v_payload := api.save_crm_interaction(jsonb_build_object(
      'actor_id', v_actorA, 'body', 'À contextualiser'));
    v_ctx_id := (v_payload->>'id')::uuid;
    v_payload := api.save_crm_interaction(jsonb_build_object('id', v_ctx_id, 'object_id', v_objA));
    ASSERT (v_payload->>'id')::uuid = v_ctx_id, 'contexte: ajout NULL → objet doit réussir';
    ASSERT jsonb_array_length(api.list_object_crm(v_objA)->'interactions') = 1,
           'contexte: l''interaction contextualisée doit apparaître côté objet';
    -- Re-parentage objet → AUTRE objet : toujours refusé (22023).
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_interaction(jsonb_build_object('id', v_ctx_id, 'object_id', v_objB));
    EXCEPTION WHEN invalid_parameter_value THEN v_denied := true;
    END;
    ASSERT v_denied, 're-parentage: objet → autre objet doit rester refusé (22023)';
    v_payload := api.delete_crm_interaction(v_ctx_id);
    ASSERT (v_payload->>'deleted')::boolean, 'delete (contextualisée): deleted=true attendu';
    ASSERT jsonb_array_length(api.list_object_crm(v_objA)->'interactions') = 0,
           'delete_crm_interaction: l''interaction doit avoir disparu';
    ASSERT jsonb_array_length(api.list_actor_crm(v_actorA)->'interactions') = 0,
           'fiche acteur: plus aucune interaction après suppression';
  RESET ROLE;

  -- ---------- E. Rectifs PO (2026-06-11) — USER A : authoring acteur/canaux, tâche-acteur, annuaire filtré ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userA, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- save_crm_actor INSERT : l'acteur entre dans le périmètre PAR son lien objet (rôle
    -- 'operator' par défaut ; non-primaire ici — actorA tient déjà la place primaire).
    v_payload := api.save_crm_actor(jsonb_build_object(
      'display_name', 'Acteur Test PO', 'object_id', v_objA));
    v_new_actor := (v_payload->>'id')::uuid;
    ASSERT v_new_actor IS NOT NULL, 'save_crm_actor: pas d''id retourné';
    -- save_actor_channel INSERT (kind réel fixture-guardé).
    v_payload := api.save_actor_channel(jsonb_build_object(
      'actor_id', v_new_actor, 'kind_code', v_kind_code, 'value', 'test@po.local', 'is_primary', true));
    v_chan_id := (v_payload->>'id')::uuid;
    ASSERT v_chan_id IS NOT NULL, 'save_actor_channel: pas d''id retourné';
    -- Fiche acteur : 5e clé channels + le lien objet créé par save_crm_actor.
    v_payload := api.list_actor_crm(v_new_actor);
    ASSERT jsonb_array_length(v_payload->'channels') >= 1
           AND v_payload->'channels'->0->>'kind_code' = v_kind_code
           AND v_payload->'channels'->0->>'value' = 'test@po.local',
           'list_actor_crm: la clé channels doit lister le canal créé';
    ASSERT jsonb_array_length(v_payload->'objects') >= 1
           AND v_payload->'objects'->0->>'object_id' = v_objA,
           'save_crm_actor: le lien actor_object_role vers objA doit remonter dans objects';
    -- save_crm_actor UPDATE partiel (first_name seul ; display_name intact).
    PERFORM api.save_crm_actor(jsonb_build_object('id', v_new_actor, 'first_name', 'Paul'));
    v_payload := api.list_actor_crm(v_new_actor);
    ASSERT v_payload->'actor'->>'first_name' = 'Paul'
           AND v_payload->'actor'->>'display_name' = 'Acteur Test PO',
           'save_crm_actor: update partiel first_name non persisté (ou display_name écrasé)';
    -- ----- Photo acteur (demande PO 2026-06-12) : set puis effacement clé+vide -----
    PERFORM api.save_crm_actor(jsonb_build_object(
      'id', v_new_actor, 'photo_url', 'https://cdn.local/acteur-po.jpg'));
    ASSERT api.list_actor_crm(v_new_actor)->'actor'->>'photo_url' = 'https://cdn.local/acteur-po.jpg',
           'save_crm_actor: photo_url non persisté';
    PERFORM api.save_crm_actor(jsonb_build_object('id', v_new_actor, 'photo_url', ''));
    ASSERT NULLIF(api.list_actor_crm(v_new_actor)->'actor'->>'photo_url','') IS NULL,
           'save_crm_actor: photo_url vide doit effacer (NULL/absent)';
    -- ----- Suggestions de contacts (demande PO 2026-06-12) : établissement + acteurs liés -----
    v_suggestions := api.list_object_contact_suggestions(v_objA);
    ASSERT jsonb_typeof(v_suggestions) = 'array',
           'list_object_contact_suggestions: doit renvoyer un tableau JSON';
    -- Le contact email de l'établissement (fixture) doit apparaître quand 'email' est seedé.
    IF v_email_kind IS NOT NULL THEN
      ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_suggestions) s
                     WHERE s->>'kind_code' = 'email'
                       AND s->>'value' = 'contact@objA.local'
                       AND s->>'source' = 'établissement'),
             'list_object_contact_suggestions: le contact email de l''établissement doit apparaître';
    END IF;
    -- Tâche rattachée à un acteur : actor_id accepté, actor_name exposé par list_crm_tasks.
    v_payload := api.save_crm_task(jsonb_build_object(
      'object_id', v_objA, 'title', 'Tâche acteur PO', 'actor_id', v_new_actor));
    v_task2_id := (v_payload->>'id')::uuid;
    ASSERT (SELECT t->>'actor_name' FROM jsonb_array_elements(api.list_crm_tasks()) AS t
            WHERE (t->>'id')::uuid = v_task2_id) = 'Acteur Test PO',
           'save_crm_task: actor_name absent de list_crm_tasks (rattachement acteur)';
    -- Annuaire filtré : 1 interaction topique + 1 générale sans sujet → KPI réactifs.
    v_payload := api.save_crm_interaction(jsonb_build_object(
      'actor_id', v_new_actor, 'object_id', v_objA, 'body', 'Visite guidée',
      'topic_code', 'demande_de_visite'));
    v_po_int_id := (v_payload->>'id')::uuid;
    ASSERT v_po_int_id IS NOT NULL, 'fixture E: interaction topique non créée';
    PERFORM api.save_crm_interaction(jsonb_build_object(
      'actor_id', v_new_actor, 'body', 'Sans sujet'));
    -- Sans filtre : les 2 interactions comptent (comportement inchangé).
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory()) d
                   WHERE (d->>'actor_id')::uuid = v_new_actor
                     AND (d->>'interaction_count')::int = 2),
           'annuaire sans filtre: interaction_count=2 attendu pour l''acteur PO';
    -- Filtre sujet correspondant : l'acteur reste, les KPI suivent l'ensemble FILTRÉ.
    v_payload := api.list_crm_directory(p_topic_code := 'demande_de_visite');
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload) d
                   WHERE (d->>'actor_id')::uuid = v_new_actor
                     AND (d->>'interaction_count')::int = 1),
           'annuaire filtré (sujet): acteur PO attendu avec interaction_count=1 (KPI réactifs)';
    -- Les acteurs « lien seul » disparaissent sous filtre (actorA n'a plus d'interaction).
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payload) d
                       WHERE (d->>'actor_id')::uuid = v_actorA),
           'annuaire filtré: les acteurs lien-seul doivent disparaître sous filtre';
    -- Filtre sujet non correspondant : l'acteur disparaît.
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                         api.list_crm_directory(p_topic_code := 'boutique')) d
                       WHERE (d->>'actor_id')::uuid = v_new_actor),
           'annuaire filtré (autre sujet): l''acteur PO ne doit pas apparaître';
    -- Filtre période sans correspondance : l'acteur disparaît aussi.
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                         api.list_crm_directory(p_from := NOW() + interval '1 day')) d
                       WHERE (d->>'actor_id')::uuid = v_new_actor),
           'annuaire filtré (période future): l''acteur PO ne doit pas apparaître';
    -- Statuts : Actives = planned, Traitées = done (les interactions de test sont 'done').
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
                         api.list_crm_directory(p_status := 'active')) d
                       WHERE (d->>'actor_id')::uuid = v_new_actor),
           'annuaire filtré (active=planned): interactions done → acteur absent';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(
                     api.list_crm_directory(p_status := 'done')) d
                   WHERE (d->>'actor_id')::uuid = v_new_actor),
           'annuaire filtré (done): acteur PO présent attendu';
    -- p_status hors contrat (NULL | active | done) → 22023.
    v_denied := false;
    BEGIN
      PERFORM api.list_crm_directory(p_status := 'bidon');
    EXCEPTION WHEN invalid_parameter_value THEN v_denied := true;
    END;
    ASSERT v_denied, 'annuaire filtré: p_status invalide doit lever 22023';
    -- delete_actor_channel : {deleted} + channels redescend à 0.
    v_payload := api.delete_actor_channel(v_chan_id);
    ASSERT (v_payload->>'deleted')::boolean, 'delete_actor_channel: deleted=true attendu';
    ASSERT jsonb_array_length(api.list_actor_crm(v_new_actor)->'channels') = 0,
           'delete_actor_channel: channels doit redescendre à 0';
  RESET ROLE;

  -- ---------- E2. USER C (membre SANS permission) : authoring acteur/canaux refusé ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userC, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_actor(jsonb_build_object('display_name', 'Refusé', 'object_id', v_objA));
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'save_crm_actor: le membre sans write_crm_notes doit être refusé (42501)';
    v_denied := false;
    BEGIN
      PERFORM api.save_actor_channel(jsonb_build_object(
        'actor_id', v_new_actor, 'kind_code', v_kind_code, 'value', 'refus@po.local'));
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'save_actor_channel: le membre sans write_crm_notes doit être refusé (42501)';
  RESET ROLE;

  -- ---------- E3. USER B (autre ORG) : édition de l'acteur de A refusée ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_userB, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_actor(jsonb_build_object('id', v_new_actor, 'first_name', 'Intrus'));
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'cross-ORG: save_crm_actor UPDATE sur l''acteur de A doit être refusé (42501)';
  RESET ROLE;

  RAISE NOTICE 'CRM module §61 + acteur-centré v2 + rectifs PO (photo acteur, suggestions contacts, timeline filtrée) : vocabulaires, ancrages, accès/écriture/cross-ORG, authoring acteur/canaux, annuaire filtré — assertions passées.';
END$$;
ROLLBACK;
