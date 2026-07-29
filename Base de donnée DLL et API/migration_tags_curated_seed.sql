-- =====================================================================================
-- migration_tags_curated_seed.sql
-- Manifest 16q — Catalogue de tags §09 reconstruit : 3 tags choisis, appliqués par
--                règles à PHRASE SPÉCIFIQUE dont la précision a été mesurée à la main.
--
-- Design : docs/superpowers/specs/2026-07-29-tags-doctrine-gouvernance-design.md
-- Journal : lot1_mapping_decisions.md §203
--
-- ------------------------------------------------------------------------------------
-- EN QUOI CECI DIFFÈRE DE L'IMPORT DE MAI QU'ON CORRIGE (question légitime)
-- ------------------------------------------------------------------------------------
--   Mai 2026                                  |  Cette migration
--   ------------------------------------------|--------------------------------------
--   Champs lexicaux larges (« mer », « vue »)  |  Phrases spécifiques, une par tag
--   Aucune mesure de précision                 |  Échantillon LU à la main, précision
--                                              |  chiffrée et écrite ici, tag par tag
--   4 529 liens, ~5,5 par fiche                |  146 liens, ~1,1 par fiche
--   Provenance non exploitable                 |  `extra.source` + `extra.rule` par lien
--   Concepts doublonnant 13 axes existants     |  3 orphelins vérifiés (aucune collision
--                                              |  de nom avec équipement/cadre/taxonomie)
--   Qualifiait le voisinage                    |  R1 : fait constatable SUR PLACE
--
--   Autrement dit : ce n'est pas « la même chose en plus prudent », c'est un ordre de
--   grandeur en moins, chaque règle relue sur pièces, et chaque lien révocable par sa
--   provenance (voir le ROLLBACK au pied du fichier).
--
-- ------------------------------------------------------------------------------------
-- LES 3 TAGS, ET POURQUOI EUX
-- ------------------------------------------------------------------------------------
-- 1. « Vue mer » — 75 fiches (8,9 %). Précision mesurée 21/22 sur échantillon aléatoire lu.
--    C'est la réponse JUSTE au signalement d'origine : le tag fautif « Mer et littoral »
--    sous-entendait le bord de mer et atterrissait sur des gîtes des hauts du Tampon.
--    « Vue mer » ne dit pas où est la fiche, il dit ce qu'on voit DEPUIS la fiche — donc
--    une villa des hauts du Tampon avec vue panoramique sur l'océan le mérite vraiment.
--    R1 satisfait (fait sur place). Orphelin : le cadre porte « Bord de mer » (= où l'on
--    EST) et « Vue panoramique » (générique, 439 fiches) — ni l'un ni l'autre n'est ceci.
--    ZÉRO négation dans le corpus (aucun « pas de vue mer ») ; la garde est là par principe.
--
-- 2. « Cuisine au feu de bois » — 55 fiches (6,5 %). Précision mesurée 14/14.
--    Très spécifique au territoire (le cari cuit au feu de bois) et jamais modélisé :
--    aucun équipement, aucun nœud de taxonomie ne le porte. Sélectif, vérifiable d'un
--    coup d'œil, et c'est un vrai critère de choix pour un visiteur.
--
-- 3. « Case créole » — 16 fiches (2,0 %). Précision mesurée ~12/13 après RESSERRAGE.
--    ⚠️ La première version de la règle incluait « créole traditionnelle » et attrapait
--    surtout « CUISINE créole traditionnelle » (un fait culinaire, pas architectural),
--    plus un « atelier kaz créole (paper art) ». Détecté en lisant l'échantillon, pas en
--    lisant le SQL — c'est exactement pour ça que l'échantillon est obligatoire.
--    Exclusion ajoutée : « mitoyen d'une case créole » (la fiche est À CÔTÉ d'une case
--    créole, elle n'en est pas une) — R1, encore.
--
-- ÉCARTÉS, et pourquoi (la trace vaut autant que la sélection) :
--   * « Table d'hôtes » — 43 fiches, précision 16/16, donc excellent… mais **échoue R2-a** :
--     `taxonomy_res` porte déjà « Table d'hôtes » (nœud désactivé faute d'usage par 13i).
--     Le concept EST modélisé ⇒ c'est une PROMOTION (équipement famille Gastronomie ou
--     réactivation du nœud), pas un tag. La garde D de `test_tags_purge_catalog.sql`
--     l'aurait refusé — la doctrine a fonctionné toute seule.
--   * « Sud Sauvage » — 90 fiches mais précision ~75 % : les excursions qui MÈNENT au Sud
--     Sauvage (« 5A Transports : circuits Volcan, Sud Sauvage ») sont comptées comme s'y
--     trouvant. Et la variante déterministe (commune ∈ {Saint-Joseph, Saint-Philippe})
--     ne ferait que doublonner le filtre commune. Écarté des deux façons.
--
-- ------------------------------------------------------------------------------------
-- PÉRIMÈTRE ET LIMITES ASSUMÉES
-- ------------------------------------------------------------------------------------
-- * Fiches **publiées uniquement** — c'est le corpus sur lequel la précision a été mesurée.
--   Appliquer aux brouillons serait extrapoler une mesure hors de son échantillon.
-- * Les règles lisent la description **canonique** (`org_object_id IS NULL`), pas les
--   surcouches par ORG : une même fiche doit porter les mêmes tags pour tout le monde.
-- * `ponytail:` la précision n'est pas 100 %. Plafond assumé : ~5 % de liens discutables
--   sur « Vue mer » et « Case créole ». La voie de sortie n'est pas un durcissement des
--   regex (on retomberait dans le réglage aveugle) mais le **rail de suggestion à valider**
--   du lot 5, où un agent confirme ou infirme sur pièces. En attendant, `extra.rule` permet
--   de retirer un tag entier en une requête.
-- * Aucune règle ne tourne en continu : c'est une passe unique, pas un trigger. Une fiche
--   créée demain n'aura pas ces tags — c'est voulu, la saisie reprend la main.
--
-- Idempotent, transaction-wrapped. Après `schema_unified.sql`, `api_views_functions.sql`
-- et `seeds_data.sql`. Indépendant de 16p : la purge ne vise que
-- `extra.source = 'old_data_enrichment_20260512'`, donc l'ordre entre 16p et 16q est
-- indifférent pour la donnée (le manifest les enchaîne pour la lisibilité).
-- =====================================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.tag_link') IS NULL OR to_regclass('public.ref_tag') IS NULL THEN
    RAISE EXCEPTION 'migration 16q : tag_link/ref_tag absents';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE NOT tgisinternal
      AND tgrelid = 'public.tag_link'::regclass
      AND tgname = 'trg_refresh_object_filter_caches_tag_link'
  ) THEN
    RAISE EXCEPTION 'migration 16q : trigger de cache introuvable sur tag_link — vérifier le nommage';
  END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- 1) Catalogue — les 3 tags. Couleurs prises dans la palette maison de TagPickerModal.
--    `ON CONFLICT DO NOTHING` : garantit l'EXISTENCE, jamais les valeurs (un admin peut
--    recolorer via `api.set_tag_color`, ré-appliquer ne doit pas l'écraser).
-- -------------------------------------------------------------------------------------
INSERT INTO public.ref_tag (slug, name, description, color, position) VALUES
  ('vue_mer',     'Vue mer',                'Vue sur la mer ou l''océan depuis l''établissement', '#3a6ea5', 10),
  ('feu_de_bois', 'Cuisine au feu de bois', 'Cuisine préparée au feu de bois sur place',          '#c96d3b', 11),
  ('case_creole', 'Case créole',            'Bâti en case ou maison créole traditionnelle',       '#b88a3e', 12)
ON CONFLICT (slug) DO NOTHING;

-- -------------------------------------------------------------------------------------
-- 2) Application des règles.
--
--    `doc` reproduit EXACTEMENT le texte sur lequel la précision a été mesurée : nom +
--    description canonique + chapô, espaces normalisés. Toute divergence ici invaliderait
--    les chiffres annoncés en tête de fichier.
-- -------------------------------------------------------------------------------------
ALTER TABLE public.tag_link DISABLE TRIGGER trg_refresh_object_filter_caches_tag_link;

CREATE TEMP TABLE _tags_curated_new ON COMMIT DROP AS
WITH doc AS (
  SELECT o.id,
         regexp_replace(
           coalesce(o.name,'') || '. ' || coalesce(d.description,'') || ' ' || coalesce(d.description_chapo,''),
           '\s+', ' ', 'g') AS s
  FROM public.object o
  LEFT JOIN public.object_description d
         ON d.object_id = o.id AND d.org_object_id IS NULL
  WHERE o.status = 'published'
),
rules(slug, include_rx, exclude_rx) AS (VALUES
  -- « vue » à moins de 25 caractères de « mer / océan » : capte « vue mer », « vue sur la
  -- mer », « vue imprenable sur l'océan », « vue à 180° sur l'océan Indien ».
  ('vue_mer',
   '\yvue\y[^.!?]{0,25}\y(mer|océan|ocean)\y',
   '(pas|sans|aucune)\s+(de\s+)?vue'),
  ('feu_de_bois',
   '\yfeu de bois\y',
   NULL),
  -- resserré : « créole traditionnelle » EXCLU du motif (il désigne la cuisine)
  ('case_creole',
   '\y(case|maison)\s+cr[ée]ole\y|\yarchitecture\s+cr[ée]oles?\y',
   '(mitoyen|mitoyenne|à côté d|a cote d|proximité d|proche d)[^.!?]{0,40}(case|maison)\s+cr[ée]ole')
)
SELECT t.id AS tag_id, r.slug AS rule_slug, doc.id AS object_id
FROM doc
JOIN rules r ON doc.s ~* r.include_rx
            AND (r.exclude_rx IS NULL OR doc.s !~* r.exclude_rx)
JOIN public.ref_tag t ON t.slug = r.slug
WHERE NOT EXISTS (                       -- rejeu : ne jamais dupliquer un lien existant
  SELECT 1 FROM public.tag_link tl
   WHERE tl.tag_id = t.id AND tl.target_table = 'object' AND tl.target_pk = doc.id
);

INSERT INTO public.tag_link (tag_id, target_table, target_pk, position, extra)
SELECT n.tag_id, 'object', n.object_id,
       -- se place APRÈS les tags déjà portés par la fiche (saisie éditeur préservée)
       COALESCE((SELECT max(tl.position) FROM public.tag_link tl
                  WHERE tl.target_table = 'object' AND tl.target_pk = n.object_id), -1)
         + row_number() OVER (PARTITION BY n.object_id ORDER BY n.rule_slug)::integer,
       jsonb_build_object('source', 'tag_rules_20260729', 'rule', n.rule_slug)
FROM _tags_curated_new n
ON CONFLICT (tag_id, target_table, target_pk) DO NOTHING;

ALTER TABLE public.tag_link ENABLE TRIGGER trg_refresh_object_filter_caches_tag_link;

-- -------------------------------------------------------------------------------------
-- 3) UN rafraîchissement de cache par fiche touchée (le trigger était éteint).
-- -------------------------------------------------------------------------------------
DO $$
DECLARE v_id text; v_n bigint := 0;
BEGIN
  FOR v_id IN SELECT DISTINCT object_id FROM _tags_curated_new LOOP
    PERFORM api.refresh_object_filter_caches(v_id);
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'migration 16q : caches rafraîchis sur % fiche(s)', v_n;
END $$;

-- -------------------------------------------------------------------------------------
-- 4) Rapport + assertions fail-closed.
-- -------------------------------------------------------------------------------------
DO $$
DECLARE r record; v_total bigint := 0;
BEGIN
  FOR r IN
    SELECT t.slug, count(*) AS n
    FROM public.tag_link tl JOIN public.ref_tag t ON t.id = tl.tag_id
    WHERE tl.extra->>'source' = 'tag_rules_20260729'
    GROUP BY t.slug ORDER BY t.slug
  LOOP
    RAISE NOTICE 'migration 16q : % → % lien(s)', r.slug, r.n;
    v_total := v_total + r.n;
  END LOOP;
  RAISE NOTICE 'migration 16q : % lien(s) au total (attendu 146 sur live : vue_mer 75, feu_de_bois 55, case_creole 16)', v_total;

  -- Un tag du catalogue doit exister pour chacune des 3 règles, sinon la passe a
  -- silencieusement ne rien appliquer.
  IF (SELECT count(*) FROM public.ref_tag WHERE slug IN ('vue_mer','feu_de_bois','case_creole')) <> 3 THEN
    RAISE EXCEPTION 'migration 16q : les 3 tags ne sont pas au catalogue';
  END IF;

  -- Garde de doctrine (miroir de l'assertion D du test) : aucun des 3 ne doit dupliquer,
  -- au nom exact, un équipement / un code de cadre / un nœud de taxonomie.
  IF EXISTS (
    SELECT 1 FROM public.ref_tag t
    JOIN (SELECT name FROM public.ref_amenity
          UNION ALL SELECT name FROM public.ref_code WHERE domain = 'environment_tag'
          UNION ALL SELECT name FROM public.ref_code WHERE domain LIKE 'taxonomy%') v
      ON public.immutable_unaccent(lower(btrim(t.name))) = public.immutable_unaccent(lower(btrim(v.name)))
    WHERE t.slug IN ('vue_mer','feu_de_bois','case_creole')
  ) THEN
    RAISE EXCEPTION 'migration 16q : un des 3 tags duplique un axe structuré (invariant §196)';
  END IF;
END $$;

COMMIT;

-- =====================================================================================
-- APRÈS APPLICATION SUR LIVE (hors transaction) :
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
--
-- ROLLBACK — total, ou règle par règle (c'est l'intérêt de `extra.rule`) :
--
--   BEGIN;
--   ALTER TABLE public.tag_link DISABLE TRIGGER trg_refresh_object_filter_caches_tag_link;
--   CREATE TEMP TABLE _undo AS
--     SELECT DISTINCT target_pk FROM public.tag_link
--      WHERE extra->>'source' = 'tag_rules_20260729'
--        /* AND extra->>'rule' = 'case_creole' */;      -- décommenter pour une seule règle
--   DELETE FROM public.tag_link
--    WHERE extra->>'source' = 'tag_rules_20260729'
--      /* AND extra->>'rule' = 'case_creole' */;
--   ALTER TABLE public.tag_link ENABLE TRIGGER trg_refresh_object_filter_caches_tag_link;
--   DO $rb$ DECLARE v_id text; BEGIN
--     FOR v_id IN SELECT target_pk FROM _undo LOOP
--       PERFORM api.refresh_object_filter_caches(v_id); END LOOP; END $rb$;
--   -- DELETE FROM public.ref_tag WHERE slug IN (...);  -- seulement si on retire le tag du catalogue
--   COMMIT;
-- =====================================================================================
