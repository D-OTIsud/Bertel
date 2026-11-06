-- Test-only current authority fixture. INVOKER; all callers roll back.
-- Existing actor/email links and created_by remain deliberately insufficient.
CREATE OR REPLACE FUNCTION pg_temp.grant_current_canonical_fixture(
  p_user_id uuid, p_org_id text, p_object_ids text[]
) RETURNS void LANGUAGE plpgsql AS $fixture$
DECLARE v_publisher uuid; v_permission uuid; v_object text;
BEGIN
  SELECT id INTO STRICT v_publisher FROM public.ref_org_role WHERE code='publisher';
  SELECT id INTO STRICT v_permission FROM public.ref_permission
    WHERE code='edit_canonical_when_publisher' AND is_active IS TRUE;
  IF NOT EXISTS(SELECT 1 FROM public.object WHERE id=p_org_id) THEN
    INSERT INTO public.object(id,object_type,name,status)
      VALUES(p_org_id,'ORG','Current authority test fixture','published');
  END IF;
  INSERT INTO public.org_config(org_object_id,access_scope,is_test_org)
    VALUES(p_org_id,'own_objects_only',false) ON CONFLICT(org_object_id) DO NOTHING;
  INSERT INTO public.user_org_membership(user_id,org_object_id,is_active)
    SELECT p_user_id,p_org_id,true
    WHERE NOT EXISTS(SELECT 1 FROM public.user_org_membership
      WHERE user_id=p_user_id AND org_object_id=p_org_id AND is_active IS TRUE);
  INSERT INTO public.user_permission(user_id,permission_id,is_active)
    VALUES(p_user_id,v_permission,true)
    ON CONFLICT(user_id,permission_id) DO UPDATE SET is_active=true;
  FOREACH v_object IN ARRAY p_object_ids LOOP
    INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
      VALUES(v_object,p_org_id,v_publisher,false)
      ON CONFLICT(object_id,org_object_id,role_id) DO NOTHING;
  END LOOP;
END;
$fixture$;
