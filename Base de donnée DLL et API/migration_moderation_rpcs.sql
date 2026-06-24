-- migration_moderation_rpcs.sql
-- =====================================================================================
-- P2.1 — Module Modération (`pending_change`)  — décision log §120
-- =====================================================================================
-- Cadrage PO (validé) :
--   • La table `pending_change` existe déjà (schema_unified.sql), complète, avec ses triggers
--     `is_editing` (after insert/update/delete). AUCUNE DDL de table ici.
--   • Décision clé — APPROVE = re-dispatch vers le writer structuré existant (Option A).
--     PAS de SQL dynamique « libre » : le payload stocke l'enveloppe d'un save-RPC de section
--     (`(p_object_id text, p_payload jsonb)`), `metadata->>'rpc'` nomme ce writer, et l'approbation
--     le ré-invoque. Le nom de RPC est validé contre une WHITELIST (anti-escalade : jamais d'EXECUTE
--     d'une fonction arbitraire fournie par l'appelant).
--
-- Invariants respectés :
--   • Toutes les RPCs sont SECURITY DEFINER, schéma `api`, search_path restreint (public, api, auth) —
--     elles utilisent gen_random_uuid via les writers (jamais uuid_generate_v4 ici : pas de génération
--     d'UUID dans ce fichier). Aucune lecture/écriture directe PostgREST sur `pending_change` (RLS
--     admin-only) : tout passe par ces RPCs (§36 authorize-once).
--   • `submit` est LARGE (toute personne qui peut LIRE l'objet peut suggérer) ; `list/approve/reject`
--     sont gated par `api.user_can_moderate_object`.
--   • Le re-dispatch d'`approve` réinvoque le writer structuré EN TANT QUE L'APPELANT (auth.uid()
--     inchangé sous SECURITY DEFINER) : le writer re-vérifie l'écriture canonique. Un modérateur doit
--     donc AUSSI satisfaire la garde du writer (superuser aujourd'hui — 0 grant ; sinon
--     `edit_canonical_when_publisher` une fois SP-2 effectif). C'est une défense en profondeur voulue,
--     pas un contournement.
--
-- Idempotent (CREATE OR REPLACE + REVOKE/GRANT) et transaction-wrappé.
-- Dépend de : schema_unified.sql (table pending_change + triggers), rls_policies.sql
--   (is_platform_superuser, user_has_permission, current_user_crm_object_ids, can_read_object),
--   object_workspace_safe_write_rpcs.sql + object_workspace_gap_rpcs.sql (les 7 writers whitelistés).
-- Couvert par tests/test_moderation_rpcs.sql.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- 1. Helper d'autorisation : qui peut modérer les suggestions d'un objet ?
--    superuser plateforme OU (permission `validate_changes` ET membre d'une ORG PUBLISHER
--    de l'objet). `current_user_crm_object_ids()` = objets dont une ORG du user (membership
--    actif) est publisher — exactement « publisher-ORG = ORG du user courant ».
--    Pour p_object_id NULL, le `IN` est NULL ⇒ seul le superuser passe (voulu).
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.user_can_moderate_object(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  SELECT api.is_platform_superuser()
      OR (api.user_has_permission('validate_changes')
          AND p_object_id IN (SELECT api.current_user_crm_object_ids()));
$$;

-- -------------------------------------------------------------------------------------
-- 2. SUBMIT — déposer une suggestion (large : authentifié + objet lisible).
--    `submitted_by = auth.uid()` ; statut initial `pending` (le trigger after-insert
--    bascule object.is_editing à TRUE).
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.submit_pending_change(
  p_object_id    text,
  p_target_table text,
  p_target_pk    text,
  p_action       text,
  p_payload      jsonb,
  p_metadata     jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentification requise pour soumettre une modification'
      USING ERRCODE = '42501';
  END IF;
  IF p_target_table IS NULL OR btrim(p_target_table) = '' THEN
    RAISE EXCEPTION 'target_table requis' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_action, '') NOT IN ('insert', 'update', 'delete') THEN
    RAISE EXCEPTION 'action invalide (insert|update|delete attendu): %', p_action
      USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'payload requis' USING ERRCODE = '22023';
  END IF;
  -- Garde de lisibilité : on ne suggère que sur un objet qu'on peut voir.
  IF p_object_id IS NOT NULL AND NOT api.can_read_object(p_object_id) THEN
    RAISE EXCEPTION 'Objet introuvable ou non lisible: %', p_object_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO pending_change (
    object_id, target_table, target_pk, action, payload, submitted_by, status, metadata
  )
  VALUES (
    p_object_id, p_target_table, p_target_pk, p_action, p_payload, v_uid, 'pending', p_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 3. LIST — file de modération, AUTO-AUTORISÉE (§36) : on ne renvoie que les lignes des
--    objets que l'appelant peut modérer (jamais la liste du caller). Authorize-once : le
--    périmètre publisher est calculé UNE fois, puis filtre `pc.object_id = ANY(scope)`.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.list_pending_changes(
  p_status    text DEFAULT 'pending',
  p_object_id text DEFAULT NULL,
  p_limit     int  DEFAULT 50,
  p_offset    int  DEFAULT 0
)
RETURNS TABLE (
  id             uuid,
  object_id      text,
  object_name    text,
  target_table   text,
  target_pk      text,
  action         text,
  status         text,
  field_label    text,
  before_value   text,
  after_value    text,
  submitted_by   uuid,
  submitter_label text,
  submitted_at   timestamptz,
  reviewed_by    uuid,
  reviewer_label text,
  reviewed_at    timestamptz,
  review_note    text,
  applied_at     timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_is_super boolean := api.is_platform_superuser();
  v_scope    text[]  := ARRAY(SELECT api.current_user_crm_object_ids());
  v_can_validate boolean := api.user_has_permission('validate_changes');
  v_limit    int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset   int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  RETURN QUERY
  SELECT
    pc.id,
    pc.object_id,
    o.name,
    pc.target_table,
    pc.target_pk,
    pc.action,
    pc.status,
    pc.metadata->>'field'  AS field_label,
    pc.metadata->>'before' AS before_value,
    pc.metadata->>'after'  AS after_value,
    pc.submitted_by,
    COALESCE(sp.display_name, 'Utilisateur ' || left(pc.submitted_by::text, 8)) AS submitter_label,
    pc.submitted_at,
    pc.reviewed_by,
    CASE WHEN pc.reviewed_by IS NULL THEN NULL
         ELSE COALESCE(rp.display_name, 'Utilisateur ' || left(pc.reviewed_by::text, 8)) END AS reviewer_label,
    pc.reviewed_at,
    pc.review_note,
    pc.applied_at
  FROM pending_change pc
  LEFT JOIN object o            ON o.id = pc.object_id
  LEFT JOIN app_user_profile sp ON sp.id = pc.submitted_by
  LEFT JOIN app_user_profile rp ON rp.id = pc.reviewed_by
  WHERE (p_status IS NULL OR pc.status = p_status)
    AND (p_object_id IS NULL OR pc.object_id = p_object_id)
    -- self-authorize : superuser voit tout ; sinon il faut validate_changes ET l'objet
    -- dans le périmètre publisher de l'appelant.
    AND (
      v_is_super
      OR (v_can_validate AND pc.object_id IS NOT NULL AND pc.object_id = ANY(v_scope))
    )
  ORDER BY pc.submitted_at DESC, pc.id
  LIMIT v_limit OFFSET v_offset;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 4. APPROVE — re-dispatch vers le writer structuré (Option A) puis status=applied.
--    Garde : api.user_can_moderate_object. Refuse si déjà résolu. Le nom de writer
--    (metadata->>'rpc') est validé contre une WHITELIST des save-RPCs de section
--    `(p_object_id, p_payload)` (anti-escalade). Le writer est ré-invoqué EN TANT QUE
--    L'APPELANT et re-vérifie ses propres droits.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.approve_pending_change(
  p_id          uuid,
  p_review_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_row pending_change%ROWTYPE;
  v_rpc text;
  v_allowed text[] := ARRAY[
    'save_object_commercial',
    'save_object_workspace_sustainability',
    'save_object_workspace_tags',
    'save_object_itinerary_nested',
    'save_object_openings',
    'save_object_places',
    'save_object_relations'
  ];
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion introuvable: %', p_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Suggestion déjà résolue (statut=%)', v_row.status USING ERRCODE = '22023';
  END IF;
  IF NOT api.user_can_moderate_object(v_row.object_id) THEN
    RAISE EXCEPTION 'Droits de modération insuffisants sur cet objet' USING ERRCODE = '42501';
  END IF;

  v_rpc := v_row.metadata->>'rpc';
  IF v_rpc IS NULL OR NOT (v_rpc = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'RPC de re-dispatch absent ou non autorisé: %', COALESCE(v_rpc, '(null)')
      USING ERRCODE = '22023';
  END IF;

  -- Re-dispatch vers le writer structuré (signature uniforme (p_object_id, p_payload)).
  -- %I quote l'identifiant ; le nom est en outre whitelisté ci-dessus.
  EXECUTE format('SELECT api.%I($1, $2)', v_rpc) USING v_row.object_id, v_row.payload;

  UPDATE pending_change
     SET status      = 'applied',
         reviewed_by = auth.uid(),
         reviewed_at = v_now,
         applied_at  = v_now,
         review_note = p_review_note,
         updated_at  = v_now
   WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'id', p_id, 'status', 'applied', 'applied_at', v_now);
END;
$$;

-- -------------------------------------------------------------------------------------
-- 5. REJECT — refus motivé. Garde : api.user_can_moderate_object. Note OBLIGATOIRE non
--    vide. Refuse si déjà résolu. Aucun re-dispatch (la suggestion n'est jamais appliquée).
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION api.reject_pending_change(
  p_id          uuid,
  p_review_note text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_row pending_change%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_review_note IS NULL OR btrim(p_review_note) = '' THEN
    RAISE EXCEPTION 'Un motif de refus est obligatoire' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM pending_change WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion introuvable: %', p_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Suggestion déjà résolue (statut=%)', v_row.status USING ERRCODE = '22023';
  END IF;
  IF NOT api.user_can_moderate_object(v_row.object_id) THEN
    RAISE EXCEPTION 'Droits de modération insuffisants sur cet objet' USING ERRCODE = '42501';
  END IF;

  UPDATE pending_change
     SET status      = 'rejected',
         reviewed_by = auth.uid(),
         reviewed_at = v_now,
         review_note = p_review_note,
         updated_at  = v_now
   WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'id', p_id, 'status', 'rejected', 'reviewed_at', v_now);
END;
$$;

-- -------------------------------------------------------------------------------------
-- 6. Grants : jamais PUBLIC/anon ; authenticated + service_role uniquement.
-- -------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION api.user_can_moderate_object(text)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.submit_pending_change(text, text, text, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.list_pending_changes(text, text, int, int)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.approve_pending_change(uuid, text)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.reject_pending_change(uuid, text)                    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION api.user_can_moderate_object(text)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.submit_pending_change(text, text, text, text, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.list_pending_changes(text, text, int, int)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.approve_pending_change(uuid, text)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.reject_pending_change(uuid, text)                    TO authenticated, service_role;

COMMENT ON FUNCTION api.user_can_moderate_object(text) IS
  'P2.1 §120 — TRUE si l''appelant peut modérer les suggestions de cet objet (superuser OU validate_changes + membre ORG publisher).';
COMMENT ON FUNCTION api.submit_pending_change(text, text, text, text, jsonb, jsonb) IS
  'P2.1 §120 — Dépose une suggestion (pending). Large : authentifié + objet lisible. submitted_by=auth.uid().';
COMMENT ON FUNCTION api.list_pending_changes(text, text, int, int) IS
  'P2.1 §120 — File de modération auto-autorisée (§36) : lignes des objets modérables par l''appelant uniquement.';
COMMENT ON FUNCTION api.approve_pending_change(uuid, text) IS
  'P2.1 §120 — Approuve : re-dispatch vers le writer structuré (metadata->>''rpc'', whitelisté) puis status=applied.';
COMMENT ON FUNCTION api.reject_pending_change(uuid, text) IS
  'P2.1 §120 — Refuse une suggestion (note obligatoire). Aucun re-dispatch.';

COMMIT;
