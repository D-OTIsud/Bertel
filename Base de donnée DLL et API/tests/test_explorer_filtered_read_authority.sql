\ir fixtures/object_current_rights.sql
BEGIN;

DO $test$
DECLARE
  own_id constant text := 'HOTRUN999999AR01';
  foreign_id constant text := 'HOTRUN999999AR02';
  published_id constant text := 'HOTRUN999999AR03';
  test_id constant text := 'HOTRUN999999AR05';
  writer_claims constant text := '{"sub":"00000000-0000-4000-a000-00000000ae11","role":"authenticated"}';
  hotel_types constant public.object_type[] := ARRAY['HOT']::public.object_type[];
  drafts constant public.object_status[] := ARRAY['draft']::public.object_status[];
  published constant public.object_status[] := ARRAY['published']::public.object_status[];
  observed text[];
BEGIN
  PERFORM pg_temp.setup_current_rights_fixture();
  UPDATE public.object SET name = CASE id WHEN own_id THEN 'Quornaxixe' ELSE 'Quornaxile' END
  WHERE id IN (own_id, foreign_id);

  PERFORM set_config('request.jwt.claims', writer_claims, true);
  SET LOCAL ROLE authenticated;
    ASSERT EXISTS (SELECT FROM public.object WHERE id = own_id)
       AND NOT EXISTS (SELECT FROM public.object WHERE id = foreign_id),
      'fixture must distinguish current own-ORG read from a same-realm foreign draft';
    SELECT array_agg(object_id ORDER BY object_id) INTO observed
    FROM api.get_filtered_object_ids('{}', hotel_types, drafts, NULL)
    WHERE object_id IN (own_id, foreign_id, published_id, test_id);
    ASSERT observed IS NOT DISTINCT FROM ARRAY[own_id],
      'direct Explorer RPC must only return the currently readable draft in the fixture';
    SELECT array_agg(object_id ORDER BY object_id) INTO observed
    FROM api.get_filtered_object_ids('{"search_mode":"global"}', hotel_types, drafts, 'quornaxile')
    WHERE object_id IN (own_id, foreign_id);
    ASSERT observed IS NOT DISTINCT FROM ARRAY[own_id],
      'unreadable exact match must not suppress the readable fuzzy match';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{}', true);
  SET LOCAL ROLE authenticated;
    SELECT array_agg(object_id ORDER BY object_id) INTO observed
    FROM api.get_filtered_object_ids('{}', hotel_types, drafts || published, NULL)
    WHERE object_id IN (own_id, foreign_id, published_id, test_id);
    ASSERT observed IS NOT DISTINCT FROM ARRAY[published_id],
      'missing identity must keep the same-realm public witness and no drafts';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
    SELECT array_agg(object_id ORDER BY object_id) INTO observed
    FROM api.get_filtered_object_ids('{}', hotel_types, drafts, NULL)
    WHERE object_id IN (own_id, foreign_id, published_id, test_id);
    ASSERT observed IS NOT DISTINCT FROM ARRAY[own_id, foreign_id],
      'technical service claim retains real drafts and cannot cross into test';
  RESET ROLE;

  UPDATE public.object SET status = 'published' WHERE id = own_id;
  REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;
  UPDATE public.object SET status = 'archived' WHERE id = published_id;
  ASSERT (SELECT count(*) FROM internal.mv_filtered_objects
    WHERE id IN (own_id, published_id) AND status = 'published') = 2,
    'MV must still contain both the current publication and the stale publication';

  PERFORM set_config('request.jwt.claims', writer_claims, true);
  SET LOCAL ROLE authenticated;
    SELECT array_agg(object_id ORDER BY object_id) INTO observed
    FROM api.get_filtered_object_ids('{}', hotel_types, published, NULL)
    WHERE object_id IN (own_id, published_id);
    ASSERT observed IS NOT DISTINCT FROM ARRAY[own_id],
      'published MV path must ignore a now-archived cached row before refresh';
  RESET ROLE;
END
$test$;

ROLLBACK;
