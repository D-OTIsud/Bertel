-- test_crm_interaction_status.sql
-- Prouve migration_crm_interaction_default_status.sql (manifeste 17b, chantier 2026-08-28 n°5) :
--   (A) DDL — la colonne `status` n'a PLUS de DEFAULT, et une écriture DIRECTE sans statut
--       ÉCHOUE au lieu de deviner. Sans cette assertion, on ne saurait pas distinguer « le
--       défaut a été retiré » de « le défaut a été remplacé par un statut ouvert ».
--   (B) RACINE AVEC SUJET, payload sans `status` ⇒ 'new' + `resolved_at` NULL — et la ligne
--       est réellement rendue par le filtre « Actives » (`p_status := 'active'`). GARDE NON
--       VACANTE : on éprouve le VRAI chemin de lecture, pas seulement la colonne. C'est ce
--       filtre qui était vide en production.
--   (C) RACINE SANS SUJET, payload sans `status` ⇒ 'resolved' + `resolved_at` RENSEIGNÉ. C'est CE
--       bloc qui prouve que la règle serveur ne transforme pas les NOTES INTERNES en demandes
--       en attente — l'erreur symétrique de celle qu'on corrige.
--   (D) Un `status` explicite dans le payload GAGNE sur le discriminant, dans les DEUX sens.
--       (C'est le contrat dont dépend le choix « À traiter / Déjà traitée » de la modale.)
--   (E) RÉPONSE dans un fil ⇒ 'resolved' (décision §66 PRÉSERVÉE — une réponse n'est pas une
--       demande en attente), avec `resolved_at` cohérent.
--   (F) Cycle §66 intact : basculer la racine en 'resolved' pose `resolved_at`, la rebasculer en
--       'new' le remet à NULL.
--
-- ⚠ VOCABULAIRE TRADUIT PAR LE MANIFESTE 17g : la règle §220 (défaut dérivé du SUJET) ne change
--   pas d'un iota — seuls ses libellés changent, 'planned' → 'new' et 'done' → 'resolved'.
--
-- PERSONA OBLIGATOIRE : le test écrit via `api.save_crm_interaction`, dont la garde est
-- `write_crm_notes` OU rang admin d'ORG OU superuser. Il s'exécute donc en tant que le persona
-- le MOINS privilégié qui doit passer — un membre d'ORG portant la seule permission
-- `write_crm_notes` — jamais en superuser : une garde d'écriture éprouvée en superuser ne
-- prouve rien (§214, et `api.is_platform_superuser()` court-circuite tout le reste).
--
-- Run AFTER the full manifest. Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste).
-- Plage de fixtures dédiée 10xx (08xx = test_crm_module, 09xx = test_crm_directory_search).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_org    text := 'ORGRUN9999991001';
  v_obj    text := 'HOTRUN9999991011';
  v_user   uuid := '00000000-0000-4000-a000-000000001001';
  v_actor  uuid := '00000000-0000-4000-a000-000000001021';
  v_pub_role   uuid;
  v_actor_role uuid;
  v_perm_id    uuid;
  v_topic_code text;
  v_id_topic     uuid;   -- (B) racine AVEC sujet
  v_id_note      uuid;   -- (C) racine SANS sujet
  v_id_forced    uuid;   -- (D) statut explicite
  v_id_reply     uuid;   -- (E) réponse
  v_status     text;
  v_resolved   timestamptz;
  v_failed     boolean;
BEGIN
  -- ---------- (A) DDL : plus aucun DEFAULT sur status ----------
  ASSERT (SELECT column_default FROM information_schema.columns
           WHERE table_schema='public' AND table_name='crm_interaction' AND column_name='status') IS NULL,
         'A1 : crm_interaction.status ne doit plus porter de DEFAULT (il valait ''done'', ancien vocabulaire d avant 17g)';

  -- ---------- Fixture (superuser, RLS bypass) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code='publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant (seeds non appliques)'; END IF;
  SELECT id INTO v_actor_role FROM ref_actor_role WHERE code='operator' LIMIT 1;
  IF v_actor_role IS NULL THEN
    v_actor_role := gen_random_uuid();
    INSERT INTO ref_actor_role (id, code, name) VALUES (v_actor_role,'operator','Exploitant');
  END IF;
  SELECT id INTO v_perm_id FROM ref_permission WHERE code='write_crm_notes' AND is_active LIMIT 1;
  IF v_perm_id IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[write_crm_notes] manquant (seeds non appliques)'; END IF;
  -- Un sujet de demande ACTIF est le discriminant même du chantier : sans lui le bloc (B)
  -- testerait la branche « sans sujet » en croyant tester l'autre — vacuité parfaite.
  SELECT code INTO v_topic_code FROM ref_code_demand_topic WHERE is_active ORDER BY code LIMIT 1;
  IF v_topic_code IS NULL THEN RAISE EXCEPTION 'fixture: aucun ref_code_demand_topic actif (seeds non appliques)'; END IF;

  INSERT INTO auth.users (id, email) VALUES (v_user,'crm_status@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_user,'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org,'ORG','ORG statut CRM','published'),
    (v_obj,'HOT','Hotel statut CRM','draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES (v_obj,v_org,v_pub_role)
    ON CONFLICT DO NOTHING;
  INSERT INTO actor (id, display_name) VALUES (v_actor,'Exploitant statut CRM') ON CONFLICT (id) DO NOTHING;
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary)
    VALUES (v_actor,v_obj,v_actor_role,TRUE) ON CONFLICT DO NOTHING;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_user,v_org,TRUE)
    ON CONFLICT DO NOTHING;
  -- Le persona porte UNIQUEMENT write_crm_notes : ni rôle d'admin d'ORG, ni superuser.
  INSERT INTO user_permission (user_id, permission_id, is_active) VALUES (v_user,v_perm_id,TRUE)
    ON CONFLICT DO NOTHING;

  -- ---------- (A2) Une écriture DIRECTE sans statut doit ÉCHOUER ----------
  -- Sous-transaction : l'échec attendu ne doit pas emporter le test.
  v_failed := FALSE;
  BEGIN
    INSERT INTO crm_interaction (object_id, interaction_type, direction, body)
      VALUES (v_obj, 'note', 'internal', 'ecriture directe sans statut');
  EXCEPTION WHEN not_null_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed,
         'A2 : une ecriture directe sans `status` doit echouer (NOT NULL sans DEFAULT), pas deviner un statut';

  -- ---------- Écritures EN TANT QUE le persona (le chemin réel) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

    -- Préalable asserté AVANT usage : sans lui, tous les blocs suivants leveraient 42501 et le
    -- test n'assert erait rien du tout.
    ASSERT api.user_can_write_crm(v_obj),
           'prealable : le persona (write_crm_notes + membre de l ORG publisher) doit pouvoir ecrire';

    -- (B) RACINE AVEC SUJET, sans `status` dans le payload.
    v_id_topic := (api.save_crm_interaction(jsonb_build_object(
      'object_id', v_obj, 'actor_id', v_actor, 'interaction_type','call',
      'body','Demande d information', 'topic_code', v_topic_code))->>'id')::uuid;

    -- (C) RACINE SANS SUJET, sans `status` dans le payload.
    v_id_note := (api.save_crm_interaction(jsonb_build_object(
      'object_id', v_obj, 'actor_id', v_actor, 'interaction_type','note',
      'body','Compte rendu d un echange deja clos'))->>'id')::uuid;

    -- (D) Statut explicite, dans les deux sens.
    v_id_forced := (api.save_crm_interaction(jsonb_build_object(
      'object_id', v_obj, 'actor_id', v_actor, 'interaction_type','note',
      'body','Note explicitement a traiter', 'status','new'))->>'id')::uuid;

    -- (E) Réponse dans le fil de (B).
    v_id_reply := (api.save_crm_interaction(jsonb_build_object(
      'parent_interaction_id', v_id_topic, 'interaction_type','email',
      'body','Reponse envoyee'))->>'id')::uuid;

    -- (B2) NON VACUITÉ — la demande doit ressortir du VRAI filtre « Actives ».
    -- Bornée à l'établissement témoin : sans `p_object_id`, la page de 50 du corpus réel
    -- pourrait ne pas contenir la ligne, et l'assertion échouerait pour une raison étrangère.
    ASSERT EXISTS (
             SELECT 1 FROM jsonb_array_elements(
               api.list_crm_timeline(p_object_id := v_obj, p_status := 'active') -> 'items') d
             WHERE (d->>'id')::uuid = v_id_topic),
           'B2 : la demande nee « en attente » doit ressortir du filtre Actives (p_status=active) — '
           'c est CE filtre qui etait vide en production';
    ASSERT NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(
               api.list_crm_timeline(p_object_id := v_obj, p_status := 'active') -> 'items') d
             WHERE (d->>'id')::uuid = v_id_note),
           'B3 : une NOTE interne ne doit PAS apparaitre dans les demandes actives';

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ---------- Vérifications d'état HORS PERSONA ----------
  -- Une lecture directe de table sous `SET LOCAL ROLE authenticated` rendrait 0 ligne (RLS
  -- admin-only sur les tables crm_*) : l'assertion comparerait a NULL et echouerait pour une
  -- raison etrangere a ce qu'elle teste (§218).
  SELECT status::text, resolved_at INTO v_status, v_resolved FROM crm_interaction WHERE id = v_id_topic;
  ASSERT v_status = 'new',
         format('B1 : une racine AVEC sujet doit naitre « new » ; obtenu %s', v_status);
  ASSERT v_resolved IS NULL,
         'B1b : une demande en attente ne peut pas porter de date de resolution';

  SELECT status::text, resolved_at INTO v_status, v_resolved FROM crm_interaction WHERE id = v_id_note;
  ASSERT v_status = 'resolved',
         format('C1 : une racine SANS sujet (note interne) doit naitre « resolved » ; obtenu %s', v_status);
  ASSERT v_resolved IS NOT NULL,
         'C2 : une ligne qui NAIT « traitee » doit porter sa date de resolution — sinon on recree '
         'l etat (done, resolved_at NULL) que le cycle §66 ne produit jamais';

  SELECT status::text, resolved_at INTO v_status, v_resolved FROM crm_interaction WHERE id = v_id_forced;
  ASSERT v_status = 'new',
         format('D1 : un `status` explicite doit gagner sur le discriminant ; obtenu %s', v_status);
  ASSERT v_resolved IS NULL, 'D1b : « new » explicite ne pose pas de date de resolution';

  SELECT status::text, resolved_at INTO v_status, v_resolved FROM crm_interaction WHERE id = v_id_reply;
  ASSERT v_status = 'resolved',
         format('E1 : une REPONSE reste « resolved » (decision §66 preservee) ; obtenu %s', v_status);
  ASSERT v_resolved IS NOT NULL, 'E2 : une reponse nee « resolved » porte sa date de resolution';

  -- (D2) L'autre sens : forcer « resolved » sur une racine PORTANT un sujet.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_id_forced := (api.save_crm_interaction(jsonb_build_object(
      'object_id', v_obj, 'actor_id', v_actor, 'interaction_type','call',
      'body','Demande deja traitee au telephone', 'topic_code', v_topic_code,
      'status','resolved'))->>'id')::uuid;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT status::text, resolved_at INTO v_status, v_resolved FROM crm_interaction WHERE id = v_id_forced;
  ASSERT v_status = 'resolved',
         format('D2 : « resolved » explicite doit gagner meme AVEC un sujet ; obtenu %s', v_status);
  ASSERT v_resolved IS NOT NULL, 'D2b : « resolved » explicite pose la date de resolution des l INSERT';

  -- ---------- (F) Le cycle « marquer traitee / rouvrir » (§66) est intact ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.save_crm_interaction(jsonb_build_object('id', v_id_topic, 'status','resolved'));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT resolved_at INTO v_resolved FROM crm_interaction WHERE id = v_id_topic;
  ASSERT v_resolved IS NOT NULL, 'F1 : marquer traitee doit poser resolved_at';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.save_crm_interaction(jsonb_build_object('id', v_id_topic, 'status','new'));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT resolved_at INTO v_resolved FROM crm_interaction WHERE id = v_id_topic;
  ASSERT v_resolved IS NULL, 'F2 : rouvrir doit remettre resolved_at a NULL';

  RAISE NOTICE 'crm interaction status assertions passed (A DDL sans defaut + ecriture directe refusee / B demande AVEC sujet nee « new » ET rendue par le filtre Actives / C note SANS sujet nee « resolved » avec sa date / D statut explicite gagnant dans les deux sens / E reponse toujours « resolved » / F cycle marquer-traitee-rouvrir intact).';
END$$;
ROLLBACK;
