-- Real nested/array reference coverage. Every source, owning object and blocked write is a fixture.
-- Runs on the fresh-install test database; all changes roll back, including publication.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='180s';
INSERT INTO auth.users(id,email) VALUES('b73e0000-0000-4000-8000-000000000201','thesaurus-nested@example.invalid') ON CONFLICT DO NOTHING;
INSERT INTO public.app_user_profile(id,role,display_name) VALUES('b73e0000-0000-4000-8000-000000000201','super_admin','Nested thesaurus fixture') ON CONFLICT(id) DO UPDATE SET role='super_admin';
SELECT set_config('request.jwt.claims','{"sub":"b73e0000-0000-4000-8000-000000000201","role":"authenticated"}',true);
-- Minimal local DBs may omit the full seed corpus; use the same applicability pairs as
-- migration_facet_applicability.sql, without disabling any trigger or widening a real pair.
INSERT INTO public.ref_facet_registry(facet_table,object_id_column)VALUES
('object_room_type','object_id'),('object_menu','object_id'),('object_meeting_room','object_id')ON CONFLICT DO NOTHING;
INSERT INTO public.ref_facet_applicability(facet_table,object_type)VALUES
('object_room_type','HOT'),('object_menu','RES'),('object_meeting_room','HOT')ON CONFLICT DO NOTHING;
INSERT INTO public.ref_actor_role(id,code,name)VALUES('b73e9400-0000-4000-8000-000000000201','operator','Exploitant témoin')ON CONFLICT(code)DO NOTHING;

CREATE TEMP TABLE nested_sources(source_id uuid PRIMARY KEY,domain text NOT NULL,kind text NOT NULL);
INSERT INTO public.ref_code(id,domain,code,name,description) VALUES
('b73e9100-0000-4000-8000-000000000201','amenity_family','nested_fixture_family','Famille imbriquée','Définition de la famille témoin'),
('b73e9100-0000-4000-8000-000000000202','bed_type','nested_fixture_bed','Lit imbriqué','Définition du lit témoin'),
('b73e9100-0000-4000-8000-000000000203','allergen','nested_fixture_allergen','Allergène imbriqué','Définition de l’allergène témoin'),
('b73e9100-0000-4000-8000-000000000204','cuisine_type','nested_fixture_cuisine','Cuisine imbriquée','Définition de la cuisine témoin'),
('b73e9100-0000-4000-8000-000000000205','dietary_tag','nested_fixture_diet','Régime imbriqué','Définition du régime témoin'),
('b73e9100-0000-4000-8000-000000000206','meeting_equipment','nested_fixture_equipment','Équipement de salle imbriqué','Définition de l’équipement témoin'),
('b73e9100-0000-4000-8000-000000000207','media_tag','nested_fixture_tag','Tag média imbriqué','Définition du tag témoin'),
('b73e9100-0000-4000-8000-000000000208','media_type','nested_fixture_media','Type média témoin','Définition du type média'),
('b73e9100-0000-4000-8000-000000000209','contact_kind','nested_fixture_contact','Contact témoin','Définition du contact'),
('b73e9100-0000-4000-8000-000000000210','opening_period_type','nested_fixture_period','Période témoin','Définition de la période'),
('b73e9100-0000-4000-8000-000000000211','opening_schedule_type','nested_fixture_schedule','Horaire témoin','Définition de l’horaire'),
('b73e9100-0000-4000-8000-000000000212','media_type','nested_fixture_media_active','Type média actif','Définition du type actif'),
('b73e9100-0000-4000-8000-000000000213','opening_schedule_type','nested_fixture_schedule_active','Horaire actif','Définition de l’horaire actif'),
('b73e9100-0000-4000-8000-000000000214','contact_kind','nested_fixture_actor_contact','Contact acteur témoin','Définition du contact acteur'),
('b73e9100-0000-4000-8000-000000000215','media_tag','nested_fixture_place_tag','Tag de lieu témoin','Définition du tag de lieu');
INSERT INTO public.ref_amenity(id,code,name,family_id,description) VALUES
('b73e9200-0000-4000-8000-000000000201','nested_fixture_amenity','Équipement de chambre','b73e9100-0000-4000-8000-000000000201','Définition de l’équipement de chambre');
INSERT INTO public.ref_classification_scheme(id,code,name,description,is_distinction) VALUES
('b73e9300-0000-4000-8000-000000000201','NESTED_FIXTURE_SCHEME','Schéma de sous-valeurs','Définition du schéma',true);
INSERT INTO public.ref_classification_value(id,scheme_id,code,name) VALUES
('b73e9300-0000-4000-8000-000000000202','b73e9300-0000-4000-8000-000000000201','nested_primary','Valeur principale'),
('b73e9300-0000-4000-8000-000000000203','b73e9300-0000-4000-8000-000000000201','nested_detail','Sous-valeur historique');

INSERT INTO nested_sources SELECT id,domain,'ref_code' FROM public.ref_code WHERE id IN
('b73e9100-0000-4000-8000-000000000202','b73e9100-0000-4000-8000-000000000203','b73e9100-0000-4000-8000-000000000204',
 'b73e9100-0000-4000-8000-000000000205','b73e9100-0000-4000-8000-000000000206','b73e9100-0000-4000-8000-000000000207',
 'b73e9100-0000-4000-8000-000000000208','b73e9100-0000-4000-8000-000000000209','b73e9100-0000-4000-8000-000000000210',
 'b73e9100-0000-4000-8000-000000000211','b73e9100-0000-4000-8000-000000000214','b73e9100-0000-4000-8000-000000000215');
INSERT INTO nested_sources VALUES
('b73e9200-0000-4000-8000-000000000201','amenity','amenity'),
('b73e9300-0000-4000-8000-000000000203','classification_value','classification_value');
INSERT INTO public.ref_code(id,domain,code,name,description,dow_number)
SELECT 'b73e9100-0000-4000-8000-000000000216','weekday','nested_fixture_monday','Lundi témoin','Définition du jour témoin',1
WHERE NOT EXISTS(SELECT 1 FROM public.ref_code WHERE domain='weekday');
INSERT INTO nested_sources SELECT id,'weekday','ref_code' FROM public.ref_code WHERE domain='weekday' ORDER BY code LIMIT 1;

INSERT INTO public.object(id,object_type,name,status) VALUES
('HOTRUNNESTED0001','HOT','Propriétaire des usages imbriqués','draft'),
('HOTRUNNESTED0002','HOT','Témoin de nouvelles affectations','draft'),
('RESRUNNESTED0003','RES','Propriétaire du menu imbriqué','draft');
INSERT INTO public.object_room_type(id,object_id,code,name) VALUES
('b73ea100-0000-4000-8000-000000000201','HOTRUNNESTED0001','NESTED1','Chambre historique'),
('b73ea100-0000-4000-8000-000000000202','HOTRUNNESTED0002','NESTED2','Chambre nouvelle');
INSERT INTO public.object_room_type_amenity(room_type_id,amenity_id) VALUES('b73ea100-0000-4000-8000-000000000201','b73e9200-0000-4000-8000-000000000201');
INSERT INTO public.object_room_type_bed(room_type_id,bed_type_id,quantity) VALUES('b73ea100-0000-4000-8000-000000000201','b73e9100-0000-4000-8000-000000000202',1);
INSERT INTO public.object_menu(id,object_id,name) VALUES('b73ea200-0000-4000-8000-000000000201','RESRUNNESTED0003','Menu témoin');
INSERT INTO public.object_menu_item(id,menu_id,name) VALUES
('b73ea200-0000-4000-8000-000000000202','b73ea200-0000-4000-8000-000000000201','Plat historique'),
('b73ea200-0000-4000-8000-000000000203','b73ea200-0000-4000-8000-000000000201','Nouveau plat');
INSERT INTO public.object_menu_item_allergen(menu_item_id,allergen_id) VALUES('b73ea200-0000-4000-8000-000000000202','b73e9100-0000-4000-8000-000000000203');
INSERT INTO public.object_menu_item_cuisine_type(menu_item_id,cuisine_type_id) VALUES('b73ea200-0000-4000-8000-000000000202','b73e9100-0000-4000-8000-000000000204');
INSERT INTO public.object_menu_item_dietary_tag(menu_item_id,dietary_tag_id) VALUES('b73ea200-0000-4000-8000-000000000202','b73e9100-0000-4000-8000-000000000205');
INSERT INTO public.object_meeting_room(id,object_id,name) VALUES
('b73ea300-0000-4000-8000-000000000201','HOTRUNNESTED0001','Salle historique'),
('b73ea300-0000-4000-8000-000000000202','HOTRUNNESTED0002','Salle nouvelle');
INSERT INTO public.meeting_room_equipment(room_id,equipment_id) VALUES('b73ea300-0000-4000-8000-000000000201','b73e9100-0000-4000-8000-000000000206');
INSERT INTO public.media(id,object_id,media_type_id,url,title,is_published) VALUES
('b73ea400-0000-4000-8000-000000000201','HOTRUNNESTED0001','b73e9100-0000-4000-8000-000000000208','https://example.invalid/nested-old.jpg','Média historique',true),
('b73ea400-0000-4000-8000-000000000202','HOTRUNNESTED0002','b73e9100-0000-4000-8000-000000000212','https://example.invalid/nested-new.jpg','Média nouveau',true);
INSERT INTO public.media_tag(media_id,tag_id) VALUES('b73ea400-0000-4000-8000-000000000201','b73e9100-0000-4000-8000-000000000207');
INSERT INTO public.object_place(id,object_id,label)VALUES('b73ea400-0000-4000-8000-000000000203','HOTRUNNESTED0001','Lieu du média témoin');
INSERT INTO public.media(id,place_id,media_type_id,url,title,is_published)VALUES
('b73ea400-0000-4000-8000-000000000204','b73ea400-0000-4000-8000-000000000203','b73e9100-0000-4000-8000-000000000212','https://example.invalid/nested-place.jpg','Média rattaché au lieu',true);
INSERT INTO public.media_tag(media_id,tag_id)VALUES('b73ea400-0000-4000-8000-000000000204','b73e9100-0000-4000-8000-000000000215');
INSERT INTO public.contact_channel(id,object_id,kind_id,value) VALUES('b73ea500-0000-4000-8000-000000000201','HOTRUNNESTED0001','b73e9100-0000-4000-8000-000000000209','Témoin historique');
INSERT INTO public.opening_period(id,object_id,name,all_years,period_type_id) VALUES
('b73ea600-0000-4000-8000-000000000201','HOTRUNNESTED0001','Période historique',true,'b73e9100-0000-4000-8000-000000000210'),
('b73ea600-0000-4000-8000-000000000202','HOTRUNNESTED0002','Nouvelle période',true,NULL);
INSERT INTO public.opening_schedule(id,period_id,schedule_type_id,name) VALUES
('b73ea600-0000-4000-8000-000000000203','b73ea600-0000-4000-8000-000000000201','b73e9100-0000-4000-8000-000000000211','Horaire historique'),
('b73ea600-0000-4000-8000-000000000204','b73ea600-0000-4000-8000-000000000202','b73e9100-0000-4000-8000-000000000213','Nouvel horaire');
INSERT INTO public.opening_time_period(id,schedule_id,closed) VALUES
('b73ea600-0000-4000-8000-000000000205','b73ea600-0000-4000-8000-000000000203',false),
('b73ea600-0000-4000-8000-000000000206','b73ea600-0000-4000-8000-000000000204',false);
INSERT INTO public.opening_time_period_weekday(time_period_id,weekday_id) SELECT 'b73ea600-0000-4000-8000-000000000205',source_id FROM nested_sources WHERE domain='weekday';
INSERT INTO public.object_classification(id,object_id,scheme_id,value_id,subvalue_ids,status) VALUES
('b73ea700-0000-4000-8000-000000000201','HOTRUNNESTED0001','b73e9300-0000-4000-8000-000000000201','b73e9300-0000-4000-8000-000000000202',ARRAY['b73e9300-0000-4000-8000-000000000203']::uuid[],'granted'),
('b73ea700-0000-4000-8000-000000000202','HOTRUNNESTED0002','b73e9300-0000-4000-8000-000000000201','b73e9300-0000-4000-8000-000000000202',NULL,'granted');
INSERT INTO public.actor(id,display_name)VALUES
('b73ea800-0000-4000-8000-000000000201','Acteur relié au restaurant'),
('b73ea800-0000-4000-8000-000000000202','Acteur sans ancien contact');
INSERT INTO public.actor_object_role(actor_id,object_id,role_id)
SELECT a.id,a.object_id,r.id FROM(VALUES
('b73ea800-0000-4000-8000-000000000201'::uuid,'RESRUNNESTED0003'),
('b73ea800-0000-4000-8000-000000000202'::uuid,'HOTRUNNESTED0002'))a(id,object_id)
CROSS JOIN LATERAL(SELECT id FROM public.ref_actor_role WHERE code='operator' LIMIT 1)r;
INSERT INTO public.actor_channel(id,actor_id,kind_id,value)VALUES
('b73ea800-0000-4000-8000-000000000203','b73ea800-0000-4000-8000-000000000201','b73e9100-0000-4000-8000-000000000214','Ancien contact acteur');

CREATE FUNCTION pg_temp.assert_rejected(p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN check_violation THEN RETURN;
  END;
  RAISE EXCEPTION 'Retired nested concept was accepted: %',p_sql;
END $$;

CREATE FUNCTION pg_temp.publish_nested(p_retire boolean) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE c record;d jsonb;r jsonb;ids jsonb:='[]';versions jsonb:='{}';result jsonb;
BEGIN
  FOR c IN SELECT tc.concept_id FROM nested_sources s JOIN thesaurus.concept tc
    ON tc.source_id=s.source_id::text AND tc.domain=s.domain AND tc.source_kind=s.kind ORDER BY tc.concept_id LOOP
    d:=thesaurus.concept_document(c.concept_id);
    IF p_retire THEN d:=d||'{"lifecycle":"retired"}'::jsonb;
    ELSE d:=d||jsonb_build_object('name',(d->>'name')||' renommé'); END IF;
    r:=api.thesaurus_admin('save_draft',jsonb_build_object('concept_id',c.concept_id,'expected_version',0,'document',d));
    r:=api.thesaurus_admin('validate_draft',jsonb_build_object('revision_id',r->>'revision_id','expected_version',(r->>'version')::integer));
    ids:=ids||jsonb_build_array(r->>'revision_id');versions:=versions||jsonb_build_object(r->>'revision_id',(r->>'version')::integer);
  END LOOP;
  ASSERT jsonb_array_length(ids)=(SELECT count(*) FROM nested_sources),'Some nested fixture concepts were not published';
  result:=api.thesaurus_admin('publish',jsonb_build_object('revision_ids',ids,'expected_revision_versions',versions,
    'expected_release_id',api.thesaurus_generation(),'idempotency_key',CASE WHEN p_retire THEN 'nested-retirement' ELSE 'nested-rename' END));
  RETURN (result->>'release_id')::bigint;
END $$;

DO $nested_test$
DECLARE c record;usage_ids text[];before_hot timestamptz;before_res timestamptz;gen bigint;weekday uuid;copy jsonb;pair record;
  parent_copy jsonb;items_copy jsonb;a_copy jsonb;b_copy jsonb;c_copy jsonb;
BEGIN
  ASSERT (SELECT count(*) FROM nested_sources)=15,'Non-vacuous source fixtures missing';
  ASSERT (SELECT count(*)FROM public.actor_object_role WHERE actor_id IN('b73ea800-0000-4000-8000-000000000201','b73ea800-0000-4000-8000-000000000202'))=2,'Actor ownership bridge fixtures missing';
  PERFORM api.thesaurus_admin('configure_instance','{"base_uri":"https://example.invalid/api/public/thesaurus/concepts/","license":"fixture-only","attribution":"Nested fixture"}');
  PERFORM api.thesaurus_admin('workspace','{}');
  PERFORM api.thesaurus_admin('bootstrap','{"domains":["amenity","bed_type","allergen","cuisine_type","dietary_tag","meeting_equipment","media_tag","media_type","contact_kind","opening_period_type","opening_schedule_type","weekday","classification_value"],"idempotency_key":"nested-bootstrap"}');
  FOR c IN SELECT tc.concept_id,s.domain,s.source_id FROM nested_sources s JOIN thesaurus.concept tc
    ON tc.source_id=s.source_id::text AND tc.domain=s.domain AND tc.source_kind=s.kind LOOP
    SELECT array_agg(DISTINCT object_id ORDER BY object_id) INTO usage_ids FROM thesaurus.usage_objects(ARRAY[c.concept_id]);
    ASSERT usage_ids=CASE WHEN c.domain IN('allergen','cuisine_type','dietary_tag')OR c.source_id='b73e9100-0000-4000-8000-000000000214'::uuid THEN ARRAY['RESRUNNESTED0003'] ELSE ARRAY['HOTRUNNESTED0001'] END,
      format('Nested source %s failed to resolve its exact owning fixture: %s',c.domain,usage_ids);
  END LOOP;
  SELECT updated_at INTO before_hot FROM public.object WHERE id='HOTRUNNESTED0001';
  SELECT updated_at INTO before_res FROM public.object WHERE id='RESRUNNESTED0003';
  gen:=pg_temp.publish_nested(false);
  ASSERT gen=api.thesaurus_generation(),'Nested rename publication did not activate';
  ASSERT (SELECT updated_at>before_hot FROM public.object WHERE id='HOTRUNNESTED0001'),'Nested hotel usages did not advance synchronization marker';
  ASSERT (SELECT updated_at>before_res FROM public.object WHERE id='RESRUNNESTED0003'),'Nested menu usages did not advance synchronization marker';
  gen:=pg_temp.publish_nested(true);
  ASSERT (api.thesaurus_admin('requalification')->>'total')::integer=15,'Requalification missed nested/array fixture usages';

  PERFORM pg_temp.assert_rejected($q$INSERT INTO public.object_room_type_amenity(room_type_id,amenity_id)VALUES('b73ea100-0000-4000-8000-000000000202','b73e9200-0000-4000-8000-000000000201')$q$);
  PERFORM pg_temp.assert_rejected($q$INSERT INTO public.object_room_type_bed(room_type_id,bed_type_id)VALUES('b73ea100-0000-4000-8000-000000000202','b73e9100-0000-4000-8000-000000000202')$q$);
  PERFORM pg_temp.assert_rejected($q$INSERT INTO public.object_menu_item_allergen(menu_item_id,allergen_id)VALUES('b73ea200-0000-4000-8000-000000000203','b73e9100-0000-4000-8000-000000000203')$q$);
  PERFORM pg_temp.assert_rejected($q$INSERT INTO public.object_menu_item_cuisine_type(menu_item_id,cuisine_type_id)VALUES('b73ea200-0000-4000-8000-000000000203','b73e9100-0000-4000-8000-000000000204')$q$);
  PERFORM pg_temp.assert_rejected($q$INSERT INTO public.object_menu_item_dietary_tag(menu_item_id,dietary_tag_id)VALUES('b73ea200-0000-4000-8000-000000000203','b73e9100-0000-4000-8000-000000000205')$q$);
  PERFORM pg_temp.assert_rejected($q$INSERT INTO public.meeting_room_equipment(room_id,equipment_id)VALUES('b73ea300-0000-4000-8000-000000000202','b73e9100-0000-4000-8000-000000000206')$q$);
  PERFORM pg_temp.assert_rejected($q$INSERT INTO public.media_tag(media_id,tag_id)VALUES('b73ea400-0000-4000-8000-000000000202','b73e9100-0000-4000-8000-000000000207')$q$);
  PERFORM pg_temp.assert_rejected($q$UPDATE public.media SET media_type_id='b73e9100-0000-4000-8000-000000000208' WHERE id='b73ea400-0000-4000-8000-000000000202'$q$);
  PERFORM pg_temp.assert_rejected($q$INSERT INTO public.contact_channel(object_id,kind_id,value)VALUES('HOTRUNNESTED0002','b73e9100-0000-4000-8000-000000000209','Nouveau contact')$q$);
  PERFORM pg_temp.assert_rejected($q$UPDATE public.opening_period SET period_type_id='b73e9100-0000-4000-8000-000000000210' WHERE id='b73ea600-0000-4000-8000-000000000202'$q$);
  PERFORM pg_temp.assert_rejected($q$UPDATE public.opening_schedule SET schedule_type_id='b73e9100-0000-4000-8000-000000000211' WHERE id='b73ea600-0000-4000-8000-000000000204'$q$);
  SELECT source_id INTO weekday FROM nested_sources WHERE domain='weekday';
  PERFORM pg_temp.assert_rejected(format('INSERT INTO public.opening_time_period_weekday(time_period_id,weekday_id)VALUES(%L,%L)','b73ea600-0000-4000-8000-000000000206',weekday));
  PERFORM pg_temp.assert_rejected($q$UPDATE public.object_classification SET subvalue_ids=ARRAY['b73e9300-0000-4000-8000-000000000203']::uuid[] WHERE id='b73ea700-0000-4000-8000-000000000202'$q$);
  PERFORM pg_temp.assert_rejected($q$INSERT INTO public.actor_channel(actor_id,kind_id,value)VALUES('b73ea800-0000-4000-8000-000000000202','b73e9100-0000-4000-8000-000000000214','Nouveau contact acteur interdit')$q$);
  PERFORM pg_temp.assert_rejected($q$INSERT INTO public.media_tag(media_id,tag_id)VALUES('b73ea400-0000-4000-8000-000000000202','b73e9100-0000-4000-8000-000000000215')$q$);

  -- A parent deletion cascades after its own row disappears. Ownership retention must still
  -- recognize its historical children; no earlier child deletion has primed their retention.
  SELECT to_jsonb(t)INTO parent_copy FROM public.object_room_type t WHERE id='b73ea100-0000-4000-8000-000000000201';
  SELECT jsonb_agg(to_jsonb(t))INTO a_copy FROM public.object_room_type_amenity t WHERE room_type_id='b73ea100-0000-4000-8000-000000000201';
  SELECT jsonb_agg(to_jsonb(t))INTO b_copy FROM public.object_room_type_bed t WHERE room_type_id='b73ea100-0000-4000-8000-000000000201';
  DELETE FROM public.object_room_type WHERE id='b73ea100-0000-4000-8000-000000000201';
  INSERT INTO public.object_room_type SELECT * FROM jsonb_populate_record(NULL::public.object_room_type,parent_copy);
  INSERT INTO public.object_room_type_amenity SELECT * FROM jsonb_populate_recordset(NULL::public.object_room_type_amenity,a_copy);
  INSERT INTO public.object_room_type_bed SELECT * FROM jsonb_populate_recordset(NULL::public.object_room_type_bed,b_copy);
  SELECT to_jsonb(t)INTO parent_copy FROM public.object_menu t WHERE id='b73ea200-0000-4000-8000-000000000201';
  SELECT jsonb_agg(to_jsonb(t))INTO items_copy FROM public.object_menu_item t WHERE menu_id='b73ea200-0000-4000-8000-000000000201';
  SELECT jsonb_agg(to_jsonb(t))INTO a_copy FROM public.object_menu_item_allergen t WHERE menu_item_id='b73ea200-0000-4000-8000-000000000202';
  SELECT jsonb_agg(to_jsonb(t))INTO b_copy FROM public.object_menu_item_cuisine_type t WHERE menu_item_id='b73ea200-0000-4000-8000-000000000202';
  SELECT jsonb_agg(to_jsonb(t))INTO c_copy FROM public.object_menu_item_dietary_tag t WHERE menu_item_id='b73ea200-0000-4000-8000-000000000202';
  DELETE FROM public.object_menu WHERE id='b73ea200-0000-4000-8000-000000000201';
  INSERT INTO public.object_menu SELECT * FROM jsonb_populate_record(NULL::public.object_menu,parent_copy);
  INSERT INTO public.object_menu_item SELECT * FROM jsonb_populate_recordset(NULL::public.object_menu_item,items_copy);
  INSERT INTO public.object_menu_item_allergen SELECT * FROM jsonb_populate_recordset(NULL::public.object_menu_item_allergen,a_copy);
  INSERT INTO public.object_menu_item_cuisine_type SELECT * FROM jsonb_populate_recordset(NULL::public.object_menu_item_cuisine_type,b_copy);
  INSERT INTO public.object_menu_item_dietary_tag SELECT * FROM jsonb_populate_recordset(NULL::public.object_menu_item_dietary_tag,c_copy);

  -- Preserve all existing values across genuine link reconciliation, with the same owning entity.
  FOR pair IN SELECT * FROM(VALUES
    ('object_room_type_amenity','room_type_id','b73ea100-0000-4000-8000-000000000201'),
    ('object_room_type_bed','room_type_id','b73ea100-0000-4000-8000-000000000201'),
    ('object_menu_item_allergen','menu_item_id','b73ea200-0000-4000-8000-000000000202'),
    ('object_menu_item_cuisine_type','menu_item_id','b73ea200-0000-4000-8000-000000000202'),
    ('object_menu_item_dietary_tag','menu_item_id','b73ea200-0000-4000-8000-000000000202'),
    ('meeting_room_equipment','room_id','b73ea300-0000-4000-8000-000000000201'),
    ('media_tag','media_id','b73ea400-0000-4000-8000-000000000201'),
    ('opening_time_period_weekday','time_period_id','b73ea600-0000-4000-8000-000000000205')
  )v(tbl,key,id)LOOP
    EXECUTE format('SELECT to_jsonb(t)FROM public.%I t WHERE %I=$1::uuid',pair.tbl,pair.key)INTO copy USING pair.id;
    ASSERT copy IS NOT NULL,format('Missing historical row for %s',pair.tbl);
    EXECUTE format('DELETE FROM public.%I WHERE %I=$1::uuid',pair.tbl,pair.key)USING pair.id;
    EXECUTE format('INSERT INTO public.%1$I SELECT * FROM jsonb_populate_record(NULL::public.%1$I,$1)',pair.tbl)USING copy;
  END LOOP;
  UPDATE public.media SET title='Titre modifié, type historique conservé'WHERE id='b73ea400-0000-4000-8000-000000000201';
  UPDATE public.contact_channel SET value='Contact modifié, nature conservée'WHERE id='b73ea500-0000-4000-8000-000000000201';
  UPDATE public.opening_period SET name='Période historique modifiée'WHERE id='b73ea600-0000-4000-8000-000000000201';
  UPDATE public.opening_schedule SET note='Horaire historique conservé'WHERE id='b73ea600-0000-4000-8000-000000000203';
  UPDATE public.object_classification SET note='Sous-valeurs historiques conservées'WHERE id='b73ea700-0000-4000-8000-000000000201';
  UPDATE public.actor_channel SET value='Contact acteur modifié, nature historique conservée'WHERE id='b73ea800-0000-4000-8000-000000000203';
  SELECT to_jsonb(t)INTO copy FROM public.object_classification t WHERE id='b73ea700-0000-4000-8000-000000000201';
  DELETE FROM public.object_classification WHERE id='b73ea700-0000-4000-8000-000000000201';
  INSERT INTO public.object_classification SELECT * FROM jsonb_populate_record(NULL::public.object_classification,copy);
  ASSERT (SELECT subvalue_ids FROM public.object_classification WHERE id='b73ea700-0000-4000-8000-000000000201')=ARRAY['b73e9300-0000-4000-8000-000000000203']::uuid[], 'Historical UUID array was lost during reconciliation';
  RAISE NOTICE 'Nested thesaurus ownership, publication impact, retirement guards and historical retention passed.';
END $nested_test$;
ROLLBACK;
