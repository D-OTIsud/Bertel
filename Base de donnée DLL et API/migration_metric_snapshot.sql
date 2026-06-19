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

CREATE OR REPLACE FUNCTION api.capture_metric_snapshots(p_date date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $fn$
DECLARE
  v_comp jsonb;
  v_rows integer;
BEGIN
  -- 1. Complétude (pool publié) — contrat figé api.get_dashboard_completeness
  v_comp := api.get_dashboard_completeness(NULL, ARRAY['published']::object_status[],
                                           '{}'::jsonb, NULL, NULL, 0);

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'type',r->>'type','completeness_avg',(r->>'avg_score')::numeric,(r->>'total')::int
  FROM jsonb_array_elements(v_comp->'rows') r
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key)
    DO UPDATE SET value=EXCLUDED.value, denominator=EXCLUDED.denominator, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'type',r->>'type','completeness_complete_pct',(r->>'complete_pct')::numeric,(r->>'total')::int
  FROM jsonb_array_elements(v_comp->'rows') r
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key)
    DO UPDATE SET value=EXCLUDED.value, denominator=EXCLUDED.denominator, captured_at=now();

  -- moyenne globale pondérée par le nombre de fiches
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','completeness_avg',
         ROUND(SUM((r->>'avg_score')::numeric*(r->>'total')::numeric)
               / NULLIF(SUM((r->>'total')::numeric),0),1),
         SUM((r->>'total')::int)
  FROM jsonb_array_elements(v_comp->'rows') r
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key)
    DO UPDATE SET value=EXCLUDED.value, denominator=EXCLUDED.denominator, captured_at=now();

  -- 2. Corpus net (tous statuts, hors ORG) : global / type / statut
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','corpus_count',count(*),NULL FROM object WHERE object_type<>'ORG'
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'type',object_type::text,'corpus_count',count(*),NULL
  FROM object WHERE object_type<>'ORG' GROUP BY object_type
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'status',status::text,'corpus_count',count(*),NULL
  FROM object WHERE object_type<>'ORG' GROUP BY status
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  -- 3. Classés (granted) : global + par commune
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','classified_count',count(DISTINCT object_id),NULL
  FROM object_classification WHERE status='granted'
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'commune',COALESCE(NULLIF(btrim(ol.city),''),'(inconnu)'),'classified_count',
         count(DISTINCT oc.object_id),NULL
  FROM object_classification oc
  JOIN object_location ol ON ol.object_id=oc.object_id AND ol.is_main_location=true
  WHERE oc.status='granted' GROUP BY 3
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  -- 4. Couverture : durabilité / accessibilité
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','sustainability_count',count(DISTINCT object_id),NULL
  FROM object_sustainability_action
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','accessibility_count',count(DISTINCT oa.object_id),NULL
  FROM object_amenity oa
  JOIN ref_amenity ra ON ra.id=oa.amenity_id
  JOIN ref_code_amenity_family f ON f.id=ra.family_id
  WHERE f.code='accessibility'
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  -- 5. Backlog CRM (provisoire jusqu'à Brique 3 : non résolu ET statut <> 'done')
  INSERT INTO public.metric_snapshot(snapshot_date,scope,scope_key,metric_key,value,denominator)
  SELECT p_date,'global','','crm_backlog',count(*),NULL
  FROM crm_interaction WHERE resolved_at IS NULL AND status::text <> 'done'
  ON CONFLICT (snapshot_date,scope,scope_key,metric_key) DO UPDATE SET value=EXCLUDED.value, captured_at=now();

  SELECT count(*) INTO v_rows FROM public.metric_snapshot WHERE snapshot_date=p_date;
  RETURN v_rows;
END$fn$;

COMMENT ON FUNCTION api.capture_metric_snapshots(date) IS
'Brique 2: fige le panel de KPIs dashboard pour p_date dans metric_snapshot (upsert idempotent).
Complétude via api.get_dashboard_completeness (pool publié), corpus net (tous statuts), classés
(granted, global+commune), couverture durable/accessibilité, backlog CRM (provisoire avant Brique 3).
Exécutée par le cron quotidien capture-metric-snapshots.';

REVOKE ALL ON FUNCTION api.capture_metric_snapshots(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.capture_metric_snapshots(date) TO service_role;

COMMIT;
