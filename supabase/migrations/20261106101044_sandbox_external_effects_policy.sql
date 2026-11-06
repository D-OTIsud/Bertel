BEGIN;

-- Preserve the in-app event while remembering that it must never send real mail,
-- even after the originating object/account is moved or deleted.
ALTER TABLE public.app_notification ADD COLUMN IF NOT EXISTS email_effects_blocked boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.app_notification.email_effects_blocked IS
  'Monotonic discovery/test provenance: real email is disabled; the in-app notification remains available.';

CREATE OR REPLACE FUNCTION internal.notification_has_sandbox_context(
  p_recipient_id uuid, p_created_by uuid, p_task_id uuid, p_payload jsonb
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,internal,pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id IN (p_recipient_id,p_created_by)
      AND u.raw_app_meta_data @> '{"sandbox_discovery":true}'::jsonb
  ) OR EXISTS (
    SELECT 1 FROM public.crm_task t
    LEFT JOIN public.object o ON o.id=t.object_id
    LEFT JOIN auth.users u ON u.id=t.created_by
    WHERE t.id=p_task_id AND (o.is_test IS TRUE OR u.raw_app_meta_data @> '{"sandbox_discovery":true}'::jsonb)
  ) OR EXISTS (
    SELECT 1 FROM public.object o WHERE o.id=p_payload->>'object_id' AND o.is_test IS TRUE
  );
$fn$;
REVOKE ALL ON FUNCTION internal.notification_has_sandbox_context(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION internal.guard_notification_external_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,internal,pg_temp
AS $fn$
BEGIN
  NEW.email_effects_blocked:=COALESCE(NEW.email_effects_blocked,false)
    OR (TG_OP='UPDATE' AND OLD.email_effects_blocked)
    OR internal.notification_has_sandbox_context(NEW.recipient_id,NEW.created_by,NEW.task_id,NEW.payload);
  IF NEW.email_effects_blocked THEN
    -- email_sent_at already represents both accepted emails and terminated
    -- no-email cases. This reason distinguishes suppression from actual sending.
    NEW.email_sent_at:=COALESCE(NEW.email_sent_at,now());
    NEW.email_error:='sandbox_external_effects_disabled';
    NEW.email_claimed_at:=NULL;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION internal.guard_notification_external_email() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS trg_guard_notification_external_email ON public.app_notification;
CREATE TRIGGER trg_guard_notification_external_email BEFORE INSERT OR UPDATE ON public.app_notification
  FOR EACH ROW EXECUTE FUNCTION internal.guard_notification_external_email();

-- Recognize pending discovery events without replaying or deleting notifications.
UPDATE public.app_notification n SET email_effects_blocked=true
WHERE n.email_sent_at IS NULL AND NOT n.email_effects_blocked
  AND internal.notification_has_sandbox_context(n.recipient_id,n.created_by,n.task_id,n.payload);

CREATE OR REPLACE FUNCTION api.suppress_sandbox_notification_emails(p_notification_ids uuid[])
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,internal,pg_temp
AS $fn$
DECLARE v_blocked uuid[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF cardinality(p_notification_ids)>1000 THEN RAISE EXCEPTION 'Too many notifications' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(array_agg(n.id ORDER BY n.id),ARRAY[]::uuid[]) INTO v_blocked
  FROM public.app_notification n
  WHERE n.id=ANY(p_notification_ids) AND (n.email_effects_blocked OR
    internal.notification_has_sandbox_context(n.recipient_id,n.created_by,n.task_id,n.payload));
  UPDATE public.app_notification SET email_effects_blocked=true WHERE id=ANY(v_blocked);
  -- Include previously terminated rows as well: an old claimant must still
  -- suppress its buffered envelope after a concurrent drain handled the row.
  RETURN v_blocked;
END;
$fn$;
REVOKE ALL ON FUNCTION api.suppress_sandbox_notification_emails(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.suppress_sandbox_notification_emails(uuid[]) TO service_role;
COMMENT ON FUNCTION api.suppress_sandbox_notification_emails(uuid[]) IS
  'Service-only final check before SMTP: terminates discovery/test notification email, retaining in-app events and durable provenance.';

COMMIT;
NOTIFY pgrst,'reload schema';
