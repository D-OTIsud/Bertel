-- Targeted, read-only catalogue supplement. No concept rows or function bodies.
-- Run via the verified Bertel Supabase MCP account, then save supplement JSON.
WITH scoped_functions AS (
 SELECT p.*,n.nspname AS schema_name
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='thesaurus' AND p.proname IN (
   'has_editorial_text','normalize_editorial_text','definition_errors',
   'assert_release_definitions','guard_immutable','concept_document',
   'validate_document','apply_source','preparation_contract_registry',
   'assert_preparation_contract','assert_current_authority','current_actor',
   'admin_dispatch','public_dispatch','activate','publication_documents'))
 OR (n.nspname='api' AND p.proname IN ('thesaurus_admin','thesaurus_public'))
), scoped_tables AS (
 SELECT c.*,n.nspname AS schema_name
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='thesaurus' AND c.relkind IN ('r','p')
)
SELECT jsonb_build_object(
 '_capture',jsonb_build_object(
   'scope','thesaurus-editorial-policy-and-private-search-contract',
   'captured_at',statement_timestamp(),'database_name',current_database(),
   'server_version_num',current_setting('server_version_num'),
   'read_only_query',true,'complete_catalogue_refresh',false,
   'concept_rows_included',false,'function_bodies_included',false,
   'source','PostgreSQL catalogue SELECT; transport and project verified separately'),
 'migrations',COALESCE((SELECT jsonb_agg(jsonb_build_object('version',version,'name',name) ORDER BY version)
   FROM supabase_migrations.schema_migrations
   WHERE name IN ('thesaurus_required_definitions','thesaurus_complete_admin_batches',
     'thesaurus_simple_business_names','thesaurus_legacy_search_term_roundtrip',
     'thesaurus_complete_editorial_definitions')),'[]'::jsonb),
 'functions',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'signature',f.oid::regprocedure::text,'schema',f.schema_name,'name',f.proname,
   'arguments',pg_get_function_arguments(f.oid),'returns',pg_get_function_result(f.oid),
   'owner',pg_get_userbyid(f.proowner),'acl',f.proacl::text,
   'security_definer',f.prosecdef,'volatility',f.provolatile,'settings',f.proconfig,
   'definition_md5',md5(pg_get_functiondef(f.oid)),
   'body_md5',md5(replace(f.prosrc,chr(13),'')),
   'execute_roles',(SELECT COALESCE(jsonb_agg(CASE WHEN a.grantee=0 THEN 'PUBLIC'
     ELSE pg_get_userbyid(a.grantee)::text END ORDER BY a.grantee),'[]'::jsonb)
     FROM aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) a
     WHERE a.privilege_type='EXECUTE'),
   'effective_execute',jsonb_build_object(
     'anon',has_function_privilege('anon',f.oid,'EXECUTE'),
     'authenticated',has_function_privilege('authenticated',f.oid,'EXECUTE'),
     'service_role',has_function_privilege('service_role',f.oid,'EXECUTE'),
     'bertel_thesaurus_publisher',has_function_privilege('bertel_thesaurus_publisher',f.oid,'EXECUTE'))
 ) ORDER BY f.schema_name,f.proname,pg_get_function_identity_arguments(f.oid))
 FROM scoped_functions f),'[]'::jsonb),
 'table_security',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'table',t.schema_name||'.'||t.relname,'owner',pg_get_userbyid(t.relowner),
   'rls_enabled',t.relrowsecurity,'rls_forced',t.relforcerowsecurity,'acl',t.relacl::text,
   'effective_access',jsonb_build_object(
     'anon_select',has_table_privilege('anon',t.oid,'SELECT'),
     'authenticated_select',has_table_privilege('authenticated',t.oid,'SELECT'),
     'service_role_select',has_table_privilege('service_role',t.oid,'SELECT'),
     'anon_write',has_table_privilege('anon',t.oid,'INSERT,UPDATE,DELETE'),
     'authenticated_write',has_table_privilege('authenticated',t.oid,'INSERT,UPDATE,DELETE'),
     'service_role_write',has_table_privilege('service_role',t.oid,'INSERT,UPDATE,DELETE')),
   'policies',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
     'name',p.policyname,'command',p.cmd,'roles',p.roles,'permissive',p.permissive,
     'qual',p.qual,'with_check',p.with_check) ORDER BY p.policyname),'[]'::jsonb)
     FROM pg_policies p WHERE p.schemaname=t.schema_name AND p.tablename=t.relname)
 ) ORDER BY t.relname) FROM scoped_tables t),'[]'::jsonb),
 'vocabulary_columns',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
   'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid='thesaurus.vocabulary'::regclass AND a.attnum>0 AND NOT a.attisdropped
     AND a.attname IN ('require_definition','required_languages','is_public','is_governed')),'[]'::jsonb),
 'vocabulary_constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'name',c.conname,'type',c.contype,'validated',c.convalidated,
   'definition',pg_get_constraintdef(c.oid,true)) ORDER BY c.conname)
   FROM pg_constraint c WHERE c.conrelid='thesaurus.vocabulary'::regclass),'[]'::jsonb),
 'vocabulary_policies',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'domain',v.domain,'is_public',v.is_public,'is_governed',v.is_governed,
   'require_definition',v.require_definition,'required_languages',v.required_languages)
   ORDER BY v.domain) FROM thesaurus.vocabulary v),'[]'::jsonb),
 'publisher_role',(SELECT jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,
   'inherit',r.rolinherit,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
   'memberships',COALESCE((SELECT jsonb_agg(jsonb_build_object(
     'member',pg_get_userbyid(m.member),'grantor',pg_get_userbyid(m.grantor),
     'inherit',m.inherit_option,'set',m.set_option,
     'admin',m.admin_option) ORDER BY pg_get_userbyid(m.member),pg_get_userbyid(m.grantor))
     FROM pg_auth_members m WHERE m.roleid=r.oid),'[]'::jsonb))
   FROM pg_roles r WHERE r.rolname='bertel_thesaurus_publisher')
) AS supplement;
