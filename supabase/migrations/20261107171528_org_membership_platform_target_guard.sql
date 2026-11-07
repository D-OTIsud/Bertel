BEGIN;

CREATE FUNCTION internal.upsert_org_membership(
  p_target_user_id    uuid,
  p_org_object_id     text,
  p_business_role_code text,
  p_invitation        boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $$
DECLARE
  v_caller_id          uuid    := auth.uid();
  v_caller_rank        integer;
  v_caller_platform    boolean;
  v_target_platform    boolean;
  v_existing_active    boolean;
  v_membership_id      uuid;
  v_existing_id        uuid;
  v_business_role_id   uuid;
BEGIN
  -- 1. Anti-self (§2.6)
  IF p_target_user_id = v_caller_id THEN
    RAISE EXCEPTION 'SELF_ACTION_FORBIDDEN: un administrateur ne peut pas gérer son propre membership';
  END IF;

  -- Read the winner's committed state after waiting, including when no row existed
  -- yet. Use the trigger's user lock in both RPC modes and for platform targets.
  IF p_invitation AND current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Invitation attachment requires READ COMMITTED' USING ERRCODE='25000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_target_user_id::text));

  -- 2. Autorisation appelant
  v_caller_platform := COALESCE(api.is_platform_superuser(), FALSE);
  IF v_caller_platform THEN
    v_caller_rank := 999;
  ELSE
    SELECT r.rank INTO v_caller_rank
    FROM user_org_membership uom
    JOIN user_org_admin_role uar ON uar.membership_id = uom.id AND uar.is_active = TRUE
    JOIN ref_org_admin_role  r   ON r.id = uar.role_id
    WHERE uom.user_id       = v_caller_id
      AND uom.org_object_id = p_org_object_id
      AND uom.is_active     = TRUE
    ORDER BY CASE WHEN p_invitation THEN r.rank END DESC NULLS LAST;

    IF v_caller_rank IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: vous n''avez pas de rôle d''administration dans cette ORG';
    END IF;
    IF v_caller_rank < 20 THEN
      RAISE EXCEPTION 'INSUFFICIENT_RANK: rang minimum requis 20 (org_manager) pour créer un membership';
    END IF;
    IF p_invitation AND v_caller_rank < 30 THEN
      RAISE EXCEPTION 'INSUFFICIENT_RANK: rang minimum requis 30 pour une invitation' USING ERRCODE='42501';
    END IF;
  END IF;

  -- 3. Validation du rôle métier initial (obligatoire — §2.5)
  SELECT id INTO v_business_role_id
  FROM ref_org_business_role WHERE code = p_business_role_code;
  IF v_business_role_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ROLE: code rôle métier inconnu : %', p_business_role_code;
  END IF;

  -- Hold the canonical role stable while a local administrator attaches the account.
  -- Legacy accounts without a profile or role have no platform role here.
  IF NOT v_caller_platform THEN
    SELECT COALESCE(p.role IN ('owner', 'super_admin'), FALSE) INTO v_target_platform
    FROM public.app_user_profile p
    WHERE p.id = p_target_user_id
    FOR SHARE;
  END IF;

  -- 4. Réactivation si un membership inactif existe déjà pour cette paire (user, org)
  SELECT m.id, m.is_active INTO v_existing_id, v_existing_active
  FROM public.user_org_membership m
  WHERE m.user_id       = p_target_user_id
    AND m.org_object_id = p_org_object_id
  ORDER BY (p_invitation AND m.is_active) DESC
  FOR UPDATE;

  IF NOT v_caller_platform AND v_target_platform IS TRUE
    AND v_existing_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: rattachement indisponible pour ce compte' USING ERRCODE='42501';
  END IF;

  IF p_invitation AND v_existing_active IS TRUE THEN
    RETURN jsonb_build_object('membership_id', v_existing_id, 'already_active', TRUE);
  END IF;

  IF v_existing_id IS NOT NULL THEN
    -- Réactivation : mettre à jour activated_at + effacer deactivated_at.
    -- invited_by / invited_at conservés depuis l'invitation d'origine.
    UPDATE user_org_membership
       SET is_active      = TRUE,
           activated_at   = NOW(),
           deactivated_at = NULL,
           updated_at     = NOW()
     WHERE id = v_existing_id;
    v_membership_id := v_existing_id;
  ELSE
    -- Création : le trigger enforce_single_active_org_membership protège la contrainte
    INSERT INTO user_org_membership (
      user_id, org_object_id, is_active,
      invited_by, invited_at, activated_at, deactivated_at,
      created_at, updated_at
    )
    VALUES (
      p_target_user_id, p_org_object_id, TRUE,
      v_caller_id, NOW(), NOW(), NULL,
      NOW(), NOW()
    )
    RETURNING id INTO v_membership_id;
  END IF;

  -- 5. Rotation du rôle métier : désactiver l'actuel puis créer le nouveau
  UPDATE user_org_business_role
     SET is_active  = FALSE,
         updated_at = NOW()
   WHERE membership_id = v_membership_id
     AND is_active     = TRUE;

  INSERT INTO user_org_business_role (
    membership_id, role_id, is_active,
    assigned_by, assigned_at, created_at, updated_at
  )
  VALUES (
    v_membership_id, v_business_role_id, TRUE,
    v_caller_id, NOW(), NOW(), NOW()
  );

  RETURN jsonb_build_object('membership_id', v_membership_id, 'already_active', FALSE);
END;
$$;

REVOKE EXECUTE ON FUNCTION internal.upsert_org_membership(uuid,text,text,boolean)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION api.rpc_upsert_membership(
  p_target_user_id uuid, p_org_object_id text, p_business_role_code text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $$
BEGIN
  RETURN (internal.upsert_org_membership(p_target_user_id,p_org_object_id,p_business_role_code,FALSE)->>'membership_id')::pg_catalog.uuid;
END;
$$;

CREATE FUNCTION api.rpc_attach_invite_membership(
  p_target_user_id uuid, p_org_object_id text, p_business_role_code text
)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT internal.upsert_org_membership(p_target_user_id,p_org_object_id,p_business_role_code,TRUE);
$$;

REVOKE EXECUTE ON FUNCTION api.rpc_attach_invite_membership(uuid,text,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION api.rpc_attach_invite_membership(uuid,text,text) TO authenticated;

COMMIT;
