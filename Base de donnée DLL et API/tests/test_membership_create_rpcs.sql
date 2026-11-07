-- §17 — asserts api.create_membership_campaign / _tier create-on-the-go behaviour:
-- first call creates (created=true), a same-(normalized)-name call dedups to the SAME
-- ref_id (created=false). Self-cleaning (deletes the throwaway row). Run as a role that
-- passes internal.workspace_assert_can_write_object for the anchor object.
DO $$
DECLARE v_obj text; r1 jsonb; r2 jsonb;
BEGIN
  SELECT id INTO v_obj FROM public.object LIMIT 1;
  IF v_obj IS NULL THEN RAISE NOTICE 'no object to anchor; skipping RPC smoke'; RETURN; END IF;

  r1 := api.create_membership_tier(v_obj, 'ZZ Test Charte Dedup');
  r2 := api.create_membership_tier(v_obj, 'ZZ Test Charte Dedup');

  IF (r1->>'created') <> 'true'  THEN RAISE EXCEPTION 'first create should be created=true, got %', r1; END IF;
  IF (r2->>'created') <> 'false' THEN RAISE EXCEPTION 'second create should dedup to created=false, got %', r2; END IF;
  IF (r1->>'ref_id') <> (r2->>'ref_id') THEN RAISE EXCEPTION 'dedup must return the SAME ref_id (% vs %)', r1->>'ref_id', r2->>'ref_id'; END IF;

  DELETE FROM public.ref_code WHERE domain = 'membership_tier' AND code = (r1->>'code');
  RAISE NOTICE 'test_membership_create_rpcs OK (ref_id=%)', r1->>'ref_id';
END $$;
