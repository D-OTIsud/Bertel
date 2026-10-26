-- Prepared, not applied. Run after partner_legal_render_visibility.
-- Reuse the getter's existing per-object access decision for its two Editor-only layers.
BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '5s';
SET LOCAL idle_in_transaction_session_timeout = '10s';

DO $editor_description_visibility$
DECLARE
  v_function regprocedure := 'api.get_object_resource(text,text[],text,jsonb)'::regprocedure;
  v_definition text;
  v_body_md5 text;
  v_before_canonical text := $before_canonical$IF v_fields IS NULL OR 'canonical_description' = ANY(v_fields) THEN$before_canonical$;
  v_after_canonical text := $after_canonical$IF COALESCE(v_can_read_extended, FALSE) AND (v_fields IS NULL OR 'canonical_description' = ANY(v_fields)) THEN$after_canonical$;
  v_before_org text := $before_org$IF v_fields IS NULL OR 'org_description' = ANY(v_fields) THEN$before_org$;
  v_after_org text := $after_org$IF COALESCE(v_can_read_extended, FALSE) AND (v_fields IS NULL OR 'org_description' = ANY(v_fields)) THEN$after_org$;
BEGIN
  SELECT md5(prosrc), pg_get_functiondef(oid)
    INTO v_body_md5, v_definition
    FROM pg_proc WHERE oid = v_function;
  IF v_body_md5 = '523b18abc402528c494e25f3895f2912' THEN
    RETURN;
  END IF;
  IF v_body_md5 IS DISTINCT FROM '1307ad085edf1fa423febddf4446cf6b' THEN
    RAISE EXCEPTION 'editor description visibility: expected reviewed definition after legal patch';
  END IF;
  IF (length(v_definition) - length(replace(v_definition, v_before_canonical, ''))) / length(v_before_canonical) <> 1
      OR (length(v_definition) - length(replace(v_definition, v_before_org, ''))) / length(v_before_org) <> 1 THEN
    RAISE EXCEPTION 'editor description visibility: expected exactly one block per field';
  END IF;
  v_definition := replace(v_definition, v_before_canonical, v_after_canonical);
  v_definition := replace(v_definition, v_before_org, v_after_org);
  EXECUTE v_definition;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_function) IS DISTINCT FROM '523b18abc402528c494e25f3895f2912' THEN
    RAISE EXCEPTION 'editor description visibility: unexpected result';
  END IF;
END;
$editor_description_visibility$;
COMMIT;
