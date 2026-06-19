-- migration_metric_snapshot.sql — Brique 2 (manifest 14s)
-- Registre temporel des stats dashboard (séries + YoY). Idempotent.
-- Folded into schema_unified.sql (table) + api_views_functions.sql (functions).
BEGIN;

CREATE TABLE IF NOT EXISTS public.metric_snapshot (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  scope         text NOT NULL,            -- 'global' | 'type' | 'category' | 'commune' | 'status'
  scope_key     text NOT NULL DEFAULT '', -- '' pour 'global' ; ex. 'HLO', 'Le Tampon', 'published'
  metric_key    text NOT NULL,            -- ex. 'completeness_avg', 'corpus_count', 'classified_count'
  value         numeric NOT NULL,
  denominator   integer,                  -- ex. 'total' du type (recompose un %)
  captured_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_metric_snapshot UNIQUE (snapshot_date, scope, scope_key, metric_key)
);
CREATE INDEX IF NOT EXISTS idx_metric_snapshot_read
  ON public.metric_snapshot (metric_key, scope, scope_key, snapshot_date);

COMMENT ON TABLE public.metric_snapshot IS
'Registre temporel faisant foi des stats dashboard (Brique 2). Long-format: une ligne par
(snapshot_date, scope, scope_key, metric_key). Agrégats non-PII. Écrit par
api.capture_metric_snapshots (cron quotidien), lu par api.get_metric_snapshot_series / _yoy.';

ALTER TABLE public.metric_snapshot ENABLE ROW LEVEL SECURITY;
-- Agrégats non-PII : lecture authenticated OK ; écritures uniquement via la fonction
-- SECURITY DEFINER / service_role (aucune policy write ⇒ deny pour anon/authenticated).
DROP POLICY IF EXISTS metric_snapshot_read ON public.metric_snapshot;
CREATE POLICY metric_snapshot_read ON public.metric_snapshot
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.metric_snapshot TO authenticated;

COMMIT;
