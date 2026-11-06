-- Disposable fresh-apply database only. Include before the photo bootstrap and
-- its public assertion in the SAME psql session (temporary snapshots survive COMMIT).
-- The two synthetic public objects are removed by test_partner_photo_album_public.sql.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO public.object (id, object_type, name, status, is_test) VALUES
  ('HOTRUN999999AP01', 'HOT', 'Album public baseline hotel', 'published', false),
  ('ACTRUN999999AP02', 'ACT', 'Album public baseline activity', 'published', false);
INSERT INTO public.media (id, object_id, media_type_id, url, title, position, is_main, is_published, visibility)
  SELECT '00000000-0000-4000-a000-00000000af01', 'HOTRUN999999AP01', id,
    'https://example.invalid/album-public/hotel.jpg', 'Public hotel photo', 1, true, true, 'public'
  FROM public.ref_code_media_type WHERE code='photo';
INSERT INTO public.media (id, object_id, media_type_id, url, title, position, is_main, is_published, visibility)
  SELECT '00000000-0000-4000-a000-00000000af02', 'ACTRUN999999AP02', id,
    'https://example.invalid/album-public/activity.jpg', 'Public activity photo', 1, true, true, 'public'
  FROM public.ref_code_media_type WHERE code='photo';

CREATE TEMP TABLE album_public_readers_before(signature text PRIMARY KEY, state jsonb NOT NULL) ON COMMIT PRESERVE ROWS;
INSERT INTO album_public_readers_before
  SELECT p.oid::regprocedure::text, jsonb_build_object(
    'definition', pg_get_functiondef(p.oid), 'owner', p.proowner, 'acl', p.proacl::text,
    'config', p.proconfig, 'definer', p.prosecdef, 'strict', p.proisstrict,
    'volatility', p.provolatile, 'parallel', p.proparallel, 'args', p.proargtypes::text,
    'returns', p.prorettype, 'set', p.proretset)
  FROM pg_proc p WHERE p.pronamespace='api'::regnamespace AND p.proname IN (
    'list_object_resources_page_text','get_object_resource','list_object_markers','list_reference_bundle',
    'list_catalog','public_catalog_domains','list_deleted_objects_since','get_object_i18n_all',
    'get_object_jsonld','get_object_interop','get_objects_interop_batch','get_object_tourinsoft','get_objects_tourinsoft_batch');
CREATE TEMP TABLE album_public_resources_before(
  object_id text, lang text, raw_payload jsonb NOT NULL, http_payload jsonb NOT NULL,
  PRIMARY KEY(object_id,lang)
) ON COMMIT PRESERVE ROWS;
GRANT SELECT, INSERT ON album_public_resources_before TO anon;

DO $fixture$ BEGIN
  ASSERT (SELECT count(*) FROM album_public_readers_before)=13, 'The 13-reader baseline must be complete';
  ASSERT (SELECT count(*) FROM public.media WHERE id IN (
    '00000000-0000-4000-a000-00000000af01','00000000-0000-4000-a000-00000000af02'))=2,
    'Public comparison requires real nonempty photo fixtures';
END; $fixture$;

SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $capture$
DECLARE v_id text; v_lang text; v_raw jsonb;
BEGIN
  ASSERT auth.uid() IS NULL, 'Public comparison cannot use a human identity';
  FOREACH v_id IN ARRAY ARRAY['HOTRUN999999AP01','ACTRUN999999AP02'] LOOP
    FOREACH v_lang IN ARRAY ARRAY['fr','en'] LOOP
      v_raw:=api.get_object_resource(v_id,ARRAY[v_lang]::text[],'none','{}'::jsonb)::jsonb;
      ASSERT v_raw IS NOT NULL AND jsonb_typeof(v_raw)='object' AND v_raw<>'{}'::jsonb,
        'Public baseline returned an empty or inaccessible object';
      ASSERT v_raw::text LIKE '%https://example.invalid/album-public/%',
        'Public baseline must actually include its seeded photo';
      INSERT INTO album_public_resources_before VALUES(
        v_id,v_lang,v_raw,v_raw-'canonical_description'-'org_description');
    END LOOP;
  END LOOP;
END; $capture$;
RESET ROLE;
COMMIT;
