\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
-- Persistent fixture ONLY in the guarded disposable CI database, never production.
-- C501 starts with 19 root public photos, C502 empty, C503 with 20.
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-a000-00000000c511','photo-stock-partner@example.test'),
 ('00000000-0000-4000-a000-00000000c512','photo-stock-office@example.test'),
 ('00000000-0000-4000-a000-00000000c513','photo-stock-foreign@example.test');
INSERT INTO public.actor(id,display_name,is_test) VALUES
 ('00000000-0000-4000-a000-00000000c521','CI photo stock partner',true),
 ('00000000-0000-4000-a000-00000000c523','CI photo stock foreign',true);
INSERT INTO public.app_user_profile(id,role,actor_id) VALUES
 ('00000000-0000-4000-a000-00000000c511','actor','00000000-0000-4000-a000-00000000c521'),
 ('00000000-0000-4000-a000-00000000c512','super_admin',NULL),
 ('00000000-0000-4000-a000-00000000c513','actor','00000000-0000-4000-a000-00000000c523')
ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,actor_id=EXCLUDED.actor_id;
INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
 ('HOTRUN999999C501','HOT','CI photo stock nineteen','published',true),
 ('HOTRUN999999C502','HOT','CI photo stock empty','published',true),
 ('HOTRUN999999C503','HOT','CI photo stock twenty','published',true);
INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary)
 SELECT '00000000-0000-4000-a000-00000000c521'::uuid,o.id,r.id,true
 FROM public.object o CROSS JOIN public.ref_actor_role r
 WHERE o.id IN('HOTRUN999999C501','HOTRUN999999C502','HOTRUN999999C503') AND r.code='operator';
INSERT INTO public.media(id,object_id,media_type_id,url,position,is_main,is_published,visibility)
 SELECT ('00000000-0000-4000-a501-'||lpad(n::text,12,'0'))::uuid,'HOTRUN999999C501',t.id,
 'https://example.test/photo-stock/19/'||n||'.jpg',n,n=1,true,'public'
 FROM generate_series(1,19) n CROSS JOIN public.ref_code_media_type t WHERE t.code='photo';
INSERT INTO public.media(id,object_id,media_type_id,url,position,is_main,is_published,visibility)
 SELECT ('00000000-0000-4000-a503-'||lpad(n::text,12,'0'))::uuid,'HOTRUN999999C503',t.id,
 'https://example.test/photo-stock/20/'||n||'.jpg',n,n=1,true,'public'
 FROM generate_series(1,20) n CROSS JOIN public.ref_code_media_type t WHERE t.code='photo';
COMMIT;
