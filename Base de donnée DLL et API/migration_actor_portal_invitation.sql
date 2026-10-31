-- Lot 6. Invitations réellement expédiées, adoption par office et une relance J+7.
-- La réservation ne contient aucun destinataire choisi par le client HTTP.
BEGIN;
CREATE TABLE IF NOT EXISTS public.portal_invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_object_id text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.actor(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_invited_at timestamptz NOT NULL DEFAULT now(),
  last_invited_at timestamptz NOT NULL DEFAULT now(),
  invitation_count integer NOT NULL DEFAULT 1 CHECK (invitation_count > 0),
  reminder_due_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'),
  reminder_claim uuid,
  reminder_claimed_at timestamptz,
  reminder_sent_at timestamptz,
  reminder_attempted_at timestamptz,
  reminder_attempts integer NOT NULL DEFAULT 0 CHECK (reminder_attempts >= 0),
  reminder_last_error text,
  UNIQUE(org_object_id,actor_id)
);
REVOKE ALL ON TABLE public.portal_invitation FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.portal_invitation TO service_role;
ALTER TABLE public.portal_invitation ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS portal_invitation_due_idx ON public.portal_invitation(reminder_due_at)
  WHERE reminder_sent_at IS NULL AND user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS portal_invitation_user_idx ON public.portal_invitation(user_id);
CREATE INDEX IF NOT EXISTS portal_invitation_actor_idx ON public.portal_invitation(actor_id);
CREATE INDEX IF NOT EXISTS portal_invitation_inviter_idx ON public.portal_invitation(invited_by);

CREATE OR REPLACE FUNCTION internal.portal_launch_assert_admin(p_org_id text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api AS $function$
BEGIN
 IF auth.uid() IS NULL OR api.is_actor_persona()
   OR NOT COALESCE(api.user_can_manage_org_smtp(p_org_id),false)
   OR NOT EXISTS(SELECT 1 FROM public.object WHERE id=p_org_id AND object_type='ORG'
      AND is_test=(SELECT api.current_user_test_realm())) THEN
  RAISE EXCEPTION 'Administration de cet office requise' USING ERRCODE='42501';
 END IF;
END $function$;

-- Source commune aux statistiques et à la sélection. Un acteur est compté une
-- seule fois même lorsqu'il gère plusieurs fiches de l'office.
CREATE OR REPLACE FUNCTION internal.portal_launch_actors(p_org_id text)
RETURNS TABLE(actor_id uuid,actor_name text,email text,user_id uuid,activated_at timestamptz,
  invited_at timestamptz,first_submission_at timestamptz,reminded_at timestamptz,
  fiche_names jsonb,types jsonb,communes jsonb,email_conflict boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 WITH fiches AS (
  SELECT DISTINCT a.id actor_id,a.display_name,o.id object_id,o.name,o.object_type,
    COALESCE(nullif(l.city,''),c.name) commune
  FROM public.actor a JOIN public.actor_object_role ar ON ar.actor_id=a.id
  JOIN public.object o ON o.id=ar.object_id
  JOIN public.object org ON org.id=p_org_id AND org.object_type='ORG'
  JOIN public.object_org_link ol ON ol.object_id=o.id AND ol.org_object_id=org.id
  JOIN public.ref_org_role rr ON rr.id=ol.role_id AND rr.code='publisher'
  LEFT JOIN LATERAL (SELECT lo.city,lo.code_insee FROM public.object_location lo WHERE lo.object_id=o.id
    ORDER BY lo.is_main_location DESC NULLS LAST,lo.position,lo.id LIMIT 1) l ON true
  LEFT JOIN public.ref_commune c ON c.insee_code=l.code_insee
  WHERE a.is_test=org.is_test AND o.is_test=org.is_test
   AND o.object_type IN ('HOT','HPA','HLO','CAMP','RVA','RES','LOI','PCU','PNA','PRD','ASC','ACT','PSV','COM','SPU')
   AND (ar.valid_from IS NULL OR ar.valid_from<=CURRENT_DATE)
   AND (ar.valid_to IS NULL OR ar.valid_to>=CURRENT_DATE)
 ), grouped AS (
  SELECT f.actor_id,min(f.display_name) actor_name,jsonb_agg(DISTINCT f.name) fiche_names,
    jsonb_agg(DISTINCT f.object_type) types,
    COALESCE(jsonb_agg(DISTINCT f.commune) FILTER(WHERE f.commune IS NOT NULL),'[]') communes
  FROM fiches f GROUP BY f.actor_id
 )
 SELECT g.actor_id,g.actor_name,ch.email,p.id,u.last_sign_in_at,
    COALESCE(i.first_invited_at,CASE WHEN p.id IS NOT NULL THEN u.created_at END),
    (SELECT min(fs.submitted_at) FROM public.fiche_submission fs JOIN fiches f ON f.object_id=fs.object_id AND f.actor_id=fs.actor_id
      WHERE fs.actor_id=g.actor_id),i.reminder_sent_at,g.fiche_names,g.types,g.communes,
    (EXISTS(SELECT 1 FROM auth.users taken WHERE lower(taken.email)=ch.email AND taken.id IS DISTINCT FROM p.id)
      OR EXISTS(SELECT 1 FROM public.app_user_profile linked WHERE linked.actor_id=g.actor_id AND linked.role IS DISTINCT FROM 'actor'))
 FROM grouped g
 LEFT JOIN public.app_user_profile p ON p.actor_id=g.actor_id AND p.role='actor'
 LEFT JOIN auth.users u ON u.id=p.id
 LEFT JOIN public.portal_invitation i ON i.actor_id=g.actor_id AND i.org_object_id=p_org_id
 JOIN LATERAL (
   SELECT lower(trim(ac.value)) email FROM public.actor_channel ac JOIN public.ref_code_contact_kind k ON k.id=ac.kind_id AND k.code='email'
   WHERE ac.actor_id=g.actor_id AND trim(ac.value) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
   ORDER BY (lower(trim(ac.value))=lower(u.email)) DESC NULLS LAST,ac.is_primary DESC NULLS LAST,ac.position,ac.id LIMIT 1
 ) ch ON true;
$function$;

CREATE OR REPLACE FUNCTION api.get_portal_launch(p_org_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,api,internal AS $function$
DECLARE v_stats jsonb; v_people jsonb; v_pending bigint; v_delay numeric; v_smtp jsonb;
BEGIN
 PERFORM internal.portal_launch_assert_admin(p_org_id);
 SELECT jsonb_build_object('reachable',count(*),'invited',count(*) FILTER(WHERE invited_at IS NOT NULL),
  'activated',count(*) FILTER(WHERE activated_at IS NOT NULL),'submitted',count(*) FILTER(WHERE first_submission_at IS NOT NULL),
  'reminded',count(*) FILTER(WHERE reminded_at IS NOT NULL)),
  COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.actor_name,a.actor_id),'[]')
 INTO v_stats,v_people FROM internal.portal_launch_actors(p_org_id) a;
 SELECT count(*) FILTER(WHERE fs.status IN ('pending','partial')),
  round(avg(extract(epoch FROM (fs.resolved_at-fs.submitted_at))/86400) FILTER(WHERE fs.resolved_at IS NOT NULL),1)
 INTO v_pending,v_delay FROM public.fiche_submission fs
 WHERE EXISTS(SELECT 1 FROM public.object_org_link l JOIN public.ref_org_role r ON r.id=l.role_id AND r.code='publisher'
   JOIN public.object o ON o.id=l.object_id WHERE l.object_id=fs.object_id AND l.org_object_id=p_org_id
     AND o.is_test=(SELECT api.current_user_test_realm()));
 SELECT jsonb_build_object('configured',s.is_enabled AND length(trim(s.host))>0 AND length(trim(s.from_email))>0,
   'tested',s.last_test_ok IS TRUE,'testedAt',s.last_test_at) INTO v_smtp
 FROM public.org_smtp_settings s WHERE s.org_object_id=p_org_id;
 RETURN jsonb_build_object('stats',v_stats,'actors',v_people,'pending',v_pending,'averageReviewDays',v_delay,
  'canInvite',COALESCE(api.current_user_can_manage_actor_portal(),false),
  'reminderFailures',(SELECT count(*) FROM public.portal_invitation WHERE org_object_id=p_org_id AND reminder_attempted_at IS NOT NULL AND reminder_sent_at IS NULL AND (reminder_claim IS NULL OR reminder_claimed_at<now()-interval '10 minutes')),
  'smtp',COALESCE(v_smtp,'{"configured":false,"tested":false}'));
END $function$;

CREATE OR REPLACE FUNCTION api.record_portal_invitation(p_org_id text,p_actor_id uuid,p_user_id uuid,p_invited_by uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'Service required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.app_user_profile p JOIN public.actor a ON a.id=p.actor_id
  JOIN public.object org ON org.id=p_org_id AND org.object_type='ORG' AND org.is_test=a.is_test
  WHERE p.id=p_user_id AND p.actor_id=p_actor_id AND p.role='actor')
 OR NOT EXISTS(SELECT 1 FROM internal.portal_launch_actors(p_org_id) a WHERE a.actor_id=p_actor_id AND a.user_id=p_user_id) THEN
  RAISE EXCEPTION 'Compte hors du périmètre de cet office' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.portal_invitation(org_object_id,actor_id,user_id,invited_by)
 VALUES(p_org_id,p_actor_id,p_user_id,p_invited_by)
 ON CONFLICT(org_object_id,actor_id) DO UPDATE SET user_id=EXCLUDED.user_id,invited_by=EXCLUDED.invited_by,
  last_invited_at=now(),invitation_count=portal_invitation.invitation_count+1,
  reminder_due_at=now()+interval '7 days',reminder_claim=NULL,reminder_claimed_at=NULL,reminder_last_error=NULL;
 -- Un renvoi manuel ne remet jamais reminder_sent_at à NULL : une relance automatique au plus.
END $function$;

CREATE OR REPLACE FUNCTION api.claim_portal_reminders(p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE v_result jsonb;
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'Service required' USING ERRCODE='42501'; END IF;
 WITH due AS (
  SELECT i.id FROM public.portal_invitation i
  JOIN public.app_user_profile p ON p.id=i.user_id AND p.actor_id=i.actor_id AND p.role='actor'
  JOIN auth.users u ON u.id=p.id AND u.last_sign_in_at IS NULL AND u.email IS NOT NULL
  JOIN public.org_smtp_settings s ON s.org_object_id=i.org_object_id AND s.is_enabled AND s.host<>'' AND s.from_email<>''
  WHERE i.reminder_sent_at IS NULL AND i.reminder_attempted_at IS NULL AND i.reminder_due_at<=now()
    AND (i.reminder_claimed_at IS NULL OR i.reminder_claimed_at<now()-interval '10 minutes')
    AND EXISTS(SELECT 1 FROM internal.portal_launch_actors(i.org_object_id) a WHERE a.actor_id=i.actor_id
      AND a.user_id=i.user_id AND a.email=lower(u.email) AND NOT a.email_conflict)
  ORDER BY i.reminder_due_at,i.id FOR UPDATE OF i SKIP LOCKED LIMIT greatest(1,least(COALESCE(p_limit,20),50))
 ), claimed AS (
  UPDATE public.portal_invitation i SET reminder_claim=gen_random_uuid(),reminder_claimed_at=now(),
   reminder_attempts=reminder_attempts+1 FROM due WHERE i.id=due.id RETURNING i.*
 ) SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'claim',c.reminder_claim,'orgId',c.org_object_id,
  'actorId',c.actor_id,'userId',c.user_id,'email',u.email)),'[]') INTO v_result
 FROM claimed c JOIN auth.users u ON u.id=c.user_id;
 RETURN v_result;
END $function$;

-- Barrière avant SMTP : un crash après l'envoi ou un acquittement perdu ne
-- déclenche pas une seconde relance. Un échec reste consultable par l'office.
CREATE OR REPLACE FUNCTION api.start_portal_reminder(p_id uuid,p_claim uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'Service required' USING ERRCODE='42501'; END IF;
 UPDATE public.portal_invitation i SET reminder_attempted_at=now()
 WHERE i.id=p_id AND i.reminder_claim=p_claim AND i.reminder_claimed_at>now()-interval '10 minutes'
  AND i.reminder_sent_at IS NULL AND i.reminder_attempted_at IS NULL
  AND EXISTS(SELECT 1 FROM public.app_user_profile p JOIN auth.users u ON u.id=p.id
    WHERE p.id=i.user_id AND p.actor_id=i.actor_id AND p.role='actor' AND u.last_sign_in_at IS NULL);
 RETURN FOUND;
END $function$;

CREATE OR REPLACE FUNCTION api.finish_portal_reminder(p_id uuid,p_claim uuid,p_sent boolean,p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
BEGIN
 IF COALESCE(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'Service required' USING ERRCODE='42501'; END IF;
 UPDATE public.portal_invitation SET reminder_sent_at=CASE WHEN p_sent THEN now() ELSE reminder_sent_at END,
  reminder_last_error=CASE WHEN p_sent THEN NULL ELSE left(COALESCE(p_error,'delivery_failed'),80) END,
  reminder_due_at=CASE WHEN p_sent THEN reminder_due_at ELSE now()+interval '1 day' END,
  reminder_claim=NULL,reminder_claimed_at=NULL
 WHERE id=p_id AND reminder_claim=p_claim;
END $function$;

REVOKE ALL ON FUNCTION internal.portal_launch_assert_admin(text),internal.portal_launch_actors(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION api.get_portal_launch(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.get_portal_launch(text) TO authenticated;
REVOKE ALL ON FUNCTION api.record_portal_invitation(text,uuid,uuid,uuid),api.claim_portal_reminders(integer),api.start_portal_reminder(uuid,uuid),api.finish_portal_reminder(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION api.record_portal_invitation(text,uuid,uuid,uuid),api.claim_portal_reminders(integer),api.start_portal_reminder(uuid,uuid),api.finish_portal_reminder(uuid,uuid,boolean,text) TO service_role;
COMMIT;
NOTIFY pgrst,'reload schema';
