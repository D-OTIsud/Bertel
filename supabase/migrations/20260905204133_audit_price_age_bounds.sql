-- DB-02: object_price.chk_age_ranges_valid is a single CHECK ANDing four
-- comparisons; when a min is NULL, `max >= NULL` evaluates to NULL, and NULL
-- passes a CHECK. So a NULL age_min_enfant/age_min_junior lets the paired max
-- go negative undetected. Add a NAMED CHECK per category that requires the
-- max to be non-negative independently of whether the min is set, without
-- touching the existing min/max ordering constraint.
--
-- NOT VALID: legacy rows may already violate this. New/updated rows are
-- blocked immediately; existing rows are audited below and the constraint is
-- VALIDATEd in the same migration only if none are found — otherwise it is
-- left NOT VALID for operator review (no repair, no delete here).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.object_price'::regclass
      AND conname = 'chk_age_max_nonneg'
  ) THEN
    ALTER TABLE public.object_price
      ADD CONSTRAINT chk_age_max_nonneg CHECK (
        (age_max_enfant IS NULL OR age_max_enfant >= 0) AND
        (age_max_junior IS NULL OR age_max_junior >= 0)
      ) NOT VALID;
  END IF;
END $$;

DO $$
DECLARE
  v_bad_count integer;
BEGIN
  SELECT count(*) INTO v_bad_count
  FROM public.object_price
  WHERE (age_max_enfant IS NOT NULL AND age_max_enfant < 0)
     OR (age_max_junior IS NOT NULL AND age_max_junior < 0);

  IF v_bad_count = 0 THEN
    ALTER TABLE public.object_price VALIDATE CONSTRAINT chk_age_max_nonneg;
  ELSE
    RAISE NOTICE 'chk_age_max_nonneg left NOT VALID: % existing object_price row(s) violate it (operator review required, see docs/SQL_ROLLOUT_RUNBOOK.md)', v_bad_count;
  END IF;
END $$;
