-- Disposable synthetic witnesses. Invoke as the connecting database owner.
CREATE OR REPLACE FUNCTION pg_temp.setup_current_rights_fixture() RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public,api,internal,pg_temp AS $fixture$
DECLARE
  v_publisher uuid; v_editor uuid; v_perm uuid; v_publish_perm uuid; v_actor_role uuid; v_email_kind uuid;
  v_amenity1 uuid; v_amenity2 uuid; v_bed1 uuid; v_bed2 uuid; v_media_type uuid; v_tag1 uuid; v_tag2 uuid;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SELECT id INTO v_publisher FROM public.ref_org_role WHERE code='publisher';
  SELECT id INTO v_editor FROM public.ref_org_business_role WHERE code='editor';
  SELECT id INTO v_perm FROM public.ref_permission WHERE code='edit_canonical_when_publisher';
  SELECT id INTO v_publish_perm FROM public.ref_permission WHERE code='publish_object';
  SELECT id INTO v_actor_role FROM public.ref_actor_role WHERE code='operator' LIMIT 1;
  SELECT id INTO v_email_kind FROM public.ref_code_contact_kind WHERE code='email';
  SELECT id INTO v_amenity1 FROM public.ref_amenity ORDER BY code LIMIT 1;
  SELECT id INTO v_amenity2 FROM public.ref_amenity ORDER BY code OFFSET 1 LIMIT 1;
  SELECT id INTO v_bed1 FROM public.ref_code_bed_type ORDER BY code LIMIT 1;
  SELECT id INTO v_bed2 FROM public.ref_code_bed_type ORDER BY code OFFSET 1 LIMIT 1;
  SELECT id INTO v_media_type FROM public.ref_code_media_type WHERE code='photo';
  SELECT id INTO v_tag1 FROM public.ref_code_media_tag ORDER BY code LIMIT 1;
  SELECT id INTO v_tag2 FROM public.ref_code_media_tag ORDER BY code OFFSET 1 LIMIT 1;
  ASSERT v_publisher IS NOT NULL AND v_editor IS NOT NULL AND v_perm IS NOT NULL AND v_publish_perm IS NOT NULL AND v_actor_role IS NOT NULL AND v_email_kind IS NOT NULL;
  ASSERT v_amenity1 IS NOT NULL AND v_amenity2 IS NOT NULL AND v_bed1 IS NOT NULL AND v_bed2 IS NOT NULL AND v_media_type IS NOT NULL AND v_tag1 IS NOT NULL AND v_tag2 IS NOT NULL, 'Non-empty DML reference witnesses are required';
  INSERT INTO auth.users(id,email) VALUES
    ('00000000-0000-4000-a000-00000000ae11','current-rights-writer@example.invalid'),
    ('00000000-0000-4000-a000-00000000ae12','current-rights-email@example.invalid'),
    ('00000000-0000-4000-a000-00000000ae13','current-rights-portal@example.invalid'),
    ('00000000-0000-4000-a000-00000000ae14','current-rights-other-portal@example.invalid'),
    ('00000000-0000-4000-a000-00000000ae15','current-rights-admin@example.invalid');
  INSERT INTO public.actor(id,display_name,is_test) VALUES
    ('00000000-0000-4000-a000-00000000aa01','Synthetic current rights actor A',false),
    ('00000000-0000-4000-a000-00000000aa02','Synthetic current rights actor B',false),
    ('00000000-0000-4000-a000-00000000aa03','Synthetic test-realm actor',true);
  INSERT INTO public.app_user_profile(id,role,actor_id) VALUES
    ('00000000-0000-4000-a000-00000000ae11','tourism_agent',NULL),
    ('00000000-0000-4000-a000-00000000ae12','tourism_agent',NULL),
    ('00000000-0000-4000-a000-00000000ae13','actor','00000000-0000-4000-a000-00000000aa01'),
    ('00000000-0000-4000-a000-00000000ae14','actor','00000000-0000-4000-a000-00000000aa02'),
    ('00000000-0000-4000-a000-00000000ae15','super_admin',NULL)
    ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,actor_id=EXCLUDED.actor_id;
  INSERT INTO public.object(id,object_type,name,status) VALUES
    ('ORGRUN999999AR01','ORG','Synthetic current rights ORG A','published'),
    ('ORGRUN999999AR02','ORG','Synthetic current rights ORG B','published'),
    ('ORGRUN999999AR03','ORG','Synthetic current rights test ORG','published'),
    ('HOTRUN999999AR01','HOT','Synthetic private object A','draft'),
    ('HOTRUN999999AR02','HOT','Synthetic private object B','draft'),
    ('HOTRUN999999AR03','HOT','Synthetic public witness','published'),
    ('HOTRUN999999AR04','HOT','Synthetic deletion witness','draft'),
    ('HOTRUN999999AR05','HOT','Synthetic test-realm object','draft');
  INSERT INTO public.org_config(org_object_id,access_scope,is_test_org) VALUES
    ('ORGRUN999999AR01','own_objects_only',false),('ORGRUN999999AR02','own_objects_only',false),
    ('ORGRUN999999AR03','own_objects_only',true);
  INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary) VALUES
    ('HOTRUN999999AR01','ORGRUN999999AR01',v_publisher,true),
    ('HOTRUN999999AR02','ORGRUN999999AR02',v_publisher,true),
    ('HOTRUN999999AR03','ORGRUN999999AR01',v_publisher,true),
    ('HOTRUN999999AR04','ORGRUN999999AR01',v_publisher,true),
    ('HOTRUN999999AR05','ORGRUN999999AR03',v_publisher,true);
  UPDATE public.object SET is_test=api.object_expected_is_test(id) WHERE id='HOTRUN999999AR05';
  UPDATE public.object SET created_by='00000000-0000-4000-a000-00000000ae11' WHERE id IN('HOTRUN999999AR01','HOTRUN999999AR02','HOTRUN999999AR03','HOTRUN999999AR05');
  INSERT INTO public.user_org_membership(id,user_id,org_object_id,is_active) VALUES
    ('00000000-0000-4000-a000-00000000ab11','00000000-0000-4000-a000-00000000ae11','ORGRUN999999AR01',true);
  INSERT INTO public.user_org_business_role(membership_id,role_id,is_active) VALUES('00000000-0000-4000-a000-00000000ab11',v_editor,true);
  INSERT INTO public.org_role_permission(org_object_id,role_id,permission_id,is_active,granted_by)
    VALUES('ORGRUN999999AR01',v_editor,v_perm,true,'00000000-0000-4000-a000-00000000ae15'),
      ('ORGRUN999999AR01',v_editor,v_publish_perm,true,'00000000-0000-4000-a000-00000000ae15')
    ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO UPDATE SET is_active=true;
  INSERT INTO public.actor_channel(actor_id,kind_id,value,visibility) VALUES
    ('00000000-0000-4000-a000-00000000aa01',v_email_kind,'current-rights-writer@example.invalid','public'),
    ('00000000-0000-4000-a000-00000000aa01',v_email_kind,'current-rights-email@example.invalid','public'),
    ('00000000-0000-4000-a000-00000000aa02',v_email_kind,'current-rights-foreign@example.invalid','public'),
    ('00000000-0000-4000-a000-00000000aa03',v_email_kind,'current-rights-writer@example.invalid','public');
  INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary,visibility) VALUES
    ('00000000-0000-4000-a000-00000000aa01','HOTRUN999999AR01',v_actor_role,true,'public'),
    ('00000000-0000-4000-a000-00000000aa02','HOTRUN999999AR02',v_actor_role,true,'public'),
    ('00000000-0000-4000-a000-00000000aa01','HOTRUN999999AR03',v_actor_role,false,'public'),
    ('00000000-0000-4000-a000-00000000aa02','HOTRUN999999AR03',v_actor_role,false,'public'),
    ('00000000-0000-4000-a000-00000000aa01','ORGRUN999999AR02',v_actor_role,false,'public'),
    ('00000000-0000-4000-a000-00000000aa03','HOTRUN999999AR05',v_actor_role,true,'public');
  INSERT INTO public.object_room_type(id,object_id,code,name,is_published) VALUES
    ('00000000-0000-4000-a000-00000000ac01','HOTRUN999999AR01','CURRENT-EXISTING','Synthetic current room',true);
  INSERT INTO public.media(id,object_id,media_type_id,url,title,is_published) VALUES
    ('00000000-0000-4000-a000-00000000ad01','HOTRUN999999AR01',v_media_type,'https://example.invalid/current-rights-1.jpg','Synthetic media one',true),
    ('00000000-0000-4000-a000-00000000ad02','HOTRUN999999AR01',v_media_type,'https://example.invalid/current-rights-2.jpg','Synthetic media two',true);
  INSERT INTO public.object_room_type_amenity(room_type_id,amenity_id) VALUES('00000000-0000-4000-a000-00000000ac01',v_amenity1);
  INSERT INTO public.object_room_type_bed(room_type_id,bed_type_id,quantity) VALUES('00000000-0000-4000-a000-00000000ac01',v_bed1,1);
  INSERT INTO public.object_room_type_media(room_type_id,media_id) VALUES('00000000-0000-4000-a000-00000000ac01','00000000-0000-4000-a000-00000000ad01');
  INSERT INTO public.media_tag(media_id,tag_id) VALUES('00000000-0000-4000-a000-00000000ad01',v_tag1);
  RETURN jsonb_build_object('publisher',v_publisher,'editor',v_editor,'permission',v_perm,'actor_role',v_actor_role,'amenity1',v_amenity1,'amenity2',v_amenity2,'bed1',v_bed1,'bed2',v_bed2,'tag1',v_tag1,'tag2',v_tag2);
END;
$fixture$;
