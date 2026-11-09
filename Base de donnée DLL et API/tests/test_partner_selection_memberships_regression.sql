-- Independent payload differential and page-cost probe. Synthetic local/CI data
-- only, real serializers and shared matcher, all fixtures are rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '180s';
SET LOCAL plpgsql.check_asserts = on;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $test$
DECLARE
  org_id constant text := 'ORGPERFMEM000001';
  last_id constant text := 'COMPERFMEM000203';
  old_page jsonb; new_page jsonb; stripped jsonb; before_memberships jsonb;
  old_updated_at timestamptz; cursor_value text; taxonomy_codes text[];
  view_value text; format_value text; tax_path boolean; sample integer;
  selection_count integer; requested_size integer; started timestamptz;
  old_ms numeric; new_ms numeric; measurement jsonb := '[]';
  baseline_hashes jsonb; after_hashes jsonb;
BEGIN
  SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(p.prosrc)) INTO baseline_hashes
    FROM pg_proc p WHERE p.oid IN (
      'api.list_partner_objects_with_vocabulary(text,text[],integer,text[],text[],text,text,text,text,text,text[],boolean)'::regprocedure,
      'api.get_partner_object_with_vocabulary(text,text[],text,text,boolean)'::regprocedure,
      'api.list_partner_selection_objects_with_vocabulary(jsonb,text,text,text,text,text[],integer,text,text,text,text,text[])'::regprocedure,
      'api.get_filtered_object_ids(jsonb,public.object_type[],public.object_status[],text)'::regprocedure);

  UPDATE internal.partner_selection SET state='suspended';
  INSERT INTO public.object(id,object_type,name,status) VALUES
    (org_id,'ORG','Synthetic membership performance organization','published');
  INSERT INTO public.object(id,object_type,name,status)
    SELECT 'COMPERFMEM'||lpad(n::text,6,'0'),'COM',
      'membershipperf fixture '||lpad(n::text,6,'0'),'published'
    FROM generate_series(1,203) n;
  INSERT INTO public.object_taxonomy(object_id,domain,ref_code_id)
    SELECT 'COMPERFMEM'||lpad(n::text,6,'0'),'taxonomy_com',r.id
    FROM generate_series(1,203) n
    JOIN public.ref_code r ON r.domain='taxonomy_com' AND r.code='covered_market';
  INSERT INTO internal.partner_selection(id,org_object_id,name,buckets)
    SELECT 9100000+n,org_id,'Synthetic membership perf '||n,
      '[{"types":["COM"],"filters":{"taxonomy_any":[{"domain":"taxonomy_com","code":"covered_market"}]}}]'::jsonb
    FROM generate_series(1,15) n;
  -- Fixtures must be present in the same canonical projection used by the
  -- taxonomy path. The refresh and all synthetic rows are transaction-local.
  REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;

  SET LOCAL ROLE service_role;
  -- Cover both old wrapper branches and every supported pivot. Only remove
  -- the newly promised field; metadata, order, IDs and nested payloads stay exact.
  FOREACH view_value IN ARRAY ARRAY['card','full'] LOOP
    FOREACH format_value IN ARRAY ARRAY['','jsonld','datatourisme','apidae','tourinsoft'] LOOP
      FOREACH tax_path IN ARRAY ARRAY[false,true] LOOP
        taxonomy_codes := CASE WHEN tax_path THEN ARRAY['taxonomy_com:covered_market'] ELSE NULL END;
        old_page := api.list_partner_objects_with_vocabulary(p_types=>ARRAY['COM'],
          p_search=>'membershipperf',p_page_size=>7,p_view=>view_value,
          p_format=>format_value,p_taxonomy_codes=>taxonomy_codes);
        new_page := api.list_partner_objects_with_selection_ids(p_types=>ARRAY['COM'],
          p_search=>'membershipperf',p_page_size=>7,p_view=>view_value,
          p_format=>format_value,p_taxonomy_codes=>taxonomy_codes);
        SELECT COALESCE(jsonb_agg(item-'selection_ids' ORDER BY ord),'[]'::jsonb) INTO stripped
          FROM jsonb_array_elements(new_page->'data') WITH ORDINALITY page(item,ord);
        ASSERT jsonb_set(new_page,'{data}',stripped)=old_page,
          format('Only root selection_ids may differ: view=%s format=%s taxonomy=%s old_meta=%s new_meta=%s',
            view_value,format_value,tax_path,old_page-'data',new_page-'data');
        ASSERT jsonb_array_length(new_page#>'{data,0,selection_ids}')=15;
        cursor_value := COALESCE(old_page#>>'{meta,next_cursor}',old_page#>>'{info,next_cursor}');
        ASSERT cursor_value IS NOT NULL, 'Synthetic corpus must exercise a real continuation';
        old_page := api.list_partner_objects_with_vocabulary(p_cursor=>cursor_value,
          p_types=>ARRAY['COM'],p_search=>'membershipperf',p_page_size=>7,
          p_view=>view_value,p_format=>format_value,p_taxonomy_codes=>taxonomy_codes);
        new_page := api.list_partner_objects_with_selection_ids(p_cursor=>cursor_value,
          p_types=>ARRAY['COM'],p_search=>'membershipperf',p_page_size=>7,
          p_view=>view_value,p_format=>format_value,p_taxonomy_codes=>taxonomy_codes);
        SELECT COALESCE(jsonb_agg(item-'selection_ids' ORDER BY ord),'[]'::jsonb) INTO stripped
          FROM jsonb_array_elements(new_page->'data') WITH ORDINALITY page(item,ord);
        ASSERT jsonb_set(new_page,'{data}',stripped)=old_page,
          'Opt-in continuation altered the legacy payload';
      END LOOP;
    END LOOP;
  END LOOP;
  -- The member is beyond a selection reader's first 200 records. A caller's
  -- one-item general page must still resolve all 15 memberships without truncation.
  before_memberships := internal.partner_selection_memberships(ARRAY[last_id]);
  ASSERT jsonb_array_length(before_memberships->last_id)=15,
    'Membership was truncated at a selection serializer page boundary';
  SELECT updated_at INTO STRICT old_updated_at FROM public.object WHERE id=last_id;
  RESET ROLE;
  UPDATE internal.partner_selection SET state='suspended' WHERE id=9100015;
  SET LOCAL ROLE service_role;
  ASSERT jsonb_array_length(internal.partner_selection_memberships(ARRAY[last_id])->last_id)=14;
  ASSERT (SELECT updated_at FROM public.object WHERE id=last_id)=old_updated_at,
    'Selection changes must not require touching object.updated_at';
  RESET ROLE;
  UPDATE internal.partner_selection SET state='active' WHERE id=9100015;

  -- Timings are observations, not a flaky ratio assertion or a production SLA.
  -- Alternate old/new calls after warm-up, with 0 versus 15 active selections.
  FOREACH selection_count IN ARRAY ARRAY[0,15] LOOP
    UPDATE internal.partner_selection SET state=CASE WHEN selection_count=0 THEN 'suspended' ELSE 'active' END
      WHERE id BETWEEN 9100001 AND 9100015;
    SET LOCAL ROLE service_role;
    FOREACH view_value IN ARRAY ARRAY['card','full'] LOOP
      requested_size := CASE WHEN view_value='full' THEN 100 ELSE 200 END;
      FOR sample IN 0..3 LOOP
        started := clock_timestamp();
        old_page := api.list_partner_objects_with_vocabulary(p_types=>ARRAY['COM'],
          p_search=>'membershipperf',p_page_size=>requested_size,p_view=>view_value);
        old_ms := extract(epoch FROM clock_timestamp()-started)*1000;
        started := clock_timestamp();
        new_page := api.list_partner_objects_with_selection_ids(p_types=>ARRAY['COM'],
          p_search=>'membershipperf',p_page_size=>requested_size,p_view=>view_value);
        new_ms := extract(epoch FROM clock_timestamp()-started)*1000;
        SELECT COALESCE(jsonb_agg(item-'selection_ids' ORDER BY ord),'[]'::jsonb) INTO stripped
          FROM jsonb_array_elements(new_page->'data') WITH ORDINALITY page(item,ord);
        ASSERT jsonb_set(new_page,'{data}',stripped)=old_page;
        ASSERT jsonb_array_length(new_page->'data')=requested_size;
        IF sample>0 THEN
          measurement := measurement||jsonb_build_array(jsonb_build_object(
            'active_selections',selection_count,'view',view_value,'page_size',requested_size,
            'sample',sample,'legacy_ms',round(old_ms,3),'opt_in_ms',round(new_ms,3)));
        END IF;
      END LOOP;
    END LOOP;
    RESET ROLE;
  END LOOP;
  SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(p.prosrc)) INTO after_hashes
    FROM pg_proc p WHERE p.oid::regprocedure::text IN (SELECT jsonb_object_keys(baseline_hashes));
  ASSERT after_hashes=baseline_hashes, 'Existing reader/core bodies changed during regression';
  RAISE NOTICE 'membership_regression_measurements=%',measurement;
END
$test$;
ROLLBACK;
DO $$ BEGIN RAISE NOTICE 'test_partner_selection_memberships_regression.sql: OK'; END $$;
