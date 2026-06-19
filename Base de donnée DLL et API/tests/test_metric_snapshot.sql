-- test_metric_snapshot.sql
-- Brique 2 (manifest 14s): registre temporel metric_snapshot + capture + lecture.
-- Run AFTER the manifest. Self-contained + transactional (ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_dup boolean := false;
BEGIN
  -- table + colonnes
  ASSERT to_regclass('public.metric_snapshot') IS NOT NULL, 'metric_snapshot must exist';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.metric_snapshot'::regclass),
         'metric_snapshot must have RLS enabled';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='metric_snapshot'
                   AND column_name='metric_key'), 'metric_key column present';
  -- unicité (snapshot_date,scope,scope_key,metric_key)
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value)
    VALUES ('2026-01-01','global','','t_demo',1);
  BEGIN
    INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value)
      VALUES ('2026-01-01','global','','t_demo',2);
  EXCEPTION WHEN unique_violation THEN v_dup := true; END;
  ASSERT v_dup, 'duplicate (date,scope,scope_key,metric) must violate unique';
  RAISE NOTICE 'metric_snapshot table assertions passed.';
END$$;
DO $$
DECLARE v_n integer; v_corpus numeric; v_again integer;
BEGIN
  -- grants : anon ne doit pas exécuter, service_role oui
  ASSERT NOT has_function_privilege('anon','api.capture_metric_snapshots(date)','EXECUTE'),
         'anon must NOT execute capture_metric_snapshots';

  v_n := api.capture_metric_snapshots(DATE '2026-06-18');
  ASSERT v_n > 0, 'capture must write rows';

  -- corpus global = total non-ORG
  SELECT value INTO v_corpus FROM public.metric_snapshot
   WHERE snapshot_date='2026-06-18' AND scope='global' AND metric_key='corpus_count';
  ASSERT v_corpus = (SELECT count(*) FROM object WHERE object_type<>'ORG'),
         'corpus_count global matches live count';

  -- complétude par type présente (HLO existe en publié)
  ASSERT EXISTS (SELECT 1 FROM public.metric_snapshot
                 WHERE snapshot_date='2026-06-18' AND scope='type'
                   AND metric_key='completeness_avg'),
         'completeness_avg per type captured';

  -- idempotence : re-run ⇒ pas de doublon, une seule ligne par clé
  v_again := api.capture_metric_snapshots(DATE '2026-06-18');
  ASSERT (SELECT count(*) FROM public.metric_snapshot
          WHERE snapshot_date='2026-06-18' AND scope='global'
            AND metric_key='corpus_count') = 1,
         'idempotent re-run keeps one row per key';
  RAISE NOTICE 'capture_metric_snapshots assertions passed.';
END$$;
ROLLBACK;
