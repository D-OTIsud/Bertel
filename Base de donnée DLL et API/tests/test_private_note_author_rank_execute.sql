BEGIN;
DO $test$
DECLARE
  v_org_a text := 'ORGRUN9999999971';
  v_org_b text := 'ORGRUN9999999972';
  v_foreign uuid := 'a1300000-0000-4000-8000-000000000001';
  v_author uuid := 'a1300000-0000-4000-8000-000000000002';
  v_superior uuid := 'a1300000-0000-4000-8000-000000000003';
  v_note uuid := 'a1300000-0000-4000-8000-000000000004';
  v_helper regprocedure := 'api.object_private_note_author_admin_rank(uuid)'::regprocedure;
  v_wrapper regprocedure := 'api.can_manage_object_private_note(uuid)'::regprocedure;
  v_denied boolean;
  v_rows integer;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO public.object(id,object_type,name,status)
  VALUES (v_org_a,'ORG','Synthetic note organisation A','published'),
         (v_org_b,'ORG','Synthetic note organisation B','published');
  INSERT INTO auth.users(id,email)
  SELECT u, u::text||'@example.invalid' FROM unnest(ARRAY[v_foreign,v_author,v_superior]) AS fixture(u);

  WITH added AS (
    INSERT INTO public.user_org_membership(user_id,org_object_id)
    VALUES (v_foreign,v_org_a),(v_author,v_org_b),(v_superior,v_org_b)
    RETURNING id,user_id
  )
  INSERT INTO public.user_org_admin_role(membership_id,role_id,is_active)
  SELECT a.id,r.id,TRUE FROM added a JOIN public.ref_org_admin_role r
  ON r.code=CASE a.user_id WHEN v_foreign THEN 'org_admin'
                          WHEN v_author THEN 'team_lead' ELSE 'org_manager' END;

  INSERT INTO public.object_private_description(id,object_id,org_object_id,body,created_by_user_id)
  VALUES (v_note,v_org_b,v_org_b,'Synthetic private note',v_author);

  ASSERT (SELECT h.proowner=w.proowner AND h.prosecdef AND w.prosecdef
          AND has_function_privilege(h.proowner,h.oid,'EXECUTE')
          FROM pg_proc h CROSS JOIN pg_proc w WHERE h.oid=v_helper AND w.oid=v_wrapper);
  ASSERT NOT has_function_privilege('service_role',v_helper,'EXECUTE');

  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  SET LOCAL ROLE anon;
    v_denied := FALSE;
    BEGIN
      PERFORM api.object_private_note_author_admin_rank(v_note);
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := TRUE;
    END;
    ASSERT v_denied, 'Anonymous direct rank lookup must return SQLSTATE 42501';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',json_build_object('role','authenticated','sub',v_foreign)::text,true);
  SET LOCAL ROLE authenticated;
    v_denied := FALSE;
    BEGIN
      PERFORM api.object_private_note_author_admin_rank(v_note);
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := TRUE;
    END;
    ASSERT v_denied, 'Authenticated direct rank lookup must return SQLSTATE 42501';
    ASSERT NOT EXISTS (SELECT FROM public.object_private_description WHERE id=v_note);
    ASSERT api.can_manage_object_private_note(v_note) IS FALSE;
    ASSERT api.can_delete_object_private_note(v_note) IS FALSE;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims',json_build_object('role','authenticated','sub',v_superior)::text,true);
  SET LOCAL ROLE authenticated;
    ASSERT api.can_manage_object_private_note(v_note) IS TRUE;
    ASSERT api.can_delete_object_private_note(v_note) IS FALSE;
    UPDATE public.object_private_description SET body='Synthetic note updated' WHERE id=v_note;
    GET DIAGNOSTICS v_rows=ROW_COUNT;
    ASSERT v_rows=1, 'The same-organisation superior must keep the normal RLS update';
  RESET ROLE;
END;
$test$;
ROLLBACK;
