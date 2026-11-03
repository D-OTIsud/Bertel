\set ON_ERROR_STOP on
\ir assert_partner_api_ephemeral.sql
-- Execute after R4 DML closure and R3b privacy cutover. All fixtures roll back.
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-a000-00000000d711','correction-super@example.test'),
 ('00000000-0000-4000-a000-00000000d712','correction-foreign@example.test'),
 ('00000000-0000-4000-a000-00000000d713','correction-partner@example.test');
INSERT INTO public.actor(id,display_name,is_test) VALUES('00000000-0000-4000-a000-00000000d714','CI correction actor',false);
INSERT INTO public.app_user_profile(id,role,actor_id) VALUES
 ('00000000-0000-4000-a000-00000000d711','super_admin',NULL),
 ('00000000-0000-4000-a000-00000000d712','tourism_agent',NULL),
 ('00000000-0000-4000-a000-00000000d713','actor','00000000-0000-4000-a000-00000000d714')
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,actor_id=EXCLUDED.actor_id;
INSERT INTO public.object(id,object_type,name,status,is_test) VALUES
 ('RESRUN999999D701','RES','CI menu published','published',false),
 ('RESRUN999999D702','RES','CI menu draft','draft',false),
 ('HOTRUN999999D703','HOT','CI stay draft','draft',false),
 ('RESRUN999999D704','RES','CI other realm','draft',true);
INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary)
 SELECT '00000000-0000-4000-a000-00000000d714','RESRUN999999D701',id,true FROM public.ref_actor_role WHERE code='operator';
INSERT INTO public.object_menu(id,object_id,name,visibility,is_active) VALUES
 ('00000000-0000-4000-a000-00000000d721','RESRUN999999D701','Inactive public menu','public',false),
 ('00000000-0000-4000-a000-00000000d722','RESRUN999999D701','Private menu','private',true),
 ('00000000-0000-4000-a000-00000000d723','RESRUN999999D701','Partners menu','partners',true),
 ('00000000-0000-4000-a000-00000000d724','RESRUN999999D702','Draft private menu','private',false),
 ('00000000-0000-4000-a000-00000000d725','RESRUN999999D704','Wrong realm private menu','private',true);
INSERT INTO public.object_menu_item(id,menu_id,name,visibility,is_available) VALUES
 ('00000000-0000-4000-a000-00000000d731','00000000-0000-4000-a000-00000000d721','Unavailable public dish','public',false),
 ('00000000-0000-4000-a000-00000000d732','00000000-0000-4000-a000-00000000d721','Private dish','private',true),
 ('00000000-0000-4000-a000-00000000d733','00000000-0000-4000-a000-00000000d722','Public dish private parent','public',true),
 ('00000000-0000-4000-a000-00000000d734','00000000-0000-4000-a000-00000000d724','Draft private dish','private',false),
 ('00000000-0000-4000-a000-00000000d735','00000000-0000-4000-a000-00000000d721','Partners dish','partners',true);
INSERT INTO public.media(id,object_id,media_type_id,url,visibility)
 SELECT '00000000-0000-4000-a000-00000000d741','RESRUN999999D701',id,'https://example.test/private-dish.jpg','private'
 FROM public.ref_code_media_type WHERE code='photo';
INSERT INTO public.media(id,object_id,media_type_id,url,visibility)
 SELECT '00000000-0000-4000-a000-00000000d742','RESRUN999999D702',id,'https://example.test/draft-private-gallery.jpg','private'
 FROM public.ref_code_media_type WHERE code='photo';
INSERT INTO public.object_menu_item_media(menu_item_id,media_id,position) VALUES('00000000-0000-4000-a000-00000000d732','00000000-0000-4000-a000-00000000d741',0);
INSERT INTO public.object_menu_item_dietary_tag(menu_item_id,dietary_tag_id) SELECT '00000000-0000-4000-a000-00000000d732',id FROM public.ref_code_dietary_tag ORDER BY id LIMIT 1;
INSERT INTO public.object_menu_item_allergen(menu_item_id,allergen_id) SELECT '00000000-0000-4000-a000-00000000d732',id FROM public.ref_code_allergen ORDER BY id LIMIT 1;
INSERT INTO public.object_menu_item_cuisine_type(menu_item_id,cuisine_type_id) SELECT '00000000-0000-4000-a000-00000000d732',id FROM public.ref_code_cuisine_type ORDER BY id LIMIT 1;
INSERT INTO public.object_stay_policy(object_id,check_in_from,check_in_until,check_out_until,conditions)
 VALUES('HOTRUN999999D703','15:00','20:00','11:00','Private office conditions preserved');

SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
DO $test$ BEGIN
 ASSERT NOT api.can_read_object_for_correction('RESRUN999999D701');
 ASSERT (SELECT count(*) FROM public.object_menu WHERE object_id='RESRUN999999D701')=1,'private menu leaks over direct REST';
 ASSERT EXISTS(SELECT 1 FROM public.object_menu WHERE id='00000000-0000-4000-a000-00000000d721' AND NOT is_active),'editorial active flag used as read authorization';
 ASSERT (SELECT count(*) FROM public.object_menu_item WHERE menu_id IN('00000000-0000-4000-a000-00000000d721','00000000-0000-4000-a000-00000000d722'))=1,'private dish or private parent leaks';
 ASSERT EXISTS(SELECT 1 FROM public.object_menu_item WHERE id='00000000-0000-4000-a000-00000000d731' AND NOT is_available),'availability used as read authorization';
 ASSERT NOT EXISTS(SELECT 1 FROM public.object_menu_item_media WHERE menu_item_id='00000000-0000-4000-a000-00000000d732');
 ASSERT NOT EXISTS(SELECT 1 FROM public.object_menu_item_dietary_tag WHERE menu_item_id='00000000-0000-4000-a000-00000000d732');
 ASSERT NOT EXISTS(SELECT 1 FROM public.object_menu_item_allergen WHERE menu_item_id='00000000-0000-4000-a000-00000000d732');
 ASSERT NOT EXISTS(SELECT 1 FROM public.object_menu_item_cuisine_type WHERE menu_item_id='00000000-0000-4000-a000-00000000d732');
END; $test$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000d712","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 ASSERT NOT api.can_read_object_for_correction('RESRUN999999D701');
 ASSERT (SELECT count(*) FROM public.object_menu WHERE object_id='RESRUN999999D701')=1,'foreign office receives private menu';
 ASSERT NOT EXISTS(SELECT 1 FROM public.object_stay_policy WHERE object_id='HOTRUN999999D703');
END; $test$;
RESET ROLE;

-- Existing partner extended scope remains intact; no new canonical correction right.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000d713","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 ASSERT NOT api.can_read_object_for_correction('RESRUN999999D701');
 ASSERT (SELECT count(*) FROM public.object_menu WHERE object_id='RESRUN999999D701')=3;
 ASSERT NOT EXISTS(SELECT 1 FROM public.object_menu WHERE object_id='RESRUN999999D702');
END; $test$;
RESET ROLE;

-- Canonical superuser without any membership loads every correction row, including drafts.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-00000000d711","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_snapshot jsonb;v_result jsonb;
BEGIN
 ASSERT api.can_read_object_for_correction('RESRUN999999D702');
 ASSERT NOT api.can_read_object_for_correction('RESRUN999999D704'),'correction scope crosses test realms';
 ASSERT (SELECT count(*) FROM public.object_menu WHERE object_id IN('RESRUN999999D701','RESRUN999999D702'))=4;
 ASSERT EXISTS(SELECT 1 FROM public.object_menu_item WHERE id='00000000-0000-4000-a000-00000000d734' AND NOT is_available);
 ASSERT EXISTS(SELECT 1 FROM public.media WHERE id='00000000-0000-4000-a000-00000000d742'),'draft gallery baseline incomplete for canonical corrector';
 ASSERT EXISTS(SELECT 1 FROM public.object_menu_item_media WHERE menu_item_id='00000000-0000-4000-a000-00000000d732');
 ASSERT EXISTS(SELECT 1 FROM public.object_menu_item_dietary_tag WHERE menu_item_id='00000000-0000-4000-a000-00000000d732');
 ASSERT EXISTS(SELECT 1 FROM public.object_menu_item_allergen WHERE menu_item_id='00000000-0000-4000-a000-00000000d732');
 ASSERT EXISTS(SELECT 1 FROM public.object_menu_item_cuisine_type WHERE menu_item_id='00000000-0000-4000-a000-00000000d732');
 SELECT jsonb_build_object('exists',true,'values',jsonb_build_object('check_in_from',check_in_from::text,'check_in_until',check_in_until::text,'check_out_until',check_out_until::text,'conditions',conditions))
 INTO v_snapshot FROM public.object_stay_policy WHERE object_id='HOTRUN999999D703';
 ASSERT v_snapshot IS NOT NULL,'draft stay row misread as exists:false';
 v_result:=api.save_object_capacity_policies('HOTRUN999999D703',jsonb_build_object('stay_policy',jsonb_build_object(
  'write_contract','stay-policy-patch-v1','expected',v_snapshot,'changes',jsonb_build_object('check_in_from','16:00'))));
 ASSERT v_result#>>'{stay_policy,values,check_in_from}'='16:00:00','corrector stuck in false absent-row conflict';
 ASSERT (SELECT conditions='Private office conditions preserved' FROM public.object_stay_policy WHERE object_id='HOTRUN999999D703');
 ASSERT NOT has_table_privilege('authenticated','public.object_menu','INSERT,UPDATE,DELETE'),'legacy menu DML reopened';
END;
$test$;
RESET ROLE;

-- A service transport with no person is not the canonical correction persona.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $test$ BEGIN
 ASSERT NOT api.can_read_object_for_correction('RESRUN999999D702'),'service transport treated as a person';
 ASSERT NOT EXISTS(SELECT 1 FROM public.user_org_membership WHERE user_id='00000000-0000-4000-a000-00000000d711');
 ASSERT (SELECT is_active=false FROM public.object_menu WHERE id='00000000-0000-4000-a000-00000000d721');
 ASSERT (SELECT visibility='private' FROM public.object_menu WHERE id='00000000-0000-4000-a000-00000000d724');
END; $test$;
ROLLBACK;
