-- test_object_stay_policy.sql
-- Proves migration_object_stay_policy.sql (§85): the object_stay_policy table (per-object
-- check-in/out), its §38 read gate + per-command canonical write family, the updated_at +
-- audit triggers, the FK to object, and anon read-gating / write-deny.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_pol int; v_trg int; v_inserted boolean := false;
  v_draft text; v_pub text; v_anon_rows int;
BEGIN
  -- ---------- Structural ----------
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.object_stay_policy'::regclass),
         'object_stay_policy RLS not enabled (migration not applied)';
  SELECT count(*) INTO v_pol FROM pg_policy WHERE polrelid='public.object_stay_policy'::regclass;
  ASSERT v_pol = 4, 'expected 4 policies (read + canonical ins/upd/del), got '||v_pol;
  ASSERT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.object_stay_policy'::regclass AND polname='read_object_stay_policy' AND polcmd='r'), 'read policy missing';
  ASSERT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.object_stay_policy'::regclass AND polname='canonical_ins_object_stay_policy' AND polcmd='a'), 'canonical insert policy missing';
  SELECT count(*) INTO v_trg FROM pg_trigger WHERE tgrelid='public.object_stay_policy'::regclass AND NOT tgisinternal;
  ASSERT v_trg = 5, 'expected 2 business triggers and 3 thesaurus ownership guards, got '||v_trg;
  ASSERT (SELECT count(*) FROM pg_trigger t JOIN (VALUES
    ('update_object_stay_policy_updated_at','public.update_updated_at_column()'::regprocedure,19),
    ('trg_audit_object_stay_policy','audit.log_row_changes()'::regprocedure,25),
    ('thesaurus_write_fence','thesaurus.write_fence()'::regprocedure,30),
    ('thesaurus_remember_ownership','thesaurus.remember_ownership()'::regprocedure,11),
    ('thesaurus_ownership_transfer_guard','thesaurus.guard_ownership_transfer()'::regprocedure,23)
  ) expected(trigger_name,function_oid,trigger_type)
    ON t.tgname=expected.trigger_name AND t.tgfoid=expected.function_oid AND t.tgtype=expected.trigger_type
    WHERE t.tgrelid='public.object_stay_policy'::regclass AND NOT t.tgisinternal AND t.tgenabled='O')=5,
    'stay policy business/ownership trigger names, functions, events or enabled state drifted';
  ASSERT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.object_stay_policy'::regclass AND contype='f'
                 AND pg_get_constraintdef(oid) ILIKE '%object(id)%'), 'FK to object missing';

  -- ---------- FK enforcement (superuser; RLS bypassed, FK enforced) ----------
  BEGIN
    INSERT INTO object_stay_policy (object_id, check_in_from) VALUES ('NOSUCHOBJECT99999', '16:00');
    v_inserted := true;
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  ASSERT NOT v_inserted, 'FK did not reject an unknown object_id';

  -- ---------- Read gate: published parent readable by anon, draft not ----------
  INSERT INTO object (id, object_type, name, status) VALUES ('STAYDR9999999901', 'HLO', 'stay draft', 'draft');
  INSERT INTO object (id, object_type, name, status) VALUES ('STAYPB9999999901', 'HLO', 'stay pub', 'published');
  INSERT INTO object_stay_policy (object_id, check_in_from, check_out_until) VALUES ('STAYDR9999999901', '16:00', '11:00');
  INSERT INTO object_stay_policy (object_id, check_in_from, check_out_until) VALUES ('STAYPB9999999901', '15:00', '10:00');

  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    SELECT count(*) INTO v_anon_rows FROM object_stay_policy WHERE object_id IN ('STAYDR9999999901','STAYPB9999999901');
    ASSERT v_anon_rows = 1, 'anon must read only the PUBLISHED object stay policy (got '||v_anon_rows||')';
    v_inserted := false;
    BEGIN
      INSERT INTO object_stay_policy (object_id, check_in_from) VALUES ('STAYPB9999999901', '09:00');
      v_inserted := true;
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
    ASSERT NOT v_inserted, 'anon MUST NOT write object_stay_policy (canonical gate)';
  RESET ROLE;

  RAISE NOTICE 'object_stay_policy assertions passed (structural + FK + §38 read gate + anon write-deny).';
END$$;
ROLLBACK;
