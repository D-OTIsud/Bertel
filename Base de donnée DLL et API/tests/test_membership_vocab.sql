-- §17 — asserts the membership vocabulary socle is present (run after seeds_data.sql /
-- migration membership_vocab_seed_and_create_rpcs). Codes must be lower-case snake.
DO $$
DECLARE n_campaign int; n_tier int; n_charte int;
BEGIN
  SELECT count(*) INTO n_campaign FROM public.ref_code WHERE domain = 'membership_campaign';
  SELECT count(*) INTO n_tier     FROM public.ref_code WHERE domain = 'membership_tier';
  SELECT count(*) INTO n_charte   FROM public.ref_code WHERE domain = 'membership_campaign' AND code = 'charte';
  IF n_campaign < 3 THEN RAISE EXCEPTION 'expected >=3 membership_campaign, got %', n_campaign; END IF;
  IF n_tier     < 4 THEN RAISE EXCEPTION 'expected >=4 membership_tier, got %', n_tier; END IF;
  IF n_charte   < 1 THEN RAISE EXCEPTION 'charte campaign missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ref_code WHERE domain = 'membership_tier' AND code = 'charte_gratuit') THEN
    RAISE EXCEPTION 'charte_gratuit tier missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ref_code WHERE domain IN ('membership_campaign','membership_tier') AND code <> lower(code)) THEN
    RAISE EXCEPTION 'membership codes must be lower-case snake';
  END IF;
  RAISE NOTICE 'test_membership_vocab OK (campaigns=%, tiers=%)', n_campaign, n_tier;
END $$;
