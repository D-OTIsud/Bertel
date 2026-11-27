-- Deferred main-location integrity for direct writes, replacements and deletes.
-- Run as postgres after the complete manifest and the required-location migration.
-- Ordinary auth, realm, ownership and thesaurus triggers stay enabled throughout.
-- Only the creation constraint is briefly disabled for one historical fixture;
-- the ALTER TABLE statements and all fixtures roll back with this transaction.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';
SET LOCAL plpgsql.check_asserts = on;
SELECT set_config('request.jwt.claims', '{}', true);

DO $main_location_structure_test$
DECLARE trigger_name text;
BEGIN
  FOREACH trigger_name IN ARRAY ARRAY[
    'object_creation_main_location_required', 'object_type_main_location_required',
    'object_main_location_delete_required', 'object_main_location_update_required'
  ] LOOP
    ASSERT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_constraint c ON c.oid = t.tgconstraint
      WHERE t.tgname = trigger_name AND NOT t.tgisinternal AND t.tgenabled = 'O'
        AND t.tgrelid = CASE WHEN trigger_name IN (
          'object_creation_main_location_required', 'object_type_main_location_required'
        ) THEN 'public.object'::regclass ELSE 'public.object_location'::regclass END
        AND t.tgdeferrable AND t.tginitdeferred
        AND c.condeferrable AND c.condeferred
        AND t.tgfoid = 'internal.guard_object_main_location_insee()'::regprocedure
    ), format('Missing enabled, initially deferred main-location constraint: %s', trigger_name);
  END LOOP;
  ASSERT (SELECT prosecdef FROM pg_proc
    WHERE oid = 'internal.guard_object_main_location_insee()'::regprocedure),
    'Private integrity decision must be SECURITY DEFINER so caller RLS cannot hide the owner';
  ASSERT NOT has_function_privilege('anon', 'internal.guard_object_main_location_insee()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'internal.guard_object_main_location_insee()', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'internal.guard_object_main_location_insee()', 'EXECUTE'),
    'Clients must not execute the private integrity trigger function';

  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM internal.guard_object_main_location_insee();
    RAISE EXCEPTION 'MAIN_LOCATION_TEST_FAIL: client executed the private integrity trigger';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END;
$main_location_structure_test$;

DO $main_location_creation_test$
BEGIN
  BEGIN
    INSERT INTO public.object(id, object_type, name, status)
    VALUES ('HOTRUNMAIN000001', 'HOT', 'Main-location refused orphan fixture', 'draft');
    -- The INSERT is legal temporarily, but the transaction cannot validate it.
    ASSERT EXISTS (SELECT 1 FROM public.object WHERE id = 'HOTRUNMAIN000001'),
      'Creation constraint must remain deferred for atomic imports';
    SET CONSTRAINTS object_creation_main_location_required IMMEDIATE;
    RAISE EXCEPTION 'MAIN_LOCATION_TEST_FAIL: direct object without a main address was accepted';
  EXCEPTION WHEN check_violation THEN
    ASSERT position('MAIN_LOCATION_INSEE_REQUIRED' IN SQLERRM) > 0,
      'Missing-main refusal must come from the new integrity guard';
  END;
  ASSERT NOT EXISTS (SELECT 1 FROM public.object WHERE id = 'HOTRUNMAIN000001')
     AND NOT EXISTS (SELECT 1 FROM public.object_location WHERE object_id = 'HOTRUNMAIN000001')
     AND NOT EXISTS (SELECT 1 FROM public.object_version WHERE object_id = 'HOTRUNMAIN000001'),
    'Failed direct creation must leave no object, address or version orphan';

  INSERT INTO public.object(id, object_type, name, status)
  VALUES ('HOTRUNMAIN000002', 'HOT', 'Main-location direct atomic fixture', 'draft');
  INSERT INTO public.object_location(object_id, city, postcode, is_main_location)
  VALUES ('HOTRUNMAIN000002', 'Entre-Deux', '97414', true);
  SET CONSTRAINTS object_creation_main_location_required IMMEDIATE;
  ASSERT EXISTS (SELECT 1 FROM public.object_location
    WHERE object_id = 'HOTRUNMAIN000002' AND is_main_location AND code_insee = '97403'),
    'Direct object plus main address in one transaction must pass with automatic INSEE';
  SET CONSTRAINTS object_creation_main_location_required DEFERRED;

  -- Institutional ORG has its own onboarding workflow and stays exempt.
  INSERT INTO public.object(id, object_type, name, status)
  VALUES ('ORGRUNMAIN000003', 'ORG', 'Main-location exempt institutional fixture', 'draft');
  SET CONSTRAINTS ALL IMMEDIATE;
  ASSERT EXISTS (SELECT 1 FROM public.object WHERE id = 'ORGRUNMAIN000003')
     AND NOT EXISTS (SELECT 1 FROM public.object_location WHERE object_id = 'ORGRUNMAIN000003'),
    'Institutional organization must remain valid without an invented address';
  SET CONSTRAINTS ALL DEFERRED;

  BEGIN
    UPDATE public.object SET object_type = 'HOT' WHERE id = 'ORGRUNMAIN000003';
    ASSERT (SELECT object_type FROM public.object WHERE id = 'ORGRUNMAIN000003') = 'HOT',
      'Facet/type guard must allow the fixture before checking deferred location integrity';
    SET CONSTRAINTS object_type_main_location_required IMMEDIATE;
    RAISE EXCEPTION 'MAIN_LOCATION_TEST_FAIL: ORG was retyped without a main address';
  EXCEPTION WHEN check_violation THEN
    ASSERT position('MAIN_LOCATION_INSEE_REQUIRED' IN SQLERRM) > 0,
      'Retype refusal must come from the main-location constraint, not an incompatible facet';
  END;
  ASSERT (SELECT object_type FROM public.object WHERE id = 'ORGRUNMAIN000003') = 'ORG',
    'Rejected retype must preserve the organization';
END;
$main_location_creation_test$;

DO $main_location_removal_test$
DECLARE main_id uuid; target_place_id uuid; replacement_id uuid;
BEGIN
  SELECT id INTO STRICT main_id FROM public.object_location
  WHERE object_id = 'HOTRUNMAIN000002' AND is_main_location;

  BEGIN
    DELETE FROM public.object_location WHERE id = main_id;
    SET CONSTRAINTS object_main_location_delete_required IMMEDIATE;
    RAISE EXCEPTION 'MAIN_LOCATION_TEST_FAIL: only main address was deleted';
  EXCEPTION WHEN check_violation THEN
    ASSERT position('MAIN_LOCATION_INSEE_REQUIRED' IN SQLERRM) > 0;
  END;
  ASSERT EXISTS (SELECT 1 FROM public.object_location WHERE id = main_id AND is_main_location),
    'Rejected deletion must preserve the main address';

  BEGIN
    UPDATE public.object_location SET is_main_location = false WHERE id = main_id;
    SET CONSTRAINTS object_main_location_update_required IMMEDIATE;
    RAISE EXCEPTION 'MAIN_LOCATION_TEST_FAIL: only main address was deselected';
  EXCEPTION WHEN check_violation THEN
    ASSERT position('MAIN_LOCATION_INSEE_REQUIRED' IN SQLERRM) > 0;
  END;
  ASSERT EXISTS (SELECT 1 FROM public.object_location WHERE id = main_id AND is_main_location),
    'Rejected deselection must preserve the main flag';

  -- The destination has no main address, avoiding a unique-index error that
  -- could otherwise hide whether the original owner is checked at all.
  BEGIN
    UPDATE public.object_location SET object_id = 'ORGRUNMAIN000003' WHERE id = main_id;
    ASSERT (SELECT object_id FROM public.object_location WHERE id = main_id) = 'ORGRUNMAIN000003';
    SET CONSTRAINTS object_main_location_update_required IMMEDIATE;
    RAISE EXCEPTION 'MAIN_LOCATION_TEST_FAIL: main address moved away from its original object';
  EXCEPTION WHEN check_violation THEN
    ASSERT position('MAIN_LOCATION_INSEE_REQUIRED' IN SQLERRM) > 0,
      'Ownership move must be refused by the original owner main-location check';
  END;
  ASSERT (SELECT object_id FROM public.object_location WHERE id = main_id) = 'HOTRUNMAIN000002',
    'Rejected owner transfer must preserve the original owner';

  INSERT INTO public.object_place(object_id, label)
  VALUES ('ORGRUNMAIN000003', 'Main-location move-to-place fixture')
  RETURNING id INTO target_place_id;
  BEGIN
    UPDATE public.object_location
    SET object_id = NULL, place_id = target_place_id WHERE id = main_id;
    ASSERT (SELECT place_id FROM public.object_location WHERE id = main_id) = target_place_id;
    SET CONSTRAINTS object_main_location_update_required IMMEDIATE;
    RAISE EXCEPTION 'MAIN_LOCATION_TEST_FAIL: main address moved to a place without replacement';
  EXCEPTION WHEN check_violation THEN
    ASSERT position('MAIN_LOCATION_INSEE_REQUIRED' IN SQLERRM) > 0,
      'Move to a place must still check the original object main address';
  END;
  ASSERT EXISTS (SELECT 1 FROM public.object_location
    WHERE id = main_id AND object_id = 'HOTRUNMAIN000002' AND place_id IS NULL),
    'Rejected place move must preserve the direct object address';

  -- A replacement may delete the previous address first within the transaction.
  DELETE FROM public.object_location WHERE id = main_id;
  INSERT INTO public.object_location(object_id, city, postcode, is_main_location)
  VALUES ('HOTRUNMAIN000002', 'Saint-Pierre', '97410', true)
  RETURNING id INTO replacement_id;
  SET CONSTRAINTS ALL IMMEDIATE;
  ASSERT NOT EXISTS (SELECT 1 FROM public.object_location WHERE id = main_id)
     AND EXISTS (SELECT 1 FROM public.object_location
       WHERE id = replacement_id AND object_id = 'HOTRUNMAIN000002'
         AND is_main_location AND code_insee = '97416'),
    'Replacing a main address atomically must succeed';
  SET CONSTRAINTS ALL DEFERRED;

  DELETE FROM public.object WHERE id = 'HOTRUNMAIN000002';
  SET CONSTRAINTS ALL IMMEDIATE;
  ASSERT NOT EXISTS (SELECT 1 FROM public.object WHERE id = 'HOTRUNMAIN000002')
     AND NOT EXISTS (SELECT 1 FROM public.object_location WHERE id = replacement_id),
    'Cascade deletion must pass once the owning object no longer exists';
  SET CONSTRAINTS ALL DEFERRED;
END;
$main_location_removal_test$;

-- Build a deterministic historical row without weakening another production
-- trigger, rather than relying on legacy content in whichever DB runs the test.
ALTER TABLE public.object DISABLE TRIGGER object_creation_main_location_required;
INSERT INTO public.object(id, object_type, name, status)
VALUES ('HOTRUNMAIN000004', 'HOT', 'Main-location historical address-free fixture', 'draft');
ALTER TABLE public.object ENABLE TRIGGER object_creation_main_location_required;
UPDATE public.object SET name = 'Main-location historical name edit allowed'
WHERE id = 'HOTRUNMAIN000004';
SET CONSTRAINTS ALL IMMEDIATE;
DO $main_location_history_test$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.object
    WHERE id = 'HOTRUNMAIN000004' AND name = 'Main-location historical name edit allowed')
     AND NOT EXISTS (SELECT 1 FROM public.object_location WHERE object_id = 'HOTRUNMAIN000004'),
    'A plain name edit must not retro-validate historical rows without an address';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.object'::regclass
      AND tgname = 'object_creation_main_location_required' AND tgenabled = 'O'),
    'Historical fixture must restore the creation constraint immediately';
  RAISE NOTICE 'Deferred main-location assertions passed: direct creation, no-orphan rollback, ORG exemption/retype, removal/moves, replacement, cascade delete, historical edits and private helper grants.';
END;
$main_location_history_test$;

ROLLBACK;
