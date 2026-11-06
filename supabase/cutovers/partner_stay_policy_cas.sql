-- R2 CUTOVER ONLY: run after all office clients/imports have converted and isolated tests pass.
-- Not part of the additive migration manifest. Never reopen legacy DML on rollback.
BEGIN;
SET LOCAL lock_timeout='500ms';
SET LOCAL statement_timeout='10s';
DO $$ BEGIN
  IF to_regprocedure('api.save_object_capacity_policies(text,jsonb)') IS NULL
    OR to_regprocedure('api.patch_portal_stay_times(text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Install the additive R2 contracts before cutover.';
  END IF;
END $$;
REVOKE INSERT,UPDATE,DELETE ON public.object_stay_policy FROM PUBLIC,anon,authenticated;
-- An explicit column grant must not leave the legacy upsert path open.
DO $$ DECLARE v_column text; BEGIN
  FOR v_column IN SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='object_stay_policy' LOOP
    EXECUTE format('REVOKE INSERT (%I), UPDATE (%I) ON public.object_stay_policy FROM PUBLIC,anon,authenticated',v_column,v_column);
  END LOOP;
  IF to_regprocedure('api.save_portal_stay_times(text,text,text,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION api.save_portal_stay_times(text,text,text,text) FROM PUBLIC,anon,authenticated;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION api.patch_portal_stay_times(text,jsonb) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
