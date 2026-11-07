-- The direct RPC is a SECURITY DEFINER because it reads the internal search
-- projection. Authorize both source arms before the fuzzy search gate.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;

DO $guard$
DECLARE
  target constant regprocedure :=
    'api.get_filtered_object_ids(jsonb,public.object_type[],public.object_status[],text)'::regprocedure;
  prior_body text;
  prior_definition text;
  prior_owner oid;
  prior_acl aclitem[];
  next_body text;
  expected record;
  mv_anchor constant text := $mv$    WHERE params.use_mv
$mv$;
  mv_replacement constant text := $mv$    WHERE params.use_mv
      AND EXISTS (
        SELECT 1 FROM public.object live
        WHERE live.id = m.id AND live.status = 'published' AND live.is_test IS FALSE
      )
$mv$;
  relation_anchor constant text := '    FROM object o';
  relation_replacement constant text := '    FROM public.object o';
  live_anchor constant text := $live$      AND o.is_test = (SELECT api.current_user_test_realm())
$live$;
  live_replacement constant text := $live$      AND o.is_test = (SELECT api.current_user_test_realm())
      AND (
        o.status = 'published'
        OR (SELECT auth.role()) IN ('service_role', 'admin')
        OR o.id IN (SELECT api.current_user_extended_object_ids())
      )
$live$;
BEGIN
  SELECT replace(p.prosrc, chr(13), ''),
         replace(pg_get_functiondef(p.oid), chr(13), ''), p.proowner, p.proacl
    INTO STRICT prior_body, prior_definition, prior_owner, prior_acl
    FROM pg_proc p WHERE p.oid = target;

  -- Live and fresh sources have different search bodies. Pin both, together
  -- with the definition (including signature, security and search path).
  SELECT * INTO expected FROM (VALUES
    ('de1cfd5c970156aca0f25105f45ee239', 'e5c5da2fdaeb100c26d30ff678a41f7c',
     'c4c23634e4b4e6f6608814a90710b829', '2585bccae24da52f6202689054372c2b'),
    ('47f2d9349755dec5f8aedaae08e8bf88', 'acd09348a0214c33fd00aadaf6aa4fe6',
     '9096646958ca9b9d31dd026dfb1d090c', 'aa52cbfc92966e8588ca50eeeeb0bed9')
  ) v(before_body, before_definition, after_body, after_definition)
  WHERE (md5(prior_body), md5(prior_definition)) IN (
    (v.before_body, v.before_definition), (v.after_body, v.after_definition)
  );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unexpected Explorer filter predecessor' USING ERRCODE = '55000';
  END IF;
  IF md5(prior_body) = expected.after_body THEN
    RETURN;
  END IF;

  IF (length(prior_body) - length(replace(prior_body, mv_anchor, ''))) / length(mv_anchor) <> 1
    OR (length(prior_body) - length(replace(prior_body, relation_anchor, ''))) / length(relation_anchor) <> 1
    OR (length(prior_body) - length(replace(prior_body, live_anchor, ''))) / length(live_anchor) <> 1
    OR strpos(prior_definition, prior_body) = 0
  THEN
    RAISE EXCEPTION 'Explorer filter authorization anchors differ' USING ERRCODE = '55000';
  END IF;

  next_body := replace(replace(replace(prior_body,
    mv_anchor, mv_replacement), relation_anchor, relation_replacement), live_anchor, live_replacement);
  EXECUTE replace(prior_definition, prior_body, next_body);

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.oid = target
      AND md5(replace(p.prosrc, chr(13), '')) = expected.after_body
      AND md5(replace(pg_get_functiondef(p.oid), chr(13), '')) = expected.after_definition
      AND p.proowner = prior_owner
      AND p.proacl IS NOT DISTINCT FROM prior_acl
  ) THEN
    RAISE EXCEPTION 'Explorer filter replacement did not converge' USING ERRCODE = '55000';
  END IF;
END
$guard$;

COMMIT;
