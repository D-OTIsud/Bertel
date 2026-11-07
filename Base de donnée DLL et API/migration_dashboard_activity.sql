-- migration_dashboard_activity.sql
-- Manifeste 17h — les deux RPC de l'onglet « Activité équipe » + l'extension de la carte
-- d'attention (tranche C-SQL).
-- Spec : docs/superpowers/specs/2026-08-31-onglet-activite-cycle-vie-crm-design.md (§2, §4)
-- Plan : docs/superpowers/plans/2026-08-31-onglet-activite-cycle-vie-crm.md (Task 5)
--
-- CE QUE FAIT CETTE MIGRATION
--   1. `api.get_dashboard_team_activity()` — rythme de saisie de l'équipe sur 12 semaines et
--      table des contributeurs.
--   2. `api.get_dashboard_crm_activity()`  — arriéré par âge et par sujet, flux mensuel,
--      temps de traitement NET.
--   3. `api.get_dashboard_crm_open()`      — DEUX clés de plus (`recent_interactions`,
--      `backlog_interactions`). Les trois clés historiques sont CONSERVÉES : l'invariant
--      carte ↔ courbe de 17g repose dessus.
--
-- ═══ ON MESURE DES JOURS, PAS DU VOLUME ═══
--
-- `editor_days` compte des COUPLES (éditeur, jour), pas des versions. Une passe d'import ou
-- une correction de masse produit des centaines de versions en une après-midi : compter les
-- versions ferait de cette après-midi le sommet de l'année et écraserait visuellement les
-- semaines de travail régulier. Le corpus le montre — une seule journée porte 482 objets
-- touchés quand la médiane est à 1. Un indicateur de RYTHME doit mesurer la régularité, pas
-- le débit.
--
-- ═══ TROIS PIÈGES FERMÉS ICI, DONT UN MESURÉ SUR LA BASE VIVE ═══
--
-- 1. **`ROW(NULL,NULL)` N'EST PAS NULL.** Poser `count(DISTINCT (created_by,
--    created_at::date))` DIRECTEMENT au-dessus d'un LEFT JOIN sur la série des semaines
--    compte la ligne toute-NULL fabriquée par la jointure : une semaine SANS AUCUNE activité
--    rapporte alors **1 jour-éditeur** pour 0 éditeur et 0 objet. Mesuré le 31/08 : la semaine
--    du 2026-07-06 est vide, et la formule naïve y rendait `editor_days=1, editors=0`.
--    Ici on AGRÈGE D'ABORD, on joint ENSUITE — l'erreur devient structurellement impossible,
--    et le bloc (B) du test la garde.
--
-- 2. **`created_by IS NULL` = 57,5 % du corpus** (2 299 versions sur 3 995 au 31/08 :
--    imports et écritures système). Les compter ferait du « rythme de l'équipe » une mesure
--    des imports. Exclu partout dans ce fichier — et le bloc (C) du test l'éprouve en
--    insérant une version anonyme qui ne doit RIEN changer.
--
-- 3. **Le seuil de journée de masse tombe dans un TROU de la distribution.** Objets touchés
--    par jour-éditeur au 31/08 : 1, 2, 9 — puis 58, 251, 277, 308, 482. La distribution est
--    BIMODALE et rien ne vit entre 10 et 57 : le seuil à 10 sépare deux régimes réels, il ne
--    coupe pas une population continue en deux. **Si la distribution se remplit un jour entre
--    ces deux modes, ce seuil cesse de vouloir dire quelque chose et doit être rediscuté** —
--    ce n'est pas un paramètre à ajuster, c'est une hypothèse à revalider. Aucune donnée vive
--    n'éprouve la bascule (il n'existe pas de journée à 10) : seul le bloc (D) du test, qui
--    fabrique 9 puis 10, la prouve.
--
-- ═══ LE LIBELLÉ D'UTILISATEUR VIENT DE `api.crm_user_label`, PAS D'UNE SECONDE FORMULE ═══
--
-- Le plan proposait `COALESCE(p.display_name, split_part(u.email,'@',1))` en posant la règle
-- « jamais l'adresse entière ». **Cette formule ne tient pas sa propre règle sur les données
-- réelles** : deux des trois contributeurs ont leur adresse complète EN `display_name`, donc
-- le `COALESCE` la rend telle quelle et le repli ne se déclenche jamais. La garde protégeait
-- la branche de repli, pas le fait.
-- Arbitrage PO du 31/08 : on réutilise `api.crm_user_label(uuid, text)` — la SOURCE UNIQUE
-- déjà employée par le kanban CRM (16w), le journal de transitions (17g) et les
-- notifications. L'onglet affichera donc les mêmes libellés que le reste de l'application,
-- adresses comprises tant que ces deux comptes n'ont pas posé de nom. **Le correctif est en
-- amont, dans /team, pas dans un second vocabulaire d'affichage propre à cet onglet** : une
-- personne qui s'appellerait « cl.metro » ici et « cl.metro@otisud.com » dans le kanban serait
-- deux personnes pour tout lecteur pressé.
--
-- ═══ SÉRIES GLOBALES — PAS DE POOL FILTRÉ ═══
--
-- Comme `get_dashboard_crm_open` (17f, décision produit du 2026-08-30), ces fonctions
-- n'obéissent PAS au panneau de filtres : elles répondent « comment l'équipe a travaillé »,
-- une question qui n'a pas de sens restreinte à une sélection d'objets. Aucun appel à
-- `api.get_filtered_object_ids`, aucun paramètre.
--
-- ═══ AUCUN CHIFFRE DE CORPUS EN DUR ═══
--
-- 3 995 / 2 299 / 3 / 5 / 170 / 482 datent du 31/08 et ne vivent que dans les commentaires
-- ci-dessus, comme justification d'une décision. Le SQL compte dynamiquement ; les gardes du
-- test portent sur des invariants relatifs (somme des tranches == total, 12 entrées
-- toujours), jamais sur des constantes.
--
-- ⚠ ORDRE AU MANIFESTE : 17h se place APRÈS 17g, qui redéploie `get_dashboard_crm_open`.
-- Placée avant, son corps étendu serait ÉCRASÉ par la version 17g rejouée ensuite.
--
-- ⚠ LE PRÉDICAT CANONIQUE DE 17g EST REPRODUIT ICI MOT POUR MOT. Le bloc (B3b) de
-- `tests/test_crm_lifecycle.sql` compare les `prosrc` de `get_dashboard_crm_open` et de
-- `capture_metric_snapshots` **à l'octet près, indentation comprise**. Réécrire cette
-- fonction sans conserver ce bloc exact fait rougir 17g-test — pas 17h-test. Le bloc (I6) du
-- test de CE fichier le garde depuis ce côté-ci.
--
-- Fonctions exposées neuves ⇒ `NOTIFY pgrst, 'reload schema';` en fin de fichier.
-- Idempotente : tout est `CREATE OR REPLACE`.

\set ON_ERROR_STOP on
BEGIN;

-- =====================================================================================
-- (1) api.get_dashboard_team_activity — rythme de saisie + contributeurs
-- =====================================================================================
CREATE OR REPLACE FUNCTION api.get_dashboard_team_activity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $fn$
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
END $fn$;

COMMENT ON FUNCTION api.get_dashboard_team_activity() IS
'Onglet Activité équipe §2 : rythme de saisie sur 12 semaines + table des contributeurs.
GLOBAL, sans paramètre — n''obéit pas au panneau de filtres (même raison que
api.get_dashboard_crm_open : « comment l''équipe a travaillé » n''a pas de sens restreint à une
sélection d''objets).
ON COMPTE DES JOURS, PAS DES VERSIONS : editor_days = couples (éditeur, jour). Une passe
d''import produit des centaines de versions en une après-midi ; les compter ferait de cette
après-midi le sommet de l''année et écraserait les semaines de travail régulier. Un indicateur
de RYTHME mesure la régularité, pas le débit.
Les versions sans auteur (imports, système — 57,5 % du corpus au 31/08) sont EXCLUES.
Une semaine sans activité est émise à ZÉRO, jamais omise : un trou se lit « pas de données »,
pas « pas de travail ». L''agrégation se fait AVANT la jointure sur la série des semaines,
sans quoi le ROW(NULL,NULL) de la jointure compterait pour un jour-éditeur fantôme.
bulk_days = jours où un éditeur touche au moins 10 objets. La distribution réelle est bimodale
(≤ 9 d''un côté, ≥ 58 de l''autre) : le seuil sépare deux régimes, il ne coupe pas une
population continue. Si elle se remplit entre les deux, le seuil est à rediscuter.
display_name vient de api.crm_user_label — MÊME source que le kanban CRM et le journal de
transitions, pour qu''une personne porte un seul nom d''un écran à l''autre.
Manifeste 17h.';

REVOKE ALL    ON FUNCTION api.get_dashboard_team_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_dashboard_team_activity() TO   authenticated, service_role;

-- §204 — un ré-apply par un rôle non-propriétaire ne rend qu'un WARNING sur le REVOKE, que
-- ON_ERROR_STOP ne rattrape pas. On échoue fort plutôt que de déployer une fonction ouverte.
DO $$
BEGIN
  IF has_function_privilege('public', 'api.get_dashboard_team_activity()', 'EXECUTE')
     OR has_function_privilege('anon', 'api.get_dashboard_team_activity()', 'EXECUTE') THEN
    RAISE EXCEPTION 'REVOKE n''a pas pris sur api.get_dashboard_team_activity — fonction ouverte, arrêt.';
  END IF;
END $$;

-- =====================================================================================
-- (2) api.get_dashboard_crm_activity — arriéré, flux, temps net
-- =====================================================================================
CREATE OR REPLACE FUNCTION api.get_dashboard_crm_activity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $fn$
DECLARE
  c_months constant int := 12;
  v_result jsonb;
BEGIN
  WITH open_interactions AS (
    -- MÊME prédicat que crm_backlog et que la carte du bandeau (17g) : la liste positive
    -- TYPÉE des statuts ouverts. Une comparaison en TEXTE désarmerait le typage et
    -- survivrait muette à tout renommage, en se réduisant à `resolved_at IS NULL`.
    SELECT ci.id, ci.occurred_at, ci.demand_topic_id
    FROM   crm_interaction ci
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
           (SELECT count(*) FROM crm_interaction ci
             WHERE ci.occurred_at >= m.month
               AND ci.occurred_at <  (m.month + interval '1 month'))::int AS created,
           (SELECT count(*) FROM crm_interaction ci
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
    JOIN   crm_interaction ci ON ci.id = ev.interaction_id
    WHERE  ev.to_status = 'awaiting_provider'
    GROUP  BY ev.interaction_id
  ),
  net AS (
    SELECT EXTRACT(EPOCH FROM (ci.resolved_at - ci.occurred_at)) / 86400.0
           - COALESCE(w.wait_days, 0) AS net_days
    FROM   crm_interaction ci
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
END $fn$;

COMMENT ON FUNCTION api.get_dashboard_crm_activity() IS
'Onglet Activité équipe §4 : arriéré CRM par âge et par sujet, flux mensuel, temps de
traitement NET. GLOBAL, sans paramètre (même raison que api.get_dashboard_crm_open).
Les statuts ouverts reprennent le prédicat exact de crm_backlog — liste positive TYPÉE
(new, in_progress, awaiting_provider) et resolved_at IS NULL, manifeste 17g.
open_by_age émet TOUJOURS les quatre tranches, une tranche vide à zéro : n''afficher que les
tranches peuplées mentirait par omission sur la forme de l''arriéré. Une demande sans date
d''occurrence vieillit au maximum — on ne rajeunit pas une demande faute d''information.
open_by_topic regroupe les demandes sans sujet sous un libellé explicite, jamais sous une case
vide, et la somme par sujet égale toujours open_interactions.
TEMPS NET = écoulé (resolved_at − occurred_at) MOINS l''attente prestataire, parce qu''un
indicateur ne doit mesurer que ce que l''équipe maîtrise. Il ne porte que sur les demandes
NÉES APRÈS la bascule 17g (leur premier événement de journal est la création) : les lignes
importées sans date de résolution n''ont pas d''événement de création et sont donc hors
moyenne PAR CONSTRUCTION, sans exclusion à maintenir. canceled exclu.
avg_days NULL = pas encore mesurable ; zéro voudrait dire instantané.
Manifeste 17h.';

REVOKE ALL    ON FUNCTION api.get_dashboard_crm_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.get_dashboard_crm_activity() TO   authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('public', 'api.get_dashboard_crm_activity()', 'EXECUTE')
     OR has_function_privilege('anon', 'api.get_dashboard_crm_activity()', 'EXECUTE') THEN
    RAISE EXCEPTION 'REVOKE n''a pas pris sur api.get_dashboard_crm_activity — fonction ouverte, arrêt.';
  END IF;
END $$;

-- =====================================================================================
-- (3) api.get_dashboard_crm_open — DEUX clés de plus, les trois autres INCHANGÉES
-- =====================================================================================
-- ⚠ LE BLOC DE PRÉDICAT DU CTE `interactions` EST REPRODUIT MOT POUR MOT DEPUIS 17g,
-- INDENTATION COMPRISE. Le bloc (B3b) de tests/test_crm_lifecycle.sql compare ce texte, à
-- l'octet près, entre ce corps et celui de api.capture_metric_snapshots. Le « ré-aligner »
-- casse une garde d'un AUTRE fichier — c'est le bloc (I6) de 17h-test qui le rappelle ici.
CREATE OR REPLACE FUNCTION api.get_dashboard_crm_open()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  WITH interactions AS (
    SELECT count(*)::int AS n
  -- ⚠ Bloc reproduit MOT POUR MOT — INDENTATION COMPRISE — depuis le point 5 de
  -- api.capture_metric_snapshots. L'indentation « plate » au milieu du CTE est DÉLIBÉRÉE :
  -- c'est ce qui rend l'identité des deux prédicats vérifiable par comparaison littérale des
  -- deux `prosrc` (test 17g, bloc B). Ne pas « ré-aligner ».
  FROM crm_interaction
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
    FROM   crm_interaction ci
    WHERE  ci.resolved_at IS NULL
      AND  ci.status = ANY (ARRAY['new','in_progress','awaiting_provider']::crm_status[])
  ),
  tasks AS (
    -- ⚠ VOCABULAIRE DES TÂCHES (crm_task_status), PAS celui des demandes. Ces cinq lignes ne
    -- bougent PAS avec le cycle de vie des demandes : `in_progress` est ici un statut de TÂCHE.
    SELECT count(*)::int AS n
    FROM   crm_task
    WHERE  status::text IN ('todo', 'in_progress', 'blocked')
  )
  SELECT jsonb_build_object(
    'open_interactions',    i.n,
    'open_tasks',           t.n,
    'total',                i.n + t.n,
    'recent_interactions',  a.recent,
    'backlog_interactions', a.backlog
  )
  FROM interactions i, tasks t, ages a;
$$;

COMMENT ON FUNCTION api.get_dashboard_crm_open IS
'Dashboard §1 : compteur GLOBAL des éléments CRM ouverts pour la carte d''attention du bandeau.
open_interactions reprend le prédicat exact de crm_backlog (api.capture_metric_snapshots) : la
liste positive TYPÉE des statuts ouverts (new, in_progress, awaiting_provider) et resolved_at
IS NULL. open_tasks = crm_task en todo/in_progress/blocked (les statuts terminaux de TÂCHE sont
exclus — une tâche annulée n''est pas du travail en attente ; vocabulaire crm_task_status,
distinct de celui des demandes). GLOBAL par décision produit (2026-08-30) : la carte est un
signal stable « ce qui m''attend aujourd''hui », elle n''obéit pas au panneau de filtres.
recent_interactions / backlog_interactions (manifeste 17h) partagent le MÊME ensemble : moins
de 90 jours d''un côté, le reste de l''autre. backlog est calculé par soustraction, si bien que
recent + backlog = open_interactions PAR CONSTRUCTION et qu''une demande sans date d''occurrence
tombe dans l''arriéré au lieu de disparaître entre deux bornes.
N''émet aucune PII (cinq entiers). Manifeste 17g, étendu par 17h.';

REVOKE EXECUTE ON FUNCTION api.get_dashboard_crm_open() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.get_dashboard_crm_open() TO   authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('public', 'api.get_dashboard_crm_open()', 'EXECUTE')
     OR has_function_privilege('anon', 'api.get_dashboard_crm_open()', 'EXECUTE') THEN
    RAISE EXCEPTION 'REVOKE n''a pas pris sur api.get_dashboard_crm_open — fonction ouverte, arrêt.';
  END IF;
END $$;

-- =====================================================================================
-- (4) GARDE — le prédicat canonique de 17g a survécu à la réécriture ci-dessus
-- =====================================================================================
-- Sans elle, une réécriture « propre » de get_dashboard_crm_open passerait ici au vert et
-- ferait rougir 17g-test, à l'autre bout du manifeste, pour une cause invisible d'ici.
DO $$
DECLARE
  v_pred constant text :=
    E'  FROM crm_interaction\n  WHERE resolved_at IS NULL\n    AND status = ANY (ARRAY[''new'',''in_progress'',''awaiting_provider'']::crm_status[])';
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'api' AND p.proname = 'get_dashboard_crm_open';

  IF v_src IS NULL OR position(v_pred IN v_src) = 0 THEN
    RAISE EXCEPTION 'api.get_dashboard_crm_open a perdu le bloc de prédicat canonique de 17g — le bloc (B3b) de test_crm_lifecycle rougira. Restaurer le bloc MOT POUR MOT, indentation comprise.';
  END IF;
END $$;

COMMIT;

-- Fonctions exposées neuves + signature de sortie étendue ⇒ PostgREST doit relire son schéma.
NOTIFY pgrst, 'reload schema';
