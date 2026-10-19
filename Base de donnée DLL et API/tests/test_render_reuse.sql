-- Differential fixture test for contacts/media/capacity/amenity render reuse.
-- Prerequisite: fixtures/capture_render_reuse_baseline.sql BEFORE migration;
-- then apply candidate and run this file in that same privileged session.
-- ci_fresh_apply.sql restores the predecessor before capture, then reapplies
-- the candidate. That bootstrap-only ordering must not be used on a live API.
-- The inner subtransaction ALWAYS rolls fixture writes back, even without an
-- outer transaction. No permanent function, grant or application data is added.
DO $test$
DECLARE
  populated text := 'HOTRUN9999990R31';
  empty_object text := 'HOTRUN9999990R32';
  family uuid := gen_random_uuid();
  amenity_a uuid := gen_random_uuid();
  amenity_b uuid := gen_random_uuid();
  metric_a uuid := gen_random_uuid();
  metric_b uuid := gen_random_uuid();
  metric_c uuid := gen_random_uuid();
  contact_kind uuid := gen_random_uuid();
  contact_role uuid := gen_random_uuid();
  photo_type uuid;
  video_type uuid;
  media_main uuid := gen_random_uuid();
  media_overlay uuid := gen_random_uuid();
  media_other uuid := gen_random_uuid();
  media_fallback uuid := gen_random_uuid();
  tag_a uuid := gen_random_uuid();
  tag_b uuid := gen_random_uuid();
  org_a text := 'ORGRUN9999990R33';
  org_b text := 'ORGRUN9999990R34';
  member_id uuid := gen_random_uuid();
  publisher_role uuid;
  en uuid;
  object_id text;
  langs text[];
  options jsonb;
  option_cases jsonb;
  expected jsonb;
  actual jsonb;
  tested integer := 0;
BEGIN
  IF to_regprocedure('pg_temp.render_reuse_baseline(text,text[],text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Capture PRE-migration baseline in this session first';
  END IF;
  IF strpos(pg_get_functiondef('pg_temp.render_reuse_baseline(text,text[],text,jsonb)'::regprocedure),
            'v_capacity_lines JSONB') > 0
     OR strpos(pg_get_functiondef('pg_temp.render_reuse_baseline(text,text[],text,jsonb)'::regprocedure),
               'v_amenity_lines JSONB') > 0
     OR strpos(pg_get_functiondef('pg_temp.render_reuse_baseline(text,text[],text,jsonb)'::regprocedure),
               'v_contact_lines JSONB') > 0
     OR strpos(pg_get_functiondef('pg_temp.render_reuse_baseline(text,text[],text,jsonb)'::regprocedure),
               'v_media_lines JSONB') > 0 THEN
    RAISE EXCEPTION 'Vacuous comparison: baseline still contains render reuse; reverse patch the pg_temp clone first';
  END IF;
  IF strpos(pg_get_functiondef('api.get_object_resource(text,text[],text,jsonb)'::regprocedure),
            'v_capacity_lines JSONB') = 0
     OR strpos(pg_get_functiondef('api.get_object_resource(text,text[],text,jsonb)'::regprocedure),
               'v_amenity_lines JSONB') = 0
     OR strpos(pg_get_functiondef('api.get_object_resource(text,text[],text,jsonb)'::regprocedure),
               'v_contact_lines JSONB') = 0
     OR strpos(pg_get_functiondef('api.get_object_resource(text,text[],text,jsonb)'::regprocedure),
               'v_media_lines JSONB') = 0 THEN
    RAISE EXCEPTION 'Candidate render reuse migration was not applied';
  END IF;
  BEGIN
    -- Explicit identity-free public context, independent of connection defaults
    -- or previous helper calls that may have left an empty custom GUC behind.
    PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
    INSERT INTO public.object(id,object_type,name,status) VALUES
      (populated,'HOT','Render reuse populated','published'),
      (empty_object,'HOT','Render reuse empty','published'),
      (org_a,'ORG','Render reuse org A','published'),
      (org_b,'ORG','Render reuse org B','published');
    INSERT INTO public.ref_code_contact_kind(id,domain,code,name,name_i18n)
      VALUES(contact_kind,'contact_kind','render_reuse_fixture','Contact brut',
             '{"fr":" ","en":"","de":"Kontakt"}');
    INSERT INTO public.ref_contact_role(id,code,name)
      VALUES(contact_role,'render_reuse_fixture','Role fixture');
    -- Equal sort columns, reverse UUID vs physical insertion order: structured
    -- contacts use UUID before ctid, while render preserves physical order.
    INSERT INTO public.contact_channel(id,object_id,kind_id,value,role_id,is_public,is_primary,position,created_at) VALUES
      ('ffffffff-ffff-4fff-8fff-fffffffff031',populated,contact_kind,'physical-first',contact_role,true,false,1,'2026-01-01 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000031',populated,contact_kind,'uuid-first',contact_role,true,false,1,'2026-01-01 00:00:00+00'),
      (gen_random_uuid(),populated,contact_kind,'primary',NULL,true,true,NULL,'2026-01-01 00:00:00+00'),
      (gen_random_uuid(),populated,contact_kind,'PRIVATE-CONTACT',contact_role,false,false,0,'2026-01-01 00:00:00+00');
    SELECT id INTO photo_type FROM public.ref_code_media_type WHERE code='photo';
    IF photo_type IS NULL THEN RAISE EXCEPTION 'Fixture requires seeded photo media type'; END IF;
    SELECT id INTO video_type FROM public.ref_code_media_type WHERE code='video';
    IF video_type IS NULL THEN RAISE EXCEPTION 'Fixture requires seeded video media type'; END IF;
    INSERT INTO public.ref_code_media_tag(id,domain,code,name,position) VALUES
      (tag_a,'media_tag','render_reuse_a','Zulu tag',20),
      (tag_b,'media_tag','render_reuse_b','Alpha tag',10);
    -- Deliberately share a URL across two IDs: DISTINCT ON(id) must retain both.
    -- Preferred-org filtering applies to structured media only, not render lines.
    INSERT INTO public.media(id,object_id,org_object_id,media_type_id,title,title_i18n,
                             description,description_i18n,credit,url,is_main,is_published,
                             visibility,position,width,height,created_at) VALUES
      (media_main,populated,NULL,photo_type,'Canonical','{"en":"Canonical EN"}',
       'Alt brut','{"en":"Alt EN"}','Credit','https://example.invalid/render-reuse-duplicate.jpg',true,true,NULL,0,640,480,'2026-01-01 00:00:00+00'),
      (media_overlay,populated,org_a,photo_type,'Overlay A',NULL,
       NULL,NULL,NULL,'https://example.invalid/render-reuse-duplicate.jpg',false,true,'public',1,NULL,NULL,'2026-01-02 00:00:00+00'),
      (media_other,populated,org_b,photo_type,'Other org B',NULL,
       NULL,NULL,'','https://example.invalid/render-reuse-other.jpg',false,true,'public',2,NULL,200,'2026-01-03 00:00:00+00'),
      (media_fallback,populated,NULL,photo_type,'Titre brut','{"fr":" ","en":"","de":"Bild fremd"}',
       NULL,NULL,NULL,'https://example.invalid/render-reuse-fallback.jpg',false,true,'public',3,NULL,NULL,'2026-01-04 00:00:00+00'),
      (gen_random_uuid(),populated,NULL,photo_type,NULL,NULL,
       NULL,NULL,NULL,'https://example.invalid/render-reuse-type-fallback.jpg',false,true,'public',4,NULL,NULL,'2026-01-05 00:00:00+00'),
      (gen_random_uuid(),populated,NULL,photo_type,'PRIVATE-MEDIA',NULL,
       NULL,NULL,NULL,'https://example.invalid/render-reuse-private.jpg',false,true,'private',5,NULL,NULL,'2026-01-06 00:00:00+00'),
      (gen_random_uuid(),populated,NULL,photo_type,'DRAFT-MEDIA',NULL,
       NULL,NULL,NULL,'https://example.invalid/render-reuse-draft.jpg',false,false,'public',6,NULL,NULL,'2026-01-07 00:00:00+00'),
      -- Equal structured sort keys across two types: exercise the legacy
      -- DISTINCT ON(id) then media-type JOIN order, without adding a new tiebreaker.
      ('ffffffff-ffff-4fff-8fff-fffffffff032',populated,NULL,photo_type,'Tie photo',NULL,
       NULL,NULL,NULL,'https://example.invalid/render-reuse-tie-photo.jpg',false,true,'public',8,NULL,NULL,'2026-01-08 00:00:00+00'),
      ('00000000-0000-4000-8000-000000000032',populated,NULL,video_type,'Tie video',NULL,
       NULL,NULL,NULL,'https://example.invalid/render-reuse-tie-video.mp4',false,true,'public',8,NULL,NULL,'2026-01-08 00:00:00+00');
    INSERT INTO public.media_tag(media_id,tag_id) VALUES(media_main,tag_a),(media_main,tag_b);
    INSERT INTO public.ref_code_amenity_family(id,domain,code,name,name_i18n)
      VALUES(family,'amenity_family','render_reuse_fixture','Famille brute',
             '{"fr":" ","en":"","de":"Familie"}');
    INSERT INTO public.ref_amenity(id,code,name,family_id,name_i18n,extra) VALUES
      (amenity_a,'render_reuse_a','Alpha brut',family,
       '{"fr":"Zulu traduit","en":"Zulu translated"}', '{"disability_types":["visual"]}'),
      (amenity_b,'render_reuse_b','Zulu brut',family,
       '{"fr":" ","en":"","de":"Alpha fremd"}', NULL);
    INSERT INTO public.object_amenity(object_id,amenity_id) VALUES
      (populated,amenity_a),(populated,amenity_b);
    -- Same position: raw names and translated names deliberately reverse order.
    -- Capacity insert trigger takes unit from the reference metric.
    INSERT INTO public.ref_capacity_metric(id,code,name,position,unit) VALUES
      (metric_a,'render_reuse_a','Alpha brut',10,''),
      (metric_b,'render_reuse_b','Zulu brut',10,' '),
      (metric_c,'render_reuse_c','Dernier brut',NULL,NULL);
    INSERT INTO public.object_capacity(object_id,metric_id,value_integer) VALUES
      (populated,metric_a,0),(populated,metric_b,12),(populated,metric_c,NULL);
    SELECT id INTO en FROM public.ref_language WHERE code='en';
    IF en IS NULL THEN RAISE EXCEPTION 'Fixture requires seeded English language'; END IF;
    INSERT INTO public.i18n_translation(target_table,target_pk,target_column,language_id,value_text) VALUES
      ('ref_capacity_metric',metric_a::text,'name',en,'Zulu translated'),
      ('ref_capacity_metric',metric_b::text,'name',en,'Alpha translated');

    option_cases := '[
          {},
          {"fields":["capacity","amenities"]},
          {"fields":["capacity"]},
          {"fields":["amenities"]},
          {"fields":["contacts"]},
          {"fields":["media"]},
          {"fields":["contacts","media","capacity","amenities"]},
          {"fields":["contacts","media"],"render":false},
          {"fields":["contacts","media"],"render":false,"include":["render"]},
          {"fields":["contacts","media"],"include_private":true},
          {"fields":["contacts","media"],"org_object_id":"ORGRUN9999990R33"},
          {"fields":["contacts","media"],"org_object_id":"ORGRUN9999990R34"},
          {"fields":[]},
          {"fields":["name"]},
          {"fields":["capacity","amenities"],"render":false},
          {"fields":["capacity","amenities"],"render":false,"include":["render"]},
          {"fields":["capacity","amenities"],"omit_empty":true},
          {"fields":["capacity","amenities"],"render_locale":"en-GB","render_tz":"Indian/Reunion","render_version":"fixture"}
        ]'::jsonb;
    FOREACH object_id IN ARRAY ARRAY[populated,empty_object] LOOP
      FOREACH langs SLICE 1 IN ARRAY ARRAY[ARRAY['fr'],ARRAY['en'],ARRAY['zz']] LOOP
        FOR options IN SELECT value FROM jsonb_array_elements(option_cases) LOOP
          expected := pg_temp.render_reuse_baseline(object_id,langs,'none',options)::jsonb;
          actual := api.get_object_resource(object_id,langs,'none',options)::jsonb;
          IF expected IS NULL OR actual IS NULL THEN
            RAISE EXCEPTION 'Fixture inaccessible: object %, langs %, options %',object_id,langs,options;
          END IF;
          IF actual IS DISTINCT FROM expected THEN
            RAISE EXCEPTION 'Render reuse mismatch: object %, langs %, options %, changed top-level keys %',
              object_id,langs,options,
              (SELECT jsonb_agg(k) FROM (SELECT jsonb_object_keys(expected || actual) AS k) keys
               WHERE expected->k IS DISTINCT FROM actual->k);
          END IF;
          tested := tested + 1;
        END LOOP;
      END LOOP;
    END LOOP;
    -- Pin why this fixture matters independently of the differential comparison:
    -- strict structured labels fall back to raw text; render may use another language.
    actual := api.get_object_resource(populated,ARRAY['en'],'none',
                                     '{"fields":["capacity","amenities"]}')::jsonb;
    IF actual#>>'{capacity,0,metric_code}' IS DISTINCT FROM 'render_reuse_a'
       OR actual#>>'{capacity,0,value}' IS DISTINCT FROM '0'
       OR actual#>>'{amenities,1,name}' IS DISTINCT FROM 'Zulu brut'
       OR actual#>>'{amenities,1,family,name}' IS DISTINCT FROM 'Famille brute'
       OR COALESCE(actual#>>'{render,capacity_lines,0}' NOT LIKE '12%Alpha translated',true)
       OR actual#>>'{render,amenity_lines,0}' IS DISTINCT FROM 'Alpha fremd (Familie)' THEN
      RAISE EXCEPTION 'Fixture does not exercise separate sort/fallback semantics: %', actual;
    END IF;
    actual := api.get_object_resource(populated,ARRAY['en'],'none',
                 jsonb_build_object('fields',ARRAY['contacts','media'],'org_object_id',org_a))::jsonb;
    IF jsonb_array_length(actual->'contacts') IS DISTINCT FROM 3
       OR actual#>>'{contacts,0,value}' IS DISTINCT FROM 'primary'
       OR actual#>>'{contacts,1,value}' IS DISTINCT FROM 'uuid-first'
       OR actual#>>'{contacts,2,value}' IS DISTINCT FROM 'physical-first'
       OR actual#>>'{contacts,1,kind_name}' IS DISTINCT FROM 'Contact brut'
       OR actual#>>'{contacts,1,role}' IS DISTINCT FROM 'render_reuse_fixture'
       OR actual#>>'{render,contact_lines,1}' IS DISTINCT FROM 'Kontakt : physical-first (render_reuse_fixture)'
       OR actual#>>'{render,contact_lines,2}' IS DISTINCT FROM 'Kontakt : uuid-first (render_reuse_fixture)' THEN
      RAISE EXCEPTION 'Contact fixture lost visibility/order/role/fallback coverage: %',actual;
    END IF;
    IF jsonb_array_length(actual->'media') IS DISTINCT FROM 6
       OR jsonb_array_length(actual#>'{render,media_lines}') IS DISTINCT FROM 7
       OR (SELECT count(*) FROM jsonb_array_elements(actual->'media') m
           WHERE m->>'url'='https://example.invalid/render-reuse-duplicate.jpg') <> 2
       OR actual#>'{media,0,tags}' IS DISTINCT FROM '["render_reuse_b","render_reuse_a"]'::jsonb
       OR actual#>>'{media,0,description}' IS DISTINCT FROM 'Alt EN'
       OR actual#>>'{media,2,title}' IS DISTINCT FROM 'Titre brut'
       OR actual#>>'{render,media_lines,0}' IS DISTINCT FROM 'Canonical EN (Credit) - 640x480'
       OR actual#>>'{render,media_lines,2}' IS DISTINCT FROM 'Other org B ()'
       OR actual#>>'{render,media_lines,3}' IS DISTINCT FROM 'Bild fremd'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(actual->'media') m
                  WHERE m->>'id'=media_other::text)
       OR actual::text LIKE '%PRIVATE-%' OR actual::text LIKE '%DRAFT-MEDIA%' THEN
      RAISE EXCEPTION 'Media fixture lost org/visibility/ID/fallback/tag coverage: %',actual;
    END IF;
    -- A real ORG member exercises the TRUE branch of can_read_extended, including
    -- private contact/media rows. No public/partner identity can satisfy this
    -- witness accidentally: check both helper and private JSON before comparison.
    SELECT id INTO publisher_role FROM public.ref_org_role WHERE code='publisher';
    IF publisher_role IS NULL THEN RAISE EXCEPTION 'Fixture requires publisher org role'; END IF;
    INSERT INTO public.org_config(org_object_id,access_scope,is_test_org)
      VALUES(org_a,'own_objects_only',false);
    INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary) VALUES
      (populated,org_a,publisher_role,true),(empty_object,org_a,publisher_role,true);
    INSERT INTO auth.users(id,email)
      VALUES(member_id,'render-reuse-' || member_id::text || '@fixture.test');
    INSERT INTO public.app_user_profile(id,role) VALUES(member_id,'tourism_agent')
      ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
    INSERT INTO public.user_org_membership(user_id,org_object_id,is_active)
      VALUES(member_id,org_a,true);
    GRANT EXECUTE ON FUNCTION pg_temp.render_reuse_baseline(text,text[],text,jsonb) TO authenticated;
    PERFORM set_config('request.jwt.claims',
                       jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
    SET LOCAL ROLE authenticated;
    IF api.can_read_extended(populated) IS DISTINCT FROM true
       OR api.can_read_extended(empty_object) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Authenticated fixture failed to acquire extended scope';
    END IF;
    expected := pg_temp.render_reuse_baseline(populated,ARRAY['en'],'none',
                  '{"fields":["contacts","media"]}')::jsonb;
    IF expected IS NULL
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(expected->'contacts') c
                      WHERE c->>'value'='PRIVATE-CONTACT')
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(expected->'media') m
                      WHERE m->>'title'='PRIVATE-MEDIA')
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(expected#>'{render,contact_lines}') AS lines(line)
                      WHERE line LIKE '%PRIVATE-CONTACT%')
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(expected#>'{render,media_lines}') AS lines(line)
                      WHERE line='PRIVATE-MEDIA')
       OR expected::text LIKE '%DRAFT-MEDIA%' THEN
      RAISE EXCEPTION 'Authenticated baseline does not expose intended private rows or exposes draft media';
    END IF;
    FOREACH object_id IN ARRAY ARRAY[populated,empty_object] LOOP
      FOREACH langs SLICE 1 IN ARRAY ARRAY[ARRAY['fr'],ARRAY['en'],ARRAY['zz']] LOOP
        FOR options IN SELECT value FROM jsonb_array_elements(option_cases) LOOP
          expected := pg_temp.render_reuse_baseline(object_id,langs,'none',options)::jsonb;
          actual := api.get_object_resource(object_id,langs,'none',options)::jsonb;
          IF expected IS NULL OR actual IS NULL OR actual IS DISTINCT FROM expected THEN
            RAISE EXCEPTION 'Authenticated render reuse mismatch: object %, langs %, options %',
              object_id,langs,options;
          END IF;
          tested := tested + 1;
        END LOOP;
      END LOOP;
    END LOOP;
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE='ZX031', MESSAGE='render fixture rollback';
  EXCEPTION WHEN SQLSTATE 'ZX031' THEN NULL;
  END;
  RAISE NOTICE 'PASS render reuse: % full JSON comparisons; fixtures rolled back',tested;
END;
$test$;
