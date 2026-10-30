-- test_metric_snapshot.sql
-- Final-schema contract: realm-scoped metric_snapshot + capture + reading.
-- Run AFTER the complete manifest, including dashboard_realm_consistency.
-- Self-contained + transactional (ROLLBACK).
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
SELECT set_config('request.jwt.claims', '{"role":"service_role","app_metadata":{"sandbox_discovery":false}}', true);
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
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='metric_snapshot'
                   AND column_name='is_test' AND data_type='boolean'), 'is_test realm column present';
  -- Une ligne par date/portée/métrique ET périmètre. Une autre capture du même
  -- jour met à jour cette ligne ; captured_at n'appartient pas à la clé unique.
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,is_test)
    VALUES ('2026-01-01','global','','__metric_snapshot_unique__',1,false);
  BEGIN
    INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,is_test)
      VALUES ('2026-01-01','global','','__metric_snapshot_unique__',2,false);
  EXCEPTION WHEN unique_violation THEN v_dup := true; END;
  ASSERT v_dup, 'duplicate (date,scope,scope_key,metric,is_test) must violate unique';
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,is_test) VALUES
    ('2026-01-01','global','','__metric_snapshot_unique__',3,true),
    ('2026-01-01','global','','__metric_snapshot_unique__',999,NULL);
  ASSERT (SELECT count(*) FROM public.metric_snapshot WHERE snapshot_date='2026-01-01'
          AND scope='global' AND scope_key='' AND metric_key='__metric_snapshot_unique__') = 3,
         'real, test and legacy archive can coexist for the same daily metric';
  RAISE NOTICE 'metric_snapshot table assertions passed.';
END$$;

-- Fixture (top-level, so REFRESH MATERIALIZED VIEW is permitted; transactional — rolled back with
-- the rest). The manifest seeds a sandbox corpus, which must not satisfy a real
-- completeness fixture. Create a production HLO to make that assertion independent.
-- Seed one PUBLISHED HLO AND refresh the filter MV that api.get_filtered_object_ids reads
-- (internal.mv_filtered_objects, the hot path) so HLO surfaces in the completeness rows — making
-- this test genuinely self-contained instead of assuming a live corpus. (fresh-apply gate 2026-07-01)
INSERT INTO object (object_type, name, status, region_code)
VALUES ('HLO', 'Test HLO complétude (fixture)', 'published', 'RUN');
REFRESH MATERIALIZED VIEW internal.mv_filtered_objects;

DO $$
DECLARE v_n integer; v_corpus numeric; v_again integer;
BEGIN
  -- grants : anon ne doit pas exécuter, service_role oui
  ASSERT NOT has_function_privilege('anon','api.capture_metric_snapshots(date)','EXECUTE'),
         'anon must NOT execute capture_metric_snapshots';
  ASSERT NOT has_function_privilege('authenticated','api.capture_metric_snapshots(date)','EXECUTE'),
         'ordinary users must NOT rewrite historical captures';
  ASSERT has_function_privilege('service_role','api.capture_metric_snapshots(date)','EXECUTE'),
         'service_role must execute scheduled captures';

  v_n := api.capture_metric_snapshots(DATE '2026-06-18');
  ASSERT v_n > 0, 'capture must write rows';

  -- Corpus global du périmètre réel, indépendamment du corpus de test.
  SELECT value INTO v_corpus FROM public.metric_snapshot
   WHERE snapshot_date='2026-06-18' AND scope='global' AND scope_key=''
     AND metric_key='corpus_count' AND is_test=false;
  ASSERT v_corpus = (SELECT count(*) FROM object WHERE object_type<>'ORG' AND is_test=false),
         'real corpus_count matches the real live count';
  ASSERT (SELECT value FROM public.metric_snapshot
           WHERE snapshot_date='2026-06-18' AND scope='global' AND scope_key=''
             AND metric_key='corpus_count' AND is_test=true)
         = (SELECT count(*) FROM object WHERE object_type<>'ORG' AND is_test=true),
         'test corpus_count matches the test live count';

  -- complétude par type présente (HLO existe en publié)
  ASSERT EXISTS (SELECT 1 FROM public.metric_snapshot
                 WHERE snapshot_date='2026-06-18' AND scope='type' AND scope_key='HLO' AND is_test=false
                   AND metric_key='completeness_avg'),
         'completeness_avg per type captured';

  -- idempotence : re-run ⇒ pas de doublon, une seule ligne par clé
  v_again := api.capture_metric_snapshots(DATE '2026-06-18');
  ASSERT v_again = v_n, 'idempotent re-run returns the same row count';
  ASSERT (SELECT count(*) FROM public.metric_snapshot
          WHERE snapshot_date='2026-06-18' AND scope='global' AND scope_key=''
            AND metric_key='corpus_count' AND is_test=false) = 1,
         'idempotent re-run keeps one real row per key';
  ASSERT (SELECT count(*) FROM public.metric_snapshot
          WHERE snapshot_date='2026-06-18' AND scope='global' AND scope_key=''
            AND metric_key='corpus_count' AND is_test=true) = 1,
         'idempotent re-run keeps one test row per key';
  RAISE NOTICE 'capture_metric_snapshots assertions passed.';
END$$;

DO $$
DECLARE v_pts integer; v_yoy integer;
BEGIN
  ASSERT has_function_privilege('authenticated',
    'api.get_metric_snapshot_series(text,text,text,date,date,text)','EXECUTE'),
    'authenticated must execute get_metric_snapshot_series';

  -- jeu d'essai : 2 jours du même mois + 1 jour l'an précédent
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,is_test) VALUES
    ('2026-03-10','global','','corpus_count',800,false),
    ('2026-03-28','global','','corpus_count',820,false),  -- dernier relevé réel du mois
    ('2025-03-15','global','','corpus_count',700,false),
    ('2026-03-30','global','','corpus_count',9000,true),
    ('2024-03-15','global','','corpus_count',600,true),
    ('2026-03-31','global','','corpus_count',9999,NULL); -- archive plus récente, jamais affichée

  -- série mensuelle : le bucket 2026-03 retient la DERNIÈRE valeur (820)
  SELECT count(*) INTO v_pts FROM api.get_metric_snapshot_series('corpus_count','global','','2026-01-01','2026-12-31','month');
  ASSERT v_pts >= 1, 'series returns the 2026-03 bucket';
  ASSERT (SELECT value FROM api.get_metric_snapshot_series('corpus_count','global','','2026-03-01','2026-03-31','month')
          LIMIT 1) = 820, 'stock semantics: last snapshot of the month wins';

  -- YoY : 2025 et 2026 présents pour le mois 3
  SELECT count(*) INTO v_yoy FROM api.get_metric_snapshot_yoy('corpus_count','global','',5) WHERE mon=3;
  ASSERT v_yoy = 2, 'YoY returns both 2025 and 2026 for month 3';
  RAISE NOTICE 'get_metric_snapshot_series/_yoy assertions passed.';
END$$;

SELECT set_config('request.jwt.claims', '{"role":"service_role","app_metadata":{"sandbox_discovery":true}}', true);
DO $$
BEGIN
  ASSERT (SELECT value FROM api.get_metric_snapshot_series('corpus_count','global','','2026-03-01','2026-03-31','month')) = 9000,
         'test series excludes real values and later unknown archives';
  ASSERT (SELECT count(*) FROM api.get_metric_snapshot_yoy('corpus_count','global','',5) WHERE mon=3) = 2,
         'test YoY includes 2024/2026 and excludes real-only 2025';
  RAISE NOTICE 'metric_snapshot realm isolation assertions passed.';
END$$;
ROLLBACK;
