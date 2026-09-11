-- Bell and e-mail notifications for ordinary contributor suggestions.
-- One open notification per object, submitter and eligible moderator; section
-- submissions coalesce until their last pending item is resolved. Portal fiche
-- submissions keep their existing task notifications and are excluded here.

ALTER TABLE public.app_notification DROP CONSTRAINT IF EXISTS chk_app_notification_kind;
ALTER TABLE public.app_notification ADD CONSTRAINT chk_app_notification_kind
  CHECK (kind IN ('crm_task_assigned', 'fiche_submission_reviewed',
                  'list_feature_requested', 'pending_change_submitted'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_notification_pending_change_recipient
  ON public.app_notification (recipient_id, (payload->>'object_id'), created_by)
  WHERE kind = 'pending_change_submitted';
CREATE INDEX IF NOT EXISTS idx_pending_change_internal_open
  ON public.pending_change (object_id, submitted_by, submitted_at, id)
  WHERE status = 'pending' AND submission_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_app_notification_pending_change_group
  ON public.app_notification ((payload->>'object_id'), created_by)
  WHERE kind = 'pending_change_submitted';

-- Recipient form of api.user_can_moderate_object. No JWT substitution: the
-- caller remains the contributor throughout submission. This internal helper
-- mirrors the effective permission's two independent grants and the publisher
-- scope; administrative rank alone never grants moderation.
CREATE OR REPLACE FUNCTION internal.user_can_moderate_pending_object(
  p_user_id uuid, p_object_id text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp
AS $$
  SELECT p_user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id)
    AND (
      EXISTS (SELECT 1 FROM public.app_user_profile p
              WHERE p.id = p_user_id AND p.role IN ('owner', 'super_admin'))
      OR (
        EXISTS (
          SELECT 1 FROM public.user_org_membership m
          JOIN public.object_org_link l ON l.org_object_id = m.org_object_id
          JOIN public.ref_org_role r ON r.id = l.role_id AND r.code = 'publisher'
          JOIN public.object o ON o.id = l.object_id
          WHERE m.user_id = p_user_id AND m.is_active AND l.object_id = p_object_id
            AND o.is_test = (
              -- app_metadata is administrator-controlled; never user_metadata.
              COALESCE((SELECT u.raw_app_meta_data->>'sandbox_discovery' = 'true'
                        FROM auth.users u WHERE u.id = p_user_id), false)
              OR EXISTS (SELECT 1 FROM public.user_org_membership tm
                         JOIN public.org_config c ON c.org_object_id = tm.org_object_id
                         WHERE tm.user_id = p_user_id AND tm.is_active AND c.is_test_org)
              OR EXISTS (SELECT 1 FROM public.app_user_profile ap
                         JOIN public.actor a ON a.id = ap.actor_id
                         WHERE ap.id = p_user_id AND ap.role = 'actor' AND a.is_test)
            )
        )
        AND (
          EXISTS (
            SELECT 1 FROM public.user_permission up
            JOIN public.ref_permission p ON p.id = up.permission_id
            WHERE up.user_id = p_user_id AND up.is_active
              AND p.code = 'validate_changes' AND p.is_active
          )
          OR EXISTS (
            SELECT 1 FROM public.org_role_permission rp
            JOIN public.ref_permission p ON p.id = rp.permission_id
            JOIN public.user_org_membership m ON m.org_object_id = rp.org_object_id
            JOIN public.user_org_business_role br ON br.membership_id = m.id
            WHERE m.user_id = p_user_id AND m.is_active
              AND br.is_active AND br.role_id = rp.role_id AND rp.is_active
              AND p.code = 'validate_changes' AND p.is_active
          )
        )
      )
    );
$$;
REVOKE ALL ON FUNCTION internal.user_can_moderate_pending_object(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.pending_change_notification_is_open(
  p_object_id text, p_submitter_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pending_change pc
    WHERE pc.object_id = p_object_id AND pc.submitted_by = p_submitter_id
      AND pc.status = 'pending' AND pc.submission_id IS NULL
  );
$$;
REVOKE ALL ON FUNCTION internal.pending_change_notification_is_open(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.sync_pending_change_notifications(
  p_object_id text, p_submitter_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp
AS $$
DECLARE
  v_pending_id uuid;
BEGIN
  IF p_object_id IS NULL OR p_submitter_id IS NULL THEN RETURN; END IF;

  SELECT pc.id INTO v_pending_id
  FROM public.pending_change pc
  WHERE pc.object_id = p_object_id AND pc.submitted_by = p_submitter_id
    AND pc.status = 'pending' AND pc.submission_id IS NULL
  ORDER BY pc.submitted_at, pc.id LIMIT 1;

  IF v_pending_id IS NULL THEN
    DELETE FROM public.app_notification n
    WHERE n.kind = 'pending_change_submitted'
      AND n.payload->>'object_id' = p_object_id AND n.created_by = p_submitter_id;
    RETURN;
  END IF;

  -- Keep a surviving pending id as the anchor after a partial review, without
  -- resetting read/e-mail state or notifying again for every edited section.
  UPDATE public.app_notification n
  SET payload = jsonb_set(n.payload, '{pending_change_id}', to_jsonb(v_pending_id))
  WHERE n.kind = 'pending_change_submitted'
    AND n.payload->>'object_id' = p_object_id AND n.created_by = p_submitter_id
    AND n.payload->>'pending_change_id' IS DISTINCT FROM v_pending_id::text;

  INSERT INTO public.app_notification (recipient_id, kind, created_by, payload)
  SELECT u.id, 'pending_change_submitted', p_submitter_id,
         jsonb_build_object('object_id', p_object_id,
                            'pending_change_id', v_pending_id,
                            'submitted_by', p_submitter_id)
  FROM auth.users u
  WHERE u.id <> p_submitter_id
    AND internal.user_can_moderate_pending_object(u.id, p_object_id)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION internal.sync_pending_change_notifications(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.tg_pending_change_notifications()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth, pg_temp
AS $$
DECLARE
  v_old_object text;
  v_old_submitter uuid;
  v_new_object text;
  v_new_submitter uuid;
  v_lock bigint;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.submission_id IS NULL THEN
    v_old_object := OLD.object_id;
    v_old_submitter := OLD.submitted_by;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.submission_id IS NULL THEN
    v_new_object := NEW.object_id;
    v_new_submitter := NEW.submitted_by;
  END IF;

  -- Serialise simultaneous section submissions and the final review. For a
  -- move between groups, take locks in one deterministic order.
  FOR v_lock IN
    SELECT DISTINCT hashtextextended('pending-change-notification:' || x.object_id || ':' || x.submitter::text, 0)
    FROM (VALUES (v_old_object, v_old_submitter), (v_new_object, v_new_submitter)) x(object_id, submitter)
    WHERE x.object_id IS NOT NULL AND x.submitter IS NOT NULL
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(v_lock);
  END LOOP;

  IF v_old_object IS NOT NULL AND v_old_submitter IS NOT NULL THEN
    PERFORM internal.sync_pending_change_notifications(v_old_object, v_old_submitter);
  END IF;
  IF v_new_object IS NOT NULL AND v_new_submitter IS NOT NULL
     AND (v_new_object, v_new_submitter) IS DISTINCT FROM (v_old_object, v_old_submitter) THEN
    PERFORM internal.sync_pending_change_notifications(v_new_object, v_new_submitter);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION internal.tg_pending_change_notifications()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_pending_change_notifications ON public.pending_change;
CREATE TRIGGER trg_pending_change_notifications
  AFTER INSERT OR UPDATE OF status, object_id, submitted_by, submission_id OR DELETE
  ON public.pending_change
  FOR EACH ROW EXECUTE FUNCTION internal.tg_pending_change_notifications();

-- Extend the live inbox/outbox definitions captured 2026-09-11. Task creator
-- sender fields, portal review fields, lease TTL, retry cap and acknowledgements
-- are retained. Eligibility is checked again before showing or claiming alerts.
CREATE OR REPLACE FUNCTION api.list_my_notifications(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'internal', 'auth', 'pg_temp'
AS $function$
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
      'object_id', CASE WHEN n.kind = 'pending_change_submitted' THEN n.payload->>'object_id' ELSE ct.object_id END,
      'object_name', o.name,
      'created_by_id', n.created_by,
      'created_by_name', api.crm_user_label(n.created_by, cp.display_name),
      'payload', n.payload
    ) AS item
    FROM public.app_notification n
    LEFT JOIN public.crm_task ct ON ct.id = n.task_id
    LEFT JOIN public.object o ON o.id = CASE WHEN n.kind = 'pending_change_submitted' THEN n.payload->>'object_id' ELSE ct.object_id END
    LEFT JOIN public.app_user_profile cp ON cp.id = n.created_by
    WHERE n.recipient_id = v_me
      AND (n.kind <> 'pending_change_submitted' OR (
        n.recipient_id IS DISTINCT FROM n.created_by
        AND COALESCE(api.user_can_moderate_object(n.payload->>'object_id'), false)
        AND internal.pending_change_notification_is_open(n.payload->>'object_id', n.created_by)
      ))
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
      AND (n.kind <> 'pending_change_submitted' OR (
        n.recipient_id IS DISTINCT FROM n.created_by
        AND COALESCE(api.user_can_moderate_object(n.payload->>'object_id'), false)
        AND internal.pending_change_notification_is_open(n.payload->>'object_id', n.created_by)
      ))
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
$function$
;
REVOKE ALL ON FUNCTION api.list_my_notifications(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_my_notifications(integer) TO authenticated, service_role;

DROP INDEX IF EXISTS public.idx_app_notification_unmailed;
CREATE INDEX idx_app_notification_unmailed
  ON public.app_notification (created_at)
  WHERE email_sent_at IS NULL
    AND kind IN ('crm_task_assigned', 'fiche_submission_reviewed', 'pending_change_submitted')
    AND email_attempts < 5;

CREATE OR REPLACE FUNCTION api.claim_unmailed_notifications(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'internal', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  WITH claimable AS (
    SELECT n.id
    FROM app_notification n
    WHERE n.kind IN ('crm_task_assigned', 'fiche_submission_reviewed', 'pending_change_submitted')
      AND (n.kind <> 'pending_change_submitted' OR (
        n.recipient_id IS DISTINCT FROM n.created_by
        AND internal.user_can_moderate_pending_object(n.recipient_id, n.payload->>'object_id')
        AND internal.pending_change_notification_is_open(n.payload->>'object_id', n.created_by)
      ))
      AND n.email_sent_at IS NULL
      AND n.email_attempts < 5
      AND (n.email_claimed_at IS NULL OR n.email_claimed_at < now() - interval '10 minutes')
    ORDER BY n.created_at
    LIMIT GREATEST(COALESCE(p_limit, 20), 1)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE app_notification n SET email_claimed_at = now()
    FROM claimable c WHERE n.id = c.id
    RETURNING n.id, n.recipient_id, n.task_id, n.created_by, n.created_at, n.kind, n.payload
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'notification_id', cl.id,
           'kind', cl.kind,
           'recipient_email', NULLIF(u.email, ''),
           'recipient_name', api.crm_user_label(cl.recipient_id, rp.display_name),
           'task_title', ct.title,
           'object_name', o.name,
           'object_id', CASE WHEN cl.kind = 'pending_change_submitted' THEN cl.payload->>'object_id' ELSE ct.object_id END,
           'due_at', ct.due_at,
           'assigner_name', api.crm_user_label(cl.created_by, ap.display_name),
           -- ct.created_by is the immutable task author. cl.created_by is instead
           -- the latest assigner/reviewer and must never determine this sender.
           'creator_email', CASE WHEN cl.kind = 'crm_task_assigned'
             THEN NULLIF(btrim(cu.email), '') END,
           'creator_name', CASE WHEN cl.kind = 'crm_task_assigned'
             THEN api.crm_user_label(ct.created_by, cp.display_name) END,
           'outcome', (cl.payload->>'outcome'),
           'submission_id', (cl.payload->>'submission_id'),
           'pending_change_id', (cl.payload->>'pending_change_id')
         ) ORDER BY cl.created_at, cl.id), '[]'::jsonb)
  INTO v_rows
  FROM claimed cl
  LEFT JOIN auth.users u        ON u.id  = cl.recipient_id
  LEFT JOIN app_user_profile rp ON rp.id = cl.recipient_id
  LEFT JOIN crm_task ct         ON ct.id = cl.task_id
  LEFT JOIN object o            ON o.id  = CASE WHEN cl.kind = 'pending_change_submitted' THEN cl.payload->>'object_id' ELSE ct.object_id END
  LEFT JOIN app_user_profile ap ON ap.id = cl.created_by
  LEFT JOIN auth.users cu       ON cu.id = ct.created_by
  LEFT JOIN app_user_profile cp ON cp.id = ct.created_by;

  -- Destinataire sans e-mail : terminée, pas retournée.
  UPDATE app_notification n
  SET email_sent_at = now(), email_error = 'no_recipient_email'
  WHERE n.id IN (
    SELECT (item->>'notification_id')::uuid
    FROM jsonb_array_elements(v_rows) item
    WHERE item->>'recipient_email' IS NULL
  );

  RETURN COALESCE((
    SELECT jsonb_agg(item)
    FROM jsonb_array_elements(v_rows) item
    WHERE item->>'recipient_email' IS NOT NULL
  ), '[]'::jsonb);
END;
$function$
;
REVOKE ALL ON FUNCTION api.claim_unmailed_notifications(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.claim_unmailed_notifications(integer) TO service_role;

CREATE OR REPLACE FUNCTION api.mark_notifications_emailed(p_sent uuid[], p_failed jsonb DEFAULT '[]'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'internal', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_n integer := 0;
BEGIN
  UPDATE app_notification SET email_sent_at = now(), email_error = NULL
  WHERE id = ANY(COALESCE(p_sent, ARRAY[]::uuid[]))
    AND kind IN ('crm_task_assigned', 'fiche_submission_reviewed', 'pending_change_submitted') AND email_sent_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE app_notification n
  SET email_error = f.err, email_claimed_at = NULL, email_attempts = n.email_attempts + 1
  FROM (
    SELECT (item->>'id')::uuid AS id, COALESCE(item->>'error', 'send_failed') AS err
    FROM jsonb_array_elements(COALESCE(p_failed, '[]'::jsonb)) item
    WHERE item->>'id' IS NOT NULL
  ) f
  WHERE n.id = f.id
    AND n.kind IN ('crm_task_assigned', 'fiche_submission_reviewed', 'pending_change_submitted')
    AND n.email_sent_at IS NULL;

  RETURN v_n;
END;
$function$
;
REVOKE ALL ON FUNCTION api.mark_notifications_emailed(uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.mark_notifications_emailed(uuid[], jsonb) TO service_role;

-- Some installations still expose the organisation-SMTP diagnostic. Preserve
-- that deployed contract when present; fresh installations do not require the
-- retired organisation-SMTP tables to install contributor notifications.
DO $migration$
BEGIN
  IF to_regprocedure('api.count_notifications_blocked_no_smtp()') IS NOT NULL THEN
    EXECUTE $definition$
CREATE OR REPLACE FUNCTION api.count_notifications_blocked_no_smtp()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'auth'
AS $function$
  SELECT count(*)::integer
  FROM public.app_notification n
  WHERE n.kind IN ('crm_task_assigned', 'fiche_submission_reviewed', 'pending_change_submitted')
      AND (n.kind <> 'pending_change_submitted' OR (
        n.recipient_id IS DISTINCT FROM n.created_by
        AND internal.user_can_moderate_pending_object(n.recipient_id, n.payload->>'object_id')
        AND internal.pending_change_notification_is_open(n.payload->>'object_id', n.created_by)
      ))
    AND n.email_sent_at IS NULL
    AND n.email_attempts < 5
    AND NOT EXISTS (
      SELECT 1 FROM public.org_smtp_settings s
      WHERE s.is_enabled
        AND s.org_object_id = api.notification_relay_org(n.task_id, n.recipient_id)
    );
$function$

$definition$;
  END IF;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
