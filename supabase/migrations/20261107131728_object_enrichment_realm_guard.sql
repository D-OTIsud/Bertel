-- DB04: keep the existing ORG contribution rule within the caller's corpus.
BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '15s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $preflight$
BEGIN
  IF to_regprocedure('internal.object_in_current_realm(text)') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_proc p
       JOIN pg_language l ON l.oid = p.prolang
       WHERE p.oid = to_regprocedure('api.user_can_write_enrichment(text)')
         AND p.prorettype = 'boolean'::regtype
         AND p.proargnames = ARRAY['p_object_id']
         AND l.lanname = 'sql'
         AND p.provolatile = 's'
         AND p.prosecdef
         AND p.proconfig = ARRAY['search_path=public, api, auth']
         AND md5(replace(p.prosrc, E'\r\n', E'\n')) = '0d84d1deee1f6f812adadeb3bbfc26df'
     )
  THEN
    RAISE EXCEPTION 'DB04 enrichment realm guard: unexpected predecessor';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION api.user_can_write_enrichment(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $fn$
  SELECT
    internal.object_in_current_realm(p_object_id)
    AND api.user_has_permission('edit_org_enrichment')
    AND EXISTS (
      SELECT 1
      FROM public.object_org_link ool
      JOIN public.ref_org_role ror ON ror.id = ool.role_id AND ror.code IN ('publisher', 'contributor')
      WHERE ool.object_id = p_object_id
        AND ool.org_object_id = api.current_user_org_id()
    )
$fn$;

COMMIT;
