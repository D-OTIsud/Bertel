-- test_moderation_rpcs.sql
-- Prouve P2.1 (migration_moderation_rpcs.sql) — module Modération (`pending_change`) :
--
-- A) HELPER : api.user_can_moderate_object = superuser OU (validate_changes ET membre d'une ORG
--    PUBLISHER de l'objet). editor(ORG A + validate_changes)=TRUE sur objA ; viewer(ORG A sans
--    permission)=FALSE ; stranger(ORG B)=FALSE sur objA ; superuser=TRUE.
-- B) SUBMIT (large) : tout utilisateur authentifié qui PEUT LIRE l'objet soumet — le contributeur
--    (non-modérateur) soumet une suggestion sur objA (publié) ⇒ uuid, status='pending',
--    submitted_by = lui, et object.is_editing(objA) bascule à TRUE (trigger en place). Garde de
--    lisibilité : soumettre sur objB (draft d'une autre ORG, illisible) ⇒ refus.
-- C) LIST self-scoped : editor & superuser voient le changement objA ; viewer/contributor (non
--    modérateurs) et stranger voient ZÉRO ; le filtre p_object_id reste auto-autorisé.
-- D) APPROVE gated + re-dispatch (Option A) : viewer/stranger ⇒ 42501 ; editor approuve ⇒
--    status='applied', applied_at + reviewed_by posés, ET le writer structuré nommé par
--    metadata->>'rpc' (save_object_commercial, payload {"payment_methods":[]}) a RÉELLEMENT tourné
--    (la ligne object_payment_method de objA disparaît) ; is_editing(objA) retombe à FALSE (0
--    pending). Double-résolution refusée. rpc hors whitelist ⇒ refus (jamais d'EXECUTE arbitraire).
-- E) REJECT gated : note vide ⇒ refus (note obligatoire) ; viewer ⇒ 42501 ; editor rejette avec
--    note ⇒ status='rejected' + review_note ; is_editing retombe à FALSE ; double-résolution refusée.
-- F) APPROVE re-dispatch via save_object_rooms (SURF3) : preuve que le whitelist member
--    save_object_rooms (pas seulement save_object_commercial) re-dispatch réellement — contributeur
--    propose une maj de capacity_total sur une chambre fixture, editor approuve, la ligne
--    object_room_type reflète le changement (capacity_total 2 → 4).
--
-- Contre une base sans la migration : échec immédiat (api.user_can_moderate_object / submit /
-- list / approve / reject absentes) — état rouge attendu (TDD).
-- Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste).
-- Personas : RPC gated appelée sous `SET LOCAL ROLE authenticated` + claims (auth.uid/role) ;
-- vérification d'état de table sous `RESET ROLE` (owner, RLS bypass — pending_change est admin-only).
-- Mécanique calquée sur test_crm_module.sql (RESET ROLE / SET LOCAL ROLE authenticated).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  -- Plage de fixtures dédiée (09xx) : 06xx review, 07xx media, 08xx crm.
  v_orgA   text := 'ORGRUN9999990901';
  v_orgB   text := 'ORGRUN9999990902';
  v_objA   text := 'HOTRUN9999990911'; -- établissement publié, publisher ORG A
  v_objB   text := 'HOTRUN9999990912'; -- établissement draft, publisher ORG B (illisible aux ORG A)
  v_view   uuid := '00000000-0000-4000-a000-000000000901'; -- viewer : membre ORG A, AUCUNE permission
  v_contrib uuid := '00000000-0000-4000-a000-000000000902'; -- contributor : membre ORG A, AUCUNE permission
  v_editor uuid := '00000000-0000-4000-a000-000000000903'; -- editor : membre ORG A + validate_changes + edit_canonical_when_publisher
  v_strang uuid := '00000000-0000-4000-a000-000000000904'; -- stranger : membre ORG B
  v_super  uuid := '00000000-0000-4000-a000-000000000905'; -- superuser plateforme (app_user_profile.role)
  v_pub_role uuid;
  v_perm_validate uuid;
  v_perm_canonical uuid;
  v_pm_ref uuid;          -- une référence de moyen de paiement (fixture object_payment_method)
  v_room_id uuid := '00000000-0000-4000-a000-000000000906'; -- fixture object_room_type (section F)
  v_id1 uuid;             -- pending_change #1 (approuvé)
  v_id2 uuid;             -- pending_change #2 (rejeté)
  v_id_evil uuid;         -- pending_change rpc hors whitelist
  v_id3 uuid;             -- pending_change #3 (save_object_rooms, section F)
  v_meta jsonb;
  v_payload jsonb;
  v_res jsonb;
  v_denied boolean;
BEGIN
  -- ---------- Fixture (owner, RLS bypass) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code = 'publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant (seeds non appliqués)'; END IF;
  SELECT id INTO v_perm_validate FROM ref_permission WHERE code = 'validate_changes' LIMIT 1;
  IF v_perm_validate IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[validate_changes] manquant (seeds non appliqués)'; END IF;
  SELECT id INTO v_perm_canonical FROM ref_permission WHERE code = 'edit_canonical_when_publisher' LIMIT 1;
  IF v_perm_canonical IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[edit_canonical_when_publisher] manquant (seeds non appliqués)'; END IF;
  SELECT id INTO v_pm_ref FROM ref_code_payment_method LIMIT 1;
  IF v_pm_ref IS NULL THEN RAISE EXCEPTION 'fixture: aucun ref_code_payment_method (seeds non appliqués)'; END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_view, 'mod_view@test.local'), (v_contrib, 'mod_contrib@test.local'),
    (v_editor, 'mod_editor@test.local'), (v_strang, 'mod_strang@test.local'),
    (v_super, 'mod_super@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES
    (v_view, 'tourism_agent'), (v_contrib, 'tourism_agent'), (v_editor, 'tourism_agent'),
    (v_strang, 'tourism_agent'), (v_super, 'super_admin')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_orgA, 'ORG', 'ORG A modération test', 'published'),
    (v_orgB, 'ORG', 'ORG B modération test', 'published'),
    (v_objA, 'HOT', 'Hôtel modération test A', 'published'),
    (v_objB, 'HOT', 'Hôtel modération test B', 'draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES
    (v_objA, v_orgA, v_pub_role),
    (v_objB, v_orgB, v_pub_role)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES
    (v_view, v_orgA, TRUE), (v_contrib, v_orgA, TRUE), (v_editor, v_orgA, TRUE),
    (v_strang, v_orgB, TRUE)
    ON CONFLICT DO NOTHING;
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at) VALUES
    (v_editor, v_perm_validate,  TRUE, v_editor, NOW(), NOW(), NOW()),
    (v_editor, v_perm_canonical, TRUE, v_editor, NOW(), NOW(), NOW())
    ON CONFLICT DO NOTHING;
  INSERT INTO object_payment_method (object_id, payment_method_id) VALUES (v_objA, v_pm_ref)
    ON CONFLICT DO NOTHING;
  INSERT INTO object_room_type (id, object_id, code, name, capacity_total, total_rooms) VALUES
    (v_room_id, v_objA, 'std', 'Chambre standard', 2, 1)
    ON CONFLICT (id) DO NOTHING;

  v_meta := jsonb_build_object('rpc', 'save_object_commercial', 'field', 'payment_methods',
                               'before', '1 moyen', 'after', '0 moyen');
  v_payload := jsonb_build_object('payment_methods', '[]'::jsonb);

  -- ============================================================
  -- A) HELPER user_can_moderate_object
  -- ============================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  ASSERT api.user_can_moderate_object(v_objA), 'A: editor (ORG A + validate_changes) doit pouvoir modérer objA';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_view, 'role','authenticated')::text, true);
  ASSERT NOT api.user_can_moderate_object(v_objA), 'A: viewer (ORG A sans validate_changes) ne doit PAS modérer objA';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_strang, 'role','authenticated')::text, true);
  ASSERT NOT api.user_can_moderate_object(v_objA), 'A: stranger (ORG B) ne doit PAS modérer objA';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super, 'role','authenticated')::text, true);
  ASSERT api.user_can_moderate_object(v_objA), 'A: superuser doit pouvoir modérer objA';
  RESET ROLE;

  -- ============================================================
  -- B) SUBMIT (large + garde de lisibilité)
  -- ============================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_contrib, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_id1 := api.submit_pending_change(v_objA, 'object', v_objA, 'update', v_payload, v_meta);
  -- Garde de lisibilité : objB (draft d'une autre ORG) est illisible au contributeur ORG A.
  v_denied := false;
  BEGIN
    PERFORM api.submit_pending_change(v_objB, 'object', v_objB, 'update', v_payload, v_meta);
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN v_denied := true;
  END;
  RESET ROLE;
  ASSERT v_id1 IS NOT NULL, 'B: submit (contributeur, objet lisible) doit retourner un id';
  ASSERT (SELECT status FROM pending_change WHERE id = v_id1) = 'pending',
         'B: la suggestion doit naître pending';
  ASSERT (SELECT submitted_by FROM pending_change WHERE id = v_id1) = v_contrib,
         'B: submitted_by doit être l''auteur (auth.uid())';
  ASSERT (SELECT is_editing FROM object WHERE id = v_objA) = TRUE,
         'B: object.is_editing(objA) doit basculer à TRUE (trigger)';
  ASSERT v_denied, 'B: submit sur un objet illisible (objB draft autre ORG) doit être refusé';

  -- ============================================================
  -- C) LIST self-scoped
  -- ============================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  ASSERT EXISTS (SELECT 1 FROM api.list_pending_changes('pending', NULL, 50, 0) r WHERE r.id = v_id1),
         'C: editor doit voir la suggestion objA';
  ASSERT EXISTS (SELECT 1 FROM api.list_pending_changes('pending', v_objA, 50, 0) r WHERE r.id = v_id1),
         'C: filtre p_object_id=objA doit remonter la suggestion pour l''editor';
  ASSERT (SELECT r.object_name FROM api.list_pending_changes('pending', v_objA, 50, 0) r WHERE r.id = v_id1) IS NOT NULL,
         'C: object_name doit être résolu';
  ASSERT (SELECT r.submitter_label FROM api.list_pending_changes('pending', v_objA, 50, 0) r WHERE r.id = v_id1) IS NOT NULL,
         'C: submitter_label doit être résolu';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super, 'role','authenticated')::text, true);
  ASSERT EXISTS (SELECT 1 FROM api.list_pending_changes('pending', NULL, 50, 0) r WHERE r.id = v_id1),
         'C: superuser doit voir la suggestion';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_view, 'role','authenticated')::text, true);
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_pending_changes('pending', NULL, 50, 0) r WHERE r.id = v_id1),
         'C: viewer (non modérateur) ne doit RIEN voir';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_strang, 'role','authenticated')::text, true);
  ASSERT NOT EXISTS (SELECT 1 FROM api.list_pending_changes('pending', NULL, 50, 0) r WHERE r.id = v_id1),
         'C: stranger (ORG B) ne doit RIEN voir';
  RESET ROLE;

  -- ============================================================
  -- D) APPROVE gated + re-dispatch
  -- ============================================================
  -- viewer / stranger : refus
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_view, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_denied := false;
  BEGIN PERFORM api.approve_pending_change(v_id1, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'D: approve par un non-modérateur (viewer) doit lever 42501';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_strang, 'role','authenticated')::text, true);
  v_denied := false;
  BEGIN PERFORM api.approve_pending_change(v_id1, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'D: approve par un étranger (ORG B) doit lever 42501';

  -- editor : approuve ⇒ applied + re-dispatch effectif
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor, 'role','authenticated')::text, true);
  v_res := api.approve_pending_change(v_id1, 'OK terrain');
  RESET ROLE;
  ASSERT v_res->>'status' = 'applied', 'D: approve doit retourner status=applied';
  ASSERT (SELECT status FROM pending_change WHERE id = v_id1) = 'applied',
         'D: la ligne doit passer applied';
  ASSERT (SELECT applied_at FROM pending_change WHERE id = v_id1) IS NOT NULL,
         'D: applied_at doit être posé';
  ASSERT (SELECT reviewed_by FROM pending_change WHERE id = v_id1) = v_editor,
         'D: reviewed_by doit être le modérateur';
  ASSERT (SELECT count(*) FROM object_payment_method WHERE object_id = v_objA) = 0,
         'D: le writer structuré (save_object_commercial) doit avoir RÉELLEMENT tourné (0 moyen de paiement)';
  ASSERT (SELECT is_editing FROM object WHERE id = v_objA) = FALSE,
         'D: is_editing(objA) doit retomber à FALSE (0 pending restant)';

  -- double-résolution refusée
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_denied := false;
  BEGIN PERFORM api.approve_pending_change(v_id1, NULL);
  EXCEPTION WHEN others THEN v_denied := true; END;
  ASSERT v_denied, 'D: ré-approuver une suggestion déjà résolue doit être refusé';
  RESET ROLE;

  -- rpc hors whitelist : refus (jamais d'EXECUTE arbitraire)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_contrib, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_id_evil := api.submit_pending_change(
    v_objA, 'object', v_objA, 'update', v_payload,
    jsonb_build_object('rpc', 'rpc_delete_object'));
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor, 'role','authenticated')::text, true);
  v_denied := false;
  BEGIN PERFORM api.approve_pending_change(v_id_evil, NULL);
  EXCEPTION WHEN others THEN v_denied := true; END;
  ASSERT v_denied, 'D: approve d''un rpc hors whitelist doit être refusé (anti-escalade)';
  RESET ROLE;
  ASSERT (SELECT status FROM pending_change WHERE id = v_id_evil) = 'pending',
         'D: une suggestion à rpc invalide reste pending (non appliquée)';

  -- ============================================================
  -- E) REJECT gated
  -- ============================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_contrib, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_id2 := api.submit_pending_change(v_objA, 'object', v_objA, 'update', v_payload, v_meta);
  RESET ROLE;
  ASSERT (SELECT is_editing FROM object WHERE id = v_objA) = TRUE,
         'E: nouvelle suggestion ⇒ is_editing à nouveau TRUE';

  -- note obligatoire
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_denied := false;
  BEGIN PERFORM api.reject_pending_change(v_id2, '   ');
  EXCEPTION WHEN others THEN v_denied := true; END;
  ASSERT v_denied, 'E: reject avec une note vide doit être refusé (note obligatoire)';

  -- viewer : refus
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_view, 'role','authenticated')::text, true);
  v_denied := false;
  BEGIN PERFORM api.reject_pending_change(v_id2, 'non');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'E: reject par un non-modérateur (viewer) doit lever 42501';

  -- editor : rejette avec note + nettoie la suggestion evil restée pending
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor, 'role','authenticated')::text, true);
  v_res := api.reject_pending_change(v_id2, 'Donnée erronée, refusé');
  PERFORM api.reject_pending_change(v_id_evil, 'rpc invalide, refusé');
  RESET ROLE;
  ASSERT v_res->>'status' = 'rejected', 'E: reject doit retourner status=rejected';
  ASSERT (SELECT status FROM pending_change WHERE id = v_id2) = 'rejected',
         'E: la ligne doit passer rejected';
  ASSERT (SELECT review_note FROM pending_change WHERE id = v_id2) = 'Donnée erronée, refusé',
         'E: review_note doit être enregistrée';
  ASSERT (SELECT is_editing FROM object WHERE id = v_objA) = FALSE,
         'E: is_editing(objA) doit retomber à FALSE quand 0 pending restant';

  -- double-résolution refusée
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_denied := false;
  BEGIN PERFORM api.reject_pending_change(v_id2, 'encore');
  EXCEPTION WHEN others THEN v_denied := true; END;
  ASSERT v_denied, 'E: re-rejeter une suggestion déjà résolue doit être refusé';
  RESET ROLE;

  -- ============================================================
  -- F) APPROVE re-dispatch via save_object_rooms (SURF3 whitelist member)
  -- ============================================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_contrib, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_id3 := api.submit_pending_change(
    v_objA, 'object_room_type', v_room_id::text, 'update',
    jsonb_build_object('rooms', jsonb_build_array(jsonb_build_object(
      'id', v_room_id, 'code', 'std', 'name', 'Chambre standard', 'capacity_total', 4, 'total_rooms', 1
    ))),
    jsonb_build_object('rpc', 'save_object_rooms', 'field', 'capacity_total', 'before', '2 pers', 'after', '4 pers'));
  RESET ROLE;
  ASSERT v_id3 IS NOT NULL, 'F: submit (rooms proposal) doit retourner un id';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_editor, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_res := api.approve_pending_change(v_id3, 'Capacite mise a jour');
  RESET ROLE;
  ASSERT v_res->>'status' = 'applied', 'F: approve (save_object_rooms) doit retourner status=applied';
  ASSERT (SELECT capacity_total FROM object_room_type WHERE id = v_room_id) = 4,
         'F: le writer structuré (save_object_rooms) doit avoir RÉELLEMENT tourné (capacity_total=4)';

  RAISE NOTICE 'test_moderation_rpcs: TOUS LES ASSERTS PASSENT';
END $$;
ROLLBACK;
