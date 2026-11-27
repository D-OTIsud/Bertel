-- Partial object names must remain searchable while the last word is incomplete.
-- Patch the installed filter engine instead of reinstalling a historical body:
-- cuisine, thesaurus, provider, authorization and realm clauses remain untouched.
-- Signature, return columns, ownership, ACL and execution attributes are preserved.

BEGIN;

DO $partial_name_search$
DECLARE
  v_oid oid := to_regprocedure('api.get_filtered_object_ids(jsonb,public.object_type[],public.object_status[],text)');
  v_definition text;
  v_before jsonb;
  v_after jsonb;
  v_index integer;
  v_count integer;
  v_marker constant text := '-- explorer_literal_name_v1';
  v_legacy_score constant text := $legacy$          CASE WHEN t.v @@ t.q THEN 2.0::real + ts_rank(t.v, t.q) ELSE 0::real END$legacy$;
  v_old text[] := ARRAY[
    $old$btrim(api.norm_search(p_search)) AS search_norm$old$,
    $old$      n.search_norm,$old$,
    $old$            s2.name_search_vector @@ plainto_tsquery('french', api.norm_search(p_search))$old$,
    $old$      src.name_search_vector @@ plainto_tsquery('french', api.norm_search(p_search)) OR$old$,
    $old$          CASE WHEN t.v @@ t.q THEN
            2.0::real + LEAST(ts_rank(t.v, t.q), 0.99::real)
            + CASE
                WHEN src.name_normalized = params.search_norm THEN 3.0::real
                WHEN position(params.search_norm IN src.name_normalized) = 1 THEN 2.0::real
                WHEN position(params.search_norm IN src.name_normalized) > 0 THEN 1.0::real
                ELSE 0::real
              END
          ELSE 0::real END$old$
  ];
  v_new text[] := ARRAY[
    $new$btrim(api.norm_search(p_search)) AS search_norm,
      -- explorer_literal_name_v1: literal name matching, independent of FTS lexemes.
      regexp_replace(btrim(lower(api.norm_search(p_search))), '[[:space:]]+', ' ', 'g') AS partial_name_search$new$,
    $new$      n.search_norm,
      n.partial_name_search,$new$,
    $new$(char_length(params.partial_name_search) >= 2
             AND position(params.partial_name_search IN lower(s2.name_normalized)) > 0)
            OR s2.name_search_vector @@ plainto_tsquery('french', api.norm_search(p_search))$new$,
    $new$(char_length(params.partial_name_search) >= 2
       AND position(params.partial_name_search IN lower(src.name_normalized)) > 0) OR
      src.name_search_vector @@ plainto_tsquery('french', api.norm_search(p_search)) OR$new$,
    $new$          CASE WHEN t.v @@ t.q
            OR (char_length(params.partial_name_search) >= 2
                AND position(params.partial_name_search IN lower(src.name_normalized)) > 0) THEN
            2.0::real + LEAST(ts_rank(t.v, t.q), 0.99::real)
            + CASE
                WHEN lower(src.name_normalized) = params.partial_name_search THEN 3.0::real
                WHEN position(params.partial_name_search IN lower(src.name_normalized)) = 1 THEN 2.0::real
                WHEN position(params.partial_name_search IN lower(src.name_normalized)) > 0 THEN 1.0::real
                ELSE 0::real
              END
          ELSE 0::real END$new$
  ];
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Partial-name search: api.get_filtered_object_ids/4 is missing';
  END IF;

  SELECT to_jsonb(p) - 'prosrc' INTO v_before FROM pg_proc p WHERE p.oid = v_oid;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.oid = v_oid AND l.lanname = 'sql'
      AND p.prosecdef AND p.provolatile = 's' AND p.proretset
      AND NOT p.proisstrict AND NOT p.proleakproof AND p.proparallel = 'u'
      AND p.procost = 100 AND p.prorows = 1000
      AND p.proconfig = ARRAY['search_path=pg_catalog, public, api, internal, extensions, auth, audit, crm, ref']
      AND pg_get_function_result(p.oid) = 'TABLE(object_id text, label_rank integer, label_match jsonb, relevance real)'
  ) THEN
    RAISE EXCEPTION 'Partial-name search: unsupported function contract or execution attributes';
  END IF;
  v_definition := pg_get_functiondef(v_oid);

  IF position(v_marker IN v_definition) > 0 THEN
    -- A partial/manual installation must fail instead of being mistaken for a replay.
    FOREACH v_index IN ARRAY ARRAY[1,2,3,4,5] LOOP
      v_count := (length(v_definition) - length(replace(v_definition, v_new[v_index], ''))) / length(v_new[v_index]);
      IF v_count <> 1 THEN
        RAISE EXCEPTION 'Partial-name search: installed patch drift at fragment %', v_index;
      END IF;
    END LOOP;
    RETURN;
  END IF;
  IF position('partial_name_search' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'Partial-name search: unrecognized partial-name implementation';
  END IF;

  -- Production still has the pre-name-bonus score; fresh-apply has the later
  -- exact/prefix/infix bonus. Only these two exact score predecessors are known.
  IF position(v_legacy_score IN v_definition) > 0 THEN
    IF position(v_old[5] IN v_definition) > 0 THEN
      RAISE EXCEPTION 'Partial-name search: ambiguous score predecessor';
    END IF;
    v_old[5] := v_legacy_score;
  END IF;

  -- Every edited predecessor must occur exactly once. Unrelated body changes are
  -- intentionally retained; changes to these five anchors require manual review.
  FOREACH v_index IN ARRAY ARRAY[1,2,3,4,5] LOOP
    v_count := (length(v_definition) - length(replace(v_definition, v_old[v_index], ''))) / length(v_old[v_index]);
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'Partial-name search: unsupported predecessor at fragment % (% occurrences)', v_index, v_count;
    END IF;
    v_definition := replace(v_definition, v_old[v_index], v_new[v_index]);
  END LOOP;
  EXECUTE v_definition;

  SELECT to_jsonb(p) - 'prosrc' INTO v_after FROM pg_proc p WHERE p.oid = v_oid;
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'Partial-name search: function identity, ownership, ACL or execution attributes changed';
  END IF;
END
$partial_name_search$;

COMMIT;
