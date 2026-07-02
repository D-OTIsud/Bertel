-- tests/test_interop_batch.sql
-- Pins the I4 §153 batch interop serializer:
--   api.get_objects_interop_batch(text[], text) — {"<id>": <profile doc>} wrapping the tested
--   per-object serializers (get_object_jsonld / get_object_interop).
-- Structural (exists, SECURITY INVOKER, service_role-only) + behavioural (published-only map,
-- draft/unknown ids absent, per-profile dispatch, dedup, 200-id clamp, NULL/empty input -> {},
-- unmapped profile -> {}).
-- Self-cleaning: fixture in a sub-transaction always rolled back (ROLLBACK_PROBE).
DO $$
DECLARE
  v_hot   text := 'HOTRUN9999990I80';  -- published
  v_draft text := 'HOTRUN9999990I81';  -- draft
  fake    text[];
  b       jsonb;
BEGIN
  -- 1. Structural.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='api' AND p.proname='get_objects_interop_batch' AND NOT p.prosecdef) <> 1 THEN
    RAISE EXCEPTION 'api.get_objects_interop_batch missing or not SECURITY INVOKER';
  END IF;
  IF has_function_privilege('anon','api.get_objects_interop_batch(text[],text)','EXECUTE')
     OR has_function_privilege('authenticated','api.get_objects_interop_batch(text[],text)','EXECUTE') THEN
    RAISE EXCEPTION 'get_objects_interop_batch must be service_role-only';
  END IF;
  IF NOT has_function_privilege('service_role','api.get_objects_interop_batch(text[],text)','EXECUTE') THEN
    RAISE EXCEPTION 'get_objects_interop_batch must be service_role-executable';
  END IF;

  -- ---------- Fixture ----------
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_hot,   'HOT', 'Batch Hôtel', 'published'),
    (v_draft, 'HOT', 'Batch Draft', 'draft');

  -- 2. Published-only map; draft + unknown ids ABSENT; duplicates deduped.
  b := api.get_objects_interop_batch(ARRAY[v_hot, v_hot, v_draft, 'HOTRUN0000000XZZ'], 'apidae');
  IF (SELECT count(*) FROM jsonb_object_keys(b)) <> 1 THEN
    RAISE EXCEPTION 'batch should contain ONLY the published id, got keys %', (SELECT string_agg(k,',') FROM jsonb_object_keys(b) k);
  END IF;
  IF b->v_hot->>'type' <> 'HOTELLERIE' THEN
    RAISE EXCEPTION 'apidae dispatch wrong (HOT->HOTELLERIE), got %', b->v_hot->>'type'; END IF;
  IF b->v_hot->'nom'->>'libelleFr' <> 'Batch Hôtel' THEN RAISE EXCEPTION 'apidae nom wrong'; END IF;

  -- 3. jsonld dispatch goes through get_object_jsonld (schema.org).
  b := api.get_objects_interop_batch(ARRAY[v_hot], 'jsonld');
  IF b->v_hot->>'@type' <> 'Hotel' THEN
    RAISE EXCEPTION 'jsonld dispatch wrong (HOT->Hotel), got %', b->v_hot->>'@type'; END IF;

  -- 4. tourinsoft dispatch.
  b := api.get_objects_interop_batch(ARRAY[v_hot], 'tourinsoft');
  IF b->v_hot->>'SyndObjectID' <> v_hot OR b->v_hot->>'type' <> 'HOT' THEN
    RAISE EXCEPTION 'tourinsoft dispatch wrong, got %', b->v_hot; END IF;

  -- 5. Unmapped profile => empty map (docs filtered out, never a fallback).
  IF api.get_objects_interop_batch(ARRAY[v_hot], 'no_such_profile') <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unmapped profile must yield an empty map'; END IF;

  -- 6. NULL / empty input => empty map.
  IF api.get_objects_interop_batch(NULL, 'apidae') <> '{}'::jsonb THEN
    RAISE EXCEPTION 'NULL ids must yield an empty map'; END IF;
  IF api.get_objects_interop_batch(ARRAY[]::text[], 'apidae') <> '{}'::jsonb THEN
    RAISE EXCEPTION 'empty ids must yield an empty map'; END IF;

  -- 7. 200-id clamp: the published id parked at position 201 must be IGNORED.
  SELECT array_agg('HOTRUNFAKE' || lpad(i::text, 6, '0')) INTO fake FROM generate_series(1, 200) i;
  b := api.get_objects_interop_batch(fake || v_hot, 'apidae');
  IF b <> '{}'::jsonb THEN
    RAISE EXCEPTION 'id #201 must be clamped away, got keys %', (SELECT string_agg(k,',') FROM jsonb_object_keys(b) k); END IF;

  RAISE EXCEPTION 'ROLLBACK_PROBE'; -- leave no fixture rows behind
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_PROBE' THEN RAISE; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'test_interop_batch.sql: OK'; END $$;
