-- object_workspace_gap_rpcs.sql
-- Plan 4 — write RPCs for the four remaining editor sections (09/11/18/20).
--
-- Adds to the safe-write surface declared in object_workspace_safe_write_rpcs.sql:
--   * api.save_object_workspace_sustainability(text, jsonb) — section 11 "Démarche durable"
--   * api.save_object_workspace_tags(text, jsonb)           — section 09 "Tags & étiquettes"
--
-- Distribution (section 20) and Fournisseur (section 18) are intentionally NOT
-- given a new RPC in this file — see lot1_mapping_decisions.md §16. Distribution
-- needs an operator-actor write contract that is out of scope for Plan 4;
-- Fournisseur composes existing modules (legal + actor) and adds no new write
-- path.
--
-- PREREQUISITES: schema_unified.sql, rls_policies.sql, object_workspace_safe_write_rpcs.sql.
-- IDEMPOTENT (uses CREATE OR REPLACE FUNCTION; row writes are delete-then-insert
-- within a single transaction). Reversible by dropping the two functions.

CREATE OR REPLACE FUNCTION api.save_object_workspace_sustainability(p_object_id text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, api, internal
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
  v_row jsonb;
  v_action_id uuid;
  v_action_code text;
  v_category_code text;
  v_count integer;
  v_inserted integer := 0;
BEGIN
  -- Workspace gate: throws on missing object or insufficient rights (see
  -- internal.workspace_assert_can_write_object in object_workspace_safe_write_rpcs.sql).
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);

  -- Sustainability is a delete-then-insert: the payload's `actions` array is the
  -- new full list of declared actions. Anything not in the payload is removed.
  IF NOT (p_payload ? 'actions') THEN
    RAISE EXCEPTION 'Payload is missing required key "actions"' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.object_sustainability_action WHERE object_id = p_object_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('object_sustainability_action_deleted', v_count);

  FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'actions')) AS t(value) LOOP
    v_action_id := internal.workspace_uuid(v_row->>'action_id');
    v_action_code := NULLIF(v_row->>'action_code', '');
    v_category_code := NULLIF(v_row->>'category_code', '');

    IF v_action_id IS NULL AND v_action_code IS NOT NULL THEN
      IF v_category_code IS NOT NULL THEN
        SELECT a.id INTO v_action_id
          FROM public.ref_sustainability_action a
          JOIN public.ref_sustainability_action_category c ON c.id = a.category_id
         WHERE lower(a.code) = lower(v_action_code)
           AND lower(c.code) = lower(v_category_code)
         LIMIT 1;
      ELSE
        SELECT id INTO v_action_id FROM public.ref_sustainability_action WHERE lower(code) = lower(v_action_code) LIMIT 1;
      END IF;
    END IF;

    IF v_action_id IS NULL THEN
      RAISE EXCEPTION 'Unknown sustainability action reference (action_id="%", action_code="%", category_code="%")',
        v_row->>'action_id', v_action_code, v_category_code
        USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.object_sustainability_action (
      object_id, action_id, document_id, note
    ) VALUES (
      p_object_id,
      v_action_id,
      internal.workspace_uuid(v_row->>'document_id'),
      NULLIF(v_row->>'note', '')
    )
    ON CONFLICT (object_id, action_id) DO NOTHING;
    v_inserted := v_inserted + 1;
  END LOOP;

  v_counts := v_counts || jsonb_build_object('object_sustainability_action_inserted', v_inserted);

  -- The action↔label bridges (object_sustainability_action_label) intentionally
  -- stay out of this write path: those rows mirror official label classifications
  -- (sustainability_labels) that are managed by the Classifications section (08),
  -- not by the action checklist. Surface a warning when the payload tries to
  -- carry them.
  IF p_payload ? 'action_labels' THEN
    v_skipped := array_append(v_skipped, 'action_labels');
    v_warnings := array_append(
      v_warnings,
      'object_sustainability_action_label is owned by the Classifications module; ignored here.'
    );
  END IF;

  RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
END;
$$;

REVOKE ALL ON FUNCTION api.save_object_workspace_sustainability(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_object_workspace_sustainability(text, jsonb) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION api.save_object_workspace_tags(p_object_id text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, api, internal
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
  v_row jsonb;
  v_tag_id uuid;
  v_slug text;
  v_count integer;
  v_inserted integer := 0;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);

  IF NOT (p_payload ? 'tags') THEN
    RAISE EXCEPTION 'Payload is missing required key "tags"' USING ERRCODE = '22023';
  END IF;

  -- Tags for an object are stored in tag_link with target_table='object' and
  -- target_pk=object_id. The presentation order is the order in the payload
  -- array; ref_tag.position drives global ordering in the library picker, not
  -- the per-object surface.
  DELETE FROM public.tag_link
   WHERE target_table = 'object'
     AND target_pk = p_object_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('tag_link_deleted', v_count);

  FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'tags')) AS t(value) LOOP
    v_tag_id := internal.workspace_uuid(v_row->>'tag_id');
    v_slug := NULLIF(v_row->>'slug', '');

    IF v_tag_id IS NULL AND v_slug IS NOT NULL THEN
      SELECT id INTO v_tag_id FROM public.ref_tag WHERE lower(slug) = lower(v_slug) LIMIT 1;
    END IF;

    IF v_tag_id IS NULL THEN
      -- The editor never auto-creates ref_tag rows: the "Bibliothèque" picker
      -- references existing tags only. Raise so the UI surfaces the gap rather
      -- than silently dropping the row.
      RAISE EXCEPTION 'Unknown tag reference (tag_id="%", slug="%")', v_row->>'tag_id', v_slug USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.tag_link (tag_id, target_table, target_pk, extra)
    VALUES (
      v_tag_id,
      'object',
      p_object_id,
      internal.workspace_jsonb_object(v_row->'extra')
    )
    ON CONFLICT (tag_id, target_table, target_pk) DO NOTHING;
    v_inserted := v_inserted + 1;
  END LOOP;

  v_counts := v_counts || jsonb_build_object('tag_link_inserted', v_inserted);

  RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
END;
$$;

REVOKE ALL ON FUNCTION api.save_object_workspace_tags(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_object_workspace_tags(text, jsonb) TO authenticated, service_role;
