-- migration_explorer_remplissage_filter.sql
-- §204 — Filtre « Remplissage » de l'Exploreur (manifest 16r).
--
-- Le bundle des 8 essentiels visiteur était écrit EN DUR dans le corps de
-- api.get_dashboard_completeness. Trois consommateurs le veulent désormais
-- (Dashboard, filtre Exploreur, cartes) : le recopier garantirait trois copies
-- divergentes. Il vit maintenant dans internal.v_object_essentials.
--
-- POURQUOI DES BOOLÉENS EN COLONNES SÉPARÉES, et pas seulement le tableau :
-- PostgreSQL élague les colonnes de CTE/vue non consommées. Un filtre sur UN
-- essentiel (« sans photo ») ne lit qu'une colonne → 2,5 ms mesurés, contre
-- 23 ms pour les 8. Fusionner les booléens dans le seul tableau ferait payer
-- 23 ms au cas le plus courant.
--
-- POURQUOI PAS UNE COLONNE CACHÉE SUR object : il faudrait ~8 nouveaux triggers
-- (media, contact_channel, object_location, tag_link, object_capacity,
-- object_room_type, object_act, object_iti, object_fma — aucune ne porte
-- aujourd'hui trg_refresh_object_filter_caches_from_child) PLUS un backfill qui
-- pousse updated_at sur tout le corpus, donc une re-synchro partenaires
-- complète. Le calcul à la volée coûte moins cher et reste toujours frais.
--
-- Idempotent et fresh-safe (CREATE OR REPLACE partout, aucune donnée touchée).
\set ON_ERROR_STOP on
BEGIN;

-- ---- 1) La vue : UNE définition du bundle -----------------------------------
-- Les expressions sont reprises À L'IDENTIQUE de api.get_dashboard_completeness
-- (api_views_functions.sql, CTE `ess`). Toute divergence déplacerait les
-- chiffres du Dashboard — c'est ce que garde tests/test_remplissage_filter.sql.
--
-- STRUCTURE : un CTE `base` calcule CHAQUE essentiel UNE FOIS, le SELECT externe
-- dérive le tableau depuis ces booléens. Ne PAS recopier les expressions dans le
-- ARRAY_REMOVE : ce serait deux copies du calcul dans le fichier même qui existe
-- pour en supprimer les copies — et la première divergence serait silencieuse.
DROP VIEW IF EXISTS internal.v_object_essentials;
CREATE VIEW internal.v_object_essentials AS
WITH base AS (
SELECT
  o.id                                                                          AS object_id,
  o.object_type,
  (o.name IS NOT NULL AND btrim(o.name) <> '')                                  AS e_name,
  EXISTS (SELECT 1 FROM object_taxonomy x WHERE x.object_id = o.id)             AS e_subcat,
  EXISTS (SELECT 1 FROM object_location l WHERE l.object_id = o.id
          AND (NULLIF(btrim(l.city), '') IS NOT NULL OR l.code_insee IS NOT NULL
               OR (l.latitude IS NOT NULL AND l.longitude IS NOT NULL)))        AS e_location,
  EXISTS (SELECT 1 FROM contact_channel c WHERE c.object_id = o.id
          AND c.is_public AND NULLIF(btrim(c.value), '') IS NOT NULL)           AS e_contact,
  EXISTS (SELECT 1 FROM object_description d WHERE d.object_id = o.id
          AND d.org_object_id IS NULL
          AND NULLIF(btrim(d.description), '') IS NOT NULL
          AND NULLIF(btrim(d.description_chapo), '') IS NOT NULL)               AS e_desc,
  (SELECT COUNT(*) FROM media m WHERE m.object_id = o.id)                       AS n_photos,
  -- Cible photos par type (décision PO 2026-06-18) : FMA = 1 (une affiche suffit
  -- pour un événement) ; PSV/VIL/COM/SPU = 2 ; sinon 4.
  (CASE WHEN o.object_type = 'FMA' THEN 1
        WHEN o.object_type IN ('PSV','VIL','COM','SPU') THEN 2
        ELSE 4 END)                                                             AS photo_target,
  CASE
    WHEN o.object_type IN ('HOT','HPA','HLO','CAMP','RVA') THEN
      EXISTS (SELECT 1 FROM object_capacity c JOIN ref_capacity_metric mt ON mt.id = c.metric_id
              WHERE c.object_id = o.id AND mt.code = 'max_capacity' AND c.value_integer IS NOT NULL)
      OR EXISTS (SELECT 1 FROM object_room_type r WHERE r.object_id = o.id)
    WHEN o.object_type = 'RES' THEN
      EXISTS (SELECT 1 FROM object_capacity c JOIN ref_capacity_metric mt ON mt.id = c.metric_id
              WHERE c.object_id = o.id AND mt.code = 'seats' AND c.value_integer IS NOT NULL)
      OR EXISTS (SELECT 1 FROM object_menu mn WHERE mn.object_id = o.id)
    WHEN o.object_type IN ('ASC','ACT') THEN EXISTS (SELECT 1 FROM object_act a WHERE a.object_id = o.id)
    WHEN o.object_type = 'ITI' THEN EXISTS (SELECT 1 FROM object_iti i WHERE i.object_id = o.id)
    WHEN o.object_type = 'FMA' THEN EXISTS (SELECT 1 FROM object_fma ev WHERE ev.object_id = o.id)
    ELSE EXISTS (SELECT 1 FROM object_amenity am WHERE am.object_id = o.id)
  END                                                                           AS e_typeblock,
  EXISTS (SELECT 1 FROM tag_link tl WHERE tl.target_table = 'object' AND tl.target_pk = o.id) AS e_tags
FROM object o
WHERE o.object_type <> 'ORG'
)
SELECT
  b.object_id, b.object_type,
  b.e_name, b.e_subcat, b.e_location, b.e_contact, b.e_desc,
  b.n_photos, b.photo_target, b.e_typeblock, b.e_tags,
  -- Dérivé des booléens ci-dessus, jamais recalculé. L'ordre est stable : il
  -- fixe l'ordre d'affichage du détail dans la pastille et la colonne Table.
  ARRAY_REMOVE(ARRAY[
    CASE WHEN NOT b.e_name                     THEN 'name'        END,
    CASE WHEN NOT b.e_subcat                   THEN 'subcategory' END,
    CASE WHEN NOT b.e_location                 THEN 'location'    END,
    CASE WHEN NOT b.e_contact                  THEN 'contact'     END,
    CASE WHEN NOT b.e_desc                     THEN 'description' END,
    CASE WHEN b.n_photos < b.photo_target      THEN 'photos'      END,
    CASE WHEN NOT b.e_typeblock                THEN 'type_block'  END,
    CASE WHEN NOT b.e_tags                     THEN 'tags'        END
  ], NULL)                                                                      AS missing_essentials
FROM base b;

COMMENT ON VIEW internal.v_object_essentials IS
'§204 — bundle des 8 essentiels visiteur, source UNIQUE partagée par api.get_dashboard_completeness,
api.get_filtered_object_ids et api.object_missing_essentials. Booléens exposés en colonnes SÉPARÉES
volontairement : PostgreSQL élague les colonnes non consommées, donc un filtre sur un seul essentiel
coûte 2,5 ms au lieu de 23 ms. ORG exclus. n_photos = COUNT(media) (approximation héritée : vidéos et
documents inclus).';

-- ---- 2) Le Dashboard lit la vue au lieu de sa copie interne -----------------
-- `internal` DOIT être ajouté au search_path : la fonction est DEFINER mais son
-- search_path d'origine ne le contient pas (vérifié en base). Sans lui, l'appel
-- échoue À L'EXÉCUTION seulement — invisible au déploiement (classe §29).
CREATE OR REPLACE FUNCTION api.get_dashboard_completeness(
  p_types           object_type[]   DEFAULT NULL,
  p_status          object_status[] DEFAULT ARRAY['published']::object_status[],
  p_filters         JSONB           DEFAULT '{}'::jsonb,
  p_updated_at_from DATE            DEFAULT NULL,
  p_updated_at_to   DATE            DEFAULT NULL,
  p_below_limit     INT             DEFAULT 10
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, extensions, auth, audit, crm, ref
AS $$
  WITH filtered_ids AS (
    SELECT object_id
    FROM api.get_filtered_object_ids(
      p_filters,
      COALESCE(p_types, ARRAY(
        SELECT t FROM unnest(enum_range(null::object_type)) AS t WHERE t <> 'ORG'
      )),
      COALESCE(p_status, ARRAY['published']::object_status[])
    )
  ),
  scored AS (
    SELECT
      e.object_id AS id, e.object_type, o.name,
      ROUND(100.0 * (
        e.e_name::int + e.e_subcat::int + e.e_location::int + e.e_contact::int + e.e_desc::int
        + LEAST(e.n_photos::numeric / e.photo_target, 1.0) + e.e_typeblock::int + e.e_tags::int
      ) / 8.0)::int AS score,
      (e.e_name AND e.e_subcat AND e.e_location AND e.e_contact AND e.e_desc
       AND e.n_photos >= e.photo_target AND e.e_typeblock AND e.e_tags) AS complete,
      e.missing_essentials AS missing_fields
    FROM   internal.v_object_essentials e
    JOIN   object o        ON o.id = e.object_id
    JOIN   filtered_ids f  ON f.object_id = e.object_id
    WHERE  (p_updated_at_from IS NULL OR o.updated_at >= p_updated_at_from::timestamptz)
      AND  (p_updated_at_to   IS NULL OR o.updated_at <  (p_updated_at_to + 1)::timestamptz)
  ),
  field_gaps AS (
    SELECT object_type, mf, COUNT(*) AS gaps
    FROM   scored, LATERAL unnest(missing_fields) AS mf
    GROUP  BY object_type, mf
  ),
  top_gap AS (
    SELECT DISTINCT ON (object_type) object_type, mf AS missing_top_field
    FROM   field_gaps
    ORDER  BY object_type, gaps DESC, mf
  ),
  below AS (
    SELECT object_type,
           jsonb_agg(
             jsonb_build_object('id', id, 'name', name, 'score', score,
                                'missing_fields', to_jsonb(missing_fields))
             ORDER BY score ASC, name
           ) FILTER (WHERE rn <= p_below_limit) AS below_80
    FROM (
      SELECT id, object_type, name, score, missing_fields,
             ROW_NUMBER() OVER (PARTITION BY object_type ORDER BY score ASC, name) AS rn
      FROM   scored
      WHERE  score < 80
    ) ranked
    GROUP BY object_type
  ),
  agg AS (
    SELECT object_type,
           COUNT(*)                                                                  AS total,
           ROUND(AVG(score))::int                                                    AS avg_score,
           ROUND(100.0 * COUNT(*) FILTER (WHERE complete) / NULLIF(COUNT(*), 0), 1)  AS complete_pct
    FROM   scored
    GROUP  BY object_type
  )
  SELECT jsonb_build_object(
    'rows', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type',              a.object_type::text,
          'total',             a.total,
          'avg_score',         a.avg_score,
          'complete_pct',      a.complete_pct,
          'missing_top_field', COALESCE(g.missing_top_field, ''),
          'below_80',          COALESCE(b.below_80, '[]'::jsonb)
        )
        ORDER BY a.total DESC
      ),
      '[]'::jsonb
    )
  )
  FROM   agg a
  LEFT   JOIN top_gap g ON g.object_type = a.object_type
  LEFT   JOIN below   b ON b.object_type = a.object_type;
$$;

COMMENT ON FUNCTION api.get_dashboard_completeness IS
'Dashboard Qualité: remplissage « perçu visiteur » par type. Lit internal.v_object_essentials
(§204, source unique du bundle) — le calcul était auparavant recopié dans ce corps. Par type: score
moyen 0-100, % fiches complètes-visiteur, essentiel le plus manquant, liste des fiches <80
(plafonnée par p_below_limit). ORG exclus. p_updated_at_from/to bornes DATE inclusives.';

GRANT EXECUTE ON FUNCTION api.get_dashboard_completeness(object_type[], object_status[], jsonb, date, date, int)
  TO authenticated, service_role;

COMMIT;
