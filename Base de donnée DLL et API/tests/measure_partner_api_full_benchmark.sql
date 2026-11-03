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
  -- First call warms both code/data; the following five are the recorded samples.
  FOR sample IN 0..5 LOOP
    SET LOCAL ROLE service_role;
    started:=clock_timestamp();
    result:=api.list_object_resources_page_text(
      p_cursor=>NULL,p_lang_prefs=>ARRAY['fr'],p_page_size=>100,
      p_types=>ARRAY['RES'],p_status=>ARRAY['published'],p_search=>'Contractbench',
      p_track_format=>'none',p_view=>'full')::jsonb;
    duration_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
    RESET ROLE;
    ASSERT jsonb_array_length(result->'data')=100,'Benchmark must measure 100 complete resources';
    ASSERT (result#>>'{data,0,id}') LIKE 'RESRUN999999C%','Benchmark matched an unrelated corpus';
    IF sample>0 THEN
      INSERT INTO internal.partner_api_full_benchmark VALUES(phase,sample,duration_ms,100);
    END IF;
  END LOOP;
END;
$benchmark$;
SELECT phase,round(min(duration_ms),2) AS min_ms,round(avg(duration_ms),2) AS mean_ms,
       round(max(duration_ms),2) AS max_ms,count(*) AS samples
FROM internal.partner_api_full_benchmark GROUP BY phase ORDER BY phase;
DO $budget$
DECLARE before_ms numeric; after_ms numeric;
BEGIN
  SELECT percentile_cont(0.5) WITHIN GROUP(ORDER BY duration_ms) INTO before_ms
    FROM internal.partner_api_full_benchmark WHERE phase='before';
  SELECT percentile_cont(0.5) WITHIN GROUP(ORDER BY duration_ms) INTO after_ms
    FROM internal.partner_api_full_benchmark WHERE phase='after';
  IF before_ms IS NOT NULL AND after_ms IS NOT NULL THEN
    -- CI noise allowance: 50% relative, or 100ms absolute for a fast fixture.
    -- This compares the same warm corpus on one runner; it is not a production SLA.
    RAISE NOTICE 'full100 median before=%ms after=%ms budget=%ms',
      round(before_ms,2),round(after_ms,2),round(greatest(before_ms*1.5,before_ms+100),2);
    ASSERT after_ms<=greatest(before_ms*1.5,before_ms+100),
      'full100 exceeds the defined isolated non-regression budget';
  END IF;
END;
$budget$;
RESET statement_timeout;
