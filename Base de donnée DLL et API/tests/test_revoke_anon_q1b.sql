-- tests/test_revoke_anon_q1b.sql
-- Pins the Q1b anon denylist (migration_revoke_anon_q1b_denylist.sql — audit API Phase 1).
-- State assertions (run LIVE via MCP; grants are outside the fresh-apply gate, cf. Q1a):
--   (1) NO api trigger function is anon-executable (property-based — covers the 31 Class-1).
--   (2) the 26 Class-2 write/admin/dashboard functions are NOT anon-executable.
--   (3) the criticals — 15 RLS-policy helpers + the public reader RPCs + i18n helpers — REMAIN
--       anon-executable (so the public Explorer / partner-anon paths are NOT broken).
-- Read-only (no seeding, no rollback needed). RAISEs on any violation.
DO $$
DECLARE
  v_bad     int;
  v_sig     text;
  v_revoked text[] := ARRAY[
    -- Class 2 — must NOT be anon-executable
    'api.add_legal_record(text, text, jsonb, uuid, date, date, legal_validity_mode, text, timestamp with time zone, timestamp with time zone, text)',
    'api.update_legal_record(uuid, jsonb, uuid, date, date, legal_validity_mode, text, timestamp with time zone, timestamp with time zone, text)',
    'api.deliver_legal_document(uuid, uuid, timestamp with time zone, text)',
    'api.request_legal_document(uuid, timestamp with time zone)',
    'api.audit_legal_compliance(text[], boolean)',
    'api.generate_legal_expiry_notifications(integer, text[])',
    'api.rpc_upsert_ref_code(text, text, uuid, text, jsonb, integer)',
    'api.rpc_delete_ref_code(text, uuid)',
    'api.rpc_set_ref_code_active(uuid, text, boolean)',
    'api.rpc_reorder_ref_code(text, uuid[])',
    'api.list_ref_code_domains()',
    'api.ref_code_domain_is_editable(text)',
    'api.ref_code_usage_count(text, uuid)',
    'api.ref_code_usage_counts(text)',
    'api.get_dashboard_actualisation(object_type[], object_status[], jsonb, date, date, integer)',
    'api.get_dashboard_city_distribution(object_type[], object_status[], jsonb, date, date, integer)',
    'api.get_dashboard_completeness(object_type[], object_status[], jsonb, date, date, integer)',
    'api.get_dashboard_distinction_overview(object_type[], object_status[], jsonb, date, date)',
    'api.get_dashboard_scorecards(object_type[], object_status[], jsonb, date, date)',
    'api.get_dashboard_type_breakdown(object_type[], object_status[], jsonb, date, date)',
    'api.upsert_app_branding(text, text, text, text, text, text, text, text, text, jsonb, jsonb, boolean)',
    'api.sync_app_user_profile_from_auth_user(uuid, text, jsonb, jsonb)',
    'api.set_itinerary_track(text, jsonb)',
    'api.export_publication_indesign(uuid, integer, integer)',
    'api.export_itineraries_gpx_batch(text[], boolean)',
    'api.list_objects_with_validated_changes_since(timestamp with time zone)'
  ];
  v_kept text[] := ARRAY[
    -- RLS-policy helpers that gate SELECT-applicable policies — MUST stay anon-executable (P0.3).
    -- NB: user_can_write_canonical + user_can_create_object are ALSO policy-referenced but only in
    -- WRITE arms anon never evaluates ⇒ they are (correctly) NOT anon-executable and are NOT asserted.
    'api.can_read_object(text)', 'api.can_read_extended(text)', 'api.is_object_owner(text)',
    'api.user_can_write_object_canonical(text)',
    'api.current_user_extended_object_ids()', 'api.current_user_org_id()',
    'api.is_platform_superuser()', 'api.is_platform_admin()', 'api.is_platform_owner()',
    'api.can_read_object_private_notes(text)', 'api.can_write_object_private_notes(text)',
    'api.can_manage_object_private_note(uuid)', 'api.can_delete_object_private_note(uuid)',
    -- public reader RPCs + i18n helpers — MUST stay anon-executable (public Explorer / partner-anon)
    'api.get_object_resource(text, text[], text, jsonb)',
    'api.list_object_resources_filtered_page(text, text[], integer, jsonb, object_type[], object_status[], text, text, boolean, text, text)',
    'api.list_object_markers(object_type[], object_status[], jsonb, text)',
    'api.get_object_with_deep_data(text, text[], jsonb)',
    'api.get_public_branding()', 'api.get_app_branding()',
    'api.list_reference_bundle(text[], text)', 'api.list_catalog(text, text)', 'api.public_catalog_domains()',
    'api.i18n_pick(jsonb, text, text)', 'api.strip_markdown(text)', 'api.strip_markdown_i18n(jsonb)'
  ];
BEGIN
  -- (1) Property-based: NO api trigger function is anon-executable.
  SELECT count(*) INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='api' AND p.prorettype='pg_catalog.trigger'::regtype
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_bad <> 0 THEN RAISE EXCEPTION 'Q1b: % api trigger function(s) still anon-executable', v_bad; END IF;

  -- (2) The 26 Class-2 functions must NOT be anon-executable.
  FOREACH v_sig IN ARRAY v_revoked LOOP
    IF has_function_privilege('anon', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'Q1b: % is STILL anon-executable (should be revoked)', v_sig;
    END IF;
  END LOOP;

  -- (3) The criticals MUST remain anon-executable (else the public front / P0.3 breaks).
  FOREACH v_sig IN ARRAY v_kept LOOP
    IF NOT has_function_privilege('anon', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'Q1b REGRESSION: critical % is NO LONGER anon-executable', v_sig;
    END IF;
  END LOOP;

  RAISE NOTICE 'test_revoke_anon_q1b.sql: OK (triggers + 26 Class-2 revoked; 15 policy helpers + public readers intact)';
END $$;
