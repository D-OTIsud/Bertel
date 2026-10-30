-- Périmètre prestataires commun à l'explorateur et au dashboard.
-- Aucun backfill de préférences ni de relevés historiques : défaut false.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- Fusion atomique d'UNE clé ; ne remplace jamais les autres préférences.
-- INVOKER : la RLS du profil reste active, et aucun user_id n'est accepté.
CREATE OR REPLACE FUNCTION api.set_provider_only_preference(p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, auth, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'p_enabled must be a boolean' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_user_profile WHERE id = (SELECT auth.uid())
    AND preferences IS NOT NULL AND jsonb_typeof(preferences) <> 'object') THEN
    RAISE EXCEPTION 'User preferences must be a JSON object' USING ERRCODE = '22023';
  END IF;
  UPDATE public.app_user_profile
    SET preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object('provider_only', p_enabled)
    WHERE id = (SELECT auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN p_enabled;
END $fn$;
REVOKE ALL ON FUNCTION api.set_provider_only_preference(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.set_provider_only_preference(boolean) TO authenticated;

-- Patch ciblé de la fonction installée : conserve toutes les évolutions de
-- recherche et facettes déjà déployées. La même clause est dans la source canonique.
DO $patch$
DECLARE
  definition text;
  anchor constant text := 'WHERE (p_types IS NULL OR src.object_type = ANY(p_types))';
BEGIN
  SELECT pg_get_functiondef('api.get_filtered_object_ids(jsonb,public.object_type[],public.object_status[],text)'::regprocedure)
    INTO definition;
  IF strpos(definition, 'provider_scope_filter') = 0 THEN
    IF (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 THEN
      RAISE EXCEPTION 'get_filtered_object_ids provider filter anchor is not unique';
    END IF;
    definition := replace(definition, anchor, anchor || $predicate$
    -- provider_scope_filter : EXISTS évite les doublons si plusieurs prestataires sont liés.
    AND ((params.filters->>'has_provider') IS DISTINCT FROM 'true' OR EXISTS (
      SELECT 1 FROM public.actor_object_role provider_link
      WHERE provider_link.object_id = src.object_id
        AND (provider_link.valid_from IS NULL OR provider_link.valid_from <= (now() AT TIME ZONE 'Indian/Reunion')::date)
        AND (provider_link.valid_to IS NULL OR provider_link.valid_to >= (now() AT TIME ZONE 'Indian/Reunion')::date)
    ))$predicate$);
    EXECUTE definition;
  END IF;
END $patch$;

-- Helpers privés : accessibles uniquement depuis les RPC autorisées ci-dessous.
CREATE OR REPLACE FUNCTION internal.provider_object_ids()
RETURNS TABLE(object_id text) LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, api, pg_temp
AS $fn$
  SELECT o.id FROM public.object o
  WHERE o.object_type <> 'ORG'
    AND o.is_test = (SELECT api.current_user_test_realm())
    AND EXISTS (
      SELECT 1 FROM public.actor_object_role provider_link
      WHERE provider_link.object_id = o.id
        AND (provider_link.valid_from IS NULL OR provider_link.valid_from <= (now() AT TIME ZONE 'Indian/Reunion')::date)
        AND (provider_link.valid_to IS NULL OR provider_link.valid_to >= (now() AT TIME ZONE 'Indian/Reunion')::date)
    );
$fn$;
REVOKE ALL ON FUNCTION internal.provider_object_ids() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal.provider_crm_interactions()
RETURNS SETOF public.crm_interaction LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, api, internal, pg_temp
AS $fn$
  WITH objects AS MATERIALIZED (SELECT object_id FROM internal.provider_object_ids())
  SELECT ci.* FROM public.crm_interaction ci
  WHERE ci.object_id IN (SELECT object_id FROM objects)
    OR (ci.object_id IS NULL AND EXISTS (
      SELECT 1 FROM public.actor_object_role provider_link
      WHERE provider_link.actor_id = ci.actor_id
        AND provider_link.object_id IN (SELECT object_id FROM objects)
        AND (provider_link.valid_from IS NULL OR provider_link.valid_from <= (now() AT TIME ZONE 'Indian/Reunion')::date)
        AND (provider_link.valid_to IS NULL OR provider_link.valid_to >= (now() AT TIME ZONE 'Indian/Reunion')::date)
    ));
$fn$;
REVOKE ALL ON FUNCTION internal.provider_crm_interactions() FROM PUBLIC, anon, authenticated;

-- Les trois RPC qui suivent gardent les calculs existants (jours-editeur,
-- statuts ouverts, delai net) en changeant uniquement le corpus d'entree.
-- Leurs homologues globaux restent disponibles pour le toggle desactive.

CREATE OR REPLACE FUNCTION api.get_dashboard_provider_team_activity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $provider$
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
      AND ov.object_id IN (SELECT object_id FROM internal.provider_object_ids())
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
END $provider$;
REVOKE ALL ON FUNCTION api.get_dashboard_provider_team_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_dashboard_provider_team_activity() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.get_dashboard_provider_crm_activity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $provider$
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
    FROM   internal.provider_crm_interactions() ci
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
           (SELECT count(*) FROM internal.provider_crm_interactions() ci
             WHERE ci.occurred_at >= m.month
               AND ci.occurred_at <  (m.month + interval '1 month'))::int AS created,
           (SELECT count(*) FROM internal.provider_crm_interactions() ci
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
    JOIN   internal.provider_crm_interactions() ci ON ci.id = ev.interaction_id
    WHERE  ev.to_status = 'awaiting_provider'
    GROUP  BY ev.interaction_id
  ),
  net AS (
    SELECT EXTRACT(EPOCH FROM (ci.resolved_at - ci.occurred_at)) / 86400.0
           - COALESCE(w.wait_days, 0) AS net_days
    FROM   internal.provider_crm_interactions() ci
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
END $provider$;
REVOKE ALL ON FUNCTION api.get_dashboard_provider_crm_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_dashboard_provider_crm_activity() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION api.get_dashboard_provider_crm_open()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $provider$
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
    FROM   (SELECT * FROM public.crm_task WHERE object_id IN (SELECT object_id FROM internal.provider_object_ids())) AS crm_task
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
END $provider$;
REVOKE ALL ON FUNCTION api.get_dashboard_provider_crm_open() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_dashboard_provider_crm_open() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
