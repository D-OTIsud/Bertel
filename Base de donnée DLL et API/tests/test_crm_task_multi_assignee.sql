-- test_crm_task_multi_assignee.sql
-- Garde permanente du manifeste 16w (migration_crm_task_multi_assignee_notifications.sql) :
-- provenance du créateur, assignation MULTIPLE, notifications persistantes.
--
-- A) STRUCTURE — colonnes/tables/index/FK/CHECK présents ; RLS activée et AUCUN grant
--    anon/authenticated sur les deux tables neuves (l'accès PostgREST direct est fermé).
-- B) BACKFILL — invariant de corpus : toute tâche portant un `owner` porte au moins une
--    ligne d'assignation. Non vacant (le corpus en contient).
-- C) CRÉATION — sans clé d'assignation ⇒ le saisisseur est assigné ET enregistré comme
--    créateur ; avec deux assignés ⇒ les deux sortent, ordonnés PAR NOM (le témoin est
--    construit pour que l'ordre des noms CONTREDISE l'ordre des uuid) ; doublons ⇒ une
--    seule ligne ; `owner` de compatibilité = plus petit uuid de l'ensemble.
-- D) REFUS — assigné hors ORG (22023) ; ensemble explicitement vide (22023) ; `owner`
--    hérité vide (22023).
-- E) NOTIFICATIONS — seuls les ENTRANTS sont notifiés ; l'auteur ne se notifie pas ;
--    un ré-enregistrement à ensemble constant n'en crée aucune ; un changement de statut
--    seul (drag & drop kanban) n'en crée aucune et ne touche pas les assignations ;
--    retirer puis remettre quelqu'un en recrée une. `payload` ne contient AUCUN nom.
-- F) CLOISONNEMENT — list/count ne rendent que la boîte de l'appelant ; marquer lu la
--    notification d'autrui rend 0 ET la laisse non lue ; anon obtient une boîte vide.
-- G) IMMUABILITÉ — `created_by` ne peut pas être réécrit par un payload d'UPDATE.
-- H) NON-RÉGRESSION §66 — interaction liée inconnue / d'un autre établissement toujours
--    refusées ; passer une tâche en `done` ne clôture RIEN en SQL (la clôture reste un
--    geste explicite de l'UI) ; une tâche sans assigné rend `assignees: []`, jamais null.
--
-- Contre une base sans 16w : échec immédiat (bloc A). Auto-contenu + transactionnel.
-- Personas RÉELS par `request.jwt.claims` (jamais `SET ROLE` seul : sans JWT, auth.uid()
-- est NULL et toutes les assertions deviendraient vides — vacuité parfaite, cf. §204).
-- Plage de fixtures dédiée 09xx (08xx = test_crm_module.sql).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA   text := 'ORGRUN9999990901';
  v_orgB   text := 'ORGRUN9999990902';
  v_objA   text := 'HOTRUN9999990911';
  v_objA2  text := 'HOTRUN9999990913';
  v_objB   text := 'HOTRUN9999990912';
  v_userA  uuid := '00000000-0000-4000-a000-000000000901'; -- ORG A, AVEC write_crm_notes (l'auteur)
  v_userB  uuid := '00000000-0000-4000-a000-000000000902'; -- ORG B (hors périmètre d'assignation)
  -- Ordre des uuid : C < D. Ordre des NOMS : « Alice… » (D) < « Zoé… » (C).
  -- Les deux ordres se CONTREDISENT : c'est ce qui rend l'assertion d'ordre non vacante.
  v_userC  uuid := '00000000-0000-4000-a000-000000000903'; -- ORG A, display_name « Zoé … »
  v_userD  uuid := '00000000-0000-4000-a000-000000000904'; -- ORG A, display_name « Alice … »
  v_pub_role uuid;
  v_perm uuid;
  v_payload jsonb;
  v_task jsonb;
  v_tasks jsonb;
  v_inbox jsonb;
  v_t_self uuid;      -- tâche créée sans clé d'assignation
  v_t_multi uuid;     -- tâche à deux assignés
  v_t_dup uuid;       -- tâche créée avec des doublons dans assignee_ids
  v_t_bare uuid;      -- tâche insérée EN DIRECT (comme le trigger incident_report)
  v_int_id uuid;      -- interaction sur objA (lien §66)
  v_int_other uuid;   -- interaction sur objA2 (probe cohérence d'établissement)
  v_notif_c uuid;     -- une notification appartenant à userC
  v_notif_d uuid;     -- une notification appartenant à userD (probe de cloisonnement)
  v_denied boolean;
  v_n int;
  v_before int;
BEGIN
  -- ═══════════════ A. STRUCTURE ═══════════════
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='crm_task' AND column_name='created_by'),
         'A: colonne crm_task.created_by absente (16w non appliquée)';
  ASSERT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='crm_task_created_by_fkey' AND confrelid='auth.users'::regclass
                   AND confdeltype='n'),
         'A: FK crm_task.created_by → auth.users ON DELETE SET NULL absente';
  ASSERT to_regclass('public.crm_task_assignee') IS NOT NULL, 'A: table crm_task_assignee absente';
  ASSERT to_regclass('public.app_notification') IS NOT NULL, 'A: table app_notification absente';
  ASSERT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='crm_task_assignee_pkey' AND conrelid='public.crm_task_assignee'::regclass),
         'A: PK (task_id,user_id) absente sur crm_task_assignee';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname='public' AND indexname='idx_crm_task_assignee_user'),
         'A: index « mes tâches » (user_id en tête) absent';
  ASSERT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_app_notification_kind'),
         'A: CHECK fail-closed sur app_notification.kind absent';
  -- Le CHECK doit réellement refuser une espèce inconnue (sinon il ne garde rien).
  v_denied := false;
  BEGIN
    INSERT INTO auth.users (id, email) VALUES (v_userA, 'crm16w_a@test.local') ON CONFLICT (id) DO NOTHING;
    INSERT INTO app_notification (recipient_id, kind) VALUES (v_userA, 'espece_inventee');
  EXCEPTION WHEN check_violation THEN v_denied := true;
  END;
  ASSERT v_denied, 'A: app_notification.kind doit refuser une espèce non déclarée';

  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.crm_task_assignee'::regclass),
         'A: RLS non activée sur crm_task_assignee';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.app_notification'::regclass),
         'A: RLS non activée sur app_notification';
  -- Aucun grant anon/authenticated : la lecture PostgREST directe est fermée par le GRANT
  -- lui-même, avant même la RLS (double verrou du modèle CRM).
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name IN ('crm_task_assignee','app_notification')
      AND grantee IN ('anon','authenticated','PUBLIC')),
    'A: crm_task_assignee/app_notification ne doivent porter AUCUN grant anon/authenticated';
  -- Les 4 RPCs de notification ne sont pas exécutables par anon.
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema='api'
      AND routine_name IN ('list_my_notifications','count_my_unread_notifications',
                           'mark_notification_read','mark_all_notifications_read')
      AND grantee IN ('anon','PUBLIC')),
    'A: les RPCs de notification ne doivent pas être exécutables par anon/PUBLIC';

  -- ═══════════════ B. BACKFILL (invariant de corpus, non vacant) ═══════════════
  ASSERT (SELECT count(*) FROM crm_task WHERE owner IS NOT NULL) > 0,
         'B: aucune tâche avec owner dans le corpus — l''assertion de backfill serait vacante';
  ASSERT NOT EXISTS (
    SELECT 1 FROM crm_task ct
    WHERE ct.owner IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM crm_task_assignee a WHERE a.task_id = ct.id)),
    'B: une tâche porte un owner sans aucune ligne crm_task_assignee (backfill incomplet)';

  -- ═══════════════ Fixture ═══════════════
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code='publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant'; END IF;
  SELECT id INTO v_perm FROM ref_permission WHERE code='write_crm_notes' LIMIT 1;
  IF v_perm IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[write_crm_notes] manquant'; END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_userA,'crm16w_a@test.local'), (v_userB,'crm16w_b@test.local'),
    (v_userC,'crm16w_c@test.local'), (v_userD,'crm16w_d@test.local')
    ON CONFLICT (id) DO NOTHING;
  -- display_name choisis pour que l'ordre alphabétique CONTREDISE l'ordre des uuid.
  INSERT INTO app_user_profile (id, role, display_name) VALUES
    (v_userA,'tourism_agent','Bernard Auteur'),
    (v_userB,'tourism_agent','Étranger OrgB'),
    (v_userC,'tourism_agent','Zoé Zoralde'),
    (v_userD,'tourism_agent','Alice Ah-Fat')
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, display_name=EXCLUDED.display_name;
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA,'ORG','ORG A 16w','published'), (v_orgB,'ORG','ORG B 16w','published'),
    (v_objA,'HOT','Hôtel 16w A','draft'), (v_objA2,'HOT','Hôtel 16w A2','draft'),
    (v_objB,'HOT','Hôtel 16w B','draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_objA,v_orgA,v_pub_role), (v_objA2,v_orgA,v_pub_role), (v_objB,v_orgB,v_pub_role)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA,v_orgA,TRUE), (v_userB,v_orgB,TRUE), (v_userC,v_orgA,TRUE), (v_userD,v_orgA,TRUE)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
  VALUES (v_userA, v_perm, TRUE, v_userA, NOW(), NOW(), NOW())
    ON CONFLICT DO NOTHING;

  -- Tâche insérée EN DIRECT, comme le fait le trigger api.create_crm_artifacts_from_incident :
  -- ni owner, ni created_by, ni assigné. Le contrat de lecture doit tenir quand même.
  v_t_bare := gen_random_uuid();
  INSERT INTO crm_task (id, object_id, title, status, priority)
  VALUES (v_t_bare, v_objA, 'Tâche née sans assigné (incident)', 'todo', 'medium');

  -- ═══════════════ C/D/E/G — persona AUTEUR (userA) ═══════════════
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

    -- C1. Aucune clé d'assignation ⇒ le saisisseur est assigné, et il est le créateur.
    v_payload := api.save_crm_task(jsonb_build_object('object_id',v_objA,'title','Tâche auto-assignée'));
    v_t_self := (v_payload->>'id')::uuid;
    ASSERT v_t_self IS NOT NULL, 'C1: pas d''id retourné';

    -- C2. Deux assignés — l'ordre attendu est celui des NOMS (Alice=D avant Zoé=C), qui est
    -- l'INVERSE de l'ordre des uuid (C < D) : si le sérialiseur triait par uuid, ce test rougirait.
    v_payload := api.save_crm_task(jsonb_build_object(
      'object_id', v_objA, 'title', 'Tâche à deux',
      'assignee_ids', jsonb_build_array(v_userC::text, v_userD::text)));
    v_t_multi := (v_payload->>'id')::uuid;

    -- C3. Doublons dans l'entrée ⇒ une seule ligne.
    v_payload := api.save_crm_task(jsonb_build_object(
      'object_id', v_objA, 'title', 'Tâche doublons',
      'assignee_ids', jsonb_build_array(v_userC::text, v_userC::text, v_userC::text)));
    v_t_dup := (v_payload->>'id')::uuid;

    -- D1. Assigné hors de l'ORG de l'appelant.
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_task(jsonb_build_object(
        'object_id', v_objA, 'title', 'Hors ORG',
        'assignee_ids', jsonb_build_array(v_userB::text)));
    EXCEPTION WHEN invalid_parameter_value THEN v_denied := true;
    END;
    ASSERT v_denied, 'D1: un assigné hors ORG doit être refusé (22023)';

    -- D2. Ensemble explicitement vide : refus, jamais « pas de changement ».
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_task(jsonb_build_object(
        'object_id', v_objA, 'title', 'Vide', 'assignee_ids', '[]'::jsonb));
    EXCEPTION WHEN invalid_parameter_value THEN v_denied := true;
    END;
    ASSERT v_denied, 'D2: un ensemble d''assignation vide doit être refusé (22023)';

    -- D3. Même refus par le contrat hérité `owner` vide.
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_task(jsonb_build_object(
        'object_id', v_objA, 'title', 'Owner vide', 'owner', ''));
    EXCEPTION WHEN invalid_parameter_value THEN v_denied := true;
    END;
    ASSERT v_denied, 'D3: `owner` présent mais vide doit être refusé (22023)';

    -- D4. Une entrée qui n'est pas un tableau, et un élément qui n'est pas un uuid.
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_task(jsonb_build_object(
        'object_id', v_objA, 'title', 'Pas un tableau', 'assignee_ids', to_jsonb(v_userC::text)));
    EXCEPTION WHEN invalid_parameter_value THEN v_denied := true;
    END;
    ASSERT v_denied, 'D4a: assignee_ids non-tableau doit être refusé (22023)';
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_task(jsonb_build_object(
        'object_id', v_objA, 'title', 'Pas un uuid', 'assignee_ids', jsonb_build_array('pas-un-uuid')));
    EXCEPTION WHEN invalid_parameter_value THEN v_denied := true;
    END;
    ASSERT v_denied, 'D4b: un élément non-uuid doit être refusé (22023)';

    -- H1. Non-régression §66 : interaction liée inconnue / d'un autre établissement.
    -- statut OUVERT explicite : sans lui l'interaction naît déjà « done » et l'assertion H3
    -- (« terminer la tâche ne clôture pas l'interaction ») serait vraie sans rien prouver.
    v_payload := api.save_crm_interaction(jsonb_build_object(
      'object_id', v_objA, 'interaction_type','call','body','Appel 16w','status','planned'));
    v_int_id := (v_payload->>'id')::uuid;
    v_payload := api.save_crm_interaction(jsonb_build_object(
      'object_id', v_objA2, 'interaction_type','call','body','Appel 16w autre objet'));
    v_int_other := (v_payload->>'id')::uuid;
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_task(jsonb_build_object(
        'object_id', v_objA, 'title','Lien inconnu',
        'related_interaction_id', gen_random_uuid()::text));
    EXCEPTION WHEN no_data_found THEN v_denied := true;
    END;
    ASSERT v_denied, 'H1a: interaction liée inconnue doit être refusée (P0002)';
    v_denied := false;
    BEGIN
      PERFORM api.save_crm_task(jsonb_build_object(
        'object_id', v_objA, 'title','Lien cross-objet',
        'related_interaction_id', v_int_other::text));
    EXCEPTION WHEN invalid_parameter_value THEN v_denied := true;
    END;
    ASSERT v_denied, 'H1b: interaction liée d''un autre établissement doit être refusée (22023)';

  RESET ROLE;

  -- ═══════════════ Vérifications d'état (superuser, lecture directe) ═══════════════
  -- NB : toute lecture directe de table doit se faire ICI, hors persona — sous
  -- `SET LOCAL ROLE authenticated` la RLS rendrait 0 ligne (crm_*) ou une erreur de
  -- permission (les deux tables 16w n'ont AUCUN grant), et l'assertion serait vide.
  --
  -- H3 (prémisse) : l'interaction témoin est bien OUVERTE avant qu'on termine la tâche.
  -- Sans cette prémisse, « elle n'est pas done à la fin » serait vrai sans rien prouver
  -- (le défaut de save_crm_interaction est justement 'done').
  ASSERT (SELECT status::text FROM crm_interaction WHERE id=v_int_id) = 'planned',
         'H3 (prémisse): l''interaction témoin doit être OUVERTE avant la probe';

  -- C1 — auto-assignation + provenance.
  ASSERT (SELECT count(*) FROM crm_task_assignee WHERE task_id=v_t_self) = 1,
         'C1: la tâche sans clé d''assignation doit avoir exactement 1 assigné';
  ASSERT EXISTS (SELECT 1 FROM crm_task_assignee WHERE task_id=v_t_self AND user_id=v_userA),
         'C1: le saisisseur doit être l''assigné';
  ASSERT (SELECT created_by FROM crm_task WHERE id=v_t_self) = v_userA,
         'C1: created_by doit être le saisisseur';
  ASSERT (SELECT assigned_by FROM crm_task_assignee WHERE task_id=v_t_self AND user_id=v_userA) = v_userA,
         'C1: assigned_by doit être le saisisseur';
  -- E1 — on ne se notifie JAMAIS de sa propre auto-assignation.
  ASSERT (SELECT count(*) FROM app_notification WHERE task_id=v_t_self) = 0,
         'E1: l''auto-assignation ne doit créer AUCUNE notification';

  -- C3 — doublons repliés.
  ASSERT (SELECT count(*) FROM crm_task_assignee WHERE task_id=v_t_dup) = 1,
         'C3: des uuid dupliqués doivent produire une seule ligne d''assignation';

  -- C4 — `owner` de compatibilité = plus petit uuid de l'ensemble (déterministe).
  ASSERT (SELECT owner FROM crm_task WHERE id=v_t_multi) = LEAST(v_userC, v_userD),
         'C4: crm_task.owner de compatibilité doit être le plus petit uuid de l''ensemble';

  -- E2 — création à deux : une notification par assigné, l'auteur exclu, payload SANS nom.
  ASSERT (SELECT count(*) FROM app_notification WHERE task_id=v_t_multi) = 2,
         'E2: 2 notifications attendues (userC + userD)';
  ASSERT (SELECT count(*) FROM app_notification WHERE task_id=v_t_multi AND recipient_id=v_userA) = 0,
         'E2: l''auteur ne doit jamais se notifier lui-même';
  ASSERT (SELECT bool_and(payload = '{}'::jsonb) FROM app_notification WHERE task_id=v_t_multi),
         'E2: payload doit rester vide — aucun nom de personne n''y est recopié (portée RGPD)';
  ASSERT (SELECT bool_and(created_by = v_userA) FROM app_notification WHERE task_id=v_t_multi),
         'E2: created_by de la notification doit être l''auteur de l''action';

  SELECT id INTO v_notif_c FROM app_notification WHERE task_id=v_t_multi AND recipient_id=v_userC;
  SELECT id INTO v_notif_d FROM app_notification WHERE task_id=v_t_multi AND recipient_id=v_userD;
  ASSERT v_notif_c IS NOT NULL AND v_notif_d IS NOT NULL, 'E2: notifications témoins introuvables';

  -- ═══════════════ E/G — ré-enregistrements (persona auteur) ═══════════════
  -- Sentinelle de provenance : une date d'assignation VOLONTAIREMENT ancienne. `now()` est
  -- figé pour toute la transaction, donc comparer à `now()` ne distinguerait RIEN — un
  -- delete-all + re-insert produirait exactement la même valeur. Seule une valeur écrite à
  -- la main peut prouver que la ligne inchangée a bien SURVÉCU au ré-enregistrement.
  UPDATE crm_task_assignee SET assigned_at = TIMESTAMPTZ '2001-01-01 00:00:00+00',
                               assigned_by = v_userD
   WHERE task_id = v_t_multi AND user_id = v_userC;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

    -- E3. Ré-enregistrement à ensemble CONSTANT ⇒ aucune notification de plus.
    PERFORM api.save_crm_task(jsonb_build_object(
      'id', v_t_multi::text, 'title', 'Tâche à deux (titre modifié)',
      'assignee_ids', jsonb_build_array(v_userD::text, v_userC::text)));

    -- E4. Changement de STATUT seul (drag & drop kanban) ⇒ assignations intactes, 0 notif.
    PERFORM api.save_crm_task(jsonb_build_object('id', v_t_multi::text, 'status', 'in_progress'));

    -- G. `created_by` est immuable : un payload qui porte la clé ne doit rien changer.
    PERFORM api.save_crm_task(jsonb_build_object(
      'id', v_t_multi::text, 'created_by', v_userC::text, 'title', 'Tâche à deux'));

  RESET ROLE;

  ASSERT (SELECT count(*) FROM app_notification WHERE task_id=v_t_multi) = 2,
         'E3/E4: un ré-enregistrement à ensemble constant, un changement de statut ou un '
         'payload created_by ne doivent créer AUCUNE notification supplémentaire';
  ASSERT (SELECT count(*) FROM crm_task_assignee WHERE task_id=v_t_multi) = 2,
         'E4: un changement de statut seul ne doit pas toucher les assignations';
  ASSERT (SELECT created_by FROM crm_task WHERE id=v_t_multi) = v_userA,
         'G: created_by ne doit pas être modifiable par un payload d''UPDATE';
  -- L'assignation inchangée conserve sa provenance : un ré-enregistrement ne réécrit pas
  -- l'historique (c'est exactement ce qu'un delete-all + re-insert détruirait en silence).
  ASSERT (SELECT assigned_at FROM crm_task_assignee WHERE task_id=v_t_multi AND user_id=v_userC)
         = TIMESTAMPTZ '2001-01-01 00:00:00+00',
         'E3: assigned_at d''un assigné INCHANGÉ doit survivre au ré-enregistrement '
         '(un delete-all + re-insert l''écraserait)';
  ASSERT (SELECT assigned_by FROM crm_task_assignee WHERE task_id=v_t_multi AND user_id=v_userC)
         = v_userD,
         'E3: assigned_by d''un assigné inchangé doit survivre au ré-enregistrement';

  -- ═══════════════ E5/E6 — retrait puis remise ═══════════════
  SELECT count(*) INTO v_before FROM app_notification WHERE task_id=v_t_multi;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- On retire userC (il ne reste que userD) : aucune notification n'est due pour un retrait.
    PERFORM api.save_crm_task(jsonb_build_object(
      'id', v_t_multi::text, 'assignee_ids', jsonb_build_array(v_userD::text)));
  RESET ROLE;
  ASSERT (SELECT count(*) FROM crm_task_assignee WHERE task_id=v_t_multi) = 1,
         'E5: le retrait d''un assigné doit supprimer sa ligne';
  ASSERT NOT EXISTS (SELECT 1 FROM crm_task_assignee WHERE task_id=v_t_multi AND user_id=v_userC),
         'E5: userC doit avoir été retiré';
  ASSERT (SELECT count(*) FROM app_notification WHERE task_id=v_t_multi) = v_before,
         'E5: un retrait ne crée aucune notification';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- On le remet : c'est un ENTRANT, donc une nouvelle notification est due.
    PERFORM api.save_crm_task(jsonb_build_object(
      'id', v_t_multi::text, 'assignee_ids', jsonb_build_array(v_userD::text, v_userC::text)));
  RESET ROLE;
  ASSERT (SELECT count(*) FROM app_notification WHERE task_id=v_t_multi AND recipient_id=v_userC) = 2,
         'E6: remettre quelqu''un qui avait été retiré doit créer une NOUVELLE notification';
  ASSERT (SELECT count(*) FROM app_notification WHERE task_id=v_t_multi AND recipient_id=v_userD) = 1,
         'E6: userD, jamais retiré, ne doit pas avoir été re-notifié';

  -- ═══════════════ C2/H2 — forme de lecture (persona auteur) ═══════════════
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_tasks := api.list_crm_tasks();
    SELECT t INTO v_task FROM jsonb_array_elements(v_tasks) t
     WHERE (t->>'id')::uuid = v_t_multi;
    ASSERT v_task IS NOT NULL, 'C2: la tâche à deux n''est pas dans list_crm_tasks';
    ASSERT jsonb_array_length(v_task->'assignees') = 2, 'C2: 2 assignés attendus dans la lecture';
    -- Ordre PAR NOM : Alice Ah-Fat (userD) avant Zoé Zoralde (userC), à l'inverse des uuid.
    ASSERT (v_task->'assignees'->0->>'user_id')::uuid = v_userD,
           'C2: assignees doit être trié par nom affiché (Alice avant Zoé), pas par uuid';
    ASSERT (v_task->'assignees'->1->>'user_id')::uuid = v_userC,
           'C2: second assigné inattendu';
    ASSERT v_task->'assignees'->0->>'display_name' = 'Alice Ah-Fat',
           'C2: display_name du premier assigné inattendu';
    ASSERT (v_task->>'created_by_id')::uuid = v_userA, 'C2: created_by_id absent de la lecture';
    ASSERT v_task->>'created_by_name' = 'Bernard Auteur', 'C2: created_by_name absent de la lecture';

    -- H2. Une tâche née sans assigné rend un tableau VIDE, jamais null, et un créateur null.
    SELECT t INTO v_task FROM jsonb_array_elements(v_tasks) t WHERE (t->>'id')::uuid = v_t_bare;
    ASSERT v_task IS NOT NULL, 'H2: la tâche sans assigné doit rester listée';
    ASSERT jsonb_typeof(v_task->'assignees') = 'array' AND jsonb_array_length(v_task->'assignees') = 0,
           'H2: assignees doit valoir [] (jamais null) pour une tâche sans assigné';
    ASSERT v_task->>'created_by_id' IS NULL, 'H2: created_by_id doit rester null (créateur inconnu)';
    ASSERT v_task->>'created_by_name' IS NULL,
           'H2: created_by_name doit rester null — l''UI dit « Créateur inconnu », elle ne devine pas';

    -- Le même contrat de tâche sort de list_object_crm (une seule forme dans l'API).
    SELECT t INTO v_task
      FROM jsonb_array_elements(api.list_object_crm(v_objA)->'tasks') t
     WHERE (t->>'id')::uuid = v_t_multi;
    ASSERT v_task IS NOT NULL, 'C2: la tâche est absente de list_object_crm';
    ASSERT jsonb_array_length(v_task->'assignees') = 2,
           'C2: list_object_crm doit porter le MÊME contrat assignees que list_crm_tasks';
    ASSERT (v_task->>'created_by_id')::uuid = v_userA,
           'C2: list_object_crm doit porter created_by_id';

    -- H3. Passer une tâche en `done` ne clôture RIEN côté SQL : la clôture de l'interaction
    -- liée reste un geste explicite de l'UI (jamais un effet de bord du save).
    PERFORM api.save_crm_task(jsonb_build_object(
      'id', v_t_self::text, 'related_interaction_id', v_int_id::text));
    PERFORM api.save_crm_task(jsonb_build_object('id', v_t_self::text, 'status', 'done'));
  RESET ROLE;
  ASSERT (SELECT status::text FROM crm_interaction WHERE id=v_int_id) = 'planned',
         'H3: terminer une tâche liée ne doit JAMAIS toucher au statut de l''interaction '
         '(la clôture reste un geste explicite de l''UI, jamais un effet de bord du save)';
  ASSERT (SELECT related_interaction_id FROM crm_task WHERE id=v_t_self) = v_int_id,
         'H3 (prémisse): le lien tâche→interaction doit bien avoir été posé';

  -- ═══════════════ F. CLOISONNEMENT DES NOTIFICATIONS ═══════════════
  -- userC lit SA boîte (il n'a pas write_crm_notes : lire ses notifications n'en dépend pas).
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userC,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_inbox := api.list_my_notifications(50);
    ASSERT jsonb_array_length(v_inbox->'items') >= 2, 'F1: userC doit voir ses 2 notifications';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_inbox->'items') e
                   WHERE (e->>'id')::uuid = v_notif_c),
           'F1: sa propre notification doit être là (assertion non vacante)';
    -- Cloisonnement : la notification de userD, née du MÊME save, n'y est pas.
    ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_inbox->'items') e
                       WHERE (e->>'id')::uuid = v_notif_d),
           'F1: la boîte de userC ne doit contenir AUCUNE notification de userD';
    -- Une tentative de lire la table en direct sous l'identité de l'appelant doit échouer :
    -- c'est le second verrou (aucun grant), indépendant de la RLS.
    v_denied := false;
    BEGIN
      PERFORM 1 FROM app_notification LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'F1: app_notification ne doit pas être lisible en direct par authenticated';
    v_denied := false;
    BEGIN
      PERFORM 1 FROM crm_task_assignee LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied, 'F1: crm_task_assignee ne doit pas être lisible en direct par authenticated';
    -- Le libellé du créateur est JOINT à la lecture (jamais stocké dans payload).
    ASSERT (v_inbox->'items'->0->>'created_by_name') = 'Bernard Auteur',
           'F1: created_by_name doit être joint à la lecture';
    ASSERT (v_inbox->'items'->0->>'task_title') IS NOT NULL,
           'F1: le titre de la tâche doit être joint à la lecture';
    ASSERT (v_inbox->>'unread_count')::int = api.count_my_unread_notifications(),
           'F1: unread_count de la liste et le compteur dédié doivent concorder';
    -- Le plus récent d'abord.
    ASSERT (v_inbox->'items'->0->>'created_at')::timestamptz
           >= (v_inbox->'items'->1->>'created_at')::timestamptz,
           'F1: la boîte doit être triée du plus récent au plus ancien';
  RESET ROLE;

  -- userD ne voit pas la boîte de userC.
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userD,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(api.list_my_notifications(50)->'items') e
      WHERE (e->>'id')::uuid = v_notif_c),
      'F2: userD ne doit pas voir la notification de userC';
    -- Marquer lue la notification d'autrui : 0 mis à jour, et elle reste non lue.
    ASSERT (api.mark_notification_read(v_notif_c)->>'updated')::int = 0,
           'F2: marquer lue la notification d''autrui doit rendre 0';
    -- Un id inexistant rend exactement la même chose : aucune sonde d'existence.
    ASSERT (api.mark_notification_read(gen_random_uuid())->>'updated')::int = 0,
           'F2: un id inconnu doit rendre 0, comme un id d''autrui';
  RESET ROLE;
  ASSERT (SELECT read_at FROM app_notification WHERE id=v_notif_c) IS NULL,
         'F2: la notification de userC doit être restée NON LUE';

  -- userC marque la sienne : 1 mise à jour, puis le compteur baisse ; re-marquer rend 0.
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userC,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_n := api.count_my_unread_notifications();
    ASSERT (api.mark_notification_read(v_notif_c)->>'updated')::int = 1,
           'F3: le destinataire doit pouvoir marquer sa notification lue';
    ASSERT api.count_my_unread_notifications() = v_n - 1,
           'F3: le compteur de non-lues doit décroître de 1';
    ASSERT (api.mark_notification_read(v_notif_c)->>'updated')::int = 0,
           'F3: re-marquer une notification déjà lue doit rendre 0 (idempotent)';
    ASSERT (api.mark_all_notifications_read()->>'updated')::int = v_n - 1,
           'F3: mark_all doit marquer exactement le reste des non-lues';
    ASSERT api.count_my_unread_notifications() = 0, 'F3: plus aucune non-lue après mark_all';
  RESET ROLE;
  -- mark_all n'a touché QUE la boîte de userC.
  ASSERT (SELECT count(*) FROM app_notification WHERE recipient_id=v_userD AND read_at IS NULL) >= 1,
         'F3: mark_all ne doit toucher que la boîte de l''appelant';

  -- Anon : boîte vide, compteur nul (aucune erreur, aucune fuite).
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT jsonb_array_length(api.list_my_notifications(50)->'items') = 0,
           'F4: sans identité, la boîte doit être vide';
    ASSERT api.count_my_unread_notifications() = 0, 'F4: sans identité, 0 non-lue';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  RAISE NOTICE '16w CRM tâches (créateur immuable, assignation multiple, notifications persistantes) : assertions passées.';
END$$;
ROLLBACK;
