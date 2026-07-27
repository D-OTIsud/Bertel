-- =====================================================================
-- migration_capacity_metric_bounds.sql
-- Manifest 16o — Bornes observées des métriques de capacité, par type d'objet
-- Audit filtres 2026-07-27, suite §194 ; signalement PO sur « Capacités détaillées ».
-- =====================================================================
--
-- PROBLÈME
-- Le tiroir « Capacités détaillées » de l'Explorer empilait une paire Min/Max par
-- métrique applicable au BUCKET (donc l'union HOT∪HLO∪HPA∪CAMP∪RVA : « Emplacements »,
-- « Camping-cars » et « Tentes » s'affichaient en cherchant un hôtel). Le remplaçant
-- est un « ajouter un critère » avec un curseur min/max — mais un curseur n'a de sens
-- que BORNÉ. Des bornes inventées en dur (0–1000) seraient inutilisables et
-- mentiraient sur la réalité du corpus.
--
-- SOLUTION
-- Une vue d'agrégat, une ligne par (métrique, type d'objet) : bornes observées +
-- effectif. ~9 lignes aujourd'hui, servies avec le catalogue de références.
--
-- SECURITY INVOKER (pattern maison, cf. migration_coverage_views_security_invoker.sql
-- et l'incident « SECURITY DEFINER view leak » du journal) : la vue s'exécute avec les
-- droits de l'APPELANT, donc la RLS d'`object_capacity` (`read_object_capacity`, forme
-- §38 : publié OU périmètre étendu) s'applique normalement. Conséquences VOULUES :
--   - `anon` voit les bornes du corpus PUBLIÉ, rien d'autre ;
--   - un éditeur voit en plus ses brouillons, donc des bornes cohérentes avec les
--     résultats que l'Explorer lui montre effectivement.
-- Jamais de SECURITY DEFINER ici : ce serait exposer les valeurs de fiches non
-- lisibles, fût-ce sous forme d'agrégat.
--
-- CE QUE LA VUE NE DIT PAS : une métrique sans aucune ligne lisible n'apparaît pas.
-- C'est une ABSENCE DE BORNES, pas une absence de filtre — le consommateur doit
-- continuer à proposer la métrique (invariant §150 : la surface de filtre suit le
-- MODÈLE, jamais les données) et retomber sur une saisie numérique libre. Dix des
-- douze métriques sont dans ce cas aujourd'hui.
--
-- Idempotent (CREATE OR REPLACE + GRANT rejouables).
-- =====================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_capacity_metric_bounds
  WITH (security_invoker = true) AS
SELECT
  cm.code                     AS metric_code,
  o.object_type               AS object_type,
  min(oc.value_integer)::int  AS value_min,
  max(oc.value_integer)::int  AS value_max,
  count(*)::int               AS sample_size
FROM object_capacity oc
JOIN ref_capacity_metric cm ON cm.id = oc.metric_id
JOIN object o               ON o.id = oc.object_id
WHERE oc.value_integer IS NOT NULL
GROUP BY cm.code, o.object_type;

COMMENT ON VIEW public.v_capacity_metric_bounds IS
  'Bornes observées (min/max/effectif) d''une métrique de capacité par type d''objet, pour borner les curseurs du filtre Explorer. SECURITY INVOKER : le périmètre suit la RLS de l''appelant. Une métrique absente = aucune borne connue, PAS une métrique à masquer (invariant §150).';

GRANT SELECT ON public.v_capacity_metric_bounds TO anon, authenticated;

COMMIT;
