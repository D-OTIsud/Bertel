-- db_supplement_extract.sql — the gaps tbls does not cover: functions (with bodies, for edge
-- inference only), RLS policies, enums (+ columns using them), and the type->facet applicability rows.
-- Emits a single JSON document. Run via psql (-tA) or the Supabase MCP.
SELECT json_build_object(
  'functions', COALESCE((
    SELECT json_agg(json_build_object(
      'schema', n.nspname,
      'name', p.proname,
      'args', pg_get_function_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef,
      'volatility', p.provolatile,
      'comment', obj_description(p.oid, 'pg_proc'),
      'body', p.prosrc
    ))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','api','internal','audit','crm')
      AND p.prokind = 'f'
  ), '[]'::json),
  'policies', COALESCE((
    SELECT json_agg(json_build_object(
      'schema', schemaname, 'table', tablename, 'name', policyname,
      'cmd', cmd, 'roles', roles, 'qual', qual, 'with_check', with_check
    ))
    FROM pg_policies WHERE schemaname IN ('public','api','internal','audit','crm')
  ), '[]'::json),
  'enums', COALESCE((
    SELECT json_agg(json_build_object(
      'schema', n.nspname, 'name', t.typname,
      'values', (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid),
      'used_by', (SELECT COALESCE(json_agg(DISTINCT (cn.nspname || '.' || c.relname || '.' || a.attname)), '[]'::json)
                  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace cn ON cn.oid = c.relnamespace
                  WHERE a.atttypid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
                    AND c.relkind IN ('r','p','v','m')
                    AND cn.nspname IN ('public','api','internal','audit','crm'))
    ))
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typtype = 'e' AND n.nspname IN ('public','api','internal','audit','crm')
  ), '[]'::json),
  'applicability', COALESCE((
    SELECT json_agg(json_build_object('object_type', a.object_type::text, 'facet_table', a.facet_table))
    FROM ref_facet_applicability a
  ), '[]'::json)
) AS extra;
