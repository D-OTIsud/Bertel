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

-- ---- 3) Helper pour le chemin CARTES ----------------------------------------
-- api.list_object_resources_filtered_page est SECURITY INVOKER et ne peut pas
-- lire le schéma internal (authenticated n'a pas USAGE dessus, par conception).
-- Ce helper est le seul point de passage, et il porte TROIS verrous :
--   1. REVOKE FROM PUBLIC (plus bas) — sinon anon peut l'appeler ;
--   2. gate métier : ensemble vide si l'appelant n'est pas éditeur — c'est ICI
--      que vit le « éditeur et supérieur », côté serveur, pas seulement masqué
--      à l'écran ;
--   3. auto-autorisation (§36) : la fonction est exécutable via PostgREST, donc
--      elle ne fait JAMAIS confiance à la liste d'ids reçue.
--
-- POURQUOI DANS `api` ET PAS UN SCHÉMA PRIVÉ : le RPC de page est SECURITY
-- INVOKER, donc c'est l'APPELANT (authenticated) qui doit pouvoir exécuter ce
-- helper. Le placer dans `internal` exigerait d'accorder USAGE sur `internal` à
-- authenticated — ce qui ouvrirait toute la couche privée, très au-delà de cette
-- fonction. Basculer le RPC de page en DEFINER changerait en bloc la sémantique
-- d'autorisation d'un RPC central. On garde `api`, verrouillé.
CREATE OR REPLACE FUNCTION api.object_missing_essentials(p_object_ids TEXT[])
RETURNS TABLE(object_id TEXT, missing TEXT[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, extensions, auth, audit, crm, ref
AS $$
  SELECT e.object_id, e.missing_essentials
  FROM   internal.v_object_essentials e
  -- COALESCE(..., FALSE) N'EST PAS DÉCORATIF : current_user_can_edit_objects()
  -- est à TROIS valeurs. Sa chaîne de OR passe par auth.role(), NULL hors
  -- contexte HTTP, donc la fonction rend NULL — pas FALSE — dans toute session
  -- sans JWT. Un WHERE écarterait déjà la ligne, mais on ne laisse pas le sens
  -- de NULL implicite : ici NULL vaut « pas éditeur ».
  WHERE  COALESCE(api.current_user_can_edit_objects(), FALSE)
    AND  e.object_id = ANY(COALESCE(p_object_ids, ARRAY[]::text[]))
    AND  e.object_id IN (SELECT api.current_user_readable_object_ids());
$$;

COMMENT ON FUNCTION api.object_missing_essentials IS
'§204 — essentiels manquants pour un ENSEMBLE d''objets (jamais par ligne). Rend 0 ligne si
l''appelant n''est pas éditeur (api.current_user_can_edit_objects) : c''est le gate serveur du
filtre « Remplissage ». Auto-autorise ses ids contre current_user_readable_object_ids (§36) — la
liste reçue n''est jamais crue sur parole. Mesuré: 2,0 ms pour une page de 24.';

-- PostgreSQL accorde EXECUTE à PUBLIC par DÉFAUT sur toute fonction créée. Un
-- GRANT ciblé ne retire pas ce droit — il faut le révoquer explicitement, sinon
-- `anon` peut appeler la fonction. Ici le corps refuserait de toute façon (gate
-- éditeur), mais on ne fait pas reposer un contrôle d'accès sur le seul corps.
REVOKE ALL ON FUNCTION api.object_missing_essentials(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.object_missing_essentials(TEXT[]) TO authenticated, service_role;

-- ---- 4) get_filtered_object_ids : les deux cles de remplissage ------------
--
-- COUT MESURE ET ASSUME — +4,4 ms de PLANIFICATION par appel, filtre ETEINT.
-- Localise par bissection sur live (30 iterations x 2 series, ecart stable) :
--     temoin sans patch ................................. 22,7 ms
--     ajouts au CTE params seuls ........................ 22,9 ms  (gratuit)
--     CASE par ligne SANS reference a la vue ............ 23,0 ms  (gratuit)
--     patch complet, filtre eteint ...................... 27,0 ms  (+4,4)
-- Le surcout n'est donc NI le CASE NI le parsing : c'est la simple PRESENCE du
-- EXISTS sur internal.v_object_essentials dans le texte de la requete. Le
-- planificateur plante le sous-plan a chaque appel meme quand la branche n'est
-- jamais prise, et la fonction etant SECURITY DEFINER elle n'est pas inlinee.
-- AUCUNE garde ne peut supprimer ce cout : il precede l'execution.
--
-- Pourquoi on l'accepte plutot que de le supprimer :
--   * le supprimer vraiment demanderait de materialiser les essentiels (une MV
--     rafraichie par le cron des 10 min). La planification tomberait a ~0, mais
--     la fiche ne quitterait la liste de travail qu'au rafraichissement suivant
--     — or ce filtre EST une liste de travail : l'agent corrige puis refiltre.
--     La fraicheur est la fonctionnalite, pas un detail.
--   * l'autre issue serait de sortir le predicat vers le RPC de page (plpgsql :
--     une branche IF n'est planifiee que si elle s'execute), mais la carte et le
--     tableau de bord passent aussi par get_filtered_object_ids : le filtre
--     cesserait de s'appliquer a la carte. Incoherence, pas optimisation.
--   * ordre de grandeur : 4,4 ms contre 220-310 ms de latence Reunion->Supabase
--     par aller-retour, soit ~1,5 % d'un seul aller-retour.
-- Si le corpus grossit ou si ce chemin devient critique, la MV est l'echappatoire
-- documentee (cf. journal de decision).
-- Corps DERIVE de la definition live par .tmp_pgapply/_gen_remplissage.cjs
-- (ancres assertees, refus d ecrire si une ancre bouge ou est ambigue).
-- NE PAS EDITER A LA MAIN : regenerer.
-- La derniere definition vivait dans migration_accommodation_unit_type.sql
-- (taxo6), PAS dans la migration phonetique : partir de la mauvaise source
-- ferait regresser 199 (dmetaphone) et 201 (types d unite).
CREATE OR REPLACE FUNCTION api.get_filtered_object_ids(p_filters jsonb, p_types object_type[], p_status object_status[], p_search text DEFAULT NULL::text)
 RETURNS TABLE(object_id text, label_rank integer, label_match jsonb, relevance real)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'api', 'internal', 'extensions', 'auth', 'audit', 'crm', 'ref'
AS $function$
  -- Extract JSON arrays once into SQL arrays to avoid per-row JSON parsing.
  WITH normalized AS (
    SELECT
      COALESCE(p_filters, '{}'::jsonb) AS filters,
      -- §197 — la saisie normalisée UNE fois (minuscules + sans accents, bords rognés).
      -- Sert au bras approximatif ; le bras plein texte garde son appel d'origine.
      btrim(api.norm_search(p_search)) AS search_norm
  ),
  params AS (
    -- Each *_any array is normalized so that an empty parse (either an empty
    -- JSON array or all entries discarded by inner filters) collapses to NULL.
    -- Downstream WHERE clauses short-circuit on `IS NULL`, so:
    --   key absent      → NULL → no filter applied
    --   key present []  → NULL → no filter applied
    --   key present [x] → ARRAY['x'] → filter applied
    -- This avoids the previous "match nothing" trap where an empty array was
    -- compared with `= ANY()` / `&&` and dropped every row.
    SELECT
      n.filters,
      n.search_norm,
      -- §197 — le flou est-il armé ? Trois gardes, chacune justifiée :
      --   * mode `global` seul : le mode `name` sert les sélecteurs d'objets de
      --     l'éditeur, qui doivent rester exacts (sinon on propose la mauvaise fiche).
      --   * un seul mot : une saisie multi-mots reste plein texte (précision).
      --   * >= 4 caractères : en dessous, les trigrammes n'ont plus de pouvoir
      --     discriminant (mesuré) et le balayage coûterait pour du bruit.
      (
        p_search IS NOT NULL
        AND (n.filters->>'search_mode') = 'global'
        AND length(n.search_norm) >= 4
        AND n.search_norm !~ '\s'
      ) AS fuzzy_enabled,
      -- §197 — seuil DÉPENDANT DE LA LONGUEUR (calibré live, cf. en-tête) : une requête
      -- de L caractères ne porte que L+1 trigrammes, donc à L petit un recouvrement
      -- accidentel pèse lourd. 4 car. → bruit mesuré à 0.400 ⇒ 0.45.
      -- >= 5 car. → bruit pur plafonné à 0.333 ⇒ 0.35 (et jaccusy→jacuzzi vaut 0.375).
      CASE WHEN length(n.search_norm) >= 5 THEN 0.35::real ELSE 0.45::real END AS fuzzy_threshold,
      CASE WHEN n.filters ? 'commercial_visibility_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'commercial_visibility_any')),
          ARRAY[]::text[]
        )
      END AS commercial_visibility_any,
      CASE WHEN n.filters ? 'amenities_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'amenities_any')),
          ARRAY[]::text[]
        )
      END AS amenities_any,
      CASE WHEN n.filters ? 'amenities_all'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'amenities_all')),
          ARRAY[]::text[]
        )
      END AS amenities_all,
      CASE WHEN n.filters ? 'amenity_families_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'amenity_families_any')),
          ARRAY[]::text[]
        )
      END AS amenity_families_any,
      CASE WHEN n.filters ? 'payment_methods_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'payment_methods_any')),
          ARRAY[]::text[]
        )
      END AS payment_methods_any,
      CASE WHEN n.filters ? 'environment_tags_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'environment_tags_any')),
          ARRAY[]::text[]
        )
      END AS environment_tags_any,
      CASE WHEN n.filters ? 'languages_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'languages_any')),
          ARRAY[]::text[]
        )
      END AS languages_any,
      CASE WHEN n.filters ? 'city_any'
        THEN NULLIF(
          ARRAY(
            SELECT immutable_unaccent(lower(jsonb_array_elements_text(n.filters->'city_any')))
          ),
          ARRAY[]::text[]
        )
      END AS city_any,
      CASE WHEN n.filters ? 'lieu_dit_any'
        THEN NULLIF(
          ARRAY(
            SELECT immutable_unaccent(lower(jsonb_array_elements_text(n.filters->'lieu_dit_any')))
          ),
          ARRAY[]::text[]
        )
      END AS lieu_dit_any,
      CASE WHEN n.filters ? 'media_types_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'media_types_any')),
          ARRAY[]::text[]
        )
      END AS media_types_any,
      CASE WHEN n.filters->'meeting_room' ? 'equipment_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'meeting_room'->'equipment_any')),
          ARRAY[]::text[]
        )
      END AS meeting_equipment_any,
      CASE WHEN n.filters->'meeting_room' ? 'equipment_all'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'meeting_room'->'equipment_all')),
          ARRAY[]::text[]
        )
      END AS meeting_equipment_all,
      CASE WHEN n.filters ? 'tags_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'tags_any')),
          ARRAY[]::text[]
        )
      END AS tags_any,
      CASE WHEN n.filters->'itinerary' ? 'practices_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'itinerary'->'practices_any')),
          ARRAY[]::text[]
        )
      END AS iti_practices_any,
      CASE WHEN n.filters ? 'classifications_any'
        THEN NULLIF(
          ARRAY(
            SELECT ((j->>'scheme_code') || ':' || (j->>'value_code'))
            FROM jsonb_array_elements(n.filters->'classifications_any') AS j
            WHERE COALESCE(j->>'scheme_code', '') <> ''
              AND COALESCE(j->>'value_code', '') <> ''
          ),
          ARRAY[]::text[]
        )
      END AS classifications_any_codes,
      CASE WHEN n.filters ? 'taxonomy_any'
        THEN NULLIF(
          ARRAY(
            SELECT ((j->>'domain') || ':' || (j->>'code'))
            FROM jsonb_array_elements(n.filters->'taxonomy_any') AS j
            WHERE COALESCE(j->>'domain', '') <> ''
              AND COALESCE(j->>'code', '') <> ''
          ),
          ARRAY[]::text[]
        )
      END AS taxonomy_any_codes,
      -- §201 — types d'unité d'hébergement (axe MULTI-VALUÉ, table de liaison
      -- object_accommodation_unit_type). Volontairement hors cache objet : un
      -- objet peut porter plusieurs unités, ce qu'une colonne cache scalaire ne
      -- représente pas — on lit la table de liaison (comme tags_any).
      CASE WHEN n.filters ? 'accommodation_unit_types_any'
        THEN NULLIF(
          ARRAY(
            SELECT jsonb_array_elements_text(n.filters->'accommodation_unit_types_any')
          ),
          ARRAY[]::text[]
        )
      END AS accommodation_unit_types_any,
      -- accessibility type filters (2026-03-22)
      -- disability_types_any: TEXT[] of canonical disability types (motor/hearing/visual/cognitive).
      -- label_disability_types_any: TEXT[] of canonical disability types matched against LBL_TOURISME_HANDICAP subvalue_ids.
      CASE WHEN n.filters ? 'disability_types_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'disability_types_any')),
          ARRAY[]::text[]
        )
      END AS disability_types_any,
      CASE WHEN n.filters ? 'label_disability_types_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'label_disability_types_any')),
          ARRAY[]::text[]
        )
      END AS label_disability_types_any,
      -- §173 — restrict a ranked-label filter to rank-0 (certified label) only, excluding
      -- equivalent evidence. Only meaningful alongside label_scheme_ranked.
      COALESCE((n.filters->>'label_scheme_ranked_exact_only')::boolean, false) AS exact_only,
      -- §157 — « ouvert à … » : instant demandé (ISO timestamptz). NULL = filtre absent.
      CASE WHEN n.filters ? 'open_at'
        THEN NULLIF(n.filters->>'open_at', '')::timestamptz
      END AS open_at,
      CASE WHEN n.filters ? 'sustainability_categories_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'sustainability_categories_any')),
          ARRAY[]::text[]
        )
      END AS sustainability_categories_any,
      CASE WHEN n.filters ? 'sustainability_actions_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'sustainability_actions_any')),
          ARRAY[]::text[]
        )
      END AS sustainability_actions_any,
      -- 204 — Remplissage. Deux cles independantes, combinees en ET :
      --   missing_essentials_buckets : palier (complete / few / many)
      --   missing_essentials_any     : quels essentiels manquent (OU interne)
      -- NULLIF(..., ARRAY[]::text[]) : une cle presente mais vide vaut « pas de
      -- filtre », jamais « ne matche rien » — convention de toutes les facettes.
      CASE WHEN n.filters ? 'missing_essentials_buckets'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'missing_essentials_buckets')),
          ARRAY[]::text[]
        )
      END AS missing_buckets,
      CASE WHEN n.filters ? 'missing_essentials_any'
        THEN NULLIF(
          ARRAY(SELECT jsonb_array_elements_text(n.filters->'missing_essentials_any')),
          ARRAY[]::text[]
        )
      END AS missing_any,
      -- 204 — « editeur et superieur » est une regle d AUTORISATION, pas un
      -- masquage d ecran. Le panneau cache le groupe et le hook neutralise
      -- l etat, mais un lecteur seul authentifie peut appeler ce RPC en direct
      -- avec les deux cles : on les neutralise donc ICI aussi. Constant par
      -- requete (un seul InitPlan), invisible sur le chemin chaud.
      -- LA SONDE EST PARESSEUSE, et ce n est pas une micro-optimisation :
      -- api.current_user_can_edit_objects() coute 2,5 ms (plusieurs EXISTS sur
      -- les tables d appartenance) et le CTE params est evalue plusieurs fois.
      -- Appelee sans garde, elle ajoutait +6,5 ms mesures a CHAQUE requete, y
      -- compris le chemin public anonyme qui n a rien a voir avec ce filtre.
      -- Le CASE court-circuite : sans les cles, la fonction n est jamais appelee
      -- et FALSE fait tomber le predicat sur sa branche « pas de filtre ».
      -- COALESCE OBLIGATOIRE dans la branche vraie : la fonction est a TROIS
      -- valeurs (sa chaine de OR passe par auth.role(), NULL hors contexte
      -- HTTP). Sans lui, `WHEN NOT can_use_remplissage` serait NULL, la branche
      -- serait ignoree et le filtre s appliquerait quand meme : fail-OPEN.
      CASE WHEN n.filters ? 'missing_essentials_buckets'
             OR n.filters ? 'missing_essentials_any'
           THEN COALESCE(api.current_user_can_edit_objects(), FALSE)
           ELSE FALSE
      END AS can_use_remplissage,
      -- use_mv: TRUE → read from internal.mv_filtered_objects (hot path).
      -- The MV is built `WHERE o.status = 'published'` so any p_status that
      -- includes a non-public value (draft / archived / …) MUST bypass the MV
      -- and read the live `object` table — otherwise non-public rows are
      -- silently invisible to editors/admins. Order is irrelevant because we
      -- use the `<@` containment operator. NULL p_status means "no status
      -- filter" at this layer (the wrapper functions already default it to
      -- ['published']), so the MV stays safe.
      -- §197 : la recherche floue N'EST PAS une exclusion — le MV porte désormais
      -- search_document_text et city_normalized, donc le chemin publié (le seul que
      -- voient les visiteurs anonymes) reste sur le cache chaud.
      (NOT (
        n.filters ? 'amenities_all'
        OR n.filters ? 'amenity_families_any'
        OR n.filters ? 'accessibility_any'         -- §162: requires live join on object_classification (label not in cache)
        OR n.filters ? 'city_any'
        OR n.filters ? 'lieu_dit_any'
        OR n.filters ? 'pet_accepted'
        OR n.filters ? 'media_types_any'
        OR n.filters ? 'meeting_room'
        OR n.filters ? 'capacity_filters'
        OR n.filters ? 'tags_any'
        OR n.filters ? 'accommodation_unit_types_any'   -- §201: jointure vive sur object_accommodation_unit_type
        OR n.filters ? 'itinerary'
        OR n.filters ? 'label_scheme_ranked'  -- requires live joins for rank-1 evidence
        OR n.filters ? 'disability_types_any'      -- requires live join on ref_amenity.extra (not in cache)
        OR n.filters ? 'label_disability_types_any' -- requires live join on object_classification.subvalue_ids
        OR n.filters ? 'sustainability_any'
        OR n.filters ? 'sustainability_categories_any'
        OR n.filters ? 'sustainability_actions_any'
      ))
      AND (
        p_status IS NULL
        OR p_status <@ ARRAY['published']::object_status[]
      ) AS use_mv
    FROM normalized n
  ),
  -- §157 — « ouvert à … » : le moteur d'ouverture (internal.compute_open_status,
  -- le MÊME que le cache open_now) évalué UNE SEULE FOIS à l'instant demandé —
  -- jamais en LATERAL par ligne (leçon §37). Ensemble vide quand le filtre est
  -- absent (garde interne p_at IS NULL ⇒ RETURN). MATERIALIZED est OBLIGATOIRE :
  -- référencé une seule fois, le CTE serait inliné dans l'EXISTS par-ligne du
  -- WHERE ⇒ le moteur re-tournerait par ligne scannée (mesuré 1,96 s vs 120 ms).
  open_at_state AS MATERIALIZED (
    SELECT s.object_id, s.is_open
    FROM params
    CROSS JOIN LATERAL internal.compute_open_status(params.open_at) s
    WHERE params.open_at IS NOT NULL
  ),
  -- NOT MATERIALIZED : ce CTE est désormais référencé DEUX fois (ici et par
  -- `fuzzy_gate`). Sans cette clause, PostgreSQL le matérialiserait d'office
  -- (règle « référencé plusieurs fois ») et les prédicats de type/statut/facette
  -- ne pourraient plus descendre dans le balayage du MV — régression silencieuse
  -- sur TOUS les chemins, y compris ceux sans recherche. Deux inlinings, chacun
  -- optimisable, coûtent moins qu'une matérialisation opaque.
  source_rows AS NOT MATERIALIZED (
    SELECT
      m.id AS object_id,
      m.object_type,
      m.status,
      m.commercial_visibility,
      m.name_search_vector,
      m.city_search_vector,
      m.city_normalized,
      NULL::TEXT AS lieu_dit_normalized,
      m.geog2,
      m.cached_is_open_now,
      m.cached_amenity_codes,
      m.cached_payment_codes,
      m.cached_environment_tags,
      m.cached_language_codes,
      m.cached_classification_codes,
      m.cached_taxonomy_codes,
      m.search_document,
      m.name_normalized,
      m.search_document_text,
      m.search_document_phonetic
    FROM internal.mv_filtered_objects m
    CROSS JOIN params
    WHERE params.use_mv

    UNION ALL

    SELECT
      o.id AS object_id,
      o.object_type,
      o.status,
      o.commercial_visibility,
      o.name_search_vector,
      ol.city_search_vector,
      immutable_unaccent(lower(ol.city)) AS city_normalized,
      immutable_unaccent(lower(ol.lieu_dit)) AS lieu_dit_normalized,
      ol.geog2,
      o.cached_is_open_now,
      o.cached_amenity_codes,
      o.cached_payment_codes,
      o.cached_environment_tags,
      o.cached_language_codes,
      o.cached_classification_codes,
      o.cached_taxonomy_codes,
      o.search_document,
      o.name_normalized,
      o.search_document_text,
      o.search_document_phonetic
    FROM object o
    CROSS JOIN params
    LEFT JOIN LATERAL (
      SELECT ol2.city_search_vector, ol2.city, ol2.lieu_dit, ol2.geog2
      FROM object_location ol2
      WHERE ol2.object_id = o.id
        AND ol2.is_main_location IS TRUE
      ORDER BY ol2.created_at
      LIMIT 1
    ) ol ON TRUE
    WHERE NOT params.use_mv
  ),
  -- §197 — LE REPLI. Le flou ne s'ajoute pas au plein texte : il le REMPLACE, et
  -- seulement quand le plein texte ne trouve RIEN. Une saisie correcte garde donc
  -- exactement son résultat et exactement son coût d'aujourd'hui ; les trigrammes
  -- ne se paient que sur les recherches qui, sans eux, renverraient une page vide.
  --
  -- Portée de la sonde : le corpus (type + statut), PAS les filtres de facette.
  -- Volontaire : si une commune ou un équipement vide le résultat, c'est le FILTRE
  -- qui décide, pas l'orthographe — relâcher la recherche à ce moment-là ferait
  -- réapparaître des fiches que l'utilisateur vient d'exclure.
  --
  -- MATERIALIZED est OBLIGATOIRE (corollaire §157) : référencé une seule fois, ce
  -- CTE serait inliné dans un prédicat évalué PAR LIGNE, et la sonde repartirait à
  -- chaque ligne scannée. Même piège que `open_at_state`.
  -- `AND NOT EXISTS(...)` court-circuite : quand le flou n'est pas armé (pas de
  -- recherche, mode `name`, multi-mots, < 4 caractères), la sonde ne s'exécute pas.
  -- Et l'EXISTS s'arrête au PREMIER résultat exact : sur une recherche qui marche —
  -- le cas courant — la sonde est quasi gratuite.
  fuzzy_gate AS MATERIALIZED (
    SELECT (
      params.fuzzy_enabled
      AND NOT EXISTS (
        SELECT 1
        FROM source_rows s2
        WHERE (p_types IS NULL OR s2.object_type = ANY(p_types))
          AND (p_status IS NULL OR s2.status = ANY(p_status))
          AND (
            s2.name_search_vector @@ plainto_tsquery('french', api.norm_search(p_search))
            OR (s2.city_search_vector IS NOT NULL
                AND s2.city_search_vector @@ plainto_tsquery('french', api.norm_search(p_search)))
            OR ((params.filters->>'search_mode') = 'global'
                AND s2.search_document IS NOT NULL
                AND s2.search_document @@ plainto_tsquery('french', api.norm_search(p_search)))
          )
      )
    ) AS armed,
    -- §199 — le code phonétique de la saisie. Le flou est mono-mot par construction
    -- (garde `search_norm !~ '\s'`), donc UN code suffit — pas besoin de tokeniser.
    -- Calculé ici, dans un CTE MATERIALIZED évalué une seule fois.
    -- Le CASE n'est PAS cosmétique : sans lui, plainto_tsquery reçoit une chaîne vide
    -- sur CHAQUE requête sans terme de recherche — le chemin le plus chaud — et
    -- PostgreSQL émet alors un NOTICE « text-search query doesn't contain lexemes »
    -- à chaque appel. Constaté en production après le déploiement, corrigé aussitôt.
    CASE WHEN params.fuzzy_enabled THEN dmetaphone(params.search_norm) END AS phonetic_code,
    CASE WHEN params.fuzzy_enabled AND COALESCE(dmetaphone(params.search_norm), '') <> ''
         THEN plainto_tsquery('simple', dmetaphone(params.search_norm)) END AS phonetic_query
    FROM params
  )
  SELECT
    src.object_id,
    -- label_rank: 0 = exact granted classification, 1 = equivalent evidence.
    -- Only meaningful when label_scheme_ranked filter is present; always 0 otherwise.
    CASE
      WHEN NOT (params.filters ? 'label_scheme_ranked') THEN 0
      WHEN exact_label.evidence_count > 0 THEN 0
      ELSE 1
    END AS label_rank,
    CASE
      WHEN NOT (params.filters ? 'label_scheme_ranked') THEN NULL::jsonb
      WHEN exact_label.evidence_count > 0 THEN jsonb_build_object(
        'scheme_code', params.filters->>'label_scheme_ranked',
        'rank', 0,
        'source', 'certified_label',
        'evidence_count', exact_label.evidence_count
      )
      WHEN accessibility_evidence.evidence_count > 0 THEN jsonb_build_object(
        'scheme_code', params.filters->>'label_scheme_ranked',
        'rank', 1,
        'source', 'accessibility_amenity',
        'evidence_count', accessibility_evidence.evidence_count
      )
      WHEN sustainability_evidence.evidence_count > 0 THEN jsonb_build_object(
        'scheme_code', params.filters->>'label_scheme_ranked',
        'rank', 1,
        'source', 'sustainability_action',
        'evidence_count', sustainability_evidence.evidence_count
      )
      ELSE NULL::jsonb
    END AS label_match,
    -- relevance (§109 + §197): deux étages qui ne se croisent JAMAIS.
    --   exact (plein texte)  → 2.0 + ts_rank(...)   ∈ [2, 3)
    --   approximatif (trgm)  → score brut pondéré   ∈ [0, 1]  (nom > commune > contenu)
    -- Le socle 2.0 garantit l'exigence produit « un résultat exact passe toujours
    -- devant un résultat approximatif », sans dépendre d'un tri applicatif. Avec le
    -- repli les deux étages ne cohabitent pas dans une même page ; le socle est
    -- conservé pour que l'invariant reste posé dans le code (cf. en-tête).
    -- Sans terme de recherche : 0 ⇒ l'ORDER BY relevance des appelants redevient
    -- un départage neutre et l'ordre historique est préservé (contrat §109).
    -- Le tsvector composé est construit UNE fois par ligne survivante (sous-requête
    -- scalaire) : la liste SELECT est évaluée après filtrage, donc jamais sur le
    -- corpus entier — et rien n'est calculé du tout quand p_search est NULL.
    CASE
      WHEN p_search IS NULL THEN 0::real
      ELSE (
        SELECT GREATEST(
          CASE WHEN t.v @@ t.q THEN 2.0::real + ts_rank(t.v, t.q) ELSE 0::real END,
          COALESCE(GREATEST(
            fz.name_score,
            fz.city_score * 0.90::real,
            fz.doc_score * 0.75::real
          ), 0::real)
        )
        FROM (
          SELECT
            setweight(src.name_search_vector, 'A')
            || setweight(COALESCE(src.city_search_vector, ''::tsvector), 'A')
            || CASE WHEN (params.filters->>'search_mode') = 'global'
                    THEN COALESCE(src.search_document, ''::tsvector)
                    ELSE ''::tsvector END AS v,
            plainto_tsquery('french', api.norm_search(p_search)) AS q
        ) t
      )
    END AS relevance
  FROM source_rows src
  CROSS JOIN params
  CROSS JOIN fuzzy_gate gate
  -- §197 — les trois scores de proximité, calculés UNE SEULE FOIS par ligne source
  -- (ils servent au filtre ET au classement).
  --
  -- LE `CASE` EST OBLIGATOIRE, PAS COSMÉTIQUE. Une première version portait
  -- `WHERE gate.armed` sur ce LATERAL : le planificateur aplatit une sous-requête
  -- sans FROM et évalue alors la liste SELECT AVANT le prédicat, donc
  -- word_similarity tournait sur les 846 documents même le flou désarmé — mesuré :
  -- le chemin chaud SANS recherche passait de 16 ms à 162 ms. `CASE` court-circuite
  -- réellement (PostgreSQL n'évalue pas les sous-expressions inutiles), et le coût
  -- des trigrammes redevient nul hors repli.
  -- Ne pas « simplifier » en remettant un WHERE.
  LEFT JOIN LATERAL (
    SELECT
      CASE WHEN gate.armed
           THEN word_similarity(params.search_norm, COALESCE(src.name_normalized, ''))
           ELSE 0::real END AS name_score,
      CASE WHEN gate.armed
           THEN word_similarity(params.search_norm, COALESCE(src.city_normalized, ''))
           ELSE 0::real END AS city_score,
      CASE WHEN gate.armed
           THEN word_similarity(params.search_norm, COALESCE(src.search_document_text, ''))
           ELSE 0::real END AS doc_score
  ) fz ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT oc.id)::integer AS evidence_count
    FROM object_classification oc
    JOIN ref_classification_scheme cs ON cs.id = oc.scheme_id
    WHERE (params.filters ? 'label_scheme_ranked')
      AND oc.object_id = src.object_id
      AND cs.code = params.filters->>'label_scheme_ranked'
      AND oc.status = 'granted'
      AND (
        (params.filters->>'label_scheme_ranked') <> 'LBL_TOURISME_HANDICAP'
        OR COALESCE(params.label_disability_types_any, params.disability_types_any) IS NULL
        OR cardinality(COALESCE(params.label_disability_types_any, params.disability_types_any)) = 0
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(oc.subvalue_ids, ARRAY[]::uuid[])) AS sv(uid)
          JOIN ref_classification_value cv ON cv.id = sv.uid
          WHERE cv.metadata->>'disability_type' = ANY(COALESCE(params.label_disability_types_any, params.disability_types_any))
        )
      )
  ) exact_label ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT osa.action_id)::integer AS evidence_count
    FROM object_sustainability_action osa
    JOIN ref_sustainability_action rsa ON rsa.id = osa.action_id
    JOIN ref_classification_scheme cs ON cs.code = params.filters->>'label_scheme_ranked'
    WHERE (params.filters ? 'label_scheme_ranked')
      AND params.filters->>'label_scheme_ranked' <> 'LBL_TOURISME_HANDICAP'
      AND osa.object_id = src.object_id
      AND (
        EXISTS (
          SELECT 1
          FROM ref_classification_equivalent_action rcea
          WHERE rcea.scheme_id = cs.id
            AND rcea.action_id = osa.action_id
            AND rcea.match_scope IN ('search_expansion', 'both')
        )
        OR EXISTS (
          SELECT 1
          FROM ref_classification_equivalent_group rceg
          WHERE rceg.scheme_id = cs.id
            AND rceg.group_id = rsa.group_id
            AND rceg.match_scope IN ('search_expansion', 'both')
        )
        OR EXISTS (
          SELECT 1
          FROM object_sustainability_action_label osal
          JOIN object_classification oc2 ON oc2.id = osal.object_classification_id
          WHERE osal.object_sustainability_action_id = osa.id
            AND oc2.scheme_id = cs.id
        )
      )
  ) sustainability_evidence ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT oa.amenity_id)::integer AS evidence_count
    FROM object_amenity oa
    JOIN ref_amenity ra ON ra.id = oa.amenity_id
    JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
    WHERE (params.filters ? 'label_scheme_ranked')
      AND params.filters->>'label_scheme_ranked' = 'LBL_TOURISME_HANDICAP'
      AND oa.object_id = src.object_id
      AND fam.code = 'accessibility'
      AND (
        COALESCE(params.disability_types_any, params.label_disability_types_any) IS NULL
        OR cardinality(COALESCE(params.disability_types_any, params.label_disability_types_any)) = 0
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(ra.extra->'disability_types', '[]'::jsonb)) AS dt(val)
          WHERE dt.val = ANY(COALESCE(params.disability_types_any, params.label_disability_types_any))
        )
      )
  ) accessibility_evidence ON TRUE
  WHERE (p_types IS NULL OR src.object_type = ANY(p_types))
    AND (p_status IS NULL OR src.status = ANY(p_status))
    AND (NOT (params.filters ? 'commercial_visibility') OR src.commercial_visibility = (params.filters->>'commercial_visibility'))
    AND (params.commercial_visibility_any IS NULL OR src.commercial_visibility = ANY(params.commercial_visibility_any))
    AND (
      p_search IS NULL OR
      src.name_search_vector @@ plainto_tsquery('french', api.norm_search(p_search)) OR
      (src.city_search_vector IS NOT NULL AND src.city_search_vector @@ plainto_tsquery('french', api.norm_search(p_search))) OR
      -- §109 global mode: also match the aggregated search_document (équipements, tags,
      -- environnement, taxonomie, labels, menus/plats/régimes/allergènes/cuisines, prose).
      (
        (params.filters->>'search_mode') = 'global'
        AND src.search_document IS NOT NULL
        AND src.search_document @@ plainto_tsquery('french', api.norm_search(p_search))
      ) OR
      -- §197 — bras APPROXIMATIF, armé UNIQUEMENT en repli (gate.armed = le plein
      -- texte n'a rien trouvé dans le corpus). Une saisie sans faute ne l'atteint
      -- jamais : elle garde son résultat et son coût d'avant, au bit près.
      (
        gate.armed
        AND (
          fz.name_score >= params.fuzzy_threshold
          OR fz.city_score >= params.fuzzy_threshold
          OR fz.doc_score >= params.fuzzy_threshold
        )
      ) OR
      -- §199 — bras PHONÉTIQUE, lui aussi armé en repli seulement. Il rattrape la
      -- classe que les trigrammes ne peuvent PAS rattraper : les graphies phonétiques
      -- (`kafé`→`café`, `site`→`cité`), où la 1re lettre change et détruit d'un coup
      -- trois trigrammes sur cinq. Mesuré : `kafe`↔`cafe` = 0.400, soit EXACTEMENT le
      -- plancher de bruit des requêtes de 4 caractères (`bequ`↔`bebe` = 0.400) — aucun
      -- seuil trigramme ne peut les séparer, c'est une collision, pas un réglage.
      --
      -- DEUX ÉTAGES, et l'ordre compte :
      --   1. préfiltre `@@` sur le document phonétique — intersection de listes triées,
      --      ~1 ms sur les 846 fiches (à comparer aux ~145 ms d'un balayage trigramme).
      --   2. confirmation AU NIVEAU DU MOT sur les seuls candidats. Confirmer sur le
      --      document ENTIER ne marche pas : mesuré, `bequ` passait alors à 18 fiches
      --      parce qu'un mot QUELCONQUE du document suffisait. Il faut que ce soit LE
      --      mot qui a matché phonétiquement qui ressemble aussi à la saisie.
      -- Seuil de confirmation 0.30 : plateau mesuré (comptes identiques de 0.25 à 0.35).
      -- Il ne refiltre pas, il rejette les collisions sans parenté de caractères —
      -- `zzqtrpp`→`secteur` 0.000, `bequ`→`pique` 0.000, `kafe`→`goyavier` 0.000 —
      -- et garde `kafe`→`cafe` (0.400).
      (
        gate.armed
        AND COALESCE(gate.phonetic_code, '') <> ''
        AND src.search_document_phonetic @@ gate.phonetic_query
        AND EXISTS (
          SELECT 1
          FROM regexp_split_to_table(COALESCE(src.search_document_text, ''), '[^a-z0-9]+') AS w(tok)
          WHERE length(w.tok) >= 3
            AND w.tok ~ '^[a-z]'
            AND dmetaphone(w.tok) = gate.phonetic_code
            AND word_similarity(params.search_norm, w.tok) >= 0.30
        )
      )
    )
    AND (params.city_any IS NULL OR COALESCE(src.city_normalized, '') = ANY(params.city_any))
    AND (params.lieu_dit_any IS NULL OR COALESCE(src.lieu_dit_normalized, '') = ANY(params.lieu_dit_any))
    AND (params.amenities_any IS NULL OR COALESCE(src.cached_amenity_codes, ARRAY[]::TEXT[]) && params.amenities_any)
    AND (params.amenities_all IS NULL OR NOT EXISTS (
      SELECT 1
      FROM unnest(params.amenities_all) AS req(code)
      WHERE NOT EXISTS (
        SELECT 1
        FROM object_amenity oa
        JOIN ref_amenity ra ON ra.id = oa.amenity_id
        WHERE oa.object_id = src.object_id AND ra.code = req.code
      )
    ))
    AND (params.amenity_families_any IS NULL OR EXISTS (
      SELECT 1
      FROM object_amenity oa
      JOIN ref_amenity ra ON ra.id = oa.amenity_id
      JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
      WHERE oa.object_id = src.object_id AND fam.code = ANY(params.amenity_families_any)
    ))
    -- accessibility_any (toggle PMR, §162) : équipement famille `accessibility` OU label
    -- Tourisme & Handicap `granted` — le label certifié suffit même sans équipement saisi
    -- (directive PO 2026-07-03). Clé DÉDIÉE : amenity_families_any reste équipement-pur
    -- (filtre transverse Services & équipements §159) et le toggle PMR ne peut plus être
    -- clobbé par lui côté payload. Bypasse le MV (labels non cachés).
    AND (NOT COALESCE((params.filters->>'accessibility_any')::boolean, FALSE) OR (
      EXISTS (
        SELECT 1
        FROM object_amenity oa
        JOIN ref_amenity ra ON ra.id = oa.amenity_id
        JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
        WHERE oa.object_id = src.object_id AND fam.code = 'accessibility'
      )
      OR EXISTS (
        SELECT 1
        FROM object_classification oc
        JOIN ref_classification_scheme cs ON cs.id = oc.scheme_id
        WHERE oc.object_id = src.object_id
          AND cs.code = 'LBL_TOURISME_HANDICAP'
          AND oc.status = 'granted'
      )
    ))
    -- disability_types_any: retourne les objets avec ≥1 amenity acc_* dont extra.disability_types
    -- contient au moins une des valeurs demandées, OU (§162) un label T&H `granted` dont les
    -- subvalue_ids couvrent un type demandé — subvalue_ids vides = couverture inconnue (état de
    -- l'import) ⇒ le label seul matche n'importe quel type demandé (directive PO 2026-07-03 ;
    -- à affiner via la saisie éditeur §10 des types couverts). Tableau vide → aucun effet
    -- (cardinality guard). Bypasse le MV (use_mv = FALSE) car ref_amenity.extra n'est pas dans
    -- cached_amenity_codes (ni les labels).
    AND (
      params.disability_types_any IS NULL
      OR cardinality(params.disability_types_any) = 0
      OR params.filters->>'label_scheme_ranked' = 'LBL_TOURISME_HANDICAP'
      OR EXISTS (
        SELECT 1
        FROM object_amenity oa
        JOIN ref_amenity ra ON ra.id = oa.amenity_id
        CROSS JOIN LATERAL jsonb_array_elements_text(
          COALESCE(ra.extra->'disability_types', '[]'::jsonb)
        ) AS dt(val)
        WHERE oa.object_id = src.object_id
          AND ra.code LIKE 'acc_%'
          AND dt.val = ANY(params.disability_types_any)
      )
      OR EXISTS (
        SELECT 1
        FROM object_classification oc
        JOIN ref_classification_scheme cs ON cs.id = oc.scheme_id
        WHERE oc.object_id = src.object_id
          AND cs.code = 'LBL_TOURISME_HANDICAP'
          AND oc.status = 'granted'
          AND (
            COALESCE(cardinality(oc.subvalue_ids), 0) = 0
            OR EXISTS (
              SELECT 1
              FROM unnest(oc.subvalue_ids) AS sv(uid)
              JOIN ref_classification_value cv ON cv.id = sv.uid
              WHERE cv.metadata->>'disability_type' = ANY(params.disability_types_any)
            )
          )
      )
    )
    -- label_disability_types_any: retourne les objets avec un grant LBL_TOURISME_HANDICAP explicite
    -- dont les subvalue_ids contiennent ≥1 type demandé (via ref_classification_value.metadata->>'disability_type').
    -- Ne déduit pas depuis les amenities — requiert uniquement le label certifié avec subvalue_ids renseignés.
    -- Tableau vide → aucun effet. Bypasse le MV (use_mv = FALSE).
    AND (
      params.label_disability_types_any IS NULL
      OR cardinality(params.label_disability_types_any) = 0
      OR params.filters->>'label_scheme_ranked' = 'LBL_TOURISME_HANDICAP'
      OR EXISTS (
        SELECT 1
        FROM object_classification oc
        JOIN ref_classification_scheme cs ON cs.id = oc.scheme_id
        CROSS JOIN LATERAL unnest(oc.subvalue_ids) AS sv(uid)
        JOIN ref_classification_value cv ON cv.id = sv.uid
        WHERE oc.object_id = src.object_id
          AND cs.code = 'LBL_TOURISME_HANDICAP'
          AND oc.status = 'granted'
          AND cv.metadata->>'disability_type' = ANY(params.label_disability_types_any)
      )
    )
    AND (NOT COALESCE((params.filters->>'sustainability_any')::boolean, FALSE) OR (
      EXISTS (
        SELECT 1
        FROM object_sustainability_action osa
        WHERE osa.object_id = src.object_id
      )
      OR EXISTS (
        SELECT 1
        FROM object_classification oc
        JOIN ref_classification_scheme sc ON sc.id = oc.scheme_id
        WHERE oc.object_id = src.object_id
          AND oc.status = 'granted'
          AND sc.display_group = 'sustainability_labels'
      )
    ))
    AND (params.sustainability_categories_any IS NULL OR cardinality(params.sustainability_categories_any) = 0 OR EXISTS (
      SELECT 1
      FROM object_sustainability_action osa
      JOIN ref_sustainability_action rsa ON rsa.id = osa.action_id
      JOIN ref_sustainability_action_category rac ON rac.id = rsa.category_id
      WHERE osa.object_id = src.object_id
        AND rac.code = ANY(params.sustainability_categories_any)
    ))
    AND (params.sustainability_actions_any IS NULL OR cardinality(params.sustainability_actions_any) = 0 OR EXISTS (
      SELECT 1
      FROM object_sustainability_action osa
      JOIN ref_sustainability_action rsa ON rsa.id = osa.action_id
      WHERE osa.object_id = src.object_id
        AND rsa.code = ANY(params.sustainability_actions_any)
    ))
    -- 204 — Remplissage.
    -- GARDE EN `CASE`, JAMAIS EN `OR` : le planificateur reordonne les quals
    -- par cout, donc `AND (garde IS NULL OR <couteux>)` n assure aucun
    -- court-circuit. `CASE` court-circuite (lecon 197). Filtre eteint => la
    -- vue n est jamais lue, cout nul sur le chemin chaud.
    -- Un appelant non-editeur voit ses cles IGNOREES, pas rejetees : cette
    -- fonction est `LANGUAGE sql` et ne peut pas lever d exception sans une
    -- fonction tierce, et une degradation douce evite de casser la session d un
    -- utilisateur dont le role change en cours de route. Ignorer ne divulgue
    -- rien — le filtre est simplement sans effet.
    AND CASE
      WHEN NOT params.can_use_remplissage THEN TRUE
      WHEN params.missing_buckets IS NULL AND params.missing_any IS NULL THEN TRUE
      ELSE EXISTS (
        SELECT 1
        FROM internal.v_object_essentials ess
        WHERE ess.object_id = src.object_id
          AND (params.missing_buckets IS NULL OR
               CASE
                 WHEN cardinality(ess.missing_essentials) = 0  THEN 'complete'
                 WHEN cardinality(ess.missing_essentials) <= 2 THEN 'few'
                 ELSE 'many'
               END = ANY(params.missing_buckets))
          -- `&&` = recouvrement de tableaux : « au moins un des essentiels
          -- demandes est manquant ». C est le OU interne de la facette.
          AND (params.missing_any IS NULL OR ess.missing_essentials && params.missing_any)
      )
    END
    AND (NOT (params.filters ? 'pet_accepted') OR EXISTS (
      SELECT 1 FROM object_pet_policy opp
      WHERE opp.object_id = src.object_id AND opp.accepted = ((params.filters->>'pet_accepted')::boolean)
    ))
    AND (params.payment_methods_any IS NULL OR COALESCE(src.cached_payment_codes, ARRAY[]::TEXT[]) && params.payment_methods_any)
    AND (params.environment_tags_any IS NULL OR COALESCE(src.cached_environment_tags, ARRAY[]::TEXT[]) && params.environment_tags_any)
    AND (params.languages_any IS NULL OR COALESCE(src.cached_language_codes, ARRAY[]::TEXT[]) && params.languages_any)
    AND (params.media_types_any IS NULL OR EXISTS (
      SELECT 1
      FROM media m
      JOIN ref_code_media_type mt ON mt.id = m.media_type_id
      WHERE m.object_id = src.object_id
        AND (NOT (params.filters ? 'media_published_only') OR m.is_published = TRUE)
        AND ((params.filters->>'media_must_have_main')::boolean IS DISTINCT FROM TRUE OR m.is_main = TRUE)
        AND mt.code = ANY(params.media_types_any)
    ))
    AND (NOT (params.filters ? 'meeting_room') OR (
      EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = src.object_id)
      AND ( (params.filters->'meeting_room'->>'min_count') IS NULL
            OR (SELECT COUNT(*) FROM object_meeting_room r WHERE r.object_id = src.object_id) >= (params.filters->'meeting_room'->>'min_count')::int )
      AND ( (params.filters->'meeting_room'->>'min_area_m2') IS NULL
            OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = src.object_id AND r.area_m2 >= (params.filters->'meeting_room'->>'min_area_m2')::numeric) )
      AND ( (params.filters->'meeting_room'->>'min_cap_theatre') IS NULL
            OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = src.object_id AND r.cap_theatre >= (params.filters->'meeting_room'->>'min_cap_theatre')::int) )
      AND ( (params.filters->'meeting_room'->>'min_cap_u') IS NULL
            OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = src.object_id AND r.cap_u >= (params.filters->'meeting_room'->>'min_cap_u')::int) )
      AND ( (params.filters->'meeting_room'->>'min_cap_classroom') IS NULL
            OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = src.object_id AND r.cap_classroom >= (params.filters->'meeting_room'->>'min_cap_classroom')::int) )
      AND ( (params.filters->'meeting_room'->>'min_cap_boardroom') IS NULL
            OR EXISTS (SELECT 1 FROM object_meeting_room r WHERE r.object_id = src.object_id AND r.cap_boardroom >= (params.filters->'meeting_room'->>'min_cap_boardroom')::int) )
      AND ( params.meeting_equipment_any IS NULL
            OR EXISTS (
              SELECT 1
              FROM meeting_room_equipment me
              JOIN object_meeting_room r ON r.id = me.room_id AND r.object_id = src.object_id
              JOIN ref_code_meeting_equipment e ON e.id = me.equipment_id
              WHERE e.code = ANY(params.meeting_equipment_any)
            )
      )
      AND ( params.meeting_equipment_all IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM unnest(params.meeting_equipment_all) AS req(code)
              WHERE NOT EXISTS (
                SELECT 1
                FROM meeting_room_equipment me
                JOIN object_meeting_room r ON r.id = me.room_id AND r.object_id = src.object_id
                JOIN ref_code_meeting_equipment e ON e.id = me.equipment_id
                WHERE e.code = req.code
              )
            )
      )
    ))
    AND (NOT (params.filters ? 'capacity_filters') OR NOT EXISTS (
      SELECT 1
      FROM LATERAL jsonb_array_elements(params.filters->'capacity_filters') cf(j)
      LEFT JOIN ref_capacity_metric cm ON cm.code = (cf.j->>'code')
      WHERE cm.id IS NULL
         OR NOT EXISTS (
              SELECT 1
              FROM object_capacity oc
              WHERE oc.object_id = src.object_id
                AND oc.metric_id = cm.id
                AND ( (cf.j ? 'min') IS FALSE OR oc.value_integer >= (cf.j->>'min')::int )
                AND ( (cf.j ? 'max') IS FALSE OR oc.value_integer <= (cf.j->>'max')::int )
         )
    ))
    AND (params.classifications_any_codes IS NULL OR COALESCE(src.cached_classification_codes, ARRAY[]::TEXT[]) && params.classifications_any_codes)
    AND (params.taxonomy_any_codes IS NULL OR COALESCE(src.cached_taxonomy_codes, ARRAY[]::TEXT[]) && params.taxonomy_any_codes)
    -- Positionnements hôteliers : axe multi-valué, AND avec la nature.
    AND (
      NOT (params.filters ? 'accommodation_positionings_any')
      OR jsonb_array_length(params.filters->'accommodation_positionings_any') = 0
      OR EXISTS (
        SELECT 1
          FROM object_hotel_positioning ohp
          JOIN ref_code rc
            ON rc.id = ohp.positioning_id
           AND rc.domain = ohp.positioning_domain
         WHERE ohp.object_id = src.object_id
           AND rc.code IN (
             SELECT jsonb_array_elements_text(params.filters->'accommodation_positionings_any')
           )
      )
    )
    AND (params.tags_any IS NULL OR EXISTS (
      SELECT 1
      FROM tag_link tl
      JOIN ref_tag t ON t.id = tl.tag_id
      WHERE tl.target_table = 'object'
        AND tl.target_pk = src.object_id
        AND t.slug = ANY(params.tags_any)
    ))
    AND (params.accommodation_unit_types_any IS NULL OR EXISTS (
      SELECT 1
      FROM object_accommodation_unit_type ou
      JOIN ref_code_accommodation_unit_type ut ON ut.id = ou.unit_type_id
      WHERE ou.object_id = src.object_id
        AND ut.code = ANY(params.accommodation_unit_types_any)
    ))
    AND (NOT (params.filters ? 'itinerary') OR EXISTS (
      SELECT 1
      FROM object_iti oi
      WHERE oi.object_id = src.object_id
        AND ( (params.filters->'itinerary'->>'is_loop') IS NULL OR oi.is_loop = (params.filters->'itinerary'->>'is_loop')::boolean )
        AND ( (params.filters->'itinerary'->>'difficulty_min') IS NULL OR oi.difficulty_level >= (params.filters->'itinerary'->>'difficulty_min')::int )
        AND ( (params.filters->'itinerary'->>'difficulty_max') IS NULL OR oi.difficulty_level <= (params.filters->'itinerary'->>'difficulty_max')::int )
        AND ( (params.filters->'itinerary'->>'distance_min_km') IS NULL OR oi.distance_km >= (params.filters->'itinerary'->>'distance_min_km')::numeric )
        AND ( (params.filters->'itinerary'->>'distance_max_km') IS NULL OR oi.distance_km <= (params.filters->'itinerary'->>'distance_max_km')::numeric )
        -- Public filter contract stays in HOURS (duration_min_h / duration_max_h); object_iti.duration_min is MINUTES, so convert (h * 60).
        AND ( (params.filters->'itinerary'->>'duration_min_h') IS NULL OR oi.duration_min >= (params.filters->'itinerary'->>'duration_min_h')::numeric * 60 )
        AND ( (params.filters->'itinerary'->>'duration_max_h') IS NULL OR oi.duration_min <= (params.filters->'itinerary'->>'duration_max_h')::numeric * 60 )
        AND (
          params.iti_practices_any IS NULL
          OR EXISTS (
              SELECT 1
              FROM object_iti_practice oip
              JOIN ref_code_iti_practice ip ON ip.id = oip.practice_id
              WHERE oip.object_id = src.object_id AND ip.code = ANY(params.iti_practices_any)
          )
        )
    ))
    AND (NOT (params.filters ? 'within_radius') OR (
      src.geog2 IS NOT NULL
      AND ST_DWithin(
            src.geog2,
            ST_SetSRID(ST_MakePoint(
              (params.filters->'within_radius'->>'lon')::float8,
              (params.filters->'within_radius'->>'lat')::float8
            ),4326)::geography,
            GREATEST(0,(params.filters->'within_radius'->>'radius_m')::int)
          )
    ))
    AND (NOT (params.filters ? 'bbox') OR (
      src.geog2 IS NOT NULL
      AND src.geog2::geometry && ST_MakeEnvelope(
        (params.filters->'bbox'->>0)::float8, (params.filters->'bbox'->>1)::float8,
        (params.filters->'bbox'->>2)::float8, (params.filters->'bbox'->>3)::float8, 4326
      )
      AND ST_Within(
        src.geog2::geometry,
        ST_MakeEnvelope(
          (params.filters->'bbox'->>0)::float8, (params.filters->'bbox'->>1)::float8,
          (params.filters->'bbox'->>2)::float8, (params.filters->'bbox'->>3)::float8, 4326
        )
      )
    ))
    AND (NOT (params.filters ? 'open_now') OR src.cached_is_open_now = TRUE)
    -- §157 — « ouvert à … » : match uniquement is_open = TRUE (le tri-état NULL
    -- « aucune donnée d'ouverture » n'est JAMAIS matché, invariant §133 — même
    -- sémantique que open_now sur le cache).
    AND (params.open_at IS NULL OR EXISTS (
      SELECT 1 FROM open_at_state oas
      WHERE oas.object_id = src.object_id AND oas.is_open = TRUE
    ))
    -- §157 — Événements : recouvrement de [event_start_date, COALESCE(end,start)]
    -- avec la plage demandée `event:{from,to}` (dates ISO). La récurrence
    -- (object_fma.recurrence_pattern, texte libre) n'est PAS évaluée — limite
    -- documentée, à structurer quand les données FMA arriveront.
    AND (NOT (params.filters ? 'event') OR EXISTS (
      SELECT 1
      FROM object_fma f
      WHERE f.object_id = src.object_id
        AND ( (params.filters->'event'->>'from') IS NULL
              OR COALESCE(f.event_end_date, f.event_start_date) >= (params.filters->'event'->>'from')::date )
        AND ( (params.filters->'event'->>'to') IS NULL
              OR f.event_start_date <= (params.filters->'event'->>'to')::date )
    ))
    -- label_scheme_ranked: admit rank-0 (exact granted classification) and rank-1 (equivalent evidence).
    -- rank-1a: sustainability actions/groups mapped through ref_classification_equivalent_*.
    -- rank-1b: accessibility amenity family evidence (LBL_TOURISME_HANDICAP only).
    -- §173 — exact_only: when TRUE, admit ONLY rank-0 (certified label); equivalent evidence excluded.
    AND (NOT (params.filters ? 'label_scheme_ranked') OR (
      exact_label.evidence_count > 0
      OR (NOT params.exact_only AND (
        sustainability_evidence.evidence_count > 0
        OR accessibility_evidence.evidence_count > 0
      ))
    ));
$function$
;

-- ---- 5) list_object_resources_filtered_page : le champ sur les cartes -----
-- Corps DERIVE de la definition live par .tmp_pgapply/_gen_page204.cjs.
-- NE PAS EDITER A LA MAIN : regenerer.
-- Emis des que l appelant est editeur, sans condition sur le filtre :
-- 2,0 ms mesures pour une page de 24 (tout en index scan). Le conditionner
-- au filtre economiserait 2 ms et priverait la colonne Table de ses donnees
-- filtre eteint.
CREATE OR REPLACE FUNCTION api.list_object_resources_filtered_page(p_cursor text DEFAULT NULL::text, p_lang_prefs text[] DEFAULT ARRAY['fr'::text], p_page_size integer DEFAULT 50, p_filters jsonb DEFAULT '{}'::jsonb, p_types object_type[] DEFAULT NULL::object_type[], p_status object_status[] DEFAULT ARRAY['published'::object_status], p_search text DEFAULT NULL::text, p_track_format text DEFAULT 'none'::text, p_include_stages boolean DEFAULT NULL::boolean, p_stage_color text DEFAULT NULL::text, p_view text DEFAULT 'card'::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'api', 'extensions', 'auth', 'audit', 'crm', 'ref'
AS $function$
DECLARE
  v_cur JSONB;
  v_offset INTEGER := 0;
  v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_page_size,50),1), 200);
  v_filters JSONB := COALESCE(p_filters, '{}'::jsonb);
  v_types object_type[] := p_types;
  v_status object_status[] := p_status;
  v_search TEXT := p_search;
  v_lang_prefs TEXT[] := p_lang_prefs;
  v_total BIGINT;
  v_cursor JSONB;
  v_next TEXT;
  v_data JSONB;
  v_track TEXT := lower(coalesce(p_track_format,'none'));
  v_inc   BOOLEAN := p_include_stages;
  v_color TEXT    := p_stage_color;
  v_render_enabled BOOLEAN := TRUE;
  v_render_locale TEXT := NULL;
  v_render_tz TEXT := 'UTC';
  v_render_version TEXT := '1.0';
  v_view TEXT := lower(COALESCE(p_view, 'card'));
  v_current_cursor TEXT;
  v_rank0 INT;
  v_rank1 INT;
BEGIN
  v_render_locale := CASE
    WHEN array_length(p_lang_prefs,1) >= 1 AND position('-' IN p_lang_prefs[1]) > 0 THEN p_lang_prefs[1]
    WHEN array_length(p_lang_prefs,1) >= 1 AND char_length(p_lang_prefs[1]) = 2 THEN lower(p_lang_prefs[1]) || '-' || upper(p_lang_prefs[1])
    ELSE 'fr-FR'
  END;
  v_render_locale := lower(split_part(v_render_locale, '-', 1)) || '-' ||
                     upper(CASE WHEN position('-' IN v_render_locale) > 0 THEN split_part(v_render_locale, '-', 2)
                                ELSE split_part(v_render_locale, '-', 1) END);

  -- Cursor (offset/page_size + options)
  IF p_cursor IS NOT NULL THEN
    v_cur := api.cursor_unpack(p_cursor);
    v_offset := COALESCE((v_cur->>'offset')::INT, 0);
    v_limit  := LEAST(GREATEST(COALESCE((v_cur->>'page_size')::INT, v_limit),1),200);
    IF v_cur ? 'filters'      THEN v_filters := v_cur->'filters'; END IF;
    IF v_cur ? 'types'        THEN v_types := ARRAY(SELECT jsonb_array_elements_text(v_cur->'types'))::object_type[]; END IF;
    IF v_cur ? 'status' THEN
      IF (v_cur->'status') IS NULL OR jsonb_typeof(v_cur->'status') <> 'array' THEN
        v_status := NULL;
      ELSE
        v_status := ARRAY(SELECT jsonb_array_elements_text(v_cur->'status'))::object_status[];
      END IF;
    END IF;
    IF v_cur ? 'search'       THEN v_search := v_cur->>'search'; END IF;
    IF v_cur ? 'lang'         THEN v_lang_prefs := ARRAY(SELECT jsonb_array_elements_text(v_cur->'lang')); END IF;
    IF v_cur ? 'track_format'   THEN v_track := lower(v_cur->>'track_format'); END IF;
    IF v_cur ? 'include_stages' THEN v_inc   := (v_cur->>'include_stages')::boolean; END IF;
    IF v_cur ? 'stage_color'    THEN v_color := v_cur->>'stage_color'; END IF;
    IF v_cur ? 'render'         THEN v_render_enabled := (v_cur->>'render')::boolean; END IF;
    IF v_cur ? 'render_locale'  THEN v_render_locale := v_cur->>'render_locale'; END IF;
    IF v_cur ? 'render_tz'      THEN v_render_tz := v_cur->>'render_tz'; END IF;
    IF v_cur ? 'render_version' THEN v_render_version := v_cur->>'render_version'; END IF;
    IF v_cur ? 'view'           THEN v_view := lower(v_cur->>'view'); END IF;
  END IF;

  IF v_status IS NULL THEN
    v_status := ARRAY['published']::object_status[];
  END IF;

  IF v_view NOT IN ('card', 'full') THEN
    v_view := 'card';
  END IF;

  IF v_render_locale IS NULL OR v_render_locale = '' THEN
    v_render_locale := 'fr-FR';
  END IF;
  v_render_locale := lower(split_part(v_render_locale, '-', 1)) || '-' ||
                     upper(CASE WHEN position('-' IN v_render_locale) > 0 THEN split_part(v_render_locale, '-', 2)
                                ELSE split_part(v_render_locale, '-', 1) END);

  WITH filt AS (
    SELECT
      o.id,
      o.name_normalized,
      o.updated_at,
      o.updated_at_source,
      -- label_rank: 0 = exact label, 1 = equivalent evidence; always 0 when no label_scheme_ranked filter
      fids.label_rank,
      fids.label_match,
      -- relevance (§109): full-text rank; 0 when no search term (ordering then identical to legacy)
      fids.relevance
    FROM api.get_filtered_object_ids(v_filters, v_types, v_status, v_search) fids
    JOIN object o ON o.id = fids.object_id
  ),
  paged AS (
    SELECT f.*, ROW_NUMBER() OVER (ORDER BY CASE WHEN v_filters ? 'label_scheme_ranked' THEN f.label_rank END, f.relevance DESC, f.label_rank, f.name_normalized NULLS LAST, f.id) AS ord
    FROM filt f
    ORDER BY CASE WHEN v_filters ? 'label_scheme_ranked' THEN f.label_rank END, f.relevance DESC, f.label_rank, f.name_normalized NULLS LAST, f.id
    OFFSET v_offset LIMIT v_limit
  ),
  raw_data AS (
    SELECT
      CASE
        WHEN v_view = 'full' THEN
          api.get_object_resources_batch(
            (SELECT ARRAY_AGG(p.id ORDER BY p.ord) FROM paged p),
            v_lang_prefs,
            v_track,
            jsonb_build_object(
              'include_stages', v_inc,
              'stage_color', v_color,
              'render', v_render_enabled,
              'render_locale', v_render_locale,
              'render_tz', v_render_tz,
              'render_version', v_render_version
            )
          )::jsonb
        ELSE
          api.get_object_cards_batch(
            (SELECT ARRAY_AGG(p.id ORDER BY p.ord) FROM paged p),
            v_lang_prefs
          )::jsonb
      END AS data
  ),
  decorated_data AS (
    -- Attach per-card label_match by array position. Sound because this function is
    -- SECURITY INVOKER (paged ids are already RLS-filtered to the caller's readable set,
    -- the same set the batch functions authorize) and both batch functions return items
    -- in input order (ORDER BY input ordinality).
    SELECT COALESCE(
      jsonb_agg(
        CASE
          WHEN p.label_match IS NULL THEN item.value
          ELSE item.value || jsonb_build_object('label_match', p.label_match)
        END
        ORDER BY item.ordinality
      ) FILTER (WHERE item.value IS NOT NULL),
      '[]'::jsonb
    ) AS data
    FROM raw_data rd
    LEFT JOIN LATERAL jsonb_array_elements(COALESCE(rd.data, '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinality) ON TRUE
    LEFT JOIN paged p ON p.ord = item.ordinality
  )
  SELECT
    (SELECT COUNT(*) FROM filt) AS total,
    (SELECT data FROM decorated_data) AS data,
    (SELECT COUNT(*) FROM filt WHERE label_rank = 0) AS rank0,
    (SELECT COUNT(*) FROM filt WHERE label_rank = 1) AS rank1
  INTO v_total, v_data, v_rank0, v_rank1;

  -- 204 — Remplissage : decoration de la page en UN SEUL appel ensembliste.
  -- Jamais par ligne. api.object_missing_essentials rend 0 ligne si l appelant
  -- n est pas editeur, donc le LEFT JOIN laisse simplement le champ absent :
  -- le gate « editeur et superieur » est porte LA-BAS, pas ici.
  -- Cette fonction est en plpgsql : le corps du IF n est planifie QUE s il
  -- s execute. Le cout est donc reellement nul pour une page vide, contrairement
  -- a un predicat SQL dont la seule presence coute de la planification.
  IF jsonb_array_length(COALESCE(v_data, '[]'::jsonb)) > 0 THEN
    SELECT COALESCE(
             jsonb_agg(
               CASE WHEN me.missing IS NULL THEN item.value
                    ELSE item.value || jsonb_build_object('missing_essentials', to_jsonb(me.missing))
               END
               ORDER BY item.ordinality
             ),
             '[]'::jsonb
           )
    INTO v_data
    FROM jsonb_array_elements(v_data) WITH ORDINALITY AS item(value, ordinality)
    LEFT JOIN api.object_missing_essentials(
                ARRAY(SELECT d->>'id' FROM jsonb_array_elements(v_data) AS d)
              ) me ON me.object_id = item.value->>'id';
  END IF;

  v_cursor := jsonb_build_object(
    'kind','page',
    'offset', v_offset,
    'page_size', v_limit,
    'filters', v_filters,
    'types', CASE WHEN v_types IS NULL THEN NULL ELSE to_jsonb(v_types) END,
    'status', CASE WHEN v_status IS NULL THEN NULL ELSE to_jsonb(v_status) END,
    'search', v_search,
    'lang', to_jsonb(v_lang_prefs),
    'track_format', v_track,
    'include_stages', v_inc,
    'stage_color', v_color,
    'view', v_view,
    'render', v_render_enabled,
    'render_locale', v_render_locale,
    'render_tz', v_render_tz,
    'render_version', v_render_version
  );
  v_current_cursor := api.cursor_pack(api.json_clean(v_cursor));
  v_next := api.cursor_pack(api.json_clean(jsonb_set(v_cursor,'{offset}', to_jsonb(v_offset + v_limit))));

  RETURN json_build_object(
    'meta', json_build_object(
      'kind','page',
      'language', COALESCE(v_lang_prefs[1],'fr'),
      'language_fallbacks', v_lang_prefs,
      'page_size', v_limit,
      'offset', v_offset,
      'total', v_total,
      -- §173 — comptes corpus par rang quand le filtre label est actif (sinon null).
      'label_rank_counts', CASE WHEN v_filters ? 'label_scheme_ranked'
        THEN json_build_object('labelled', v_rank0, 'equivalent', v_rank1)
        ELSE NULL END,
      'schema_version', '3.0',
      'render_locale', v_render_locale,
      'render_tz', v_render_tz,
      'render_version', v_render_version,
      'cursor', v_current_cursor,
      'next_cursor', CASE WHEN v_offset + v_limit < v_total THEN v_next ELSE NULL END
    ),
    'data', v_data
  );
END;
$function$
;


COMMIT;
