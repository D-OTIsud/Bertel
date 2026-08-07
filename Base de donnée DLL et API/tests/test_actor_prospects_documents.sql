-- test_actor_prospects_documents.sql
-- Création d'un acteur en projet sans établissement, rôle par défaut, bibliothèque privée,
-- puis héritage du rôle lors du premier rattachement.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_org text := 'ORGRUN9999991901';
  v_obj text := 'HOTRUN9999991911';
  v_user uuid := '00000000-0000-4000-a000-000000001901';
  v_actor uuid;
  v_document uuid;
  v_pub_role uuid;
  v_permission uuid;
  v_guide_role uuid;
  v_document_type uuid;
  v_payload jsonb;
  v_denied boolean := false;
BEGIN
  -- Structure et défense en profondeur du stockage privé.
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='actor' AND column_name='crm_owner_org_id'),
         'actor.crm_owner_org_id absent';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='actor' AND column_name='default_role_id'),
         'actor.default_role_id absent';
  ASSERT to_regclass('public.actor_document') IS NOT NULL, 'actor_document absent';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.actor_document'::regclass),
         'actor_document doit avoir la RLS';
  ASSERT NOT has_table_privilege('authenticated', 'public.actor_document', 'SELECT'),
         'authenticated ne doit pas lire actor_document directement';
  ASSERT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='chk_ref_document_access_scope'
                   AND pg_get_constraintdef(oid) LIKE '%crm_private%'),
         'ref_document.access_scope ne reconnaît pas crm_private';
  ASSERT EXISTS (SELECT 1 FROM storage.buckets
                 WHERE id='actor-documents' AND public=false AND file_size_limit=5242880),
         'bucket actor-documents absent, public ou différent de 5 Mo';
  ASSERT has_function_privilege('authenticated', 'api.list_actor_support(uuid)', 'EXECUTE'),
         'authenticated ne peut pas exécuter list_actor_support';

  SELECT id INTO v_pub_role FROM ref_org_role WHERE code='publisher' LIMIT 1;
  SELECT id INTO v_permission FROM ref_permission WHERE code='write_crm_notes' LIMIT 1;
  SELECT id INTO v_guide_role FROM ref_actor_role WHERE code='guide' LIMIT 1;
  IF v_guide_role IS NULL THEN
    v_guide_role := gen_random_uuid();
    INSERT INTO ref_actor_role (id, code, name) VALUES (v_guide_role, 'guide', 'Guide');
  END IF;
  SELECT id INTO v_document_type FROM ref_code_document_type WHERE is_active ORDER BY position, code LIMIT 1;
  IF v_pub_role IS NULL OR v_permission IS NULL OR v_document_type IS NULL THEN
    RAISE EXCEPTION 'fixture: catalogues publisher/write_crm_notes/document_type incomplets';
  END IF;

  INSERT INTO auth.users (id, email) VALUES (v_user, 'actor_project@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_user, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role=excluded.role;
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org, 'ORG', 'ORG accompagnement test', 'published'),
    (v_obj, 'HOT', 'Projet hôtel test', 'draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id)
  VALUES (v_obj, v_org, v_pub_role) ON CONFLICT DO NOTHING;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active)
  VALUES (v_user, v_org, true) ON CONFLICT DO NOTHING;
  INSERT INTO user_permission (user_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
  VALUES (v_user, v_permission, true, v_user, now(), now(), now()) ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_user,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    v_payload := api.save_crm_actor(jsonb_build_object(
      'display_name', 'Projet sans établissement', 'role_code', 'guide'));
    v_actor := (v_payload->>'id')::uuid;
    ASSERT v_actor IS NOT NULL, 'save_crm_actor sans object_id ne retourne pas d''acteur';
    ASSERT EXISTS (SELECT 1 FROM api.current_user_crm_actor_ids() AS x(actor_id) WHERE actor_id=v_actor),
           'acteur en projet absent du périmètre CRM de son ORG';
    ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(api.list_crm_directory()) d
                   WHERE (d->>'actor_id')::uuid=v_actor AND jsonb_array_length(d->'objects')=0),
           'acteur en projet absent de l''annuaire ou établissement artificiel ajouté';
    ASSERT api.list_actor_support(v_actor)->'default_role'->>'code' = 'guide',
           'rôle guide non conservé sans établissement';
  RESET ROLE;

  -- Le serveur d'upload écrit ces deux lignes avec service_role ; ici postgres simule ce chemin.
  INSERT INTO ref_document (url, title, storage_bucket, storage_path, access_scope, extra)
  VALUES ('storage://actor-documents/test.pdf', 'Prévisionnel', 'actor-documents', 'test.pdf',
          'crm_private', '{"mime_type":"application/pdf","size_bytes":1024}'::jsonb)
  RETURNING id INTO v_document;
  INSERT INTO actor_document (actor_id, document_id, title, intended_role_id, created_by)
  VALUES (v_actor, v_document, 'Prévisionnel', v_document_type, v_user);

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_user,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT jsonb_array_length(api.list_actor_support(v_actor)->'documents') = 1,
           'bibliothèque acteur ne restitue pas son document privé';
    v_payload := api.link_actor_to_object(jsonb_build_object('actor_id',v_actor,'object_id',v_obj));
    ASSERT (v_payload->>'linked')::boolean, 'premier rattachement non créé';
  RESET ROLE;

  ASSERT EXISTS (
    SELECT 1 FROM actor_object_role ar JOIN ref_actor_role r ON r.id=ar.role_id
    WHERE ar.actor_id=v_actor AND ar.object_id=v_obj AND r.code='guide'
  ), 'le rattachement n''a pas hérité du rôle guide';

  -- Une lecture directe reste refusée au rôle navigateur, même après rattachement.
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_user,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM count(*) FROM public.actor_document WHERE actor_id=v_actor;
    EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
    END;
  RESET ROLE;
  ASSERT v_denied, 'actor_document est lisible directement par authenticated';

  RAISE NOTICE 'actor prospects/documents assertions passed.';
END$$;
ROLLBACK;
