"""Build one read-only, body-free catalogue query for the partner-selection lot."""
from pathlib import Path

FUNCTIONS = (
    ("internal", "cuisine_filter_codes"),
    ("api", "get_filtered_object_ids"),
    ("internal", "partner_selection_can_manage"),
    ("internal", "partner_selection_validate"),
    ("internal", "partner_selection_document"),
    ("api", "list_partner_selections"),
    ("api", "get_partner_selection"),
    ("api", "create_partner_selection"),
    ("api", "update_partner_selection"),
    ("api", "set_partner_selection_state"),
    ("api", "prepare_partner_selection_preview"),
    ("api", "get_active_partner_selection_definition"),
    ("api", "seed_beta_partner_selections"),
)


def build_query():
    base = Path(__file__).with_name("db_catalog_bulk_extract.sql").read_text(encoding="utf-8")
    prefix = base[:base.index("function_rows AS (")].rstrip().rstrip(",")
    anchor = "   AND c.relkind IN('r','p','v','m','f')"
    assert prefix.count(anchor) == 1
    prefix = prefix.replace(anchor, anchor + "\n   AND n.nspname='internal' AND c.relname='partner_selection'")
    names = ",".join("('%s','%s')" % pair for pair in FUNCTIONS)
    return prefix + """
, target_functions AS (
 SELECT p.*,n.nspname AS schema_name
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname,p.proname) IN (""" + names + """)
)
SELECT jsonb_build_object(
 '_capture',jsonb_build_object('scope','partner-selection-admin-cuisine',
   'captured_at',statement_timestamp(),'database_name',current_database(),
   'source','PostgreSQL catalogue SELECT; transport/provenance supplied by the operator'),
 'table_catalog',jsonb_build_object(
   'tables',COALESCE((SELECT jsonb_agg(item ORDER BY oid) FROM table_rows),'[]'::jsonb),
   'relations',COALESCE((SELECT jsonb_agg(jsonb_build_object('table',child_name,'columns',child_columns,
     'parent_table',parent_name,'parent_columns',parent_columns,'def',definition) ORDER BY oid)
     FROM constraint_rows WHERE contype='f'),'[]'::jsonb)),
 'table_security',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'name',n.nspname||'.'||c.relname,'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity,
   'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,
   'policies',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',policyname,'cmd',cmd,
       'roles',roles,'permissive',permissive,'qual',qual,'with_check',with_check)),'[]'::jsonb)
       FROM pg_policies WHERE schemaname=n.nspname AND tablename=c.relname),
   'client_select',jsonb_build_object('anon',has_table_privilege('anon',c.oid,'SELECT'),
       'authenticated',has_table_privilege('authenticated',c.oid,'SELECT')),
   'client_write',jsonb_build_object('anon',has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE'),
       'authenticated',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE'))
 )) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='internal' AND c.relname='partner_selection'),'[]'::jsonb),
 'functions',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'schema',f.schema_name,'name',f.proname,'args',pg_get_function_arguments(f.oid),
   'returns',pg_get_function_result(f.oid),'security_definer',f.prosecdef,'volatility',f.provolatile,
   'comment',obj_description(f.oid,'pg_proc'),'body_md5',md5(replace(f.prosrc,chr(13),'')),
   'settings',f.proconfig,'owner',pg_get_userbyid(f.proowner),'acl',f.proacl::text,
   'execute_roles',(SELECT jsonb_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END ORDER BY a.grantee)
       FROM aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) a WHERE a.privilege_type='EXECUTE'),
   'effective_execute',jsonb_build_object('anon',has_function_privilege('anon',f.oid,'EXECUTE'),
       'authenticated',has_function_privilege('authenticated',f.oid,'EXECUTE'),
       'service_role',has_function_privilege('service_role',f.oid,'EXECUTE')),
   'dynamic_sql',f.prosrc ~* '\\mexecute\\M(.|\\n)*\\mformat\\s*\\(',
   'references',(SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',kind,'identifier',identifier,'evidence',evidence)
       ORDER BY kind,identifier),'[]'::jsonb) FROM (
     SELECT DISTINCT 'reads' AS kind,lower(match[2]) AS identifier,match[1]||' '||match[2] AS evidence
     FROM regexp_matches(f.prosrc,'\\m(from|join)\\s+([a-z_][a-z_0-9]*(?:\\.[a-z_][a-z_0-9]*)?)','ig') matches(match)
     UNION
     SELECT DISTINCT 'writes',lower(match[2]),match[1]||' '||match[2]
     FROM regexp_matches(f.prosrc,'\\m(insert\\s+into|update|delete\\s+from)\\s+([a-z_][a-z_0-9]*(?:\\.[a-z_][a-z_0-9]*)?)','ig') matches(match)
   ) refs)
 ) ORDER BY f.schema_name,f.proname) FROM target_functions f),'[]'::jsonb),
 'preserved_readers',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',n.nspname||'.'||p.proname,
   'body_md5',md5(replace(p.prosrc,chr(13),''))) ORDER BY p.proname)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='api' AND p.proname IN('list_partner_objects_with_vocabulary',
   'list_partner_selection_objects_with_vocabulary')),'[]'::jsonb)
) AS supplement;
"""


if __name__ == "__main__":
    print(build_query())
