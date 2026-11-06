-- Real Supabase disposable-database regression for repeated canonical seed/UPSERT.
-- All function sabotage, regenerated fixtures and bootstrap replay roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='120s';
SET LOCAL lock_timeout='5s';
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $seed_replay$
DECLARE
  v_org text:=internal.test_org_id(); v_expected integer; v_before jsonb; v_after jsonb;
  v_definition text; v_body_md5 text; v_result jsonb; v_denied boolean:=false; v_detail text;
  v_old text:=$old$      INSERT INTO object (id, object_type, name, status, region_code, extra)
      VALUES (v_id, v_type::object_type, v_name, 'published', 'RUN',
              jsonb_build_object('test_corpus', true, 'seeded_at', now()))$old$;
  v_new text:=$new$      INSERT INTO object (id, object_type, name, status, region_code, extra, is_test)
      VALUES (v_id, v_type::object_type, v_name, 'published', 'RUN',
              jsonb_build_object('test_corpus', true, 'seeded_at', now()),
              api.object_expected_is_test(v_id))$new$;
BEGIN
  ASSERT EXISTS(SELECT 1 FROM public.org_config WHERE org_object_id=v_org AND is_test_org), 'A real configured test corpus is required';
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id=v_org AND is_test), 'The test ORG is a non-empty UPSERT witness';
  v_expected:=15*(SELECT count(*) FROM unnest(enum_range(NULL::public.object_type)) t WHERE t::text<>'ORG');
  ASSERT v_expected>0;
  ASSERT (SELECT count(*) FROM public.object WHERE extra->>'test_corpus'='true' AND object_type<>'ORG')=v_expected,
    'Repeated-seed proof requires the complete existing corpus, not an empty fixture';
  SELECT jsonb_agg(jsonb_build_object('id',o.id,'is_test',o.is_test,
    'primary_links',(SELECT count(*) FROM public.object_org_link l WHERE l.object_id=o.id AND l.is_primary),
    'locations',(SELECT count(*) FROM public.object_location l WHERE l.object_id=o.id),
    'descriptions',(SELECT count(*) FROM public.object_description d WHERE d.object_id=o.id),
    'opening_periods',(SELECT count(*) FROM public.opening_period p WHERE p.object_id=o.id),
    'prices',(SELECT count(*) FROM public.object_price p WHERE p.object_id=o.id),
    'actor_links',(SELECT count(*) FROM public.actor_object_role r WHERE r.object_id=o.id)) ORDER BY o.id)
    INTO v_before FROM public.object o WHERE o.extra->>'test_corpus'='true' AND o.object_type<>'ORG';
  ASSERT jsonb_array_length(v_before)=v_expected;

  -- Replay the actual bootstrap ORG UPSERT without choosing an independent flag.
  INSERT INTO public.object(id,object_type,name,status,region_code,extra,is_test)
    SELECT id,object_type,name,status,region_code,extra,api.object_expected_is_test(id)
    FROM public.object WHERE id=v_org
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,extra=EXCLUDED.extra;
  ASSERT EXISTS(SELECT 1 FROM public.object WHERE id=v_org AND is_test);

  SELECT pg_get_functiondef('internal.seed_test_corpus(integer)'::regprocedure),md5(prosrc)
    INTO v_definition,v_body_md5 FROM pg_proc WHERE oid='internal.seed_test_corpus(integer)'::regprocedure;
  ASSERT (length(v_definition)-length(replace(v_definition,v_new,'')))/length(v_new)=1,
    'The true seed must use exactly the reviewed canonical-derived INSERT caller';
  -- Reinstall only the old caller in a subtransaction. The real repeated seed
  -- must fail at BEFORE INSERT; catching that failure restores the corrected DDL.
  BEGIN
    EXECUTE replace(v_definition,v_new,v_old);
    PERFORM internal.seed_test_corpus(1);
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;
    v_denied:=v_detail='object_realm_is_derived';
  END;
  ASSERT v_denied, 'The predecessor caller did not reproduce the real seed replay regression';
  ASSERT (SELECT md5(prosrc) FROM pg_proc WHERE oid='internal.seed_test_corpus(integer)'::regprocedure)=v_body_md5,
    'Negative control did not roll back its function definition';

  v_result:=internal.seed_test_corpus(15);
  ASSERT (v_result->>'objects')::integer=v_expected;
  v_result:=internal.seed_test_corpus(15);
  ASSERT (v_result->>'objects')::integer=v_expected;
  ASSERT NOT EXISTS(SELECT 1 FROM public.object o WHERE o.extra->>'test_corpus'='true'
    AND (NOT o.is_test OR o.is_test IS DISTINCT FROM api.object_expected_is_test(o.id))),
    'Seed replay broke the derived realm invariant';
  SELECT jsonb_agg(jsonb_build_object('id',o.id,'is_test',o.is_test,
    'primary_links',(SELECT count(*) FROM public.object_org_link l WHERE l.object_id=o.id AND l.is_primary),
    'locations',(SELECT count(*) FROM public.object_location l WHERE l.object_id=o.id),
    'descriptions',(SELECT count(*) FROM public.object_description d WHERE d.object_id=o.id),
    'opening_periods',(SELECT count(*) FROM public.opening_period p WHERE p.object_id=o.id),
    'prices',(SELECT count(*) FROM public.object_price p WHERE p.object_id=o.id),
    'actor_links',(SELECT count(*) FROM public.actor_object_role r WHERE r.object_id=o.id)) ORDER BY o.id)
    INTO v_after FROM public.object o WHERE o.extra->>'test_corpus'='true' AND o.object_type<>'ORG';
  ASSERT v_after=v_before, 'Repeated real seed changed IDs, classification or duplicated child rows';
  RAISE NOTICE 'Real seed replay: old caller rejected, two complete reseeds and bootstrap UPSERT retained identical non-empty witnesses';
END;
$seed_replay$;
ROLLBACK;
