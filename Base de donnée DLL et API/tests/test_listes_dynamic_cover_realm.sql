-- Independent regression checks for dynamic covers and published cross-realm isolation.
\set ON_ERROR_STOP on
BEGIN;
-- Independent architect acceptance probe. Applied only by the rollback review harness.
DO $$
DECLARE
  u uuid := '60000000-0000-4000-a000-000000000001';
  list_id uuid;
  result jsonb;
  grid jsonb;
  token text;
  activity timestamptz := now() - interval '2 days';
  filters jsonb := '{"buckets":[{"types":["HOT"],"filters":{"city_any":["ZzListCoverReview"]}}]}';
BEGIN
  INSERT INTO object(id, object_type, name, status) VALUES
    ('ORGRVWCOVER00001','ORG','Organisation couverture fictive','published'),
    ('HOTRVWCOVER00001','HOT','Premier sans photo','published'),
    ('HOTRVWCOVER00002','HOT','Second avec photo','published');
  UPDATE object SET cached_main_image_url='https://example.test/second.jpg' WHERE id='HOTRVWCOVER00002';
  INSERT INTO object_location(object_id, city, is_main_location) VALUES
    ('HOTRVWCOVER00001','ZzListCoverReview',true),
    ('HOTRVWCOVER00002','ZzListCoverReview',true);
  INSERT INTO auth.users(id,email) VALUES(u,'cover-review@example.test');
  INSERT INTO app_user_profile(id,role,display_name) VALUES(u,'tourism_agent','Couverture Test')
    ON CONFLICT(id) DO UPDATE SET role=excluded.role;
  INSERT INTO user_org_membership(user_id,org_object_id,is_active) VALUES(u,'ORGRVWCOVER00001',true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  list_id := api.create_list('dynamic','Couverture dynamique revue',NULL,filters,'/explorer?review=cover');
  result := api.get_list(list_id)::jsonb;
  ASSERT jsonb_array_length(result->'items')=2, 'Dynamic probe must resolve both actual fixtures (live city filter)';
  ASSERT result#>>'{items,0,object_id}'='HOTRVWCOVER00001', 'Probe first result must lack a photo';
  ASSERT result->>'cover_url' IS NULL, 'Fallback must not become an explicit cover';
  ASSERT result->>'effective_cover_url'='https://example.test/second.jpg', 'Dynamic detail must use second illustrated result';
  grid := (SELECT e FROM jsonb_array_elements(api.list_my_lists()::jsonb) e WHERE e->>'id'=list_id::text);
  ASSERT grid->>'cover_url'='https://example.test/second.jpg' AND (grid->>'item_count')::int=2, 'Grid and detail must resolve same dynamic cover/count';
  RESET ROLE;
  UPDATE object_list SET last_activity_at=activity WHERE id=list_id;
  INSERT INTO object(id,object_type,name,status) VALUES('HOTRVWCOVER00003','HOT','Nouveau résultat automatique','published');
  INSERT INTO object_location(object_id,city,is_main_location) VALUES('HOTRVWCOVER00003','ZzListCoverReview',true);
  SET LOCAL ROLE authenticated;
  result := api.get_list(list_id)::jsonb;
  ASSERT jsonb_array_length(result->'items')=3, 'Dynamic source changes must resolve automatically';
  ASSERT (result->>'last_activity_at')::timestamptz=activity, 'Dynamic refresh/read must not postpone retention';
  token := api.ensure_list_share_link(list_id)::jsonb->>'share_token';
  RESET ROLE;
  ASSERT (SELECT last_activity_at FROM object_list WHERE id=list_id)=activity, 'Sharing must preserve business activity';
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  SET LOCAL ROLE anon;
  result := api.get_public_list_by_token(token)::jsonb;
  ASSERT jsonb_array_length(result->'items')=3, 'Public link must retain live dynamic resolution';
  RESET ROLE;
  RAISE NOTICE 'ARCHITECT dynamic cover/count, live refresh and unchanged retention: PASS';
END $$;

DO $$
DECLARE
  u uuid := '60000000-0000-4000-a000-000000000001';
  list_id uuid;
  dynamic_id uuid;
  publisher uuid;
  phone_kind uuid;
  result jsonb;
  token text;
BEGIN
  SELECT id INTO publisher FROM ref_org_role WHERE code='publisher' LIMIT 1;
  SELECT id INTO phone_kind FROM ref_code_contact_kind WHERE code='phone' LIMIT 1;
  ASSERT publisher IS NOT NULL AND phone_kind IS NOT NULL, 'Realm probe reference seeds required';
  INSERT INTO object(id,object_type,name,status) VALUES
    ('ORGRVWCOVER00002','ORG','Organisation test fictive','published'),
    ('HOTRVWCOVER00000','HOT','REALM-SECRET Hotel de test','published');
  INSERT INTO org_config(org_object_id,access_scope,is_test_org)
    VALUES('ORGRVWCOVER00002','own_objects_only',true);
  INSERT INTO object_org_link(object_id,org_object_id,role_id,is_primary)
    VALUES('HOTRVWCOVER00000','ORGRVWCOVER00002',publisher,true);
  UPDATE object SET cached_main_image_url='https://example.test/REALM-SECRET.jpg' WHERE id='HOTRVWCOVER00000';
  INSERT INTO object_location(object_id,city,is_main_location)
    VALUES('HOTRVWCOVER00000','ZzListCoverReview',true);
  INSERT INTO contact_channel(object_id,kind_id,value,is_public)
    VALUES('HOTRVWCOVER00000',phone_kind,'REALM-SECRET-PHONE',true);
  ASSERT (SELECT is_test FROM object WHERE id='HOTRVWCOVER00000'), 'Realm must be set by organization trigger';
  PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  ASSERT NOT api.current_user_test_realm(), 'Caller must be in production realm';
  list_id := api.create_list('static','Revue isolation couverture',ARRAY['HOTRVWCOVER00000','HOTRVWCOVER00001'],NULL,NULL);
  result := api.get_list(list_id)::jsonb;
  ASSERT jsonb_array_length(result->'items')=1, 'Cross-realm published item must be rejected at admission';
  RESET ROLE;
  INSERT INTO object_list_item(list_id,object_id,position,note_fr)
    VALUES(list_id,'HOTRVWCOVER00000',0,'REALM-SECRET-NOTE');
  SELECT id INTO dynamic_id FROM object_list WHERE name='Couverture dynamique revue';
  SET LOCAL ROLE authenticated;
  result := api.get_list(list_id)::jsonb;
  ASSERT jsonb_array_length(result->'items')=1 AND result->>'effective_cover_url' IS NULL,
    'Historical cross-realm item must not become cover or detail';
  ASSERT result::text NOT LIKE '%REALM-SECRET%', 'No cross-realm contact/photo/note in detail';
  result := api.list_my_lists()::jsonb;
  ASSERT result::text NOT LIKE '%REALM-SECRET%', 'No cross-realm photo in cards';
  result := api.get_list(dynamic_id)::jsonb;
  ASSERT jsonb_array_length(result->'items')=3 AND result::text NOT LIKE '%REALM-SECRET%',
    'Dynamic resolution must exclude published test fixture before enrichment';
  token := api.ensure_list_share_link(list_id)::jsonb->>'share_token';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  SET LOCAL ROLE anon;
  result := api.get_public_list_by_token(token)::jsonb;
  ASSERT jsonb_array_length(result->'items')=1 AND result::text NOT LIKE '%REALM-SECRET%',
    'Public historical list must exclude cross-realm photo/contact/note';
  RESET ROLE;
  RAISE NOTICE 'ARCHITECT published cross-realm admission, historical cards/detail/public and dynamic resolution: PASS';
END $$;

ROLLBACK;
