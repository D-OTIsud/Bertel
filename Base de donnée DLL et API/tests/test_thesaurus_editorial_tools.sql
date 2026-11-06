-- Real read-only/proposal/outbox preconditions. No fixture or release survives this test.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='120s';
INSERT INTO auth.users(id,email)VALUES('b73e0000-0000-4000-8000-000000000301','thesaurus-tools@example.invalid')ON CONFLICT DO NOTHING;
INSERT INTO public.app_user_profile(id,role,display_name)VALUES('b73e0000-0000-4000-8000-000000000301','super_admin','Editorial tools test')ON CONFLICT(id)DO UPDATE SET role='super_admin';
SELECT set_config('request.jwt.claims','{"sub":"b73e0000-0000-4000-8000-000000000301","role":"authenticated"}',true);
INSERT INTO public.ref_code_domain_registry(domain,name,object_type,is_hierarchical,is_taxonomy)VALUES('taxonomy_hlo','Test accommodation','HLO',true,true)ON CONFLICT(domain)DO NOTHING;
INSERT INTO public.ref_code(id,domain,code,name,description)VALUES
('b73e1000-0000-4000-8000-000000000301','taxonomy_hlo','thesaurus_tools_fixture','Libellé livré initial','Définition du témoin');

DO $tools_test$
DECLARE w jsonb;cid uuid;fp text;rev jsonb;doc jsonb;pub jsonb;claimed jsonb;event jsonb;receipt jsonb;other uuid;delivered jsonb;attempts_before integer;
BEGIN
  w:=api.thesaurus_admin('workspace','{"read_only":true,"domain":"taxonomy_hlo"}');
  ASSERT w#>>'{capabilities,content_proposal_preconditions}'='1','Missing content proposal capability';
  ASSERT w#>>'{capabilities,read_only_workspace}'='1','Missing read-only workspace capability';
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.concept WHERE source_id='b73e1000-0000-4000-8000-000000000301'),'Read-only workspace created an identity';
  PERFORM api.thesaurus_admin('workspace','{}');
  SELECT concept_id INTO cid FROM thesaurus.concept WHERE source_id='b73e1000-0000-4000-8000-000000000301'AND domain='taxonomy_hlo';
  ASSERT cid IS NOT NULL,'Fixture identity absent';fp:=thesaurus.source_fingerprint(cid);
  doc:='{"name":"Proposition de la version Bertel suivante"}';
  BEGIN
    PERFORM api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',0,'only_if_no_revision',true,'expected_source_fingerprint','stale','document',doc));
    RAISE EXCEPTION 'A content update with a stale source was accepted';
  EXCEPTION WHEN SQLSTATE'PT409'THEN NULL;END;
  ASSERT NOT EXISTS(SELECT 1 FROM thesaurus.revision WHERE concept_id=cid),'Stale proposal left a draft';
  rev:=api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',0,'only_if_no_revision',true,'expected_source_fingerprint',fp,'document',doc));
  ASSERT rev->>'status'='draft','Content proposal skipped editorial validation';
  BEGIN
    PERFORM api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',cid,'expected_version',(rev->>'version')::integer,'only_if_no_revision',true,'expected_source_fingerprint',fp,'document','{"name":"Écrasement interdit"}'::jsonb));
    RAISE EXCEPTION 'An existing local draft was overwritten';
  EXCEPTION WHEN SQLSTATE'PT409'THEN NULL;END;
  ASSERT(SELECT document->>'name'FROM thesaurus.revision WHERE revision_id=(rev->>'revision_id')::uuid)=doc->>'name','Local draft changed';
  ASSERT(SELECT name FROM public.ref_code WHERE id='b73e1000-0000-4000-8000-000000000301'AND domain='taxonomy_hlo')='Libellé livré initial','Proposal modified live source';
  PERFORM api.thesaurus_admin('configure_instance','{"base_uri":"https://example.invalid/api/public/thesaurus/concepts/","license":"fixture-only","attribution":"Editorial tools fixture"}');
  pub:=api.thesaurus_admin('bootstrap','{"domains":["taxonomy_hlo"],"idempotency_key":"tools-bootstrap"}');
  claimed:=api.thesaurus_admin('claim_outbox','{"limit":20}');
  SELECT x INTO event FROM jsonb_array_elements(claimed)x WHERE(x->>'release_id')::bigint=(pub->>'release_id')::bigint;
  ASSERT event IS NOT NULL AND event->>'status'='processing','Publication event was not claimed';
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(api.thesaurus_admin('claim_outbox','{}'))x WHERE x->>'id'=event->>'id'),'Active lease was reclaimed';
  receipt:=jsonb_build_object('id',event->>'id','claim_token',event->>'claim_token');other:=gen_random_uuid();
  BEGIN
    PERFORM api.thesaurus_admin('deliver_outbox',receipt||jsonb_build_object('claim_token',other));
    RAISE EXCEPTION 'A different claim token delivered an event';
  EXCEPTION WHEN SQLSTATE'PT409'THEN NULL;END;
  BEGIN
    PERFORM api.thesaurus_admin('ack_outbox',receipt);
    RAISE EXCEPTION 'Success acknowledged without the notification effect';
  EXCEPTION WHEN SQLSTATE'PT400'THEN NULL;END;
  PERFORM api.thesaurus_admin('ack_outbox',receipt||'{"error":"Sensitive upstream text"}'::jsonb);
  ASSERT(SELECT status='failed'AND last_error='delivery_failed'FROM thesaurus.outbox WHERE id=(event->>'id')::bigint),'Delivery failure was not safely persisted';
  PERFORM api.thesaurus_admin('retry_outbox',receipt);
  claimed:=api.thesaurus_admin('claim_outbox','{}');
  SELECT x INTO event FROM jsonb_array_elements(claimed)x WHERE(x->>'release_id')::bigint=(pub->>'release_id')::bigint;
  ASSERT event->>'claim_token'<>receipt->>'claim_token','Retry reused the stale claim token';
  receipt:=jsonb_build_object('id',event->>'id','claim_token',event->>'claim_token');
  -- A crashed processor is reclaimable after the ten-minute lease, without a new release.
  UPDATE thesaurus.outbox SET claimed_at=clock_timestamp()-interval'11 minutes'WHERE id=(event->>'id')::bigint;
  claimed:=api.thesaurus_admin('claim_outbox','{}');
  SELECT x INTO event FROM jsonb_array_elements(claimed)x WHERE(x->>'release_id')::bigint=(pub->>'release_id')::bigint;
  ASSERT event->>'claim_token'<>receipt->>'claim_token','Expired lease was not reclaimed';
  receipt:=jsonb_build_object('id',event->>'id','claim_token',event->>'claim_token');
  delivered:=api.thesaurus_admin('deliver_outbox',receipt);
  ASSERT delivered->>'status'='completed'AND delivered->>'completed_at'IS NOT NULL,'Delivery did not complete';
  attempts_before:=(delivered->>'attempts')::integer;
  ASSERT api.thesaurus_admin('deliver_outbox',receipt)=delivered,'Same receipt was not idempotent';
  ASSERT(SELECT attempts FROM thesaurus.outbox WHERE id=(event->>'id')::bigint)=attempts_before,'Replay increased attempts';
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(api.thesaurus_admin('claim_outbox','{}'))x WHERE x->>'id'=event->>'id'),'Completed event was claimed again';
  RAISE NOTICE 'Content proposal concurrency guards, read-only workspace and leased outbox delivery passed.';
END $tools_test$;
ROLLBACK;
