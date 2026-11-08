-- Effacement d'un acteur : inventaire et rétention des documents CRM, reçus de provenance,
-- audit after_data, refus portail atomique et fermeture des RPC. Transaction annulée.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
\ir fixtures/object_current_rights.sql

DO $test$
DECLARE
  v_writer uuid := '00000000-0000-4000-a000-00000000ae11';
  v_portal uuid := '00000000-0000-4000-a000-00000000ae13';
  v_admin uuid := '00000000-0000-4000-a000-00000000ae15';
  v_actor uuid := '00000000-0000-4000-a000-00000000aa01';
  v_other_actor uuid := '00000000-0000-4000-a000-00000000aa02';
  v_test_actor uuid := '00000000-0000-4000-a000-00000000aa03';
  v_media_row uuid := '00000000-0000-4000-a000-00000000ad01';
  v_task uuid := gen_random_uuid();
  v_other_task uuid := gen_random_uuid();
  v_orphan uuid := gen_random_uuid();
  v_shared uuid := gen_random_uuid();
  v_detached uuid := gen_random_uuid();
  v_detached_used uuid := gen_random_uuid();
  v_portal_doc uuid := gen_random_uuid();
  v_published uuid := gen_random_uuid();
  v_same_key uuid := gen_random_uuid();
  v_same_key_twin uuid := gen_random_uuid();
  v_never_attached uuid := gen_random_uuid();
  v_moved_upload uuid := gen_random_uuid();
  v_audit_row uuid := gen_random_uuid();
  v_analysis uuid := gen_random_uuid();
  v_pending uuid;
  v_hash text := repeat('a', 64);
  v_report jsonb;
  v_operation uuid;
  v_role text;
  v_function regprocedure;
  v_scenario text;
  v_denied boolean;
  v_logs bigint;
  v_avatar_upload uuid := gen_random_uuid();
  v_avatar_orphan uuid := gen_random_uuid();
  v_avatar_path text;
  v_orphan_path text;
  v_profile_before jsonb;
BEGIN
  ------------------------------------------------------------------
  -- Fermeture : propriétaire seul, table sans accès API
  ------------------------------------------------------------------
  FOREACH v_function IN ARRAY ARRAY[
    'api.rpc_gdpr_erase_subject(text,text,text,text)'::regprocedure,
    'api.rpc_gdpr_get_cleanup_status(uuid)'::regprocedure,
    'api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)'::regprocedure,
    'audit.redact_subject(text,text,text,text[])'::regprocedure,
    'internal.gdpr_document_is_referenced(uuid)'::regprocedure
  ] LOOP
    ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = v_function AND a.grantee <> p.proowner), 'RPC RGPD non réservée au propriétaire';
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      ASSERT NOT has_function_privilege(v_role, v_function, 'EXECUTE');
    END LOOP;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    ASSERT NOT has_table_privilege(v_role, 'internal.gdpr_cleanup_task',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  END LOOP;
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'internal.gdpr_cleanup_task'::regclass);
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'internal.gdpr_cleanup_task'::regclass);

  -- Une nouvelle FK entrante impose une décision de rétention explicite.
  ASSERT ARRAY(
    SELECT format('%I.%I.%I', n.nspname, t.relname, a.attname)
    FROM pg_constraint k
    JOIN pg_class t ON t.oid = k.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(k.conkey)
    WHERE k.contype = 'f' AND k.confrelid = 'public.ref_document'::regclass
    ORDER BY format('%I.%I.%I', n.nspname, t.relname, a.attname) COLLATE "C"
  ) = ARRAY[
    'internal.portal_photo_analysis.document_id',
    'public.actor_consent.document_id', 'public.actor_document.document_id',
    'public.actor_document.promoted_document_id', 'public.crm_task_document.document_id',
    'public.object_classification.document_id', 'public.object_document.document_id',
    'public.object_iti.status_document_id', 'public.object_legal.document_id',
    'public.object_sustainability_action.document_id'
  ], 'Revoir internal.gdpr_document_is_referenced après un changement des FK de ref_document';

  ------------------------------------------------------------------
  -- Fixtures
  ------------------------------------------------------------------
  PERFORM pg_temp.setup_current_rights_fixture();
  INSERT INTO public.crm_task(id, object_id, actor_id, title) VALUES
    (v_task, 'HOTRUN999999AR01', v_actor, 'Titre de tâche personnel'),
    (v_other_task, 'HOTRUN999999AR02', v_other_actor, 'Autre tâche');
  INSERT INTO public.ref_document(id, url, title, storage_bucket, storage_path, access_scope, extra) VALUES
    (v_orphan, 'storage://actor-documents/gdpr/orphan.pdf', 'Orphelin', 'actor-documents', 'gdpr/orphan.pdf', 'crm_private', '{}'),
    (v_shared, 'storage://actor-documents/gdpr/shared.pdf', 'Partagé', 'actor-documents', 'gdpr/shared.pdf', 'crm_private', '{}'),
    (v_detached, 'storage://actor-documents/gdpr/detached.pdf', 'Détaché personnel', 'actor-documents', 'gdpr/detached.pdf', 'crm_private', '{}'),
    (v_detached_used, 'storage://actor-documents/gdpr/detached-used.pdf', 'Utilisé ailleurs', 'actor-documents', 'gdpr/detached-used.pdf', 'crm_private', '{}'),
    (v_portal_doc, 'storage://actor-documents/portal-photos/gdpr/p.jpg', 'Photo', 'actor-documents', 'portal-photos/gdpr/p.jpg', 'crm_private', '{"source":"portal_photo"}'),
    (v_published, 'storage://actor-documents/gdpr/published.jpg', 'Publiée', 'actor-documents', 'gdpr/published.jpg', 'crm_private', '{}'),
    (v_same_key, 'storage://actor-documents/gdpr/same-a.pdf', 'Même clé A', 'actor-documents', 'gdpr/same.pdf', 'crm_private', '{}'),
    (v_same_key_twin, 'storage://actor-documents/gdpr/same-b.pdf', 'Même clé B', 'actor-documents', 'gdpr/same.pdf', 'crm_private', '{}'),
    (v_moved_upload, 'storage://actor-documents/gdpr/moved.pdf', 'Déplacé', 'actor-documents', 'tasks/gdpr/moved.pdf', 'crm_private', '{}');
  INSERT INTO public.crm_task_document(task_id, document_id, title) VALUES
    (v_task, v_orphan, 'Pièce personnelle'),
    (v_task, v_shared, 'Pièce personnelle partagée'),
    (v_other_task, v_shared, 'Lien d''une autre tâche'),
    (v_other_task, v_moved_upload, 'Lien du second acteur');
  INSERT INTO public.actor_document(actor_id, document_id) VALUES
    (v_actor, v_portal_doc), (v_actor, v_published), (v_actor, v_same_key);
  UPDATE public.media SET extra = COALESCE(extra, '{}'::jsonb) || jsonb_build_object('portal_document_id', v_published)
   WHERE id = v_media_row;
  ASSERT FOUND, 'fixture: média témoin absent';
  -- Fiche en brouillon : la rétention ne dépend d'aucun statut.
  INSERT INTO public.object_document(object_id, document_id, title) VALUES ('HOTRUN999999AR04', v_detached_used, 'Usage brouillon');
  INSERT INTO internal.crm_document_detachment(parent_kind, parent_id, document_id, subject_actor_id, storage_bucket, storage_path, detached_by) VALUES
    ('task', v_task, v_detached, v_actor, 'actor-documents', 'gdpr/detached.pdf', v_writer),
    ('actor', v_actor, v_detached_used, v_actor, 'actor-documents', 'gdpr/detached-used.pdf', v_writer);
  INSERT INTO internal.crm_document_upload(id, parent_kind, parent_id, prepared_actor_id, uploaded_by, storage_bucket, storage_path, title, mime_type, size_bytes, sha256)
    VALUES (v_never_attached, 'actor', v_actor, v_actor, v_writer, 'actor-documents',
            'actors/' || v_actor || '/' || v_never_attached || '.pdf', 'Nom personnel.pdf', 'application/pdf', 3, v_hash);
  INSERT INTO internal.crm_document_upload(id, parent_kind, parent_id, prepared_actor_id, attached_actor_id, uploaded_by, storage_bucket, storage_path, title, mime_type, size_bytes, sha256, state, uploaded_at, attached_at)
    VALUES (v_moved_upload, 'task', v_other_task, v_actor, v_other_actor, v_writer, 'actor-documents',
            'tasks/' || v_other_task || '/' || v_moved_upload || '.pdf', 'Nom déplacé.pdf', 'application/pdf', 3, v_hash, 'attached', now(), now());
  -- Trace visible uniquement par after_data.
  INSERT INTO audit.audit_log(table_name, operation, row_pk, before_data, after_data, changed_by)
    VALUES ('crm_task_document', 'UPDATE', jsonb_build_object('id', v_audit_row), NULL,
            jsonb_build_object('task_id', v_task, 'title', 'Titre audit personnel'), 'fixture');
  -- Sans claims : voie de maintenance, seule ouverte tant que l'API reste fermée.
  PERFORM set_config('request.jwt.claims', '', true);

  ------------------------------------------------------------------
  -- Droits réels et garde realm
  ------------------------------------------------------------------
  SELECT count(*) INTO v_logs FROM public.gdpr_erasure_log;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  ASSERT api.is_platform_superuser(), 'fixture: administrateur autorisé attendu';
  v_denied := false;
  BEGIN PERFORM api.rpc_gdpr_erase_subject('actor', v_actor::text, 'anonymize', 'Fermé');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'Un administrateur plateforme ne doit pas rouvrir START';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  v_denied := false;
  BEGIN PERFORM api.rpc_gdpr_get_cleanup_status(gen_random_uuid());
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'service_role ne doit pas rouvrir le statut';
  v_denied := false;
  BEGIN PERFORM api.rpc_gdpr_ack_cleanup_task(gen_random_uuid(), gen_random_uuid(), true, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'service_role ne doit pas rouvrir l''acquittement';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  v_denied := false;
  BEGIN PERFORM api.rpc_gdpr_erase_subject('actor', v_test_actor::text, 'anonymize', 'Autre realm');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  ASSERT v_denied, 'La garde realm explicite doit rester active';
  ASSERT (SELECT count(*) = v_logs FROM public.gdpr_erasure_log);

  ------------------------------------------------------------------
  -- Portail actif : refus avant toute mutation
  ------------------------------------------------------------------
  FOREACH v_scenario IN ARRAY ARRAY['claim', 'analysis', 'proposal'] LOOP
    IF v_scenario = 'claim' THEN
      UPDATE public.ref_document
         SET extra = extra || jsonb_build_object('approval_claim_id', gen_random_uuid(), 'approval_claim_until', now() + interval '1 hour')
       WHERE id = v_portal_doc;
    ELSIF v_scenario = 'analysis' THEN
      INSERT INTO internal.portal_photo_analysis(id, object_id, document_id, actor_id, created_by, source_sha256, local_day, provider_revision, state)
      VALUES (v_analysis, 'HOTRUN999999AR01', v_portal_doc, v_actor, v_portal, v_hash, CURRENT_DATE, now(), 'started');
    ELSE
      -- Le marqueur RPC est posé après l'INSERT : ses triggers ne valident que les vraies soumissions.
      INSERT INTO public.pending_change(object_id, target_table, action, payload, submitted_by, status, metadata)
      VALUES ('HOTRUN999999AR01', 'media', 'insert',
              jsonb_build_object('additions', jsonb_build_array(jsonb_build_object('upload_id', v_portal_doc, 'credit', 'x'))),
              v_portal, 'pending', '{}'::jsonb)
      RETURNING id INTO v_pending;
      UPDATE public.pending_change SET metadata = '{"rpc":"publish_portal_photo_additions"}'::jsonb WHERE id = v_pending;
    END IF;

    v_denied := false;
    BEGIN PERFORM api.rpc_gdpr_erase_subject('actor', v_actor::text, 'anonymize', 'Portail actif');
    EXCEPTION WHEN object_not_in_prerequisite_state THEN v_denied := true; END;
    ASSERT v_denied, format('Portail actif non refusé : %s', v_scenario);
    ASSERT (SELECT count(*) = v_logs FROM public.gdpr_erasure_log), 'Le refus ne doit laisser aucune opération';
    ASSERT (SELECT display_name = 'Synthetic current rights actor A' FROM public.actor WHERE id = v_actor);
    ASSERT (SELECT actor_id = v_actor FROM public.app_user_profile WHERE id = v_portal), 'Le compte portail ne doit pas être délié';
    ASSERT EXISTS (SELECT 1 FROM public.crm_task_document WHERE task_id = v_task AND document_id = v_orphan);
    ASSERT (SELECT title = 'Nom personnel.pdf' FROM internal.crm_document_upload WHERE id = v_never_attached);

    IF v_scenario = 'claim' THEN
      UPDATE public.ref_document SET extra = '{"source":"portal_photo"}'::jsonb WHERE id = v_portal_doc;
    ELSIF v_scenario = 'analysis' THEN
      DELETE FROM internal.portal_photo_analysis WHERE id = v_analysis;
    ELSE
      DELETE FROM public.pending_change WHERE id = v_pending;
    END IF;
  END LOOP;

  ------------------------------------------------------------------
  -- Effacement
  ------------------------------------------------------------------
  v_report := api.rpc_gdpr_erase_subject('actor', v_actor::text, 'anonymize', 'Provenance CRM');
  v_operation := (v_report->>'operationId')::uuid;

  ASSERT (SELECT display_name = '[Donnée effacée]' FROM public.actor WHERE id = v_actor);
  ASSERT (v_report->>'portal_user_id')::uuid = v_portal, 'Le compte portail délié doit rester nommé';
  ASSERT (SELECT actor_id IS NULL FROM public.app_user_profile WHERE id = v_portal);
  ASSERT (v_report->>'manualReviewRequired')::boolean IS TRUE;
  ASSERT (v_report->>'retainedSharedDocuments')::int = 5, 'partagé, déplacé, détaché utilisé, publié et même clé';
  ASSERT (v_report->'crmProvenance'->>'detachmentReceipts')::int = 2;
  ASSERT (v_report->'crmProvenance'->>'uploadReceipts')::int = 2;
  ASSERT v_report->'unresolvedScope' ?& ARRAY['storageAliasesAndGenerations', 'portalAccountAvatar'],
         'Les verrous d''activation doivent rester explicites';

  -- Lien vivant du sujet seul : catalogue retiré, tâche mise en file.
  ASSERT NOT EXISTS (SELECT 1 FROM public.ref_document WHERE id = v_orphan);
  ASSERT EXISTS (SELECT 1 FROM internal.gdpr_cleanup_task WHERE operation_id = v_operation
    AND action = 'storage_remove' AND metadata->>'bucket' = 'actor-documents' AND metadata->>'path' = 'gdpr/orphan.pdf');
  ASSERT NOT EXISTS (SELECT 1 FROM audit.audit_log WHERE table_name = 'ref_document'
    AND row_pk->>'id' = v_orphan::text AND (before_data ? 'url' OR before_data ? 'storage_path'));
  ASSERT NOT EXISTS (SELECT 1 FROM public.ref_document WHERE id = v_portal_doc);

  -- Autre tâche partagée : la ligne centrale et son lien survivent, seul le lien du sujet part.
  ASSERT (SELECT title = 'Partagé' FROM public.ref_document WHERE id = v_shared);
  ASSERT EXISTS (SELECT 1 FROM public.crm_task_document WHERE task_id = v_other_task AND document_id = v_shared);
  ASSERT NOT EXISTS (SELECT 1 FROM public.crm_task_document WHERE task_id = v_task);
  ASSERT (SELECT actor_id = v_other_actor FROM public.crm_task WHERE id = v_other_task);
  ASSERT (SELECT actor_id IS NULL AND title = '[Donnée effacée]' FROM public.crm_task WHERE id = v_task);

  -- Détaché retrouvé : titre rédigé, aucune suppression ni tâche.
  ASSERT (SELECT title IS NULL FROM public.ref_document WHERE id = v_detached), 'Le titre du document retrouvé par reçu doit être rédigé';
  ASSERT v_report->'crmProvenance'->'receiptOnlyDocumentIds' ? v_detached::text;
  ASSERT NOT EXISTS (SELECT 1 FROM internal.crm_document_detachment WHERE subject_actor_id = v_actor);
  ASSERT (SELECT count(*) = 2 FROM internal.crm_document_detachment WHERE parent_id IN (v_task, v_actor) AND document_id IN (v_detached, v_detached_used));

  -- Document retrouvé mais utilisé par une fiche brouillon : ligne intacte.
  ASSERT (SELECT title = 'Utilisé ailleurs' FROM public.ref_document WHERE id = v_detached_used);
  ASSERT EXISTS (SELECT 1 FROM public.object_document WHERE object_id = 'HOTRUN999999AR04' AND document_id = v_detached_used);

  -- Usages sans FK : photo publiée et autre entrée sur la même clé.
  ASSERT EXISTS (SELECT 1 FROM public.ref_document WHERE id = v_published);
  ASSERT EXISTS (SELECT 1 FROM public.ref_document WHERE id = v_same_key);
  ASSERT EXISTS (SELECT 1 FROM public.ref_document WHERE id = v_same_key_twin);

  -- Upload jamais attaché retrouvé : reçu conservé, snapshots rédigés.
  ASSERT (SELECT title = '[Donnée effacée]' AND prepared_actor_id IS NULL AND state = 'prepared'
            FROM internal.crm_document_upload WHERE id = v_never_attached);
  ASSERT v_report->'crmProvenance'->'unattachedUploadIds' ? v_never_attached::text;

  -- Reçu dont le fichier appartient maintenant à une autre tâche.
  ASSERT (SELECT title = '[Donnée effacée]' AND prepared_actor_id IS NULL AND attached_actor_id = v_other_actor
            FROM internal.crm_document_upload WHERE id = v_moved_upload);
  ASSERT EXISTS (SELECT 1 FROM public.ref_document WHERE id = v_moved_upload);
  ASSERT EXISTS (SELECT 1 FROM public.crm_task_document WHERE task_id = v_other_task AND document_id = v_moved_upload);

  -- Seuls les deux liens vivants orphelins ouvrent une tâche Storage.
  ASSERT (SELECT count(*) = 2 FROM internal.gdpr_cleanup_task WHERE operation_id = v_operation AND action = 'storage_remove'),
         'Un reçu ou un document partagé ne doit créer aucune tâche Storage';

  -- after_data rédigé pour une trace sans autre correspondance.
  ASSERT NOT EXISTS (SELECT 1 FROM audit.audit_log WHERE table_name = 'crm_task_document'
    AND row_pk->>'id' = v_audit_row::text AND (after_data ? 'title' OR before_data ? 'title')),
    'after_data doit être rédigé';
  ASSERT NOT EXISTS (SELECT 1 FROM audit.audit_log WHERE table_name = 'crm_task'
    AND row_pk->>'id' = v_task::text AND (after_data ? 'title' OR before_data ? 'title'));

  -- Le résultat ne rouvre aucun droit.
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    ASSERT NOT has_function_privilege(v_role, 'api.rpc_gdpr_erase_subject(text,text,text,text)', 'EXECUTE');
  END LOOP;
  ------------------------------------------------------------------
  -- Les deux compagnons sont exercés par le vrai RPC, pas seulement isolément.
  ------------------------------------------------------------------
  v_avatar_path := v_writer::text || '/avatar-' || v_avatar_upload::text || '.jpg';
  v_orphan_path := v_writer::text || '/avatar-' || v_avatar_orphan::text || '.jpg';
  ASSERT (SELECT role NOT IN ('owner','super_admin') FROM public.app_user_profile WHERE id=v_writer);
  SELECT to_jsonb(p) INTO v_profile_before FROM public.app_user_profile p WHERE p.id=v_writer;
  SELECT count(*) INTO v_logs FROM public.gdpr_erasure_log;
  PERFORM api.begin_avatar_upload(v_avatar_upload,v_writer,v_avatar_path,repeat('b',64),3);
  v_denied := false;
  BEGIN
    PERFORM api.rpc_gdpr_erase_subject('user',upper(v_writer::text),'anonymize','avatar engaged');
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_denied := true;
  END;
  ASSERT v_denied, 'Le vrai RPC doit refuser un avatar engagé avant le journal';
  ASSERT (SELECT count(*)=v_logs FROM public.gdpr_erasure_log);
  ASSERT (SELECT to_jsonb(p)=v_profile_before FROM public.app_user_profile p WHERE p.id=v_writer),
    'Le refus ne doit pas modifier le profil';
  ASSERT (SELECT state='engaged' FROM internal.avatar_upload_intent WHERE id=v_avatar_upload);

  PERFORM api.complete_avatar_upload(v_avatar_upload,v_writer,v_avatar_path,repeat('b',64),3);
  INSERT INTO storage.buckets(id,name,public) VALUES('avatars','avatars',true) ON CONFLICT(id) DO NOTHING;
  INSERT INTO storage.objects(bucket_id,name) VALUES('avatars',v_avatar_path),('avatars',v_orphan_path);
  v_report := api.rpc_gdpr_erase_subject('user',upper(v_writer::text),'anonymize','avatar inventory');
  v_operation := (v_report->>'operationId')::uuid;
  ASSERT (SELECT count(*)=v_logs+1 FROM public.gdpr_erasure_log);
  ASSERT EXISTS(SELECT 1 FROM internal.gdpr_cleanup_task WHERE operation_id=v_operation
    AND action='storage_remove' AND metadata->>'bucket'='avatars'
    AND metadata->>'path'=v_orphan_path AND metadata ? 'storage_object_id'),
    'Le vrai RPC doit retrouver la génération orpheline';
  ASSERT (SELECT count(*)=2 FROM internal.gdpr_cleanup_task WHERE operation_id=v_operation
    AND action='storage_remove' AND metadata->>'path' IN(v_avatar_path,v_orphan_path));
  ASSERT internal.gdpr_enqueue_avatar_inventory(v_operation,v_writer)=0, 'Inventaire canonique sans doublon';
  ASSERT NOT api.avatar_upload_allowed(v_writer), 'Les tâches pendantes ferment une nouvelle admission';
  ASSERT (SELECT display_name IS NULL AND avatar_url IS NULL FROM public.app_user_profile WHERE id=v_writer);
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    ASSERT NOT has_function_privilege(v_role,'api.rpc_gdpr_erase_subject(text,text,text,text)','EXECUTE');
    ASSERT NOT has_function_privilege(v_role,'api.rpc_gdpr_get_cleanup_status(uuid)','EXECUTE');
    ASSERT NOT has_function_privilege(v_role,'api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)','EXECUTE');
  END LOOP;
END;
$test$;
ROLLBACK;
