-- Task assignment e-mails use the task creator as their visible sender.
-- Prerequisites: migration_crm_task_multi_assignee_notifications.sql (created_by),
-- migration_crm_task_email_documents.sql, and migration_actor_portal.sql (both kinds).
-- Creator identity is joined at claim time; no e-mail address is copied to the outbox.
-- Historical/deleted creators remain NULL, allowing the server's SMTP fallback.

CREATE OR REPLACE FUNCTION api.claim_unmailed_notifications(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  WITH claimable AS (
    SELECT n.id
    FROM app_notification n
    WHERE n.kind IN ('crm_task_assigned', 'fiche_submission_reviewed')
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
           'due_at', ct.due_at,
           'assigner_name', api.crm_user_label(cl.created_by, ap.display_name),
           -- ct.created_by is the immutable task author. cl.created_by is instead
           -- the latest assigner/reviewer and must never determine this sender.
           'creator_email', CASE WHEN cl.kind = 'crm_task_assigned'
             THEN NULLIF(btrim(cu.email), '') END,
           'creator_name', CASE WHEN cl.kind = 'crm_task_assigned'
             THEN api.crm_user_label(ct.created_by, cp.display_name) END,
           'outcome', (cl.payload->>'outcome'),
           'submission_id', (cl.payload->>'submission_id')
         ) ORDER BY cl.created_at, cl.id), '[]'::jsonb)
  INTO v_rows
  FROM claimed cl
  LEFT JOIN auth.users u        ON u.id  = cl.recipient_id
  LEFT JOIN app_user_profile rp ON rp.id = cl.recipient_id
  LEFT JOIN crm_task ct         ON ct.id = cl.task_id
  LEFT JOIN object o            ON o.id  = ct.object_id
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
$function$;

REVOKE ALL ON FUNCTION api.claim_unmailed_notifications(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.claim_unmailed_notifications(integer) TO service_role;
COMMENT ON FUNCTION api.claim_unmailed_notifications(integer) IS
  'Outbox e-mail : crm_task_assigned et fiche_submission_reviewed (TTL 10 min, SKIP LOCKED, '
  '5 tentatives). Contenu joint en DB, creator_email/creator_name issus de crm_task.created_by '
  'pour les assignations uniquement. Réservée au drain Next en service_role.';

NOTIFY pgrst, 'reload schema';
