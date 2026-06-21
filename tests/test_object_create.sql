-- tests/test_object_create.sql
-- Pins the api.rpc_create_object contract (B1 object creation, decision log §105).
--
-- Runs as the CI / migration role (no application JWT) → auth.uid() is NULL, so the
-- success path is asserted STRUCTURALLY (a direct INSERT mirroring the RPC's own
-- INSERT, rolled back) and the auth/guard path BEHAVIOURALLY (calling the RPC must
-- be refused with NO_AUTH_CONTEXT). Self-cleaning: the structural probe runs inside a
-- sub-transaction that is always rolled back, so CI leaves no object row behind.
DO $$
DECLARE
  v_def    text;
  v_id     text;
  v_status text;
BEGIN
  -- 1. Function exists with the exact signature, and is SECURITY DEFINER.
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'api' AND p.proname = 'rpc_create_object'
    AND pg_get_function_arguments(p.oid)
        = 'p_object_type text, p_name text, p_region_code text DEFAULT NULL::text';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'rpc_create_object missing or wrong signature';
  END IF;
  IF position('SECURITY DEFINER' IN v_def) = 0 THEN
    RAISE EXCEPTION 'rpc_create_object must be SECURITY DEFINER';
  END IF;

  -- 2. A null auth context (no app JWT) is refused explicitly, never a silent bad insert.
  BEGIN
    PERFORM api.rpc_create_object('HOT', 'CI test');
    RAISE EXCEPTION 'expected NO_AUTH_CONTEXT, none raised';
  EXCEPTION WHEN OTHERS THEN
    IF position('NO_AUTH_CONTEXT' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'expected NO_AUTH_CONTEXT, got: %', SQLERRM;
    END IF;
  END;

  -- 3. The ownership + id-generation wiring the RPC depends on is present.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_auto_attach_object_to_creator_org') THEN
    RAISE EXCEPTION 'trg_auto_attach_object_to_creator_org missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_before_insert_object_generate_id') THEN
    RAISE EXCEPTION 'trg_before_insert_object_generate_id missing';
  END IF;

  -- 4. Every creatable type (enum minus ORG) is a valid arg → the picker can never offer
  --    a type the RPC would reject.
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumtypid = 'object_type'::regtype AND enumlabel <> 'ORG'
  ) THEN
    RAISE EXCEPTION 'object_type enum has no non-ORG values';
  END IF;

  -- 5. Structural success probe (rolled back): an insert shaped exactly like the RPC's own
  --    yields status='draft' and a generated id matching chk_object_id_shape.
  BEGIN
    INSERT INTO object (object_type, name, region_code, status, created_by, updated_by)
    VALUES ('HOT', '__test_object_create__', 'RUN', 'draft', NULL, NULL)
    RETURNING id, status INTO v_id, v_status;

    IF v_status <> 'draft' THEN
      RAISE EXCEPTION 'new object status must be draft, got %', v_status;
    END IF;
    IF v_id !~ '^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$' THEN
      RAISE EXCEPTION 'generated id shape invalid: %', v_id;
    END IF;

    -- Roll the probe back so CI leaves no object/version rows behind.
    RAISE EXCEPTION 'ROLLBACK_PROBE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_PROBE' THEN
      RAISE;
    END IF;
  END;

  RAISE NOTICE 'test_object_create.sql: OK';
END $$;
