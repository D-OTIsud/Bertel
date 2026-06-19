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
ROLLBACK;
