\set ON_ERROR_STOP on
-- OPERATOR-REVIEWED PROCEDURE ONLY; NOT EXECUTED BY THIS TASK.
-- Uses ONE already existing, explicitly selected is_test fiche and its already
-- authorized actor account. Creates no fixture/row/schema/database. No messaging,
-- moderation submission, provider/AI, storage upload or email call is made.
-- Required psql variables: pilot_object_id, pilot_user_id, pilot_title,
-- pilot_description, pilot_approved=yes. Never paste a JWT/service key here.
-- The approved operator impersonation is local to this ROLLBACK transaction;
-- it is not proof that an HTTP JWT/session or deployed React flow was tested.

-- Keep only a fingerprint for the comparison after ROLLBACK. No texts/private
-- paths are exported. All rows on that fiche, including hidden ones, are covered.
SELECT md5(COALESCE(jsonb_agg(to_jsonb(m)||jsonb_build_object('_revision',m.xmin::text||':'||m.ctid::text)
 ORDER BY m.id),'[]'::jsonb)::text) AS fingerprint
FROM public.media m WHERE m.object_id=:'pilot_object_id'
\gset pilot_before_

BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='20s';
SET LOCAL idle_in_transaction_session_timeout='30s';
SELECT set_config('bertel.photo_pilot_object',:'pilot_object_id',true);
SELECT set_config('bertel.photo_pilot_user',:'pilot_user_id',true);
SELECT set_config('bertel.photo_pilot_title',:'pilot_title',true);
SELECT set_config('bertel.photo_pilot_description',:'pilot_description',true);
SELECT set_config('bertel.photo_pilot_approved',:'pilot_approved',true);
DO $preflight$
BEGIN
 IF current_setting('bertel.photo_pilot_approved') IS DISTINCT FROM 'yes' THEN
  RAISE EXCEPTION 'The actual fiche/account/texts must be explicitly approved by the operator';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.object o JOIN public.actor_object_role aor ON aor.object_id=o.id
   JOIN public.actor a ON a.id=aor.actor_id JOIN public.app_user_profile u ON u.actor_id=a.id
   WHERE o.id=current_setting('bertel.photo_pilot_object') AND o.is_test AND o.object_type<>'ORG'
    AND u.id=current_setting('bertel.photo_pilot_user')::uuid AND u.role='actor' AND a.is_test
    AND (aor.valid_from IS NULL OR aor.valid_from<=CURRENT_DATE) AND (aor.valid_to IS NULL OR aor.valid_to>=CURRENT_DATE)) THEN
  RAISE EXCEPTION 'Need an existing is_test fiche already linked to the selected actor account' USING ERRCODE='42501';
 END IF;
 IF (SELECT count(*) FROM public.media m JOIN public.ref_code_media_type t ON t.id=m.media_type_id
  WHERE m.object_id=current_setting('bertel.photo_pilot_object') AND m.place_id IS NULL
   AND t.code='photo' AND m.is_published AND COALESCE(m.visibility,'public')='public')<2 THEN
  RAISE EXCEPTION 'Need at least two existing public root photos';
 END IF;
 IF to_regprocedure('api.get_my_portal_photo_workspace(text)') IS NULL
  OR to_regprocedure('api.reconcile_portal_photo_order(text,jsonb,jsonb)') IS NULL
  OR to_regprocedure('api.update_portal_photo_texts(text,uuid,jsonb,text,text)') IS NULL THEN
  RAISE EXCEPTION 'Reviewed album migration has not been deployed';
 END IF;
END;
$preflight$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('bertel.photo_pilot_user'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $pilot$
DECLARE v_object text:=current_setting('bertel.photo_pilot_object');w jsonb;before_order jsonb;after_order jsonb;first_photo jsonb;ids jsonb;
BEGIN
 w:=api.get_my_portal_photo_workspace(v_object);
 IF w->'writesEnabled' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Album writes are not enabled'; END IF;
 first_photo:=w->'published'->0;before_order:=w->'orderSnapshot';
 IF jsonb_array_length(w->'published')<2 THEN RAISE EXCEPTION 'Scope no longer contains two public photos'; END IF;
 w:=api.update_portal_photo_texts(v_object,(first_photo->>'id')::uuid,first_photo->'textSnapshot',
  current_setting('bertel.photo_pilot_title'),current_setting('bertel.photo_pilot_description'));
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(w->'published') p WHERE p->>'id'=first_photo->>'id'
  AND p->>'title'=current_setting('bertel.photo_pilot_title') AND p->>'description'=current_setting('bertel.photo_pilot_description')) THEN
  RAISE EXCEPTION 'Caption did not persist through the authorized workspace read';
 END IF;
 -- A text save must not implicitly choose/normalize a main or reorder photos.
 SELECT jsonb_agg(p-'revision' ORDER BY n) INTO before_order FROM jsonb_array_elements(before_order) WITH ORDINALITY a(p,n);
 SELECT jsonb_agg(p-'revision' ORDER BY n) INTO after_order FROM jsonb_array_elements(w->'orderSnapshot') WITH ORDINALITY a(p,n);
 IF before_order IS DISTINCT FROM after_order THEN RAISE EXCEPTION 'Text save changed raw photo order/main'; END IF;
 SELECT jsonb_agg(p->'id' ORDER BY CASE n WHEN 1 THEN 2 WHEN 2 THEN 1 ELSE n END)
  INTO ids FROM jsonb_array_elements(w->'published') WITH ORDINALITY a(p,n);
 w:=api.reconcile_portal_photo_order(v_object,w->'orderSnapshot',ids);
 IF w->'published'->0->'id' IS DISTINCT FROM ids->0 OR w->'published'->0->'isMain' IS DISTINCT FROM 'true'::jsonb
  OR w->'orderNeedsNormalization' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'Complete rotation/main did not persist'; END IF;
 RAISE NOTICE 'Authorized workspace read, caption write and complete rotation verified inside the transaction; ROLLBACK follows';
END;
$pilot$;
RESET ROLE;
ROLLBACK;

SELECT md5(COALESCE(jsonb_agg(to_jsonb(m)||jsonb_build_object('_revision',m.xmin::text||':'||m.ctid::text)
 ORDER BY m.id),'[]'::jsonb)::text)=:'pilot_before_fingerprint' AS restored
FROM public.media m WHERE m.object_id=:'pilot_object_id'
\gset pilot_after_
\if :pilot_after_restored
\echo 'PASS: all original media rows/texts/order/main restored after ROLLBACK'
\else
\echo 'FAIL: baseline differs; inspect concurrent edits before any further action'
\quit 1
\endif
