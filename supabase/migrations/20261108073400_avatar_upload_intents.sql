-- Avatar-only admission, before Storage. No TTL, adoption, rearm or activation.
-- Integrate the owner-only erasure guard AFTER caller/input checks but BEFORE
-- INSERT gdpr_erasure_log (or any other erasure mutation) in the user branch:
-- IF p_subject_kind='user' THEN
--   PERFORM internal.gdpr_assert_no_avatar_upload(p_subject_id::uuid);
-- END IF;
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog,pg_temp;

DO $prerequisites$
BEGIN
 IF to_regclass('internal.gdpr_cleanup_task') IS NULL
    OR to_regprocedure('api.avatar_upload_allowed(uuid)') IS NULL THEN
   RAISE EXCEPTION 'Avatar intent requires the closed durable cleanup and inventory';
 END IF;
END;
$prerequisites$;

CREATE TABLE internal.avatar_upload_intent (
 id uuid PRIMARY KEY CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 user_id uuid NOT NULL,
 storage_path text NOT NULL UNIQUE,
 sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
 size_bytes bigint NOT NULL CHECK (size_bytes>0),
 state text NOT NULL DEFAULT 'engaged' CHECK (state IN ('engaged','finished')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 CHECK (storage_path=user_id::text||'/avatar-'||id::text||'.jpg'),
 CHECK ((state='finished')=(finished_at IS NOT NULL))
);
ALTER TABLE internal.avatar_upload_intent OWNER TO postgres;
ALTER TABLE internal.avatar_upload_intent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE internal.avatar_upload_intent FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX avatar_upload_intent_engaged_user_idx ON internal.avatar_upload_intent(user_id) WHERE state='engaged';
COMMENT ON TABLE internal.avatar_upload_intent IS
 'Private permanent avatar attempt identity and immutable byte/path binding. No cascade FK, expiry, adoption or rearm. Engaged attempts block user erasure; a receipt is never authority to erase.';

-- One shared formula, taken before active-state reads. RC is required because an
-- advisory-lock wait does not refresh a Repeatable Read transaction's old snapshot.
CREATE FUNCTION internal.avatar_subject_lock(p_user_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $function$
BEGIN
 IF p_user_id IS NULL THEN RAISE EXCEPTION 'invalid_avatar_subject' USING ERRCODE='22023'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN
   RAISE EXCEPTION 'avatar_admission_requires_read_committed' USING ERRCODE='0A000';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('avatar-user:'||p_user_id::text,0));
END;
$function$;

CREATE FUNCTION internal.gdpr_assert_no_avatar_upload(p_user_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $function$
BEGIN
 PERFORM internal.avatar_subject_lock(p_user_id);
 IF EXISTS(SELECT 1 FROM internal.avatar_upload_intent WHERE user_id=p_user_id AND state='engaged') THEN
   RAISE EXCEPTION 'avatar_upload_in_progress' USING ERRCODE='55000';
 END IF;
END;
$function$;

CREATE FUNCTION api.begin_avatar_upload(p_upload_id uuid,p_user_id uuid,p_storage_path text,p_sha256 text,p_size_bytes bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $function$
DECLARE v_row internal.avatar_upload_intent;
BEGIN
 PERFORM internal.avatar_subject_lock(p_user_id);
 IF api.avatar_upload_allowed(p_user_id) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'avatar_cleanup_in_progress' USING ERRCODE='55000';
 END IF;
 -- Auth may have succeeded before this request waited. Check the account AFTER
 -- the task gate: an auth_delete ACK can only follow the Auth deletion commit.
 -- An invited account need not have an application profile yet.
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_user_id AND u.deleted_at IS NULL) THEN
   RAISE EXCEPTION 'avatar_subject_unavailable' USING ERRCODE='55000';
 END IF;
 -- A repeated UUID is refused, even with identical arguments and even if engaged.
 -- Returning an old receipt here would admit a second producer for the same key.
 INSERT INTO internal.avatar_upload_intent(id,user_id,storage_path,sha256,size_bytes)
 VALUES(p_upload_id,p_user_id,p_storage_path,p_sha256,p_size_bytes)
 RETURNING * INTO v_row;
 RETURN jsonb_build_object('uploadId',v_row.id,'userId',v_row.user_id,'path',v_row.storage_path,
   'sha256',v_row.sha256,'sizeBytes',v_row.size_bytes,'state',v_row.state);
END;
$function$;

CREATE FUNCTION api.complete_avatar_upload(p_upload_id uuid,p_user_id uuid,p_storage_path text,p_sha256 text,p_size_bytes bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $function$
DECLARE v_row internal.avatar_upload_intent;
BEGIN
 PERFORM internal.avatar_subject_lock(p_user_id);
 SELECT * INTO v_row FROM internal.avatar_upload_intent WHERE id=p_upload_id FOR UPDATE;
 IF NOT FOUND OR v_row.user_id IS DISTINCT FROM p_user_id
    OR v_row.storage_path IS DISTINCT FROM p_storage_path OR v_row.sha256 IS DISTINCT FROM p_sha256
    OR v_row.size_bytes IS DISTINCT FROM p_size_bytes THEN
   RAISE EXCEPTION 'avatar_receipt_mismatch' USING ERRCODE='22023';
 END IF;
 IF v_row.state='engaged' THEN
   UPDATE internal.avatar_upload_intent SET state='finished',finished_at=clock_timestamp()
   WHERE id=p_upload_id RETURNING * INTO v_row;
 END IF;
 RETURN jsonb_build_object('uploadId',v_row.id,'userId',v_row.user_id,'path',v_row.storage_path,
   'sha256',v_row.sha256,'sizeBytes',v_row.size_bytes,'state',v_row.state);
END;
$function$;

ALTER FUNCTION internal.avatar_subject_lock(uuid) OWNER TO postgres;
ALTER FUNCTION internal.gdpr_assert_no_avatar_upload(uuid) OWNER TO postgres;
ALTER FUNCTION api.begin_avatar_upload(uuid,uuid,text,text,bigint) OWNER TO postgres;
ALTER FUNCTION api.complete_avatar_upload(uuid,uuid,text,text,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.avatar_subject_lock(uuid),internal.gdpr_assert_no_avatar_upload(uuid),
 api.begin_avatar_upload(uuid,uuid,text,text,bigint),api.complete_avatar_upload(uuid,uuid,text,text,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION api.begin_avatar_upload(uuid,uuid,text,text,bigint),
 api.complete_avatar_upload(uuid,uuid,text,text,bigint) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
