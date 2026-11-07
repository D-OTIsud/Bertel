-- test_object_type_spu.sql
-- Proves manifest step 8u (migration_object_type_spu.sql, §53):
--   * object_type enum carries 'SPU'
--   * ref_code_domain_registry has taxonomy_spu (object_type='SPU', taxonomy, active)
--   * taxonomy_spu tree = 1 non-assignable technical root + 3 assignable leaves
--     (public_toilets / drinking_water / electric_charging) parented to root
--   * an SPU object INSERT passes the type→facet guard (SPU has no facet table)
--     and gets a generated id (api.generate_object_id is type-generic)
-- Against a DB without 8u the enum assertion fails -> red.
-- Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_root_id uuid;
  v_leaves  int;
  v_id      text;
BEGIN
  -- 1. enum value
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'object_type'::regtype AND enumlabel = 'SPU'
  ) THEN
    RAISE EXCEPTION 'object_type enum is missing SPU (8u not applied)';
  END IF;

  -- 2. registry row
  IF NOT EXISTS (
    SELECT 1 FROM ref_code_domain_registry
    WHERE domain = 'taxonomy_spu'
      AND object_type = 'SPU'::object_type
      AND is_taxonomy IS TRUE
      AND is_active   IS TRUE
  ) THEN
    RAISE EXCEPTION 'ref_code_domain_registry[taxonomy_spu] missing or mis-typed';
  END IF;

  -- 3. taxonomy tree shape
  SELECT id INTO v_root_id
  FROM ref_code
  WHERE domain = 'taxonomy_spu' AND code = 'root' AND is_assignable IS FALSE;
  IF v_root_id IS NULL THEN
    RAISE EXCEPTION 'taxonomy_spu technical root missing (or wrongly assignable)';
  END IF;

  SELECT count(*) INTO v_leaves
  FROM ref_code
  WHERE domain = 'taxonomy_spu'
    AND parent_id = v_root_id
    AND is_assignable IS TRUE
    AND code IN ('public_toilets', 'drinking_water', 'electric_charging');
  IF v_leaves <> 3 THEN
    RAISE EXCEPTION 'taxonomy_spu expected 3 assignable leaves under root, found %', v_leaves;
  END IF;

  -- 4. SPU object insert passes (no facet guard, generic id generation)
  INSERT INTO object (object_type, name, status, region_code)
  VALUES ('SPU', 'Test SPU — toilettes publiques', 'draft', 'RUN')
  RETURNING id INTO v_id;
  IF v_id IS NULL OR v_id = '' THEN
    RAISE EXCEPTION 'SPU object insert did not generate an id';
  END IF;

  RAISE NOTICE 'test_object_type_spu: all assertions green (root=%, new id=%)', v_root_id, v_id;
END $$;
ROLLBACK;
