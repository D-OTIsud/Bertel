-- Prepared, not applied. Source: live catalogue read-only, 2026-10-26 08:01:09 UTC.
-- Only adds the structured legal_records visibility predicate to render.legal_lines.
-- Refuses source drift; refresh/review the catalogue before applying at a later authorized step.
BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '5s';
SET LOCAL idle_in_transaction_session_timeout = '10s';

DO $legal_visibility$
DECLARE
  v_function regprocedure := 'api.get_object_resource(text,text[],text,jsonb)'::regprocedure;
  v_definition text;
  v_body_md5 text;
  v_before text := $before$        WHERE ol.object_id = obj.id
      ) lines;
      v_render := v_render || jsonb_build_object('legal_lines', COALESCE(v_tmp_json, '[]'::jsonb));$before$;
  v_after text := $after$        WHERE ol.object_id = obj.id
          AND (v_can_read_extended OR rlt.is_public = TRUE)
      ) lines;
      v_render := v_render || jsonb_build_object('legal_lines', COALESCE(v_tmp_json, '[]'::jsonb));$after$;
BEGIN
  SELECT md5(prosrc), pg_get_functiondef(oid)
    INTO v_body_md5, v_definition
    FROM pg_proc WHERE oid = v_function;

  IF v_body_md5 = '1307ad085edf1fa423febddf4446cf6b' THEN
    RETURN; -- This exact patch is already present.
  END IF;
  IF v_body_md5 IS DISTINCT FROM '141dfc79d7e08ccd2a2e6842a9b7d62d' THEN
    RAISE EXCEPTION 'legal render visibility: source changed; refresh and review the live definition';
  END IF;
  IF (length(v_definition) - length(replace(v_definition, v_before, ''))) / length(v_before) <> 1 THEN
    RAISE EXCEPTION 'legal render visibility: expected exactly one render block';
  END IF;

  -- pg_get_functiondef retains the live signature and function settings.
  -- CREATE OR REPLACE keeps ownership and existing grants; no ACL changes are made.
  EXECUTE replace(v_definition, v_before, v_after);
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_function) IS DISTINCT FROM '1307ad085edf1fa423febddf4446cf6b' THEN
    RAISE EXCEPTION 'legal render visibility: unexpected result';
  END IF;
END;
$legal_visibility$;
COMMIT;
