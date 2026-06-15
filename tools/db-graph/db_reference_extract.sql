-- db_reference_extract.sql
-- Read-only live reference dump for Supabase MCP `execute_sql`.
--
-- Usage:
-- 1. Run this whole query via `mcp__supabase__execute_sql`.
-- 2. Save the returned JSON row to `db-graph-out/reference_live.json`.
-- 3. Run `.tools/python/Scripts/python.exe tools/db-graph/db_graph.py`.
--
-- The query reads `public.ref_code` once (including all partitions) plus the
-- standalone public `ref_*` tables used by the API documentation.

WITH live_rows AS (
  SELECT 'public.ref_actor_role' AS table_name, to_jsonb(t) AS row_data FROM public.ref_actor_role t
  UNION ALL SELECT 'public.ref_amenity', to_jsonb(t) FROM public.ref_amenity t
  UNION ALL SELECT 'public.ref_capacity_applicability', to_jsonb(t) FROM public.ref_capacity_applicability t
  UNION ALL SELECT 'public.ref_capacity_metric', to_jsonb(t) FROM public.ref_capacity_metric t
  UNION ALL SELECT 'public.ref_classification_equivalent_action', to_jsonb(t) FROM public.ref_classification_equivalent_action t
  UNION ALL SELECT 'public.ref_classification_equivalent_group', to_jsonb(t) FROM public.ref_classification_equivalent_group t
  UNION ALL SELECT 'public.ref_classification_scheme', to_jsonb(t) FROM public.ref_classification_scheme t
  UNION ALL SELECT 'public.ref_classification_value', to_jsonb(t) FROM public.ref_classification_value t
  UNION ALL SELECT 'public.ref_code', to_jsonb(t) FROM public.ref_code t
  UNION ALL SELECT 'public.ref_code_domain_registry', to_jsonb(t) FROM public.ref_code_domain_registry t
  UNION ALL SELECT 'public.ref_code_taxonomy_closure', to_jsonb(t) FROM public.ref_code_taxonomy_closure t
  UNION ALL SELECT 'public.ref_commune', to_jsonb(t) FROM public.ref_commune t
  UNION ALL SELECT 'public.ref_contact_role', to_jsonb(t) FROM public.ref_contact_role t
  UNION ALL SELECT 'public.ref_document', to_jsonb(t) FROM public.ref_document t
  UNION ALL SELECT 'public.ref_facet_applicability', to_jsonb(t) FROM public.ref_facet_applicability t
  UNION ALL SELECT 'public.ref_facet_registry', to_jsonb(t) FROM public.ref_facet_registry t
  UNION ALL SELECT 'public.ref_iti_assoc_role', to_jsonb(t) FROM public.ref_iti_assoc_role t
  UNION ALL SELECT 'public.ref_language', to_jsonb(t) FROM public.ref_language t
  UNION ALL SELECT 'public.ref_legal_type', to_jsonb(t) FROM public.ref_legal_type t
  UNION ALL SELECT 'public.ref_object_relation_type', to_jsonb(t) FROM public.ref_object_relation_type t
  UNION ALL SELECT 'public.ref_org_admin_role', to_jsonb(t) FROM public.ref_org_admin_role t
  UNION ALL SELECT 'public.ref_org_business_role', to_jsonb(t) FROM public.ref_org_business_role t
  UNION ALL SELECT 'public.ref_org_role', to_jsonb(t) FROM public.ref_org_role t
  UNION ALL SELECT 'public.ref_permission', to_jsonb(t) FROM public.ref_permission t
  UNION ALL SELECT 'public.ref_review_source', to_jsonb(t) FROM public.ref_review_source t
  UNION ALL SELECT 'public.ref_sustainability_action', to_jsonb(t) FROM public.ref_sustainability_action t
  UNION ALL SELECT 'public.ref_sustainability_action_category', to_jsonb(t) FROM public.ref_sustainability_action_category t
  UNION ALL SELECT 'public.ref_sustainability_action_group', to_jsonb(t) FROM public.ref_sustainability_action_group t
  UNION ALL SELECT 'public.ref_tag', to_jsonb(t) FROM public.ref_tag t
),
live_tables AS (
  SELECT json_agg(table_name ORDER BY table_name) AS names
  FROM (SELECT DISTINCT table_name FROM live_rows) t
)
SELECT json_build_object(
  'rows', COALESCE((
    SELECT json_agg(
      json_build_object(
        'table', table_name,
        'values', row_data,
        'source', 'mcp:' || table_name,
        'source_kind', 'mcp_execute_sql'
      )
      ORDER BY
        table_name,
        row_data->>'domain',
        row_data->>'position',
        row_data->>'code',
        row_data->>'slug',
        row_data->>'external_code',
        row_data->>'name'
    )
    FROM live_rows
  ), '[]'::json),
  'derived_sources', '[]'::json,
  'live', json_build_object(
    'status', 'mcp_queried',
    'tables', COALESCE((SELECT names FROM live_tables), '[]'::json),
    'errors', '[]'::json,
    'truncated', '[]'::json
  )
) AS reference_extract;
