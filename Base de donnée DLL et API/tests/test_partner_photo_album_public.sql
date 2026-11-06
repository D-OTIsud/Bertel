-- Run immediately after the photo bootstrap in the capture script's psql session.
-- Compare real anonymous JSON recursively via JSONB equality; no ignored values.
\set ON_ERROR_STOP on
BEGIN;
DO $readers$
DECLARE v_row record; v_current jsonb;
BEGIN
  ASSERT to_regclass('pg_temp.album_public_readers_before') IS NOT NULL,
    'Capture the public baseline before installing the album, in the same session';
  ASSERT (SELECT count(*) FROM album_public_readers_before)=13;
  ASSERT (SELECT count(*) FROM album_public_resources_before)=4,
    'Both object types and both language baselines must be populated';
  FOR v_row IN SELECT * FROM album_public_readers_before LOOP
    SELECT jsonb_build_object(
      'definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl::text,
      'config',p.proconfig,'definer',p.prosecdef,'strict',p.proisstrict,
      'volatility',p.provolatile,'parallel',p.proparallel,'args',p.proargtypes::text,
      'returns',p.prorettype,'set',p.proretset)
    INTO v_current FROM pg_proc p WHERE p.oid=to_regprocedure(v_row.signature);
    ASSERT v_current IS NOT DISTINCT FROM v_row.state,
      format('Photo-only bootstrap changed public reader %s or its attributes',v_row.signature);
  END LOOP;
END; $readers$;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
DO $public$
DECLARE v_row record; v_raw jsonb;
BEGIN
  ASSERT auth.uid() IS NULL;
  FOR v_row IN SELECT * FROM album_public_resources_before LOOP
    v_raw:=api.get_object_resource(v_row.object_id,ARRAY[v_row.lang]::text[],'none','{}'::jsonb)::jsonb;
    ASSERT v_raw IS NOT NULL AND v_raw::text LIKE '%https://example.invalid/album-public/%',
      'The post-install public witness must remain nonempty';
    ASSERT v_raw IS NOT DISTINCT FROM v_row.raw_payload,
      format('Raw public JSON changed for %s/%s',v_row.object_id,v_row.lang);
    ASSERT (v_raw-'canonical_description'-'org_description') IS NOT DISTINCT FROM v_row.http_payload,
      format('HTTP v1 projection changed for %s/%s',v_row.object_id,v_row.lang);
  END LOOP;
END; $public$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DELETE FROM public.object WHERE id IN ('HOTRUN999999AP01','ACTRUN999999AP02');
DO $cleanup$ BEGIN
  ASSERT NOT EXISTS(SELECT 1 FROM public.object WHERE id IN ('HOTRUN999999AP01','ACTRUN999999AP02'));
  ASSERT NOT EXISTS(SELECT 1 FROM public.media WHERE id IN (
    '00000000-0000-4000-a000-00000000af01','00000000-0000-4000-a000-00000000af02'));
  RAISE NOTICE 'Photo-only public contract: 13 readers and 4 populated anonymous raw/HTTP JSON witnesses unchanged; fixture objects removed';
END; $cleanup$;
DROP TABLE album_public_readers_before,album_public_resources_before;
COMMIT;
