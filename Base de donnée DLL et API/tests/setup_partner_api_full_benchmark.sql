-- Fixed 100-resource corpus, disposable Supabase only; no production benchmark writes.
\ir assert_partner_api_ephemeral.sql
DO $$ BEGIN
  IF current_setting('bertel.ephemeral_ci',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Disposable Supabase required: bertel.ephemeral_ci=on';
  END IF;
END $$;
BEGIN;
SET LOCAL statement_timeout='30s';
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.object(id,object_type,name,status,is_test)
SELECT 'RESRUN999999C'||lpad(n::text,3,'0'),'RES','Contractbench restaurant '||n,'published',false
FROM generate_series(1,100) n;
INSERT INTO public.object_menu(id,object_id,name,is_active,visibility,position)
SELECT md5('portal-contract-menu-'||n)::uuid,'RESRUN999999C'||lpad(n::text,3,'0'),
       'Menu '||n,n%10<>0,'public',1 FROM generate_series(1,100) n;
INSERT INTO public.object_menu_item(id,menu_id,name,price,currency,is_available,position)
SELECT md5('portal-contract-dish-'||n||'-'||dish)::uuid,md5('portal-contract-menu-'||n)::uuid,
       'Plat '||dish,12.5+dish,'EUR',dish=1,dish
FROM generate_series(1,100) n CROSS JOIN generate_series(1,2) dish;
INSERT INTO public.ref_document(id,url,title,access_scope) VALUES
 ('00000000-0000-4000-a000-00000000c231','https://files.example.test/benchmark/public.pdf','Carte publique','public'),
 ('00000000-0000-4000-a000-00000000c232','https://files.example.test/benchmark/private.pdf','Carte privée','crm_private');
INSERT INTO public.object_document(object_id,document_id,role_id,position)
SELECT 'RESRUN999999C'||lpad(n::text,3,'0'),d.id,r.id,
       CASE WHEN right(d.id::text,4)='c231' THEN 1 ELSE 2 END
FROM generate_series(1,100) n CROSS JOIN public.ref_document d
CROSS JOIN public.ref_code_document_type r
WHERE r.code='carte' AND d.id IN ('00000000-0000-4000-a000-00000000c231','00000000-0000-4000-a000-00000000c232');
CREATE TABLE internal.partner_api_full_benchmark(
  phase text NOT NULL CHECK(phase IN ('before','after')),
  sample integer NOT NULL,
  duration_ms numeric NOT NULL,
  resource_count integer NOT NULL CHECK(resource_count=100),
  PRIMARY KEY(phase,sample)
);
REVOKE ALL ON internal.partner_api_full_benchmark FROM PUBLIC,anon,authenticated;
REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;
COMMIT;
