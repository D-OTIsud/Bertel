-- Fresh-only preconditions. Catalog reads only; included BEFORE any album DDL.
DO $fresh_only$
BEGIN
 IF EXISTS(SELECT 1 FROM (VALUES
  ('api.portal_message_upload_context(text)'),
  ('api.send_portal_message(text,text,text,jsonb,text,uuid)'),
  ('api.portal_message_document(uuid)'),
  ('api.list_portal_message_documents(uuid)'),
  ('api.list_my_portal_messages(text)'),
  ('internal.portal_photo_assert_actor(text)'),
  ('internal.portal_photos_json(text)'),
  ('api.portal_photo_upload_context(text)'),
  ('api.list_my_portal_photos(text)'),
  ('api.withdraw_portal_photo(text,uuid)'),
  ('api.reorder_portal_photos(text,jsonb)'),
  ('internal.validate_portal_photo_additions(text,jsonb,uuid)'),
  ('api.portal_photo_preview(uuid)'),
  ('api.prepare_portal_photo_approval(uuid,boolean,uuid)'),
  ('api.get_portal_photo_review(uuid)'),
  ('api.publish_portal_photo_additions(text,jsonb)'),
  ('api.portal_photo_failed_approval(uuid)'),
  ('api.can_read_object_for_correction(text)'),
  ('internal.gallery_published_photo_count(text)'),
  ('internal.gallery_photo_reservations(text)'),
  ('internal.gallery_photo_usage(text)'),
  ('internal.gallery_assert_photo_capacity(text,integer,integer)'),
  ('internal.gallery_arm_photo_reservation(text,uuid,uuid)'),
  ('internal.gallery_bind_photo_proposal()'),
  ('api.reserve_portal_photo_upload(text,uuid,uuid)'),
  ('api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer)'),
  ('api.cancel_portal_photo_upload(text,uuid)'),
  ('api.save_object_gallery(text,jsonb)'),
  ('api.get_gallery_write_receipt(text,uuid)'),
  ('internal.photo_analysis_local_day(timestamptz)'),
  ('internal.photo_analysis_reset_at(date)'),
  ('internal.photo_analysis_assert_owner(text,uuid)'),
  ('internal.photo_analysis_json(uuid)'),
  ('internal.photo_analysis_envelope(uuid)'),
  ('internal.photo_assessment_valid(jsonb)'),
  ('api.reserve_portal_photo_analysis(text,uuid,uuid)'),
  ('api.get_portal_photo_analysis(uuid)'),
  ('api.start_portal_photo_analysis(uuid,uuid)'),
  ('api.finish_portal_photo_analysis(uuid,uuid,jsonb)'),
  ('api.appeal_portal_photo_analysis(uuid,text,uuid)'),
  ('internal.portal_photo_actor_writes_enabled()'),
  ('internal.portal_photo_assert_writes_open()'),
  ('internal.portal_photo_text_snapshot(text,text,jsonb,jsonb,text)'),
  ('internal.portal_photo_order_snapshot(text)'),
  ('internal.portal_photo_workspace_json(text,uuid)'),
  ('api.get_my_portal_photo_workspace(text)'),
  ('internal.update_portal_photo_texts(text,uuid,boolean,jsonb,text,text)'),
  ('api.update_portal_photo_texts(text,uuid,jsonb,text,text)'),
  ('api.update_portal_photo_proposal_texts(text,uuid,jsonb,text,text)'),
  ('api.reconcile_portal_photo_order(text,jsonb,jsonb)'),
  ('api.appeal_portal_photo_review(text,uuid,uuid,text,uuid)'),
  ('internal.gallery_capture_photo_proposal_usage()'),
  ('internal.portal_photo_appeal_document(uuid)')
 ) expected(signature) WHERE to_regprocedure(expected.signature) IS NOT NULL)
 OR EXISTS(SELECT 1 FROM (VALUES
  ('internal.gallery_write_receipt'),('internal.portal_photo_analysis_settings'),('internal.portal_photo_analysis'),
  ('public.uq_crm_portal_client_message'),('public.idx_ref_document_portal_photo_object')
 ) expected(name) WHERE to_regclass(expected.name) IS NOT NULL)
 OR EXISTS(SELECT 1 FROM pg_policy WHERE (polrelid,polname) IN (
  ('public.media'::regclass,'correction_read_root_gallery'),
  ('public.media'::regclass,'gallery_photo_no_direct_insert'),('public.media'::regclass,'gallery_photo_no_direct_update'),
  ('public.media'::regclass,'gallery_photo_no_direct_delete'),('public.ref_document'::regclass,'portal_photo_receipt_no_direct_insert'),
  ('public.ref_document'::regclass,'portal_photo_receipt_no_direct_update'),('public.ref_document'::regclass,'portal_photo_receipt_no_direct_delete')))
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.pending_change'::regclass
  AND tgname IN('gallery_bind_photo_proposal','gallery_capture_photo_proposal_usage') AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'Photo album is partial or already present: review the existing state; do not replay the fresh initializer';
 END IF;
 IF to_regprocedure('api.is_actor_persona()') IS NULL
    OR to_regprocedure('api.current_user_portal_object_ids()') IS NULL
    OR to_regprocedure('api.user_can_write_object_canonical(text)') IS NULL
    OR to_regclass('public.actor_document') IS NULL
    OR to_regclass('public.crm_interaction') IS NULL
    OR to_regclass('public.app_notification') IS NULL THEN
  RAISE EXCEPTION 'Install the canonical actor, CRM and authorization prerequisites first';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='actor-documents' AND NOT public)
    OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='media' AND public) THEN
  RAISE EXCEPTION 'The canonical private actor-documents and public media buckets are required';
 END IF;
 -- These are the CURRENT canonical pre-photo shared bodies, not a public-reader
 -- snapshot or an operator identity. A changed predecessor needs a reviewed delta.
 IF (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('api.actor_portal_floor_modules()')) IS DISTINCT FROM '2bbe58646c2d56dc402bbede946e1511'
 OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('api.submit_actor_fiche(text,jsonb,text)')) IS DISTINCT FROM '0861011392137effc9c7cb97bef6beab'
 OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('api.approve_pending_change(uuid,text,boolean)')) IS DISTINCT FROM '78b171f997cd630da118ecc81382448d'
 OR (SELECT md5(replace(prosrc,E'\r\n',E'\n')) FROM pg_proc WHERE oid=to_regprocedure('api.reject_pending_change(uuid,text)')) IS DISTINCT FROM 'c125ebd25849243cf45f1b7a114960ed' THEN
  RAISE EXCEPTION 'The canonical pre-photo moderation/submission contract changed; review before bootstrap';
 END IF;
 IF (SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.app_notification'::regclass AND conname='chk_app_notification_kind') IS DISTINCT FROM '7422d4daf1c99e1767e91a0ce5abcfa9' THEN
  RAISE EXCEPTION 'The canonical notification kinds changed; review before adding portal_message';
 END IF;
END;
$fresh_only$;
