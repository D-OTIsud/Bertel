-- Second independent guard: a client PGOPTIONS flag alone is insufficient.
-- The marker is created only by the disposable CI seed, outside the app manifest.
DO $guard$
BEGIN
 IF current_setting('bertel.ephemeral_ci',true) IS DISTINCT FROM 'on'
    OR to_regclass('bertel_ci_fixture.bootstrap') IS NULL THEN
  RAISE EXCEPTION 'Refusing fixture writes: disposable bootstrap marker and flag required';
 END IF;
 IF (SELECT count(*) FROM bertel_ci_fixture.bootstrap
     WHERE purpose='partner-contract-local-only') <> 1 THEN
  RAISE EXCEPTION 'Invalid disposable bootstrap marker';
 END IF;
 -- This corpus has 109 objects plus the canonical seed. Live has >900.
 IF (SELECT count(*) FROM public.object WHERE NOT coalesce(is_test,false)) > 250 THEN
  RAISE EXCEPTION 'Refusing fixture writes: non-test object count exceeds isolated corpus';
 END IF;
END;
$guard$;
