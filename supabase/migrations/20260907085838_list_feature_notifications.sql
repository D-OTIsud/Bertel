-- List feature-proposal inbox notifications.
--
-- Adds an in-app-only notification for current organisation reviewers.  The
-- existing app_notification outbox remains explicitly limited to task and
-- fiche-review kinds, so this migration deliberately does not create a CRM
-- task or make the proposal claimable by SMTP.

-- Keep the generic notification kind fail-closed.  A new renderer must opt in
-- on both sides of this constraint; unknown kinds still reject at INSERT.
ALTER TABLE public.app_notification DROP CONSTRAINT IF EXISTS chk_app_notification_kind;
ALTER TABLE public.app_notification ADD CONSTRAINT chk_app_notification_kind
  CHECK (kind IN ('crm_task_assigned', 'fiche_submission_reviewed', 'list_feature_requested'));

-- Exactly one still-actionable proposal notification per recipient/list.  A
-- review or deletion removes it, so a later proposal can notify again.
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_notification_list_feature_recipient
  ON public.app_notification (recipient_id, (payload->>'list_id'))
  WHERE kind = 'list_feature_requested';

-- The expression index keeps lifecycle cleanup and the dedupe probe narrow.
CREATE INDEX IF NOT EXISTS idx_app_notification_list_feature_list
  ON public.app_notification ((payload->>'list_id'))
  WHERE kind = 'list_feature_requested';

-- Deliver to the same population allowed to review a list: active rank-30+
-- admins of its exact ORG, plus explicit platform superusers.  The helper is
-- internal because it takes an arbitrary list id and writes another user's
-- inbox.
CREATE OR REPLACE FUNCTION internal.notify_list_feature_reviewers(p_list_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp
AS $$
DECLARE
  v_list object_list;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_list
  FROM object_list
  WHERE id = p_list_id;

  -- Pending proposals that have aged into archive are no longer actionable;
  -- never create an inbox item for one.
  IF NOT FOUND
     OR v_list.is_featured
     OR v_list.feature_requested_at IS NULL
     OR api.list_is_archived(v_list.is_featured, v_list.last_activity_at) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.app_notification (recipient_id, kind, created_by, payload)
  SELECT reviewers.user_id,
         'list_feature_requested',
         -- created_by on object_list deliberately has no FK so an old list can
         -- outlive an erased account.  app_notification does have one: preserve
         -- the actor where it exists, otherwise use NULL rather than making a
         -- pending-proposal backfill fail the whole migration.
         (SELECT u.id FROM auth.users u WHERE u.id = v_list.created_by),
         jsonb_build_object(
           'list_id', v_list.id,
           'list_name', v_list.name,
           'org_object_id', v_list.org_object_id
         )
  FROM (
    SELECT DISTINCT m.user_id
    FROM public.user_org_membership m
    JOIN public.user_org_admin_role ar
      ON ar.membership_id = m.id
     AND ar.is_active
    JOIN public.ref_org_admin_role r
      ON r.id = ar.role_id
    WHERE m.org_object_id = v_list.org_object_id
      AND m.is_active
      AND r.rank >= 30

    UNION

    SELECT p.id
    FROM public.app_user_profile p
    WHERE p.role IN ('owner', 'super_admin')
  ) AS reviewers
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION internal.notify_list_feature_reviewers(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Historical pending proposals become visible immediately after deployment.
-- The unique index makes this safe to rerun and avoids duplicate alerts.
CREATE OR REPLACE FUNCTION internal.backfill_list_feature_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, pg_temp
AS $$
DECLARE
  v_list_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_list_id IN
    SELECT l.id
    FROM public.object_list l
    WHERE l.feature_requested_at IS NOT NULL
      AND NOT l.is_featured
      AND NOT api.list_is_archived(l.is_featured, l.last_activity_at)
  LOOP
    v_count := v_count + internal.notify_list_feature_reviewers(v_list_id);
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION internal.backfill_list_feature_notifications()
  FROM PUBLIC, anon, authenticated, service_role;

SELECT internal.backfill_list_feature_notifications();

-- Deleting a list through its RPC, retention purge, or an administrative SQL
-- path must not leave an orphaned inbox item.  This is intentionally an AFTER
-- DELETE trigger: the payload has no FK by design and must not invent one.
CREATE OR REPLACE FUNCTION internal.tg_remove_list_feature_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  DELETE FROM public.app_notification
  WHERE kind = 'list_feature_requested'
    AND payload->>'list_id' = OLD.id::text;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION internal.tg_remove_list_feature_notifications()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_object_list_remove_feature_notifications ON public.object_list;
CREATE TRIGGER trg_object_list_remove_feature_notifications
  AFTER DELETE ON public.object_list
  FOR EACH ROW EXECUTE FUNCTION internal.tg_remove_list_feature_notifications();

-- Preserve the public inbox shape and read RPC semantics.  List proposal
-- rows are visible only while the proposal is actionable and the recipient
-- still passes the exact same current-org/superuser reviewer predicate as
-- api.user_is_list_org_admin.  Thus a revoked role, another active org, or an
-- archived proposal cannot reveal an old payload or contribute to unread_count.
CREATE OR REPLACE FUNCTION api.list_my_notifications(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_items jsonb;
  v_unread integer;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0);
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY ord DESC, tie DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT n.created_at AS ord, n.id AS tie, jsonb_build_object(
      'id', n.id,
      'kind', n.kind,
      'created_at', n.created_at,
      'read_at', n.read_at,
      'task_id', n.task_id,
      'task_title', ct.title,
      'object_id', ct.object_id,
      'object_name', o.name,
      'created_by_id', n.created_by,
      'created_by_name', api.crm_user_label(n.created_by, cp.display_name),
      'payload', n.payload
    ) AS item
    FROM public.app_notification n
    LEFT JOIN public.crm_task ct ON ct.id = n.task_id
    LEFT JOIN public.object o ON o.id = ct.object_id
    LEFT JOIN public.app_user_profile cp ON cp.id = n.created_by
    WHERE n.recipient_id = v_me
      AND (
        n.kind <> 'list_feature_requested'
        OR EXISTS (
          SELECT 1
          FROM public.object_list l
          WHERE l.id::text = n.payload->>'list_id'
            AND l.feature_requested_at IS NOT NULL
            AND NOT l.is_featured
            AND NOT api.list_is_archived(l.is_featured, l.last_activity_at)
            AND COALESCE(api.user_is_list_org_admin(l.id), FALSE)
        )
      )
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT v_limit
  ) q;

  SELECT count(*) INTO v_unread
  FROM public.app_notification n
  WHERE n.recipient_id = v_me
    AND n.read_at IS NULL
    AND (
      n.kind <> 'list_feature_requested'
      OR EXISTS (
        SELECT 1
        FROM public.object_list l
        WHERE l.id::text = n.payload->>'list_id'
          AND l.feature_requested_at IS NOT NULL
          AND NOT l.is_featured
          AND NOT api.list_is_archived(l.is_featured, l.last_activity_at)
          AND COALESCE(api.user_is_list_org_admin(l.id), FALSE)
      )
    );

  RETURN jsonb_build_object('items', v_items, 'unread_count', v_unread);
END;
$$;
REVOKE ALL ON FUNCTION api.list_my_notifications(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_my_notifications(integer) TO authenticated, service_role;
COMMENT ON FUNCTION api.list_my_notifications(integer) IS
  'Boîte de réception de l''appelant UNIQUEMENT (recipient_id = auth.uid(), jamais un '
  'paramètre). Renvoie {items[], unread_count}. Les propositions de listes sont rendues '
  'seulement aux reviewers encore éligibles dans leur ORG active (ou superuser) et tant '
  'qu''elles sont pending/non archivées. Anon ⇒ boîte vide.';

-- Proposal lifecycle: create recipients in the same transaction as the first
-- request; clear all pending alerts as soon as a review resolves it.  The
-- direct self-feature path can also close a pending request, so it removes the
-- same alerts.
CREATE OR REPLACE FUNCTION api.request_list_feature(p_list_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM object_list WHERE id = p_list_id FOR UPDATE;
  IF NOT COALESCE((
    SELECT l.created_by = (SELECT auth.uid())
       AND NOT l.is_featured
       AND l.org_object_id = api.current_user_org_id()
       AND internal.org_membership_active(l.created_by, l.org_object_id)
    FROM object_list l WHERE l.id = p_list_id
  ), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  UPDATE object_list
     SET feature_requested_at = COALESCE(feature_requested_at, now())
   WHERE id = p_list_id AND NOT is_featured;

  -- Repeat proposals repair a partial historical delivery without emitting a
  -- duplicate: the unique partial index is the final concurrency guard.
  PERFORM internal.notify_list_feature_reviewers(p_list_id);
  RETURN internal.build_list_detail_json(p_list_id);
END;
$$;
REVOKE ALL ON FUNCTION api.request_list_feature(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.request_list_feature(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.review_list_feature(p_list_id uuid, p_accept boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM object_list WHERE id = p_list_id FOR UPDATE;
  IF NOT COALESCE(api.user_is_list_org_admin(p_list_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM object_list
    WHERE id = p_list_id
      AND feature_requested_at IS NOT NULL
      AND NOT is_featured
      AND NOT api.list_is_archived(is_featured, last_activity_at)
  ) THEN
    RAISE EXCEPTION 'NOT_PENDING' USING ERRCODE = 'PT409';
  END IF;

  IF p_accept THEN
    UPDATE object_list SET is_featured = TRUE, feature_requested_at = NULL WHERE id = p_list_id;
  ELSE
    UPDATE object_list SET feature_requested_at = NULL WHERE id = p_list_id;
  END IF;
  DELETE FROM public.app_notification
  WHERE kind = 'list_feature_requested'
    AND payload->>'list_id' = p_list_id::text;

  IF COALESCE(api.user_can_read_list(p_list_id), FALSE) THEN
    RETURN internal.build_list_detail_json(p_list_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION api.review_list_feature(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.review_list_feature(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.set_list_featured(p_list_id uuid, p_featured boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM object_list WHERE id = p_list_id FOR UPDATE;
  IF NOT COALESCE(api.user_is_list_org_admin(p_list_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_featured THEN
    IF NOT EXISTS (SELECT 1 FROM object_list WHERE id = p_list_id AND created_by = (SELECT auth.uid())) THEN
      RAISE EXCEPTION 'FEATURE_REQUIRES_OWN_LIST_OR_PROPOSAL' USING ERRCODE = 'PT409';
    END IF;
    UPDATE object_list SET is_featured = TRUE, feature_requested_at = NULL WHERE id = p_list_id;
    DELETE FROM public.app_notification
    WHERE kind = 'list_feature_requested'
      AND payload->>'list_id' = p_list_id::text;
  ELSE
    UPDATE object_list SET is_featured = FALSE, last_activity_at = now()
     WHERE id = p_list_id AND is_featured;
  END IF;

  IF COALESCE(api.user_can_read_list(p_list_id), FALSE) THEN
    RETURN internal.build_list_detail_json(p_list_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION api.set_list_featured(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.set_list_featured(uuid, boolean) TO authenticated, service_role;

-- `status = 'shared'` records editorial history, not whether a live capability
-- link still exists.  Emit the actual state on all list-card payloads.
CREATE OR REPLACE FUNCTION api.list_my_lists()
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp
AS $$
  SELECT COALESCE(json_agg(s ORDER BY s.updated_at DESC), '[]'::json)
  FROM (
    SELECT
      l.id, l.name, l.name_en, l.kind, l.status, l.lang,
      l.recipient_label,
      l.accent, COALESCE(l.cover_url, g.cover_image) AS cover_url, l.updated_at,
      l.created_by, p.display_name AS creator_name, l.org_object_id,
      l.last_activity_at,
      api.list_is_archived(l.is_featured, l.last_activity_at) AS is_archived,
      l.is_featured, l.feature_requested_at,
      (l.share_enabled AND l.share_token IS NOT NULL
       AND (l.share_expires_at IS NULL OR l.share_expires_at > now())) AS has_active_share_link,
      api.user_can_write_list(l.id) AS can_edit,
      api.user_can_manage_list_feature_action(l.id) AS can_manage_feature,
      (NOT l.is_featured) AS can_propose_feature,
      (api.list_is_archived(l.is_featured, l.last_activity_at) AND api.user_can_write_list(l.id)) AS can_restore,
      api.user_can_write_list(l.id) AS can_manage_sharing,
      g.item_count, g.type_breakdown
    FROM object_list l
    LEFT JOIN app_user_profile p ON p.id = l.created_by
    CROSS JOIN LATERAL internal.list_grid_summary(l.id) g
    WHERE l.created_by = (SELECT auth.uid())
      AND l.org_object_id = api.current_user_org_id()
      AND internal.org_membership_active(l.created_by, l.org_object_id)
  ) s;
$$;
REVOKE ALL ON FUNCTION api.list_my_lists() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_my_lists() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.list_featured_lists()
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp
AS $$
  SELECT COALESCE(json_agg(s ORDER BY s.updated_at DESC), '[]'::json)
  FROM (
    SELECT
      l.id, l.name, l.name_en, l.kind, l.status, l.lang,
      CASE WHEN l.created_by = (SELECT auth.uid()) THEN l.recipient_label ELSE NULL END AS recipient_label,
      l.accent, COALESCE(l.cover_url, g.cover_image) AS cover_url, l.updated_at,
      l.created_by, p.display_name AS creator_name, l.org_object_id,
      l.last_activity_at,
      FALSE AS is_archived,
      l.is_featured, l.feature_requested_at,
      (l.share_enabled AND l.share_token IS NOT NULL
       AND (l.share_expires_at IS NULL OR l.share_expires_at > now())) AS has_active_share_link,
      api.user_can_write_list(l.id) AS can_edit,
      api.user_can_manage_list_feature_action(l.id) AS can_manage_feature,
      ((l.created_by = (SELECT auth.uid())) AND NOT l.is_featured) AS can_propose_feature,
      FALSE AS can_restore,
      api.user_can_write_list(l.id) AS can_manage_sharing,
      g.item_count, g.type_breakdown
    FROM object_list l
    LEFT JOIN app_user_profile p ON p.id = l.created_by
    CROSS JOIN LATERAL internal.list_grid_summary(l.id) g
    WHERE l.is_featured AND l.org_object_id = api.current_user_org_id()
  ) s;
$$;
REVOKE ALL ON FUNCTION api.list_featured_lists() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_featured_lists() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.list_list_proposals()
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp
AS $$
  SELECT COALESCE(json_agg(s ORDER BY s.updated_at DESC), '[]'::json)
  FROM (
    SELECT
      l.id, l.name, l.name_en, l.kind, l.status, l.lang,
      CASE WHEN l.created_by = (SELECT auth.uid()) THEN l.recipient_label ELSE NULL END AS recipient_label,
      l.accent, COALESCE(l.cover_url, g.cover_image) AS cover_url, l.updated_at,
      l.created_by, p.display_name AS creator_name, l.org_object_id,
      l.last_activity_at,
      api.list_is_archived(l.is_featured, l.last_activity_at) AS is_archived,
      l.is_featured, l.feature_requested_at,
      (l.share_enabled AND l.share_token IS NOT NULL
       AND (l.share_expires_at IS NULL OR l.share_expires_at > now())) AS has_active_share_link,
      api.user_can_write_list(l.id) AS can_edit,
      api.user_can_manage_list_feature_action(l.id) AS can_manage_feature,
      ((l.created_by = (SELECT auth.uid())) AND NOT l.is_featured) AS can_propose_feature,
      (api.list_is_archived(l.is_featured, l.last_activity_at) AND api.user_can_write_list(l.id)) AS can_restore,
      api.user_can_write_list(l.id) AS can_manage_sharing,
      g.item_count, g.type_breakdown
    FROM object_list l
    LEFT JOIN app_user_profile p ON p.id = l.created_by
    CROSS JOIN LATERAL internal.list_grid_summary(l.id) g
    WHERE l.feature_requested_at IS NOT NULL
      AND NOT l.is_featured
      AND NOT api.list_is_archived(l.is_featured, l.last_activity_at)
      AND l.org_object_id = api.current_user_org_id()
      AND (internal.org_is_admin((SELECT auth.uid()), l.org_object_id) OR COALESCE(api.is_platform_superuser(), FALSE))
  ) s;
$$;
REVOKE ALL ON FUNCTION api.list_list_proposals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_list_proposals() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
