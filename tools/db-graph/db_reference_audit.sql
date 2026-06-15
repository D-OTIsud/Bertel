-- db_reference_audit.sql
-- Read-only compact audit for Supabase MCP `execute_sql`.
--
-- This intentionally returns counts, not all row values, so the MCP response
-- remains small enough for agents to consume without truncation. Use
-- `export_reference_live_rest.py` for the full local JSON export after
-- retrieving the project URL and publishable key through Supabase MCP.

SELECT jsonb_pretty(jsonb_build_object(
  'status', 'mcp_verified',
  'queried_at', now(),
  'ref_code_total', (SELECT count(*) FROM public.ref_code),
  'ref_tag_total', (SELECT count(*) FROM public.ref_tag),
  'ref_code_domains', (
    SELECT jsonb_agg(jsonb_build_object('domain', domain, 'rows', row_count) ORDER BY domain)
    FROM (
      SELECT domain, count(*) AS row_count
      FROM public.ref_code
      GROUP BY domain
    ) d
  ),
  'reference_table_counts', (
    SELECT jsonb_agg(jsonb_build_object('table', table_name, 'rows', row_count) ORDER BY table_name)
    FROM (VALUES
      ('public.ref_actor_role', (SELECT count(*) FROM public.ref_actor_role)),
      ('public.ref_amenity', (SELECT count(*) FROM public.ref_amenity)),
      ('public.ref_capacity_applicability', (SELECT count(*) FROM public.ref_capacity_applicability)),
      ('public.ref_capacity_metric', (SELECT count(*) FROM public.ref_capacity_metric)),
      ('public.ref_classification_equivalent_action', (SELECT count(*) FROM public.ref_classification_equivalent_action)),
      ('public.ref_classification_equivalent_group', (SELECT count(*) FROM public.ref_classification_equivalent_group)),
      ('public.ref_classification_scheme', (SELECT count(*) FROM public.ref_classification_scheme)),
      ('public.ref_classification_value', (SELECT count(*) FROM public.ref_classification_value)),
      ('public.ref_code', (SELECT count(*) FROM public.ref_code)),
      ('public.ref_code_domain_registry', (SELECT count(*) FROM public.ref_code_domain_registry)),
      ('public.ref_code_taxonomy_closure', (SELECT count(*) FROM public.ref_code_taxonomy_closure)),
      ('public.ref_commune', (SELECT count(*) FROM public.ref_commune)),
      ('public.ref_contact_role', (SELECT count(*) FROM public.ref_contact_role)),
      ('public.ref_document', (SELECT count(*) FROM public.ref_document)),
      ('public.ref_facet_applicability', (SELECT count(*) FROM public.ref_facet_applicability)),
      ('public.ref_facet_registry', (SELECT count(*) FROM public.ref_facet_registry)),
      ('public.ref_iti_assoc_role', (SELECT count(*) FROM public.ref_iti_assoc_role)),
      ('public.ref_language', (SELECT count(*) FROM public.ref_language)),
      ('public.ref_legal_type', (SELECT count(*) FROM public.ref_legal_type)),
      ('public.ref_object_relation_type', (SELECT count(*) FROM public.ref_object_relation_type)),
      ('public.ref_org_admin_role', (SELECT count(*) FROM public.ref_org_admin_role)),
      ('public.ref_org_business_role', (SELECT count(*) FROM public.ref_org_business_role)),
      ('public.ref_org_role', (SELECT count(*) FROM public.ref_org_role)),
      ('public.ref_permission', (SELECT count(*) FROM public.ref_permission)),
      ('public.ref_review_source', (SELECT count(*) FROM public.ref_review_source)),
      ('public.ref_sustainability_action', (SELECT count(*) FROM public.ref_sustainability_action)),
      ('public.ref_sustainability_action_category', (SELECT count(*) FROM public.ref_sustainability_action_category)),
      ('public.ref_sustainability_action_group', (SELECT count(*) FROM public.ref_sustainability_action_group)),
      ('public.ref_tag', (SELECT count(*) FROM public.ref_tag))
    ) AS t(table_name, row_count)
  )
)) AS mcp_reference_audit;
