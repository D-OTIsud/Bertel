-- Both provider modes start from the caller's real/test realm.
-- Existing unsegmented snapshots remain untouched (is_test IS NULL).
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION internal.dashboard_object_ids()
RETURNS TABLE(object_id text) LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
  SELECT o.id FROM public.object o
  WHERE o.object_type <> 'ORG'
    AND o.is_test = (SELECT api.current_user_test_realm());
$fn$;
REVOKE ALL ON FUNCTION internal.dashboard_object_ids() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal.dashboard_crm_interactions()
RETURNS SETOF public.crm_interaction LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
  WITH realm AS MATERIALIZED (SELECT api.current_user_test_realm() AS is_test)
  SELECT ci.* FROM public.crm_interaction ci
  CROSS JOIN realm r
  LEFT JOIN public.object o ON o.id = ci.object_id
  LEFT JOIN public.actor a ON a.id = ci.actor_id
  WHERE (ci.object_id IS NOT NULL OR ci.actor_id IS NOT NULL)
    AND (ci.object_id IS NULL OR o.is_test = r.is_test)
    AND (ci.actor_id IS NULL OR a.is_test = r.is_test);
$fn$;
REVOKE ALL ON FUNCTION internal.dashboard_crm_interactions() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal.provider_object_ids()
 RETURNS TABLE(object_id text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'api', 'pg_temp'
AS $function$
  SELECT o.object_id FROM internal.dashboard_object_ids() o
  WHERE EXISTS (
      SELECT 1 FROM public.actor_object_role provider_link
      WHERE provider_link.object_id = o.object_id
        AND (provider_link.valid_from IS NULL OR provider_link.valid_from <= (now() AT TIME ZONE 'Indian/Reunion')::date)
        AND (provider_link.valid_to IS NULL OR provider_link.valid_to >= (now() AT TIME ZONE 'Indian/Reunion')::date)
    );
$function$;

CREATE OR REPLACE FUNCTION internal.provider_crm_interactions()
 RETURNS SETOF crm_interaction
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'api', 'internal', 'pg_temp'
AS $function$
  WITH objects AS MATERIALIZED (SELECT object_id FROM internal.provider_object_ids())
  SELECT ci.* FROM internal.dashboard_crm_interactions() ci
  WHERE ci.object_id IN (SELECT object_id FROM objects)
    OR (ci.object_id IS NULL AND EXISTS (
      SELECT 1 FROM public.actor_object_role provider_link
      WHERE provider_link.actor_id = ci.actor_id
        AND provider_link.object_id IN (SELECT object_id FROM objects)
        AND (provider_link.valid_from IS NULL OR provider_link.valid_from <= (now() AT TIME ZONE 'Indian/Reunion')::date)
        AND (provider_link.valid_to IS NULL OR provider_link.valid_to >= (now() AT TIME ZONE 'Indian/Reunion')::date)
    ));
$function$;

CREATE OR REPLACE FUNCTION api.get_dashboard_team_activity()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'extensions', 'auth', 'audit', 'crm', 'ref'
AS $function$
DECLARE
  -- Douze semaines : un trimestre, l'horizon sur lequel une équipe reconnaît son propre
  -- rythme. La MÊME fenêtre borne les semaines ET les contributeurs — deux horizons côte à
  -- côte dans un seul onglet donneraient deux vérités pour une réalité.
  c_weeks           constant int  := 12;
  -- Journée de MASSE. Voir « trois pièges » en en-tête : la distribution est bimodale et
  -- rien ne vit entre 10 et 57. Ce n'est pas un curseur à régler mais une hypothèse : si la
  -- distribution se remplit entre les deux modes, le seuil doit être rediscuté.
  c_bulk_threshold  constant int  := 10;
  v_from            date;
  v_result          jsonb;
BEGIN
  IF auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_from := (date_trunc('week', current_date) - ((c_weeks - 1) || ' weeks')::interval)::date;

  WITH weeks AS (
    SELECT generate_series(v_from,
                           date_trunc('week', current_date)::date,
                           interval '1 week')::date AS week_start
  ),
  -- `created_by IS NULL` (imports, système) EXCLU ici, une fois, pour tout le fichier.
  authored AS (
    SELECT ov.created_by, ov.object_id, ov.change_type,
           ov.created_at,
           ov.created_at::date                        AS day,
           date_trunc('week', ov.created_at)::date    AS week_start
    FROM   object_version ov
    WHERE  ov.created_by IS NOT NULL
      AND ov.object_id IN (SELECT object_id FROM internal.dashboard_object_ids())
      AND  ov.created_at >= v_from
  ),
  -- ⚠ ON AGRÈGE ICI, AVANT LA JOINTURE. Voir le piège n°1 de l'en-tête : agrégé au-dessus
  -- du LEFT JOIN, `count(DISTINCT (created_by, day))` compterait le ROW(NULL,NULL) fabriqué
  -- par la jointure et une semaine vide rapporterait 1 jour-éditeur.
  per_week AS (
    SELECT a.week_start,
           count(DISTINCT (a.created_by, a.day))::int                        AS editor_days,
           count(DISTINCT a.created_by)::int                                 AS editors,
           count(DISTINCT a.object_id)::int                                  AS objects_touched,
           count(DISTINCT a.object_id) FILTER (WHERE a.change_type = 'insert')::int AS created
    FROM   authored a
    GROUP  BY a.week_start
  ),
  per_editor_day AS (
    SELECT a.created_by, a.day, count(DISTINCT a.object_id) AS objects_that_day
    FROM   authored a
    GROUP  BY a.created_by, a.day
  ),
  contributors AS (
    SELECT a.created_by                                                       AS user_id,
           api.crm_user_label(a.created_by, p.display_name)                   AS display_name,
           count(DISTINCT a.day)::int                                         AS active_days,
           count(DISTINCT a.object_id)::int                                   AS objects_touched,
           (SELECT count(*) FROM per_editor_day d
             WHERE d.created_by = a.created_by
               AND d.objects_that_day >= c_bulk_threshold)::int               AS bulk_days,
           min(a.created_at)                                                  AS first_at,
           max(a.created_at)                                                  AS last_at
    FROM   authored a
    LEFT   JOIN app_user_profile p ON p.id = a.created_by
    GROUP  BY a.created_by, p.display_name
  )
  SELECT jsonb_build_object(
    'weeks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'week_start',      w.week_start,
               -- Une semaine sans activité sort à ZÉRO sur toute la ligne, jamais omise :
               -- un trou dans une série se lit comme « pas de données », pas comme « pas de
               -- travail », et les deux ne veulent pas dire la même chose.
               'editor_days',     COALESCE(pw.editor_days, 0),
               'editors',         COALESCE(pw.editors, 0),
               'objects_touched', COALESCE(pw.objects_touched, 0),
               'created',         COALESCE(pw.created, 0))
             ORDER BY w.week_start)
      FROM weeks w LEFT JOIN per_week pw ON pw.week_start = w.week_start), '[]'::jsonb),
    'contributors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'user_id',         c.user_id,
               'display_name',    c.display_name,
               'active_days',     c.active_days,
               'objects_touched', c.objects_touched,
               'bulk_days',       c.bulk_days,
               'first_at',        c.first_at,
               'last_at',         c.last_at)
             ORDER BY c.active_days DESC, c.objects_touched DESC, c.user_id)
      FROM contributors c), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END $function$;
REVOKE ALL ON FUNCTION api.get_dashboard_team_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_dashboard_team_activity() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.get_dashboard_crm_activity()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'extensions', 'auth', 'audit', 'crm', 'ref'
AS $function$
DECLARE
  c_months constant int := 12;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  WITH open_interactions AS (
    -- MÊME prédicat que crm_backlog et que la carte du bandeau (17g) : la liste positive
    -- TYPÉE des statuts ouverts. Une comparaison en TEXTE désarmerait le typage et
    -- survivrait muette à tout renommage, en se réduisant à `resolved_at IS NULL`.
    SELECT ci.id, ci.occurred_at, ci.demand_topic_id
    FROM   internal.dashboard_crm_interactions() ci
    WHERE  ci.resolved_at IS NULL
      AND  ci.status = ANY (ARRAY['new','in_progress','awaiting_provider']::crm_status[])
  ),
  -- Les QUATRE tranches sont une liste FERMÉE, à gauche du LEFT JOIN : une tranche vide sort
  -- à zéro, elle n'est jamais omise. Au 31/08 `d30_90` est vide sur la base vive — un widget
  -- qui n'affiche que les tranches peuplées ment par omission sur la forme de l'arriéré.
  age_buckets AS (
    SELECT * FROM (VALUES ('lt_30d', 1), ('d30_90', 2), ('d90_1y', 3), ('gt_1y', 4))
                  AS t(bucket, ord)
  ),
  aged AS (
    SELECT CASE
             WHEN o.occurred_at >= now() - interval '30 days' THEN 'lt_30d'
             WHEN o.occurred_at >= now() - interval '90 days' THEN 'd30_90'
             WHEN o.occurred_at >= now() - interval '1 year'  THEN 'd90_1y'
             ELSE 'gt_1y'          -- une date d'occurrence absente vieillit au maximum :
           END AS bucket,          -- on ne rajeunit jamais une demande faute d'information
           count(*)::int AS n
    FROM   open_interactions o
    GROUP  BY 1
  ),
  by_topic AS (
    SELECT t.code                                                   AS code,
           -- `name` n'est JAMAIS nul : une demande sans sujet se regroupe sous un libellé
           -- explicite. Une case vide dans une légende se lit comme un bug d'affichage.
           COALESCE(t.name, 'Sans sujet')                           AS name,
           count(*)::int                                            AS n,
           min(o.occurred_at)                                       AS oldest
    FROM   open_interactions o
    LEFT   JOIN ref_code_demand_topic t ON t.id = o.demand_topic_id
    GROUP  BY t.code, t.name
  ),
  months AS (
    SELECT generate_series(
             (date_trunc('month', current_date) - ((c_months - 1) || ' months')::interval)::date,
             date_trunc('month', current_date)::date,
             interval '1 month')::date AS month
  ),
  flow AS (
    SELECT m.month,
           (SELECT count(*) FROM internal.dashboard_crm_interactions() ci
             WHERE ci.occurred_at >= m.month
               AND ci.occurred_at <  (m.month + interval '1 month'))::int AS created,
           (SELECT count(*) FROM internal.dashboard_crm_interactions() ci
             WHERE ci.resolved_at >= m.month
               AND ci.resolved_at <  (m.month + interval '1 month'))::int AS resolved
    FROM   months m
  ),
  -- ─── TEMPS DE TRAITEMENT NET ───
  -- Requête de référence prouvée par le bloc (F) de tests/test_crm_lifecycle.sql.
  -- DEUX niveaux OBLIGATOIRES : la fenêtre LEAD se calcule AVANT tout filtre et tout agrégat.
  -- Un SUM par-dessus un LEAD au même niveau est une ERREUR PostgreSQL, et fenêtrer après un
  -- `WHERE to_status = 'awaiting_provider'` perdrait la borne de fin du séjour — l'événement
  -- SUIVANT, quel que soit son statut.
  events AS (
    SELECT e.interaction_id, e.to_status, e.changed_at,
           LEAD(e.changed_at) OVER (PARTITION BY e.interaction_id ORDER BY e.changed_at) AS next_at
    FROM   crm_interaction_status_event e
  ),
  -- Seules les demandes NÉES APRÈS LA BASCULE entrent dans la moyenne : leur premier
  -- événement de journal est la création. Les 1 721 lignes importées sans date de résolution
  -- (invariant §218 : aucune date inventée) n'en ont pas et sont donc hors moyenne PAR
  -- CONSTRUCTION — pas par une exclusion qu'il faudrait penser à maintenir.
  births AS (
    SELECT DISTINCT e.interaction_id
    FROM   crm_interaction_status_event e
    WHERE  e.from_status IS NULL
  ),
  waits AS (
    SELECT ev.interaction_id,
           SUM(EXTRACT(EPOCH FROM (COALESCE(ev.next_at, ci.resolved_at) - ev.changed_at)) / 86400.0)
             AS wait_days   -- un séjour en attente non refermé se termine à resolved_at
    FROM   events ev
    JOIN   internal.dashboard_crm_interactions() ci ON ci.id = ev.interaction_id
    WHERE  ev.to_status = 'awaiting_provider'
    GROUP  BY ev.interaction_id
  ),
  net AS (
    SELECT EXTRACT(EPOCH FROM (ci.resolved_at - ci.occurred_at)) / 86400.0
           - COALESCE(w.wait_days, 0) AS net_days
    FROM   internal.dashboard_crm_interactions() ci
    JOIN   births b   ON b.interaction_id = ci.id
    LEFT   JOIN waits w ON w.interaction_id = ci.id
    WHERE  ci.resolved_at IS NOT NULL
      -- `canceled` EXCLU (arbitrage plan n°3) : une demande annulée n'a pas été traitée,
      -- son délai ne dit rien du travail de l'équipe.
      AND  ci.status = ANY (ARRAY['resolved','closed']::crm_status[])
  )
  SELECT jsonb_build_object(
    'open_by_age', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('bucket', b.bucket, 'count', COALESCE(a.n, 0))
                       ORDER BY b.ord)
      FROM age_buckets b LEFT JOIN aged a ON a.bucket = b.bucket), '[]'::jsonb),
    'open_by_topic', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('code', bt.code, 'name', bt.name,
                                          'count', bt.n, 'oldest', bt.oldest)
                       ORDER BY bt.n DESC, bt.name)
      FROM by_topic bt), '[]'::jsonb),
    'monthly_flow', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('month', f.month, 'created', f.created,
                                          'resolved', f.resolved)
                       ORDER BY f.month)
      FROM flow f), '[]'::jsonb),
    'net', (
      -- `avg_days` reste NULL tant qu'aucune demande n'a bouclé un cycle complet depuis la
      -- bascule. NULL veut dire « pas encore mesurable » ; zéro voudrait dire « instantané ».
      SELECT jsonb_build_object('avg_days', round(avg(n.net_days)::numeric, 2),
                                'count',    count(*)::int)
      FROM net n)
  ) INTO v_result;

  RETURN v_result;
END $function$;
REVOKE ALL ON FUNCTION api.get_dashboard_crm_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_dashboard_crm_activity() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.get_dashboard_crm_open()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'extensions', 'auth', 'audit', 'crm', 'ref'
AS $function$
BEGIN
  IF auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN (
WITH interactions AS (
    SELECT count(*)::int AS n
  -- Mêmes statuts ouverts que la carte globale, dans le périmètre réel/test courant.
  FROM internal.dashboard_crm_interactions()
  WHERE resolved_at IS NULL
    AND status = ANY (ARRAY['new','in_progress','awaiting_provider']::crm_status[])
  ),
  ages AS (
    -- « Récent » vs « arriéré » sur le MÊME ensemble que le CTE ci-dessus. `backlog` est
    -- calculé par SOUSTRACTION et non par un second prédicat d'âge : la somme des deux égale
    -- alors le total PAR CONSTRUCTION, et une demande sans date d'occurrence tombe dans
    -- l'arriéré plutôt que de disparaître entre deux bornes.
    SELECT count(*) FILTER (WHERE ci.occurred_at >= now() - interval '90 days')::int AS recent,
           (count(*) - count(*) FILTER (WHERE ci.occurred_at >= now() - interval '90 days'))::int
             AS backlog
    FROM   internal.dashboard_crm_interactions() ci
    WHERE  ci.resolved_at IS NULL
      AND  ci.status = ANY (ARRAY['new','in_progress','awaiting_provider']::crm_status[])
  ),
  tasks AS (
    -- ⚠ VOCABULAIRE DES TÂCHES (crm_task_status), PAS celui des demandes. Ces cinq lignes ne
    -- bougent PAS avec le cycle de vie des demandes : `in_progress` est ici un statut de TÂCHE.
    SELECT count(*)::int AS n
    FROM   (SELECT * FROM public.crm_task WHERE internal.crm_row_in_current_realm(object_id, actor_id)) AS crm_task
    WHERE  status::text IN ('todo', 'in_progress', 'blocked')
  )
  SELECT jsonb_build_object(
    'open_interactions',    i.n,
    'open_tasks',           t.n,
    'total',                i.n + t.n,
    'recent_interactions',  a.recent,
    'backlog_interactions', a.backlog
  )
  FROM interactions i, tasks t, ages a
  );
END $function$;
REVOKE ALL ON FUNCTION api.get_dashboard_crm_open() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_dashboard_crm_open() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.get_dashboard_provider_crm_open()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'extensions', 'auth', 'audit', 'crm', 'ref'
AS $function$
BEGIN
  IF auth.uid() IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN (
WITH interactions AS (
    SELECT count(*)::int AS n
  -- Mêmes statuts ouverts que la carte globale, sur le corpus prestataires.
  FROM internal.provider_crm_interactions()
  WHERE resolved_at IS NULL
    AND status = ANY (ARRAY['new','in_progress','awaiting_provider']::crm_status[])
  ),
  ages AS (
    -- « Récent » vs « arriéré » sur le MÊME ensemble que le CTE ci-dessus. `backlog` est
    -- calculé par SOUSTRACTION et non par un second prédicat d'âge : la somme des deux égale
    -- alors le total PAR CONSTRUCTION, et une demande sans date d'occurrence tombe dans
    -- l'arriéré plutôt que de disparaître entre deux bornes.
    SELECT count(*) FILTER (WHERE ci.occurred_at >= now() - interval '90 days')::int AS recent,
           (count(*) - count(*) FILTER (WHERE ci.occurred_at >= now() - interval '90 days'))::int
             AS backlog
    FROM   internal.provider_crm_interactions() ci
    WHERE  ci.resolved_at IS NULL
      AND  ci.status = ANY (ARRAY['new','in_progress','awaiting_provider']::crm_status[])
  ),
  tasks AS (
    -- ⚠ VOCABULAIRE DES TÂCHES (crm_task_status), PAS celui des demandes. Ces cinq lignes ne
    -- bougent PAS avec le cycle de vie des demandes : `in_progress` est ici un statut de TÂCHE.
    SELECT count(*)::int AS n
    FROM   (SELECT * FROM public.crm_task WHERE internal.crm_row_in_current_realm(object_id, actor_id) AND object_id IN (SELECT object_id FROM internal.provider_object_ids())) AS crm_task
    WHERE  status::text IN ('todo', 'in_progress', 'blocked')
  )
  SELECT jsonb_build_object(
    'open_interactions',    i.n,
    'open_tasks',           t.n,
    'total',                i.n + t.n,
    'recent_interactions',  a.recent,
    'backlog_interactions', a.backlog
  )
  FROM interactions i, tasks t, ages a
  );
END $function$;

-- NULL explicitly means legacy/unknown, never implicitly production.
-- No existing snapshot is reclassified, overwritten or deleted.
ALTER TABLE public.metric_snapshot ADD COLUMN IF NOT EXISTS is_test boolean;
COMMENT ON COLUMN public.metric_snapshot.is_test IS
  'Snapshot realm: false=real, true=test, NULL=legacy aggregate without proven separation.';

DO $constraint$
DECLARE definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
  WHERE conrelid = 'public.metric_snapshot'::regclass AND conname = 'uq_metric_snapshot';
  IF definition = 'UNIQUE (snapshot_date, scope, scope_key, metric_key)' THEN
    ALTER TABLE public.metric_snapshot DROP CONSTRAINT uq_metric_snapshot;
    ALTER TABLE public.metric_snapshot ADD CONSTRAINT uq_metric_snapshot
      UNIQUE (snapshot_date, scope, scope_key, metric_key, is_test);
  ELSIF definition IS DISTINCT FROM 'UNIQUE (snapshot_date, scope, scope_key, metric_key, is_test)' THEN
    RAISE EXCEPTION 'Unexpected metric_snapshot unique constraint: %', definition;
  END IF;
END $constraint$;

ALTER POLICY metric_snapshot_read ON public.metric_snapshot
  USING (is_test = (SELECT api.current_user_test_realm()));

-- Explicit realm argument for the scheduled writer: no JWT impersonation, no
-- reliance on the current account, and the same completeness rounding as the live KPI.
CREATE OR REPLACE FUNCTION internal.capture_dashboard_realm_snapshots(p_date date, p_is_test boolean)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, internal, api, pg_temp
AS $fn$
DECLARE v_rows integer;
BEGIN
  IF p_date IS NULL OR p_is_test IS NULL THEN
    RAISE EXCEPTION 'Snapshot date and realm are required' USING ERRCODE = '22023';
  END IF;

  WITH objects AS MATERIALIZED (
    SELECT o.id, o.object_type, o.status FROM public.object o
    WHERE o.object_type <> 'ORG' AND o.is_test = p_is_test
  ),
  scored AS (
    SELECT e.object_type,
      ROUND(100.0 * (
        e.e_name::int + e.e_subcat::int + e.e_location::int + e.e_contact::int + e.e_desc::int
        + LEAST(e.n_photos::numeric / e.photo_target, 1.0) + e.e_typeblock::int + e.e_tags::int
      ) / 8.0)::int AS score,
      (e.e_name AND e.e_subcat AND e.e_location AND e.e_contact AND e.e_desc
       AND e.n_photos >= e.photo_target AND e.e_typeblock AND e.e_tags) AS complete
    FROM internal.v_object_essentials e
    JOIN objects o ON o.id = e.object_id WHERE o.status = 'published'
  ),
  completeness AS (
    SELECT object_type, COUNT(*)::int AS total,
      ROUND(AVG(score))::int AS avg_score,
      ROUND(100.0 * COUNT(*) FILTER (WHERE complete) / NULLIF(COUNT(*), 0), 1) AS complete_pct
    FROM scored GROUP BY object_type
  ),
  crm AS (
    SELECT ci.* FROM public.crm_interaction ci
    LEFT JOIN public.object o ON o.id = ci.object_id
    LEFT JOIN public.actor a ON a.id = ci.actor_id
    WHERE (ci.object_id IS NOT NULL OR ci.actor_id IS NOT NULL)
      AND (ci.object_id IS NULL OR o.is_test = p_is_test)
      AND (ci.actor_id IS NULL OR a.is_test = p_is_test)
  ),
  metrics(scope, scope_key, metric_key, value, denominator) AS (
    SELECT 'type'::text, object_type::text, 'completeness_avg'::text, avg_score::numeric, total
      FROM completeness
    UNION ALL
    SELECT 'type', object_type::text, 'completeness_complete_pct', complete_pct, total FROM completeness
    UNION ALL
    SELECT 'global', '', 'completeness_avg',
      ROUND(SUM(avg_score::numeric * total) / NULLIF(SUM(total), 0), 1), SUM(total)::int
      FROM completeness HAVING SUM(total) > 0
    UNION ALL
    SELECT 'global', '', 'corpus_count', count(*), NULL::int FROM objects
    UNION ALL
    SELECT 'type', object_type::text, 'corpus_count', count(*), NULL::int FROM objects GROUP BY object_type
    UNION ALL
    SELECT 'status', status::text, 'corpus_count', count(*), NULL::int FROM objects GROUP BY status
    UNION ALL
    SELECT 'global', '', 'classified_count', count(DISTINCT oc.object_id), NULL::int
      FROM public.object_classification oc JOIN objects o ON o.id = oc.object_id WHERE oc.status = 'granted'
    UNION ALL
    SELECT 'commune', COALESCE(NULLIF(btrim(ol.city), ''), '(inconnu)'), 'classified_count',
      count(DISTINCT oc.object_id), NULL::int
      FROM public.object_classification oc JOIN objects o ON o.id = oc.object_id
      JOIN public.object_location ol ON ol.object_id = oc.object_id AND ol.is_main_location
      WHERE oc.status = 'granted' GROUP BY 2
    UNION ALL
    SELECT 'global', '', 'sustainability_count', count(DISTINCT osa.object_id), NULL::int
      FROM public.object_sustainability_action osa JOIN objects o ON o.id = osa.object_id
    UNION ALL
    SELECT 'global', '', 'accessibility_count', count(DISTINCT oa.object_id), NULL::int
      FROM public.object_amenity oa JOIN objects o ON o.id = oa.object_id
      JOIN public.ref_amenity ra ON ra.id = oa.amenity_id
      JOIN public.ref_code_amenity_family f ON f.id = ra.family_id WHERE f.code = 'accessibility'
    UNION ALL
    SELECT 'global', '', 'crm_backlog', count(*), NULL::int FROM crm
      WHERE resolved_at IS NULL
        AND status = ANY (ARRAY['new','in_progress','awaiting_provider']::public.crm_status[])
  )
  INSERT INTO public.metric_snapshot(snapshot_date, scope, scope_key, metric_key, value, denominator, is_test)
  SELECT p_date, scope, scope_key, metric_key, value, denominator, p_is_test FROM metrics
  ON CONFLICT (snapshot_date, scope, scope_key, metric_key, is_test)
    DO UPDATE SET value = EXCLUDED.value, denominator = EXCLUDED.denominator, captured_at = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END $fn$;
REVOKE ALL ON FUNCTION internal.capture_dashboard_realm_snapshots(date, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION api.capture_metric_snapshots(p_date date DEFAULT current_date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, pg_temp
AS $fn$
DECLARE v_real integer; v_test integer;
BEGIN
  v_real := internal.capture_dashboard_realm_snapshots(p_date, false);
  v_test := internal.capture_dashboard_realm_snapshots(p_date, true);
  RETURN v_real + v_test;
END $fn$;
REVOKE ALL ON FUNCTION api.capture_metric_snapshots(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.capture_metric_snapshots(date) TO service_role;

CREATE OR REPLACE FUNCTION api.get_metric_snapshot_series(p_metric_key text, p_scope text DEFAULT 'global'::text, p_scope_key text DEFAULT ''::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_grain text DEFAULT 'month'::text)
 RETURNS TABLE(bucket date, value numeric, denominator integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api'
AS $function$
  WITH src AS (
    SELECT date_trunc(p_grain, snapshot_date)::date AS bucket,
           snapshot_date, value, denominator,
           ROW_NUMBER() OVER (PARTITION BY date_trunc(p_grain, snapshot_date)
                              ORDER BY snapshot_date DESC) AS rn
    FROM public.metric_snapshot
    WHERE is_test = (SELECT api.current_user_test_realm())
      AND metric_key = p_metric_key
      AND scope      = p_scope
      AND scope_key  = p_scope_key
      AND (p_from IS NULL OR snapshot_date >= p_from)
      AND (p_to   IS NULL OR snapshot_date <= p_to)
  )
  SELECT bucket, value, denominator FROM src WHERE rn = 1 ORDER BY bucket;
$function$;

CREATE OR REPLACE FUNCTION api.get_metric_snapshot_yoy(p_metric_key text, p_scope text DEFAULT 'global'::text, p_scope_key text DEFAULT ''::text, p_years integer DEFAULT 3)
 RETURNS TABLE(yr integer, mon integer, value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api'
AS $function$
  WITH monthly AS (
    SELECT EXTRACT(YEAR  FROM snapshot_date)::int AS yr,
           EXTRACT(MONTH FROM snapshot_date)::int AS mon,
           value,
           ROW_NUMBER() OVER (PARTITION BY date_trunc('month', snapshot_date)
                              ORDER BY snapshot_date DESC) AS rn
    FROM public.metric_snapshot
    WHERE is_test = (SELECT api.current_user_test_realm())
      AND metric_key = p_metric_key AND scope = p_scope AND scope_key = p_scope_key
  )
  SELECT yr, mon, value FROM monthly
  WHERE rn = 1 AND yr > (EXTRACT(YEAR FROM current_date)::int - p_years)
  ORDER BY yr, mon;
$function$;

COMMENT ON FUNCTION api.get_dashboard_crm_open() IS
  'Open CRM counters in the caller real/test realm, independent of object facets. Provider RPC uses the same base realm.';
COMMENT ON FUNCTION api.get_dashboard_crm_activity() IS
  'CRM age, topics, flow and net processing time in the caller real/test realm.';
COMMENT ON FUNCTION api.get_dashboard_team_activity() IS
  'Twelve weeks of author activity on tourism objects in the caller real/test realm; unchanged editor-day formulas.';
COMMENT ON FUNCTION api.capture_metric_snapshots(date) IS
  'Capture current real and test KPI stocks independently. p_date labels a current capture, not a historical reconstruction.';

-- Start truthful separated history today, preserving every legacy aggregate.
SELECT api.capture_metric_snapshots((now() AT TIME ZONE 'Indian/Reunion')::date);
NOTIFY pgrst, 'reload schema';
COMMIT;
