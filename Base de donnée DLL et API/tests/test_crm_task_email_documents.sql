-- test_crm_task_email_documents.sql
-- Garde permanente du manifeste 17i (migration_crm_task_email_documents.sql) :
-- outbox e-mail d'assignation, prédicat d'écriture de tâche, pièces jointes de tâche.
--
-- A) STRUCTURE — colonnes d'outbox, table crm_task_document (RLS ON, AUCUN grant
--    anon/authenticated), les trois fonctions neuves ; §204 sur les quatre fonctions
--    exposées, avec une prémisse de NON-VACUITÉ (service_role doit s'y voir, sans quoi
--    les `NOT EXISTS` seraient vrais parce que la vue est vide, pas parce que le REVOKE
--    a pris).
-- B) OUTBOX — le drain rend LA ligne en attente avec tout le contenu du message dérivé
--    en DB ; la FENÊTRE de réclamation est éprouvée dans les deux sens (5 min : encore
--    réclamée ; 11 min : re-réclamable) parce que `now()` est FIGÉ sur la transaction —
--    un re-claim immédiat resterait vide même avec un TTL de zéro, et une garde qui ne
--    testerait que lui ne prouverait AUCUNE durée ; l'acquittement en succès est
--    définitif (un second passage ne réécrit rien), l'acquittement en échec lève le
--    claim et rend la ligne immédiatement re-réclamable ; un destinataire sans e-mail
--    est TERMINÉ sur place, jamais rendu — sinon il boucle claim/échec à l'infini ;
--    les deux RPC sont fermés à `authenticated`.
-- C) PRÉDICAT — user_can_write_crm_task porte la MÊME règle que save_crm_task ; la
--    tâche inconnue rend false SOUS UNE PERSONA QUI PEUT ÉCRIRE (sous une persona sans
--    droit, false ne prouverait rien).
-- D) DOCUMENTS — list_crm_tasks émet documents[] ; `id` est le document_id ; une tâche
--    sans pièce jointe porte la clé ET `[]`, jamais null. Et le contrat 16z
--    (assignees[], created_by_id) SURVIT au redéploiement de la fonction — c'est le
--    risque propre à 17i, qui REDÉPLOIE list_crm_tasks.
--
-- Contre une base sans 17i : échec immédiat (bloc A). Auto-contenu + transactionnel.
-- Personas RÉELS par `request.jwt.claims` (jamais `SET ROLE` seul : sans JWT, auth.uid()
-- est NULL et toutes les assertions deviendraient vides — vacuité parfaite, cf. §204).
-- Plage de fixtures dédiée 092x (09xx = test_crm_task_multi_assignee.sql, 08xx =
-- test_crm_module.sql) : un fichier de test, une plage.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_orgA   text := 'ORGRUN9999990921';
  v_orgB   text := 'ORGRUN9999990922';
  v_objA   text := 'HOTRUN9999990921';
  v_objB   text := 'HOTRUN9999990922';
  v_userA  uuid := '00000000-0000-4000-a000-000000000921'; -- ORG A, write_crm_notes (l'auteur)
  v_userB  uuid := '00000000-0000-4000-a000-000000000922'; -- ORG B (hors périmètre CRM de A)
  v_userC  uuid := '00000000-0000-4000-a000-000000000923'; -- ORG A, premier assigné
  v_userD  uuid := '00000000-0000-4000-a000-000000000924'; -- ORG A, second assigné (perdra son e-mail en B5)
  v_pub_role uuid;
  v_perm   uuid;
  v_payload jsonb;
  v_rows   jsonb;      -- retour du drain
  v_tasks  jsonb;
  v_task   jsonb;
  v_t      uuid;       -- tâche témoin, assignée puis porteuse d'une pièce jointe
  v_t_nodoc uuid;      -- tâche témoin SANS pièce jointe (D2)
  v_notif  uuid;       -- notification de userC
  v_notif_d uuid;      -- notification de userD
  v_doc    uuid;       -- ref_document de la pièce jointe
  v_denied boolean;
  v_n      int;
BEGIN
  -- ═══════════════ A. STRUCTURE ═══════════════
  ASSERT (SELECT count(*) FROM information_schema.columns
          WHERE table_schema='public' AND table_name='app_notification'
            AND column_name IN ('email_claimed_at','email_sent_at','email_error')) = 3,
    'A1: colonnes outbox manquantes';
  ASSERT to_regclass('public.crm_task_document') IS NOT NULL, 'A2: crm_task_document absente';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.crm_task_document'::regclass),
    'A3: RLS OFF sur crm_task_document';
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='crm_task_document'
      AND grantee IN ('anon','authenticated')),
    'A4: grant anon/authenticated interdit sur crm_task_document';
  -- Prémisse de A4 : la vue doit bien montrer les droits de cette table, sinon le
  -- `NOT EXISTS` ci-dessus est vrai par vacuité et ne garde plus rien.
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='crm_task_document' AND grantee='service_role'),
    'A4 (prémisse): service_role doit apparaître dans role_table_grants — sinon A4 est vacante';
  ASSERT to_regprocedure('api.claim_unmailed_notifications(integer)') IS NOT NULL, 'A5';
  ASSERT to_regprocedure('api.mark_notifications_emailed(uuid[],jsonb)') IS NOT NULL, 'A6';
  ASSERT to_regprocedure('api.user_can_write_crm_task(uuid)') IS NOT NULL, 'A7';

  -- §204 sur les fonctions exposées. Les deux RPC d'outbox sont réservés au drain
  -- service_role : un navigateur ne doit pas pouvoir vider la file ni lire des adresses
  -- e-mail. user_can_write_crm_task est appelable par authenticated (c'est le gate des
  -- routes) mais jamais par anon. list_crm_tasks est REDÉPLOYÉE ici : ses droits doivent
  -- survivre au remplacement.
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema='api'
      AND routine_name IN ('claim_unmailed_notifications','mark_notifications_emailed')
      AND grantee IN ('anon','authenticated','PUBLIC')),
    'A8: les RPC d''outbox ne doivent être exécutables NI par anon NI par authenticated';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema='api' AND routine_name='claim_unmailed_notifications'
      AND grantee='service_role'),
    'A8 (prémisse): service_role doit apparaître dans role_routine_grants — sinon A8 est vacante';
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema='api'
      AND routine_name IN ('user_can_write_crm_task','list_crm_tasks')
      AND grantee IN ('anon','PUBLIC')),
    'A9: user_can_write_crm_task / list_crm_tasks ne doivent pas être exécutables par anon/PUBLIC (§204)';

  -- ═══════════════ Fixture ═══════════════
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code='publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant'; END IF;
  SELECT id INTO v_perm FROM ref_permission WHERE code='write_crm_notes' LIMIT 1;
  IF v_perm IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[write_crm_notes] manquant'; END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_userA,'crm17i_a@test.local'), (v_userB,'crm17i_b@test.local'),
    (v_userC,'crm17i_c@test.local'), (v_userD,'crm17i_d@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role, display_name) VALUES
    (v_userA,'tourism_agent','Bernard Auteur'),
    (v_userB,'tourism_agent','Étranger OrgB'),
    (v_userC,'tourism_agent','Zoé Zoralde'),
    (v_userD,'tourism_agent','Alice Ah-Fat')
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, display_name=EXCLUDED.display_name;
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA,'ORG','ORG A 17i','published'), (v_orgB,'ORG','ORG B 17i','published'),
    (v_objA,'HOT','Hôtel 17i A','draft'), (v_objB,'HOT','Hôtel 17i B','draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_objA,v_orgA,v_pub_role), (v_objB,v_orgB,v_pub_role)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA,v_orgA,TRUE), (v_userB,v_orgB,TRUE), (v_userC,v_orgA,TRUE), (v_userD,v_orgA,TRUE)
    ON CONFLICT DO NOTHING;
  -- userC et userD reçoivent AUSSI `write_crm_notes` : depuis 17c, un assigné doit pouvoir
  -- agir dans le CRM (on ne notifie personne pour un écran auquel il serait redirigé).
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
  VALUES (v_userA, v_perm, TRUE, v_userA, NOW(), NOW(), NOW()),
         (v_userC, v_perm, TRUE, v_userA, NOW(), NOW(), NOW()),
         (v_userD, v_perm, TRUE, v_userA, NOW(), NOW(), NOW())
    ON CONFLICT DO NOTHING;

  -- ═══════════════ B. OUTBOX E-MAIL ═══════════════
  -- Le drain réclame la FILE, pas les seules lignes de ce test : sur une base vivante les
  -- notifications déjà présentes rempliraient la fenêtre de claim et les assertions de
  -- cardinalité ci-dessous seraient fausses sans qu'aucune règle soit en cause. On termine
  -- donc le corpus AVANT de fabriquer les témoins (tout est annulé au ROLLBACK).
  UPDATE app_notification SET email_sent_at = now(), email_error = 'fixture_17i_corpus'
   WHERE kind = 'crm_task_assigned' AND email_sent_at IS NULL;
  ASSERT (SELECT count(*) FROM app_notification
           WHERE kind='crm_task_assigned' AND email_sent_at IS NULL) = 0,
    'B (prémisse): la file doit être vide avant de fabriquer les témoins';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- Tâche assignée à userC ⇒ UNE notification (l'auteur ne se notifie pas lui-même).
    v_payload := api.save_crm_task(jsonb_build_object(
      'object_id', v_objA, 'title', 'Tâche 17i à e-mailer',
      'due_at', '2030-01-15T09:00:00+00',
      'assignee_ids', jsonb_build_array(v_userC::text)));
    v_t := (v_payload->>'id')::uuid;
    -- Tâche auto-assignée : témoin « sans pièce jointe » de D2, et AUCUNE notification.
    v_payload := api.save_crm_task(jsonb_build_object(
      'object_id', v_objA, 'title', 'Tâche 17i sans pièce jointe'));
    v_t_nodoc := (v_payload->>'id')::uuid;
  RESET ROLE;

  -- Lectures directes HORS persona : sous `authenticated`, app_notification ne porte aucun
  -- grant et la lecture lèverait « permission denied » (l'assertion serait vide).
  ASSERT (SELECT count(*) FROM app_notification
           WHERE kind='crm_task_assigned' AND email_sent_at IS NULL) = 1,
    'B (prémisse): exactement 1 notification en attente doit avoir été créée';
  SELECT id INTO v_notif FROM app_notification WHERE task_id = v_t AND recipient_id = v_userC;
  ASSERT v_notif IS NOT NULL, 'B (prémisse): la notification témoin de userC est introuvable';

  -- B1. Le drain rend LA ligne, avec TOUT le contenu du message dérivé en DB.
  v_rows := api.claim_unmailed_notifications(20);
  ASSERT jsonb_array_length(v_rows) = 1,
    'B1: le drain doit rendre exactement la ligne en attente';
  ASSERT (v_rows->0->>'notification_id')::uuid = v_notif,
    'B1: le drain doit rendre LA notification témoin';
  ASSERT v_rows->0->>'recipient_email' = 'crm17i_c@test.local',
    'B1: l''adresse du destinataire doit être jointe depuis auth.users';
  ASSERT v_rows->0->>'recipient_name' = 'Zoé Zoralde',
    'B1: le nom du destinataire doit être JOINT à la lecture (jamais stocké : portée RGPD)';
  ASSERT v_rows->0->>'task_title' = 'Tâche 17i à e-mailer', 'B1: task_title inattendu';
  ASSERT v_rows->0->>'object_name' = 'Hôtel 17i A', 'B1: object_name inattendu';
  ASSERT v_rows->0->>'assigner_name' = 'Bernard Auteur', 'B1: assigner_name inattendu';
  ASSERT (v_rows->0->>'due_at')::timestamptz = TIMESTAMPTZ '2030-01-15T09:00:00+00',
    'B1: due_at doit être rendu tel qu''il a été saisi';
  ASSERT (SELECT email_claimed_at FROM app_notification WHERE id=v_notif) IS NOT NULL,
    'B1: la réclamation doit être stampée sur la ligne';

  -- B2. LA FENÊTRE de réclamation, dans les deux sens.
  -- B2a. Re-claim immédiat : la ligne est réclamée.
  ASSERT jsonb_array_length(api.claim_unmailed_notifications(20)) = 0,
    'B2a: une ligne fraîchement réclamée ne doit pas être re-rendue';
  -- B2b. Réclamation vieille de 5 min : TOUJOURS dans la fenêtre de 10 min.
  -- C'est CETTE assertion qui éprouve la DURÉE. B2a seule n'en prouve aucune : `now()` est
  -- figé sur toute la transaction, donc « claimed_at < now() - 0 » est faux même avec un
  -- TTL de zéro. Ramener l'intervalle à 0 doit faire rougir ICI.
  UPDATE app_notification SET email_claimed_at = now() - interval '5 minutes' WHERE id = v_notif;
  ASSERT jsonb_array_length(api.claim_unmailed_notifications(20)) = 0,
    'B2b: une réclamation de 5 minutes est encore valide (TTL 10 min) — la ligne ne doit '
    'pas être re-rendue, sinon deux drains successifs enverraient deux fois le même e-mail';
  -- B2c. Réclamation vieille de 11 min : la fenêtre est écoulée. Sans B2c, B2b passerait
  -- aussi sur un drain qui ne rendrait JAMAIS rien.
  UPDATE app_notification SET email_claimed_at = now() - interval '11 minutes' WHERE id = v_notif;
  ASSERT jsonb_array_length(api.claim_unmailed_notifications(20)) = 1,
    'B2c: passé le TTL, une réclamation périmée doit redevenir réclamable — sinon un drain '
    'planté entre le claim et l''envoi perdrait l''e-mail pour toujours';

  -- B3. Acquittement en SUCCÈS : définitif.
  v_n := api.mark_notifications_emailed(ARRAY[v_notif], '[]'::jsonb);
  ASSERT v_n = 1, 'B3: mark doit rendre le nombre de lignes réellement terminées';
  ASSERT (SELECT email_sent_at FROM app_notification WHERE id=v_notif) IS NOT NULL,
    'B3: le succès doit poser email_sent_at';
  ASSERT (SELECT email_error FROM app_notification WHERE id=v_notif) IS NULL,
    'B3: le succès doit effacer une erreur antérieure';
  ASSERT jsonb_array_length(api.claim_unmailed_notifications(20)) = 0,
    'B3: une ligne envoyée ne doit plus jamais être réclamée';
  ASSERT api.mark_notifications_emailed(ARRAY[v_notif], '[]'::jsonb) = 0,
    'B3: un acquittement tardif ne doit RIEN réécrire d''une ligne déjà terminée '
    '(garde email_sent_at IS NULL)';

  -- B4. Acquittement en ÉCHEC : erreur stampée, claim levé, ligne re-réclamable.
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.save_crm_task(jsonb_build_object(
      'id', v_t::text, 'assignee_ids', jsonb_build_array(v_userD::text)));
  RESET ROLE;
  SELECT id INTO v_notif_d FROM app_notification WHERE task_id = v_t AND recipient_id = v_userD;
  ASSERT v_notif_d IS NOT NULL,
    'B4 (prémisse): la ré-assignation doit avoir créé une notification pour userD';
  v_rows := api.claim_unmailed_notifications(20);
  ASSERT jsonb_array_length(v_rows) = 1 AND (v_rows->0->>'notification_id')::uuid = v_notif_d,
    'B4 (prémisse): le drain doit rendre la notification neuve';
  v_n := api.mark_notifications_emailed(ARRAY[]::uuid[], jsonb_build_array(
           jsonb_build_object('id', v_notif_d::text, 'error', 'smtp boom')));
  ASSERT v_n = 0, 'B4: un échec ne doit pas être compté comme un envoi';
  ASSERT (SELECT email_error FROM app_notification WHERE id=v_notif_d) = 'smtp boom',
    'B4: l''erreur d''envoi doit être stampée pour diagnostic';
  ASSERT (SELECT email_claimed_at FROM app_notification WHERE id=v_notif_d) IS NULL,
    'B4: un échec doit LEVER la réclamation, sinon la ligne attend 10 minutes pour rien';
  ASSERT (SELECT email_sent_at FROM app_notification WHERE id=v_notif_d) IS NULL,
    'B4: un échec ne doit jamais terminer la ligne';
  v_rows := api.claim_unmailed_notifications(20);
  ASSERT jsonb_array_length(v_rows) = 1 AND (v_rows->0->>'notification_id')::uuid = v_notif_d,
    'B4: après un échec, la ligne doit être re-réclamable IMMÉDIATEMENT';

  -- B5. Destinataire sans e-mail : TERMINÉ sur place, jamais rendu.
  UPDATE auth.users SET email = NULL WHERE id = v_userD;
  UPDATE app_notification SET email_claimed_at = NULL WHERE id = v_notif_d;
  v_rows := api.claim_unmailed_notifications(20);
  ASSERT jsonb_array_length(v_rows) = 0,
    'B5: une ligne sans e-mail destinataire ne doit JAMAIS être rendue au drain';
  ASSERT (SELECT email_sent_at FROM app_notification WHERE id=v_notif_d) IS NOT NULL,
    'B5: elle doit être TERMINÉE sur place — sinon elle boucle claim/échec à l''infini et '
    'bouche la file devant les notifications qui, elles, peuvent partir';
  ASSERT (SELECT email_error FROM app_notification WHERE id=v_notif_d) = 'no_recipient_email',
    'B5: la raison de la terminaison doit être explicite';

  -- B6. Les deux RPC d'outbox sont fermés à `authenticated` (garde du REVOKE).
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_denied := false;
    BEGIN
      PERFORM api.claim_unmailed_notifications(20);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied,
      'B6: api.claim_unmailed_notifications ne doit pas être exécutable par authenticated '
      '(elle rend des adresses e-mail et vide la file)';
    v_denied := false;
    BEGIN
      PERFORM api.mark_notifications_emailed(ARRAY[]::uuid[], '[]'::jsonb);
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
    ASSERT v_denied,
      'B6: api.mark_notifications_emailed ne doit pas être exécutable par authenticated';
  RESET ROLE;

  -- ═══════════════ C. PRÉDICAT D'ÉCRITURE DE TÂCHE ═══════════════
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.user_can_write_crm_task(v_t),
      'C1: userA (write_crm_notes sur ORG A) doit pouvoir écrire la tâche de l''objet A';
    -- C3 est éprouvé ICI, sous une persona qui PEUT écrire : sous userB, `false` ne
    -- distinguerait pas « tâche inconnue » de « pas le droit », et l'assertion serait vide.
    ASSERT NOT api.user_can_write_crm_task(gen_random_uuid()),
      'C3: une tâche inconnue doit rendre false, jamais lever';
    ASSERT api.user_can_write_crm_task(NULL) IS NOT TRUE,
      'C3: un identifiant NULL ne doit jamais ouvrir le droit';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userB,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT NOT api.user_can_write_crm_task(v_t),
      'C2: userB (ORG B) ne doit pas pouvoir écrire une tâche de l''ORG A';
  RESET ROLE;

  -- ═══════════════ D. DOCUMENTS DANS list_crm_tasks ═══════════════
  -- Écriture hors persona : c'est la route Next /api/task-document en service_role qui pose
  -- ces deux lignes ; aucun rôle applicatif n'a de grant sur crm_task_document.
  v_doc := gen_random_uuid();
  INSERT INTO ref_document (id, url, title, storage_bucket, storage_path, access_scope, extra)
  VALUES (v_doc, 'storage://actor-documents/tasks/x', 'Devis.pdf',
          'actor-documents', 'tasks/'||v_t::text||'/t.pdf', 'crm_private',
          '{"mime_type":"application/pdf","size_bytes":1234}'::jsonb);
  INSERT INTO crm_task_document (task_id, document_id, title, created_by)
  VALUES (v_t, v_doc, 'Devis.pdf', v_userA);

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_tasks := api.list_crm_tasks();

    -- D1. La pièce jointe sort avec ses métadonnées.
    SELECT t INTO v_task FROM jsonb_array_elements(v_tasks) t WHERE (t->>'id')::uuid = v_t;
    ASSERT v_task IS NOT NULL, 'D1 (prémisse): la tâche témoin doit être listée';
    ASSERT jsonb_array_length(v_task->'documents') = 1,
      'D1: la tâche doit porter exactement sa pièce jointe';
    ASSERT (v_task->'documents'->0->>'id')::uuid = v_doc,
      'D1: `id` doit être le document_id — JAMAIS l''id de la ligne de liaison, que le '
      'front ne saurait pas retransformer en fichier';
    ASSERT v_task->'documents'->0->>'title' = 'Devis.pdf', 'D1: title inattendu';
    ASSERT v_task->'documents'->0->>'mime_type' = 'application/pdf', 'D1: mime_type inattendu';
    ASSERT (v_task->'documents'->0->>'size_bytes')::bigint = 1234, 'D1: size_bytes inattendu';
    ASSERT (v_task->'documents'->0->>'created_at') IS NOT NULL, 'D1: created_at manquant';

    -- D2. Une tâche sans pièce jointe porte la CLÉ et un tableau VIDE, jamais null.
    SELECT t INTO v_task FROM jsonb_array_elements(v_tasks) t WHERE (t->>'id')::uuid = v_t_nodoc;
    ASSERT v_task IS NOT NULL, 'D2 (prémisse): la tâche sans pièce jointe doit être listée';
    ASSERT jsonb_exists(v_task, 'documents'),
      'D2: la clé documents doit être présente même sans pièce jointe';
    ASSERT jsonb_typeof(v_task->'documents') = 'array'
       AND jsonb_array_length(v_task->'documents') = 0,
      'D2: documents doit valoir [] (jamais null) — le front itère, il ne teste pas la nullité';

    -- D3. Non-régression : 17i REDÉPLOIE list_crm_tasks, le contrat 16z doit SURVIVRE.
    ASSERT jsonb_array_length(v_task->'assignees') = 1,
      'D3: le contrat assignees[] de 16z doit survivre au redéploiement de list_crm_tasks';
    ASSERT (v_task->>'created_by_id')::uuid = v_userA,
      'D3: created_by_id (16z) doit survivre au redéploiement de list_crm_tasks';
    ASSERT v_task->>'created_by_name' = 'Bernard Auteur',
      'D3: created_by_name (16z) doit survivre au redéploiement de list_crm_tasks';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE '17i CRM tâches (outbox e-mail, prédicat d''écriture, pièces jointes) : assertions passées.';
END$$;
ROLLBACK;
