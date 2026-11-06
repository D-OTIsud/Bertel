-- Isolated CI database ONLY. Apply before the R6 migration; cleanup after its tests.
-- Seed true historical envelopes while no collection precondition trigger/table exists.
\ir assert_partner_api_ephemeral.sql
BEGIN;
INSERT INTO auth.users(id,email) VALUES('00000000-0000-4000-a000-000000008801','r6-history@example.test');
INSERT INTO public.app_user_profile(id,role) VALUES('00000000-0000-4000-a000-000000008801','super_admin') ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
INSERT INTO public.object(id,object_type,name,status,is_test) VALUES('HOTRUN9999998801','HOT','R6 historical fixture','draft',true);
INSERT INTO public.pending_change(id,object_id,target_table,action,payload,submitted_by,status,metadata) VALUES
  ('00000000-0000-4000-a000-000000008802','HOTRUN9999998801','object_capacity','update','{"capacities":[{"metric_code":"old","value_integer":7}]}','00000000-0000-4000-a000-000000008801','pending',
    '{"rpc":"save_object_commercial","section":"capacity-policies","field":"Ancienne capacité","before":"historique","after":"original","collection_baseline":{"contract":"actor-collection-baseline-v1","domain":"characteristics","object_id":"HOTRUN9999998801","digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}'),
  ('00000000-0000-4000-a000-000000008803','HOTRUN9999998801','opening_period','update','{"periods":[]}','00000000-0000-4000-a000-000000008801','pending','{"rpc":"save_object_openings","section":"openings","field":"Ancien planning"}');
COMMIT;
