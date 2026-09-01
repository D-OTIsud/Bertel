-- test_crm_task_email_documents.sql
-- Garde permanente du manifeste 17m (migration_crm_task_email_documents.sql) :
-- outbox e-mail d'assignation, prédicat d'écriture de tâche, pièces jointes de tâche.
-- Créneau RENUMÉROTÉ (collision avec un chantier concurrent déjà sur master) :
-- renommage documentaire pur, sans effet sur la migration déjà appliquée en production.
-- Toutes les fixtures de ce fichier portent désormais le nouveau numéro de créneau,
-- par cohérence — elles ne survivent pas au ROLLBACK, aucune n'est écrite en base.
--
-- A) STRUCTURE — colonnes d'outbox, table crm_task_document (RLS ON, AUCUN grant
--    anon/authenticated), les trois fonctions neuves ; §204 sur les quatre fonctions
--    exposées, avec une prémisse de NON-VACUITÉ (service_role doit s'y voir, sans quoi
--    les `NOT EXISTS` seraient vrais parce que la vue est vide, pas parce que le REVOKE
--    a pris).
-- B) OUTBOX — l'arriéré ANTÉRIEUR à 17m est terminé par le backfill de la migration et ne
--    repart donc pas au premier drain (B0, mesuré AVANT toute fixture, sans quoi la
--    prémisse qui vide la file masquerait la panne) ; le drain rend LA ligne en attente
--    en DB ; la FENÊTRE de réclamation est éprouvée dans les deux sens (5 min : encore
--    réclamée ; 11 min : re-réclamable) parce que `now()` est FIGÉ sur la transaction —
--    un re-claim immédiat resterait vide même avec un TTL de zéro, et une garde qui ne
--    testerait que lui ne prouverait AUCUNE durée ; l'acquittement en succès est
--    définitif (un second passage ne réécrit rien), l'acquittement en échec lève le
--    claim et rend la ligne immédiatement re-réclamable ; un destinataire sans e-mail —
--    ABSENT *OU VIDE* — est TERMINÉ sur place, jamais rendu, sinon il boucle claim/échec
--    à l'infini ; le PLAFOND de réclamation tient dans les deux extrêmes (NULL retombe
--    sur le défaut, 0 est relevé à 1) ; une ligne durablement INENVOYABLE — adresse
--    valide, boîte qui refuse définitivement — sort de la file au bout de 5 échecs (B8),
--    sans quoi elle reste en tête du parcours et mange un créneau de chaque drain à
--    jamais, la panne même que le bras `no_recipient_email` ferme pour l'autre moitié du
--    problème ; les deux RPC sont fermés à `authenticated`.
-- C) PRÉDICAT — user_can_write_crm_task porte la MÊME règle que save_crm_task ; la
--    tâche inconnue rend false SOUS UNE PERSONA QUI PEUT ÉCRIRE (sous une persona sans
--    droit, false ne prouverait rien) ; et le refus de C2 isole la PORTÉE PAR OBJET
--    seule, l'autre moitié de la conjonction étant délibérément satisfaite.
-- D) DOCUMENTS — list_crm_tasks émet documents[] ; `id` est le document_id ; une tâche
--    sans pièce jointe porte la clé ET `[]`, jamais null ; une taille illisible sort à
--    null au lieu d'abattre la lecture entière, dans les DEUX moitiés de cette classe de
--    panne : non numérique (D4, 22P02) ET numérique mais débordant bigint (D4b, 22003) —
--    une garde qui bornerait l'alphabet sans borner la LONGUEUR n'en fermerait qu'une.
--    Et le contrat 16z SURVIT au redéploiement de la fonction — c'est le risque propre à
--    17m, qui REDÉPLOIE list_crm_tasks — éprouvé sur un témoin où créateur (userA), owner
--    de compatibilité (userC) et assigné (userD) sont TROIS personnes distinctes, et
--    porté sur TOUTES les clés du contrat : assignees[], created_by_id/name,
--    owner_id/owner_name et les trois related_interaction_* (valeurs réelles, jamais des
--    nulls qu'une assertion d'existence laisserait passer).
--
-- Contre une base sans 17m : échec immédiat (bloc A). Auto-contenu + transactionnel.
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
  v_userB  uuid := '00000000-0000-4000-a000-000000000922'; -- ORG B, write_crm_notes AUSSI (cf. C2)
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
  v_t_bad  uuid;       -- tâche témoin dont la pièce jointe a une taille illisible (D4)
  v_t_ovf  uuid;       -- tâche témoin dont la pièce jointe a une taille DÉBORDANTE (D4b)
  v_notif  uuid;       -- notification de userC
  v_notif_d uuid;      -- notification de userD
  v_notif_x uuid;      -- notification durablement inenvoyable (B8)
  v_i      int;        -- compteur de tentatives d'envoi (B8)
  v_doc    uuid;       -- ref_document de la pièce jointe
  v_doc_bad uuid;      -- ref_document dont extra->>'size_bytes' n'est pas un nombre (D4)
  v_doc_ovf uuid;      -- ref_document dont extra->>'size_bytes' dépasse bigint (D4b)
  v_inter  uuid;       -- interaction liée au témoin de D3 (contrat 16z related_interaction_*)
  v_denied boolean;
  v_n      int;
BEGIN
  -- ═══════════════ A. STRUCTURE ═══════════════
  ASSERT (SELECT count(*) FROM information_schema.columns
          WHERE table_schema='public' AND table_name='app_notification'
            AND column_name IN ('email_claimed_at','email_sent_at','email_error','email_attempts')) = 4,
    'A1: colonnes outbox manquantes';
  -- `email_attempts` doit être NOT NULL DEFAULT 0 : NULLABLE, `n.email_attempts + 1` rendrait
  -- NULL sur une ligne historique et `email_attempts < 5` deviendrait NULL — la ligne
  -- sortirait de la file DÈS SON PREMIER ÉCHEC, silencieusement, exactement l'inverse de la
  -- borne voulue.
  ASSERT (SELECT is_nullable = 'NO' AND column_default = '0' FROM information_schema.columns
          WHERE table_schema='public' AND table_name='app_notification'
            AND column_name='email_attempts'),
    'A1b: email_attempts doit être NOT NULL DEFAULT 0';
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
    (v_userA,'crm17m_a@test.local'), (v_userB,'crm17m_b@test.local'),
    (v_userC,'crm17m_c@test.local'), (v_userD,'crm17m_d@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role, display_name) VALUES
    (v_userA,'tourism_agent','Bernard Auteur'),
    (v_userB,'tourism_agent','Étranger OrgB'),
    (v_userC,'tourism_agent','Zoé Zoralde'),
    (v_userD,'tourism_agent','Alice Ah-Fat')
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, display_name=EXCLUDED.display_name;
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA,'ORG','ORG A 17m','published'), (v_orgB,'ORG','ORG B 17m','published'),
    (v_objA,'HOT','Hôtel 17m A','draft'), (v_objB,'HOT','Hôtel 17m B','draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_objA,v_orgA,v_pub_role), (v_objB,v_orgB,v_pub_role)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_userA,v_orgA,TRUE), (v_userB,v_orgB,TRUE), (v_userC,v_orgA,TRUE), (v_userD,v_orgA,TRUE)
    ON CONFLICT DO NOTHING;
  -- userC et userD reçoivent AUSSI `write_crm_notes` : depuis 17c, un assigné doit pouvoir
  -- agir dans le CRM (on ne notifie personne pour un écran auquel il serait redirigé).
  -- userB AUSSI, et c'est LE point de C2. `user_can_write_crm` est une CONJONCTION :
  -- objet DANS le périmètre ET (permission OU rang d'admin). Sans permission, le `false`
  -- de C2 aurait DEUX causes suffisantes, et une implémentation qui ignorerait
  -- complètement l'objet (`SELECT api.user_has_permission('write_crm_notes')`) passerait
  -- C1 ET C2 : la moitié du prédicat qui tient l'ORG B hors des pièces jointes de l'ORG A
  -- ne serait gardée par rien — alors que c'est précisément le gate des routes documents.
  -- Permission accordée, il ne reste qu'UNE cause possible au refus : la portée par objet.
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
  VALUES (v_userA, v_perm, TRUE, v_userA, NOW(), NOW(), NOW()),
         (v_userB, v_perm, TRUE, v_userA, NOW(), NOW(), NOW()),
         (v_userC, v_perm, TRUE, v_userA, NOW(), NOW(), NOW()),
         (v_userD, v_perm, TRUE, v_userA, NOW(), NOW(), NOW())
    ON CONFLICT DO NOTHING;

  -- ═══════════════ B. OUTBOX E-MAIL ═══════════════
  -- B0. L'ARRIÉRÉ ANTÉRIEUR À 17m NE DOIT PAS REPARTIR AU PREMIER DRAIN.
  -- `ADD COLUMN email_sent_at` fait naître toute ligne historique à NULL, donc réclamable :
  -- sans le backfill de la migration, le premier ping e-maillerait des assignations déjà
  -- vieilles de plusieurs jours, que leurs destinataires ont vues dans l'interface depuis
  -- longtemps. Cette assertion doit précéder la prémisse de fixture ci-dessous, qui termine
  -- le corpus et masquerait donc exactement ce qu'on mesure ici.
  -- `created_at < now()` désigne EXACTEMENT le corpus antérieur : `now()` est figé à l'ouverture
  -- de la transaction, et le protocole du manifeste applique la migration PUIS son test dans
  -- CETTE transaction — toute ligne écrite par le test naît à `now()`, jamais avant.
  -- Vacante sur une base fraîche (aucune notification n'existe) : elle ne mord que là où un
  -- arriéré existe, c'est-à-dire exactement là où la panne est possible.
  ASSERT NOT EXISTS (
    SELECT 1 FROM app_notification
    WHERE kind = 'crm_task_assigned' AND email_sent_at IS NULL AND created_at < now()),
    'B0: aucune notification ANTÉRIEURE à 17m ne doit rester réclamable — le backfill de la '
    'migration doit les avoir terminées, sinon le premier drain e-maille tout l''arriéré';

  -- Le drain réclame la FILE, pas les seules lignes de ce test : sur une base vivante les
  -- notifications déjà présentes rempliraient la fenêtre de claim et les assertions de
  -- cardinalité ci-dessous seraient fausses sans qu'aucune règle soit en cause. On termine
  -- donc le corpus AVANT de fabriquer les témoins (tout est annulé au ROLLBACK).
  UPDATE app_notification SET email_sent_at = now(), email_error = 'fixture_17m_corpus'
   WHERE kind = 'crm_task_assigned' AND email_sent_at IS NULL;
  ASSERT (SELECT count(*) FROM app_notification
           WHERE kind='crm_task_assigned' AND email_sent_at IS NULL) = 0,
    'B (prémisse): la file doit être vide avant de fabriquer les témoins';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- Tâche assignée à userC ⇒ UNE notification (l'auteur ne se notifie pas lui-même).
    v_payload := api.save_crm_task(jsonb_build_object(
      'object_id', v_objA, 'title', 'Tâche 17m à e-mailer',
      'due_at', '2030-01-15T09:00:00+00',
      'assignee_ids', jsonb_build_array(v_userC::text)));
    v_t := (v_payload->>'id')::uuid;
    -- Tâche auto-assignée : témoin « sans pièce jointe » de D2, et AUCUNE notification.
    v_payload := api.save_crm_task(jsonb_build_object(
      'object_id', v_objA, 'title', 'Tâche 17m sans pièce jointe'));
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
  ASSERT v_rows->0->>'recipient_email' = 'crm17m_c@test.local',
    'B1: l''adresse du destinataire doit être jointe depuis auth.users';
  ASSERT v_rows->0->>'recipient_name' = 'Zoé Zoralde',
    'B1: le nom du destinataire doit être JOINT à la lecture (jamais stocké : portée RGPD)';
  ASSERT v_rows->0->>'task_title' = 'Tâche 17m à e-mailer', 'B1: task_title inattendu';
  ASSERT v_rows->0->>'object_name' = 'Hôtel 17m A', 'B1: object_name inattendu';
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

  -- B5b. Une adresse VIDE est une adresse ABSENTE. `''` n'est pas plus e-mailable que NULL,
  -- mais seul NULL déclenche le bras de terminaison ci-dessus : sans le NULLIF, la chaîne
  -- vide serait rendue au drain, échouerait au relais à chaque ping et reviendrait
  -- réclamable après chaque TTL — la boucle claim/échec même que B5 ferme, laissée grande
  -- ouverte à un caractère près. Témoin : on ressuscite la notification de userC et on vide
  -- son adresse.
  UPDATE auth.users SET email = '' WHERE id = v_userC;
  UPDATE app_notification
     SET email_sent_at = NULL, email_claimed_at = NULL, email_error = NULL
   WHERE id = v_notif;
  v_rows := api.claim_unmailed_notifications(20);
  ASSERT jsonb_array_length(v_rows) = 0,
    'B5b: une adresse VIDE doit être traitée comme absente — jamais rendue au drain';
  ASSERT (SELECT email_sent_at FROM app_notification WHERE id=v_notif) IS NOT NULL,
    'B5b: elle doit être TERMINÉE sur place comme une adresse NULL, sinon elle boucle '
    'claim/échec à chaque TTL et bouche la file';
  ASSERT (SELECT email_error FROM app_notification WHERE id=v_notif) = 'no_recipient_email',
    'B5b: la raison de la terminaison doit être la même que pour une adresse absente';

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

  -- B7. LE PLAFOND de réclamation : `LIMIT GREATEST(COALESCE(p_limit, 20), 1)`.
  -- Aucune assertion ne l'éprouvait, alors que ses deux moitiés retiennent chacune un
  -- comportement extrême : sans le COALESCE, un `p_limit` NULL (la route passe la valeur —
  -- un paramètre omis, ou un `undefined` sérialisé, arrive ici en NULL) devient `LIMIT NULL`,
  -- c'est-à-dire AUCUNE limite : un seul ping réclame la file ENTIÈRE et un drain qui tombe
  -- ensuite gèle tout l'arriéré pour 10 minutes. Sans le GREATEST, un `0` devient `LIMIT 0`
  -- et le drain ne rend plus JAMAIS rien — la file ne se vide plus du tout.
  -- Vingt-et-un témoins : 20 rendus prouvent le défaut, le 21e restant prouve qu'il PLAFONNE.
  INSERT INTO app_notification (recipient_id, kind, task_id, created_by, created_at)
  SELECT v_userA, 'crm_task_assigned', v_t_nodoc, v_userA, now() + (g || ' seconds')::interval
  FROM generate_series(1, 21) AS g;
  ASSERT (SELECT count(*) FROM app_notification
           WHERE kind='crm_task_assigned' AND email_sent_at IS NULL) = 21,
    'B7 (prémisse): les 21 témoins doivent être les SEULES lignes en attente — sinon les '
    'cardinalités ci-dessous ne mesurent pas le plafond';
  ASSERT jsonb_array_length(api.claim_unmailed_notifications(NULL)) = 20,
    'B7: un p_limit NULL doit retomber sur le défaut de 20 — sans COALESCE, LIMIT NULL vide '
    'la file entière en un seul ping';
  ASSERT jsonb_array_length(api.claim_unmailed_notifications(0)) = 1,
    'B7: un p_limit 0 doit être relevé à 1 par le GREATEST — sinon LIMIT 0 ne rend jamais '
    'rien et la file ne se draine plus';

  -- B8. UNE LIGNE DURABLEMENT INENVOYABLE SORT DE LA FILE.
  -- C'est la MÊME classe de panne que celle que ferme le bras `no_recipient_email` (B5/B5b),
  -- pour l'autre moitié du problème : une adresse syntaxiquement VALIDE dont la boîte refuse
  -- DÉFINITIVEMENT (compte fermé, domaine en rejet). La ligne échoue, l'acquittement en échec
  -- lève son claim, elle redevient réclamable — et, le parcours étant `ORDER BY created_at`,
  -- elle reste en TÊTE : elle consomme un des 20 créneaux de CHAQUE drain, à jamais. Vingt
  -- lignes de ce type et la file ne se draine plus du tout, sans que rien ne soit cassé.
  -- On repart d'une file VIDE : les 21 témoins de B7 sont encore réclamables et rendraient
  -- les cardinalités ci-dessous illisibles (tout est annulé au ROLLBACK).
  UPDATE app_notification SET email_sent_at = now(), email_error = 'fixture_17m_b8'
   WHERE kind = 'crm_task_assigned' AND email_sent_at IS NULL;
  INSERT INTO app_notification (recipient_id, kind, task_id, created_by, created_at)
  VALUES (v_userA, 'crm_task_assigned', v_t_nodoc, v_userA, now())
  RETURNING id INTO v_notif_x;

  FOR v_i IN 1..5 LOOP
    v_rows := api.claim_unmailed_notifications(20);
    ASSERT jsonb_array_length(v_rows) = 1 AND (v_rows->0->>'notification_id')::uuid = v_notif_x,
      'B8 (prémisse): la ligne doit être réclamée à chacune de ses 5 tentatives — sinon '
      'l''épuisement mesuré plus bas ne prouverait pas la BORNE mais un refus antérieur';
    PERFORM api.mark_notifications_emailed(ARRAY[]::uuid[], jsonb_build_array(
      jsonb_build_object('id', v_notif_x::text, 'error', 'boîte définitivement fermée')));
  END LOOP;

  ASSERT (SELECT email_attempts FROM app_notification WHERE id = v_notif_x) = 5,
    'B8: chaque acquittement en échec doit INCRÉMENTER email_attempts — sans l''incrément, '
    'la borne du claim est décorative et la file reste bouchable à l''infini';
  ASSERT jsonb_array_length(api.claim_unmailed_notifications(20)) = 0,
    'B8: passé 5 échecs, la ligne ne doit PLUS JAMAIS être réclamée — sinon elle reste en '
    'tête du parcours (ORDER BY created_at) et mange un créneau de chaque drain, à jamais';
  -- Elle sort de la file SANS mentir sur son sort : ni supprimée, ni marquée envoyée.
  ASSERT EXISTS (SELECT 1 FROM app_notification WHERE id = v_notif_x),
    'B8: une ligne épuisée n''est jamais supprimée — la notification reste due au destinataire '
    'dans l''interface, seul son e-mail a échoué';
  ASSERT (SELECT email_sent_at FROM app_notification WHERE id = v_notif_x) IS NULL,
    'B8: une ligne épuisée ne doit pas être marquée ENVOYÉE — aucun e-mail n''est parti, et '
    'poser email_sent_at effacerait la seule trace de l''échec';
  ASSERT (SELECT email_error FROM app_notification WHERE id = v_notif_x) = 'boîte définitivement fermée',
    'B8: elle doit rester DIAGNOSTICABLE par email_error + email_attempts — c''est le couple '
    'qui permet à l''exploitation de la retrouver et, s''il y a lieu, de la relancer';

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

  -- C2 isole la PORTÉE PAR OBJET, seule : userB porte `write_crm_notes` comme userA (voir la
  -- fixture), donc le seul terme de la conjonction qui puisse encore refuser est
  -- l'appartenance de l'objet à son périmètre. Un prédicat qui n'interrogerait que la
  -- permission — en oubliant l'objet — passerait C1 et rougirait ICI.
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userB,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT api.user_has_permission('write_crm_notes'),
      'C2 (prémisse): userB doit BIEN porter write_crm_notes — sinon son refus a deux causes '
      'suffisantes et C2 ne garde plus la portée par objet';
    ASSERT NOT api.user_can_write_crm_task(v_t),
      'C2: userB (ORG B, pourtant muni de write_crm_notes) ne doit pas pouvoir écrire une '
      'tâche de l''ORG A — le refus vient de la PORTÉE PAR OBJET, et d''elle seule';
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

  -- Témoin de D4 : une pièce jointe dont `extra->>'size_bytes'` N'EST PAS un nombre.
  -- `ref_document.extra` est un jsonb LIBRE partagé avec les autres flux documentaires —
  -- cette lecture ne contrôle pas ce qui s'y écrit. Le témoin vit sur une tâche À PART pour
  -- que D1 garde sa cardinalité de 1 et que l'ordre des pièces reste déterministe.
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_payload := api.save_crm_task(jsonb_build_object(
      'object_id', v_objA, 'title', 'Tâche 17m pièce jointe à taille illisible'));
    v_t_bad := (v_payload->>'id')::uuid;
  RESET ROLE;
  v_doc_bad := gen_random_uuid();
  INSERT INTO ref_document (id, url, title, storage_bucket, storage_path, access_scope, extra)
  VALUES (v_doc_bad, 'storage://actor-documents/tasks/y', 'Scan.pdf',
          'actor-documents', 'tasks/'||v_t_bad::text||'/y.pdf', 'crm_private',
          '{"mime_type":"application/pdf","size_bytes":"inconnu"}'::jsonb);
  INSERT INTO crm_task_document (task_id, document_id, title, created_by)
  VALUES (v_t_bad, v_doc_bad, 'Scan.pdf', v_userA);

  -- Témoin de D4b : une taille FAITE DE CHIFFRES mais qui DÉBORDE bigint. Une garde
  -- réduite à `^\d+$` la laisserait passer et le `::bigint` lèverait 22003 `value out of
  -- range` — au MÊME endroit, avec le MÊME rayon d'action (api.list_crm_tasks TOUT ENTIÈRE,
  -- donc le kanban de tout le périmètre) que le 22P02 que D4 ferme. Une garde qui ne borne
  -- que la FORME sans borner la LONGUEUR ne ferme donc que la moitié de sa propre classe de
  -- panne. Vingt chiffres : la plus petite valeur qui déborde de façon indiscutable.
  -- Témoin sur une tâche À PART, comme celui de D4, pour que les cardinalités restent à 1.
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_payload := api.save_crm_task(jsonb_build_object(
      'object_id', v_objA, 'title', 'Tâche 17m pièce jointe à taille débordante'));
    v_t_ovf := (v_payload->>'id')::uuid;
  RESET ROLE;
  v_doc_ovf := gen_random_uuid();
  INSERT INTO ref_document (id, url, title, storage_bucket, storage_path, access_scope, extra)
  VALUES (v_doc_ovf, 'storage://actor-documents/tasks/z', 'Enorme.pdf',
          'actor-documents', 'tasks/'||v_t_ovf::text||'/z.pdf', 'crm_private',
          '{"mime_type":"application/pdf","size_bytes":"99999999999999999999"}'::jsonb);
  INSERT INTO crm_task_document (task_id, document_id, title, created_by)
  VALUES (v_t_ovf, v_doc_ovf, 'Enorme.pdf', v_userA);

  -- L'interaction liée du témoin de D3. `related_interaction_id/subject/status` font partie
  -- du contrat 16z de list_crm_tasks au même titre qu'`assignees[]`, et 17m REDÉPLOIE la
  -- fonction : une clé effacée par le redéploiement ne se verrait nulle part ailleurs.
  -- L'interaction porte un sujet et un statut RÉELS (jamais NULL) : sur trois clés nulles,
  -- des assertions d'existence passeraient encore sur une fonction qui les aurait remplacées
  -- par des littéraux NULL — c'est la VALEUR jointe depuis crm_interaction qui prouve que la
  -- jointure `ri` a survécu. Écriture directe : `crm_interaction` est sous RLS admin-only.
  v_inter := gen_random_uuid();
  INSERT INTO crm_interaction (id, object_id, interaction_type, direction, status, subject)
  VALUES (v_inter, v_objA, 'note', 'internal', 'in_progress', 'Demande liée 17m');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_userA,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- Payload SANS `assignee_ids` ni `owner` : v_requested reste NULL, donc ni les
    -- assignations ni l'owner de compatibilité ne sont touchés (le témoin de D3 garde ses
    -- trois personnes distinctes).
    PERFORM api.save_crm_task(jsonb_build_object(
      'id', v_t::text, 'related_interaction_id', v_inter::text));
  RESET ROLE;

  -- D3 lira v_t, dont l'assigné est userD depuis B4 et le créateur userA. On écarte EN PLUS
  -- la valeur de compatibilité `owner` vers userC : save_crm_task la tient égale au premier
  -- assigné, donc à userD lui aussi, et une assertion d'identité ne saurait pas distinguer
  -- la jointure crm_task_assignee d'un repli sur cette colonne. Les trois rôles portent
  -- désormais trois personnes différentes — une seule origine peut satisfaire D3.
  UPDATE crm_task SET owner = v_userC WHERE id = v_t;

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

    -- D3. Non-régression : 17m REDÉPLOIE list_crm_tasks, le contrat 16z doit SURVIVRE.
    -- Éprouvé sur v_t, où le créateur (userA), l'owner de compatibilité (userC) et l'assigné
    -- (userD) sont TROIS personnes distinctes. Sur une tâche où ils coïncident, la seule
    -- CARDINALITÉ passerait au vert sur une fonction qui aurait perdu la jointure
    -- crm_task_assignee et se serait repliée sur owner ou created_by : c'est l'IDENTITÉ de
    -- l'assigné, pas leur nombre, qui prouve d'où vient le tableau.
    SELECT t INTO v_task FROM jsonb_array_elements(v_tasks) t WHERE (t->>'id')::uuid = v_t;
    ASSERT v_task IS NOT NULL, 'D3 (prémisse): la tâche assignée doit être listée';
    ASSERT jsonb_array_length(v_task->'assignees') = 1,
      'D3: le contrat assignees[] de 16z doit survivre au redéploiement de list_crm_tasks';
    ASSERT (v_task->'assignees'->0->>'user_id')::uuid = v_userD,
      'D3: assignees[] doit venir de crm_task_assignee — ni de owner (userC sur ce témoin) '
      'ni de created_by (userA)';
    ASSERT (v_task->>'created_by_id')::uuid = v_userA,
      'D3: created_by_id (16z) doit survivre au redéploiement de list_crm_tasks';
    ASSERT v_task->>'created_by_name' = 'Bernard Auteur',
      'D3: created_by_name (16z) doit survivre au redéploiement de list_crm_tasks';
    -- Le contrat 16z ne s'arrête pas à assignees[]/created_by_* : owner_id/owner_name sont
    -- la valeur de COMPATIBILITÉ que lisent encore les clients d'avant 16z pendant la
    -- fenêtre de déploiement, et le témoin les rend GRATUITEMENT discriminants — son owner
    -- est userC, distinct du créateur (userA) ET de l'assigné (userD). Un redéploiement qui
    -- les effacerait, ou qui les recalculerait depuis les assignés, ne casserait AUCUNE
    -- autre assertion de ce fichier.
    ASSERT (v_task->>'owner_id')::uuid = v_userC,
      'D3: owner_id (contrat hérité 16z) doit survivre au redéploiement — et venir de '
      'crm_task.owner, ni du créateur (userA) ni de l''assigné (userD)';
    ASSERT v_task->>'owner_name' = 'Zoé Zoralde',
      'D3: owner_name (contrat hérité 16z) doit être JOINT depuis app_user_profile sur '
      'crm_task.owner';
    -- Les trois clés d'interaction liée : la VALEUR, pas seulement la présence — une
    -- assertion d'existence passerait encore sur une fonction qui aurait perdu la jointure
    -- `ri` et émettrait trois NULL.
    ASSERT (v_task->>'related_interaction_id')::uuid = v_inter,
      'D3: related_interaction_id (16z) doit survivre au redéploiement de list_crm_tasks';
    ASSERT v_task->>'related_interaction_subject' = 'Demande liée 17m',
      'D3: related_interaction_subject (16z) doit rester JOINT depuis crm_interaction';
    ASSERT v_task->>'related_interaction_status' = 'in_progress',
      'D3: related_interaction_status (16z) doit rester JOINT depuis crm_interaction';

    -- D4. Une taille NON NUMÉRIQUE ne doit pas abattre la lecture. Le rayon d'action d'un
    -- cast nu n'est pas la pièce jointe fautive : c'est api.list_crm_tasks() TOUT ENTIÈRE,
    -- donc le kanban CRM de TOUS les utilisateurs du périmètre, abattu par UNE écriture
    -- venue d'un autre flux documentaire. Une lecture qu'une écriture d'ailleurs peut
    -- abattre doit se défendre elle-même. Si la garde tombe, l'appel ci-dessus lève
    -- 22P02 et ce fichier rougit AVANT même d'arriver ici.
    SELECT t INTO v_task FROM jsonb_array_elements(v_tasks) t WHERE (t->>'id')::uuid = v_t_bad;
    ASSERT v_task IS NOT NULL, 'D4 (prémisse): la tâche à taille illisible doit être listée';
    ASSERT jsonb_array_length(v_task->'documents') = 1,
      'D4: la pièce jointe doit être ÉMISE malgré sa taille illisible — la garde neutralise '
      'la valeur, elle ne fait pas disparaître la pièce';
    ASSERT jsonb_typeof(v_task->'documents'->0->'size_bytes') = 'null',
      'D4: une taille non numérique doit sortir à null (le front affiche la pièce sans son '
      'poids), jamais faire lever la lecture entière';
    ASSERT v_task->'documents'->0->>'mime_type' = 'application/pdf',
      'D4: les autres métadonnées de la pièce restent intactes';

    -- D4b. Une taille NUMÉRIQUE mais DÉBORDANTE ne doit pas non plus abattre la lecture.
    -- C'est l'autre moitié de la MÊME classe de panne : une garde de FORME seule (`^\d+$`)
    -- laisse « 99999999999999999999 » atteindre le `::bigint`, qui lève 22003 exactement là
    -- où le 22P02 de D4 levait — api.list_crm_tasks() TOUT ENTIÈRE, donc le kanban CRM de
    -- tous les utilisateurs du périmètre. La garde borne donc la LONGUEUR (`^\d{1,18}$`) et
    -- non seulement l'alphabet. Sans CE témoin, la borne serait ré-élargie un jour sans que
    -- rien ne rougisse. Si la borne tombe, l'appel de list_crm_tasks lève 22003 et ce
    -- fichier rougit AVANT d'arriver ici, comme pour D4.
    SELECT t INTO v_task FROM jsonb_array_elements(v_tasks) t WHERE (t->>'id')::uuid = v_t_ovf;
    ASSERT v_task IS NOT NULL, 'D4b (prémisse): la tâche à taille débordante doit être listée';
    ASSERT jsonb_array_length(v_task->'documents') = 1,
      'D4b: la pièce jointe doit être ÉMISE malgré sa taille débordante';
    ASSERT jsonb_typeof(v_task->'documents'->0->'size_bytes') = 'null',
      'D4b: une taille qui déborde bigint doit sortir à null — une garde qui ne borne que '
      'l''alphabet et pas la LONGUEUR laisse lever 22003 au même endroit que le 22P02 de D4';
    ASSERT v_task->'documents'->0->>'title' = 'Enorme.pdf',
      'D4b: les autres métadonnées de la pièce restent intactes';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE '17m CRM tâches (outbox e-mail, prédicat d''écriture, pièces jointes) : assertions passées.';
END$$;
ROLLBACK;
