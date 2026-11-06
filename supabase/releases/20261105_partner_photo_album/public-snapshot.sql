-- SELECT ONLY. Save output in the private operator evidence folder, never Git.
-- Same resource arguments as public v1 FR/track=none; trim its two editor legs.
-- Refuse a privileged/user/test projection instead of exporting private data.
WITH expected(name) AS (VALUES
 ('list_object_resources_page_text'),('get_object_resource'),('list_object_markers'),('list_reference_bundle'),
 ('list_catalog'),('public_catalog_domains'),('list_deleted_objects_since'),('get_object_i18n_all'),
 ('get_object_jsonld'),('get_object_interop'),('get_objects_interop_batch'),('get_object_tourinsoft'),('get_objects_tourinsoft_batch')),
 readers AS (
  SELECT e.name,pg_get_function_identity_arguments(p.oid) AS args,
   md5(replace(p.prosrc,E'\r\n',E'\n')) AS source_md5,pg_get_userbyid(p.proowner) AS owner,
   p.prosecdef AS security_definer,p.proconfig AS config,p.proacl::text AS acl,p.prorettype::regtype::text AS returns
  FROM expected e LEFT JOIN pg_proc p ON p.proname=e.name AND p.pronamespace='api'::regnamespace
 ), samples AS (
  SELECT DISTINCT ON(o.object_type) o.id,o.object_type::text AS object_type
  FROM public.object o WHERE o.status='published' AND NOT o.is_test ORDER BY o.object_type,o.id
 ), raw_resources AS MATERIALIZED (
  SELECT s.*,(auth.uid() IS NULL AND NOT api.current_user_test_realm()
   AND NOT COALESCE(api.can_read_extended(s.id),false)) AS public_context,
   CASE WHEN auth.uid() IS NULL AND NOT api.current_user_test_realm() AND NOT COALESCE(api.can_read_extended(s.id),false)
    THEN api.get_object_resource(s.id,ARRAY['fr']::text[],'none','{}'::jsonb)::jsonb END AS raw_payload
  FROM samples s
 ), resources AS (
  SELECT r.*,r.raw_payload-'canonical_description'-'org_description' AS payload FROM raw_resources r
 )
SELECT now() AS observed_at,
 jsonb_build_object('db_role',current_user,'jwt_role',auth.role(),'uid_present',auth.uid() IS NOT NULL,'test_realm',api.current_user_test_realm()) AS context,
 (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name,r.args) FROM readers r) AS functions,
 (SELECT jsonb_agg(jsonb_build_object('id',r.id,'object_type',r.object_type,'public_context',r.public_context,
   'raw_sql_payload_md5',md5(r.raw_payload::text),'raw_payload',r.raw_payload,
   'sql_payload_md5',md5(r.payload::text),'payload',r.payload) ORDER BY r.object_type,r.id) FROM resources r) AS resources;
