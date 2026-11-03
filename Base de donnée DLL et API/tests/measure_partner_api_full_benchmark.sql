-- Run with -v benchmark_phase=before|after; all SQL calls use service_role.
SELECT set_config('bertel.benchmark_phase', :'benchmark_phase', false);
DO $$ BEGIN
  IF current_setting('bertel.ephemeral_ci',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Disposable Supabase required: bertel.ephemeral_ci=on';
  END IF;
END $$;
SET statement_timeout='60s';
DO $benchmark$
DECLARE started timestamptz; result jsonb; phase text; sample integer; duration_ms numeric;
BEGIN
  phase:=current_setting('bertel.benchmark_phase');
  IF phase NOT IN ('before','after') THEN RAISE EXCEPTION 'Invalid benchmark phase'; END IF;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  -- First call warms both code/data; the following twenty are recorded samples.
  -- At the observed ~1s per full100 call this is ~20s per isolated phase.
  FOR sample IN 0..20 LOOP
    SET LOCAL ROLE service_role;
    started:=clock_timestamp();
    result:=api.list_object_resources_page_text(
      p_cursor=>NULL,p_lang_prefs=>ARRAY['fr'],p_page_size=>100,
      p_types=>ARRAY['RES'],p_status=>ARRAY['published'],p_search=>'Contractbench',
      p_track_format=>'none',p_view=>'full')::jsonb;
    duration_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
    RESET ROLE;
    ASSERT duration_ms>0,'Benchmark timing must be positive';
    ASSERT jsonb_array_length(result->'data')=100,'Benchmark must measure 100 complete resources';
    ASSERT (result#>>'{data,0,id}') LIKE 'RESRUN999999C%','Benchmark matched an unrelated corpus';
    IF sample>0 THEN
      INSERT INTO internal.partner_api_full_benchmark VALUES(phase,sample,duration_ms,100);
    END IF;
  END LOOP;
END;
$benchmark$;
SELECT phase,round(min(duration_ms),2) AS min_ms,round(avg(duration_ms),2) AS mean_ms,
       round(max(duration_ms),2) AS max_ms,
       round((percentile_cont(0.5) WITHIN GROUP(ORDER BY duration_ms))::numeric,2) AS median_ms,
       round(percentile_disc(0.95) WITHIN GROUP(ORDER BY duration_ms),2) AS p95_ms,
       count(*) AS samples,array_agg(round(duration_ms,2) ORDER BY sample) AS sample_ms
FROM internal.partner_api_full_benchmark GROUP BY phase ORDER BY phase;
DO $budget$
DECLARE before_ms numeric; after_ms numeric; before_p95_ms numeric; after_p95_ms numeric;
  before_samples integer; after_samples integer;
BEGIN
  SELECT percentile_cont(0.5) WITHIN GROUP(ORDER BY duration_ms),
         percentile_disc(0.95) WITHIN GROUP(ORDER BY duration_ms),count(*)
    INTO before_ms,before_p95_ms,before_samples
    FROM internal.partner_api_full_benchmark WHERE phase='before';
  SELECT percentile_cont(0.5) WITHIN GROUP(ORDER BY duration_ms),
         percentile_disc(0.95) WITHIN GROUP(ORDER BY duration_ms),count(*)
    INTO after_ms,after_p95_ms,after_samples
    FROM internal.partner_api_full_benchmark WHERE phase='after';
  ASSERT NOT EXISTS(SELECT 1 FROM internal.partner_api_full_benchmark GROUP BY phase
    HAVING count(*)<>20 OR min(sample)<>1 OR max(sample)<>20),
    'full100 requires exactly twenty recorded samples per measured phase';
  IF before_ms IS NOT NULL AND after_ms IS NOT NULL THEN
    -- CI noise allowance: 50% relative, or 100ms absolute for a fast fixture.
    -- This compares the same warm corpus on one runner; it is not a production SLA.
    RAISE NOTICE 'full100 median before=%ms after=%ms budget=%ms',
      round(before_ms,2),round(after_ms,2),round(greatest(before_ms*1.5,before_ms+100),2);
    -- Empirical nearest-rank p95: the 19th sorted observation out of twenty,
    -- not an interpolated value or an inference about production percentiles.
    RAISE NOTICE 'full100 p95 before=%ms after=%ms budget=%ms samples_before=% samples_after=%',
      round(before_p95_ms,2),round(after_p95_ms,2),round(greatest(before_p95_ms*1.5,before_p95_ms+100),2),before_samples,after_samples;
    ASSERT after_ms<=greatest(before_ms*1.5,before_ms+100),
      'full100 exceeds the defined isolated non-regression budget';
    ASSERT after_p95_ms<=greatest(before_p95_ms*1.5,before_p95_ms+100),
      'full100 p95 exceeds the defined isolated non-regression budget';
  ELSE
    RAISE NOTICE 'full100 comparative median/p95 budgets not evaluated: before_samples=% after_samples=%; isolated phase measurement only',
      before_samples,after_samples;
  END IF;
END;
$budget$;
RESET statement_timeout;
