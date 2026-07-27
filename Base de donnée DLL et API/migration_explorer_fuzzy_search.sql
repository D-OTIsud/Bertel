-- =====================================================================
-- migration_explorer_fuzzy_search.sql  (manifest step 16k2 ; decision log §197)
-- Explorer : recherche TOLÉRANTE AUX FAUTES (trigrammes pg_trgm).
--
-- BESOIN — le moteur actuel est un `tsvector` : il encaisse accents, casse et
-- flexions, mais PAS une faute de frappe. `jaccusy` ne trouve pas `jacuzzi`.
--
-- CE QUE FAIT CETTE MIGRATION
--   1. `object.search_document_text` : la MÊME agrégation de contenu public que
--      `object.search_document` (§109 + alias §192), conservée en TEXTE BRUT
--      normalisé (minuscules, sans accents, espaces compactés). Un tsvector ne
--      peut pas servir de source aux trigrammes : il ne stocke que des lexèmes
--      *racinisés*, la forme réelle des mots est perdue.
--   2. `api.refresh_object_filter_caches` produit les DEUX représentations depuis
--      le MÊME CTE `doc` — une seule source, jamais deux listes de tables à tenir
--      en cohérence.
--   3. `internal.mv_filtered_objects` (chemin rapide des fiches publiées) porte
--      `search_document_text` + `city_normalized` : sans cela le flou serait muet
--      pour les visiteurs anonymes (le seul chemin qui compte en production).
--   4. `api.get_filtered_object_ids` gagne un bras approximatif EN REPLI, et un
--      classement où tout résultat exact passe devant tout résultat approximatif.
--
-- LE REPLI, ET POURQUOI PAS UN SIMPLE « OU » (décision PO, 2026-07-27, sur mesures).
--   Le flou ne s'ajoute pas au plein texte : il ne se déclenche QUE si le plein texte
--   ne trouve rien dans le corpus. Une première version en OU a été implémentée et
--   mesurée : elle coûtait +170 ms PAR RPC sur toute recherche d'un seul mot (et
--   l'Exploreur en appelle deux : cartes + marqueurs), y compris pour une saisie
--   correctement orthographiée qui n'avait aucun besoin des trigrammes. Elle élargissait
--   aussi le résultat de « jacuzzi » de 86 à 102 fiches, les 16 ajoutées étant des
--   « Jacques / Jacqueline » à 0.375. En repli : « jacuzzi » garde ses 86 fiches et ses
--   111 ms, « jaccusy » déclenche le repli et rend les 102. Le coût n'existe que là où
--   il achète quelque chose.
--   Conséquence assumée : exact et approximatif ne coexistent jamais dans une page, donc
--   le barème de classement ci-dessous n'a pas d'occasion de les départager. Il est
--   conservé quand même — l'invariant « un exact devant un approximatif » reste ainsi
--   posé DANS le code et survivrait à un retour au OU.
--
-- PÉRIMÈTRE DU FLOU — délibérément étroit (chaque garde a une mesure derrière) :
--   * `search_mode = 'global'` UNIQUEMENT. Le mode `name` alimente les sélecteurs
--     d'objets de l'éditeur : ils doivent rester exacts.
--   * un SEUL mot normalisé (pas d'espace). Une saisie multi-mots reste plein texte.
--   * au moins 4 caractères.
--   * et le plein texte n'a rien trouvé (le repli proprement dit).
--
-- SEUIL — calibré sur le corpus live (846 fiches) le 2026-07-27, pas au doigt mouillé.
--   Le seuil du plan initial (0.45, hérité de §195 sur les noms d'acteurs) ÉCHOUE sur
--   le cas d'acceptation : word_similarity('jaccusy','jacuzzi') = 0.375.
--   Mesures (word_similarity, sur le document global des 846 fiches) :
--     vrais positifs   jacuzi→jacuzzi 0.714 · jacussi 0.500 · jaccuzi 0.455 · jaccusy 0.375
--                      hoareu→hoareau 0.714 · climatisaton 0.846 · randonee 0.778
--     bruit pur (requêtes fantaisistes) : kzlmrtp 0.125 · qwxvbnm 0.125 · vgtrn 0.167
--                      bequz 0.333 · kzlmr 0.333 · jaccusyy 0.333  ⇒ plafond 0.333 dès 5 car.
--     bruit des requêtes COURTES : `bequ` (4 car.) = 0.400 sur 217 fiches
--                      (meilleurs jetons : bebe / belle / beau / besoin) ⇒ plancher 0.400 à 4 car.
--   D'où un seuil DÉPENDANT DE LA LONGUEUR — contre-intuitif mais mécanique : une
--   requête de L caractères ne porte que L+1 trigrammes, donc à L petit le moindre
--   recouvrement accidentel pèse une grosse fraction du score.
--     longueur 4    → 0.45   (au-dessus du plancher de bruit mesuré 0.400)
--     longueur >= 5 → 0.35   (au-dessus du plafond de bruit pur mesuré 0.333)
--   Vérification de recouvrement : `jaccusy` @0.35 ramène exactement les 103 fiches
--   que `jacuzzi` @0.35 ramène, dont les 87 qui contiennent littéralement le mot —
--   AUCUNE fiche « jacuzzi » n'est manquée. Les 16 autres sont des prénoms `jac*`
--   (jacques, jacqueline, jacquiers) à 0.375 : c'est le prix assumé du seuil bas,
--   et il est identique pour la requête correctement orthographiée.
--   Ces valeurs sont assertées en CI (tests/test_global_search.sql) : elles protègent
--   d'un changement de version de pg_trgm.
--
-- GOTCHA §29/§195 — pg_trgm vit dans le schéma `extensions`. `get_filtered_object_ids`
--   a déjà `extensions` dans son search_path : word_similarity() résout. Une assertion
--   de fin de migration le fige (sans quoi : panne à l'exécution, pas au déploiement).
--
-- ponytail: seuil comparé littéralement (`word_similarity(...) >= seuil`) plutôt que
--   via l'opérateur indexable `<%` + la GUC pg_trgm.word_similarity_threshold — même
--   choix qu'en §195. Plafond assumé et MESURÉ : la forme littérale n'est pas accélérée
--   par un index GIN trgm, donc un balayage complet des 846 documents coûte ~142 ms, et
--   seulement pendant une recherche floue. Aucun index trgm n'est créé ici : il ne serait
--   jamais choisi par le planificateur sous cette forme. Bascule vers `<%` + GUC figée au
--   niveau fonction si le corpus dépasse ~10^4 fiches.
--
-- BACKFILL — les 3 triggers « changement métier ? » de `object`
--   (update_object_updated_at / trg_increment_object_version / trg_object_version)
--   soustraient les colonnes `cached_*` de leur comparaison, mais PAS `search_document`
--   (oubli §109, pré-existant, hors périmètre ici). Sans précaution, remplir la nouvelle
--   colonne sur 846 fiches bumperait `object.updated_at` PARTOUT — donc une re-synchro
--   complète chez tous les partenaires (updated_at est LE signal de reprise) + 846
--   snapshots `object_version`. On les désactive donc le temps du backfill, à l'intérieur
--   de la transaction qui détient déjà un ACCESS EXCLUSIVE sur `object` (ADD COLUMN
--   ci-dessus) : aucune fenêtre où un autre écrivain passerait triggers éteints.
--   `trg_audit_object` reste ACTIF : la trace d'audit du backfill est légitime.
--
-- DÉPENDANCES / ORDRE : après 16k (`migration_label_filter_sections.sql`), qui porte
--   la définition la plus récente de `api.get_filtered_object_ids` (§157+§162+§173) —
--   la placer avant l'écraserait. Rien après 16k ne redéfinit `refresh_object_filter_caches`,
--   `mv_filtered_objects` ni `get_filtered_object_ids` (vérifié sur le manifeste).
-- SIGNATURE INCHANGÉE (mêmes 4 arguments, même type de retour) ⇒ ni DROP/CREATE,
--   ni re-GRANT, ni NOTIFY pgrst.
-- FOLDÉ : `schema_unified.sql` (colonne + fonction de cache + MV) et
--   `api_views_functions.sql` (`get_filtered_object_ids`) ⇒ no-op sur base fraîche.
-- RÉVERSIBLE : `git checkout` des deux fichiers foldés + ré-application ; la colonne
--   peut rester (inerte) ou être supprimée par `ALTER TABLE object DROP COLUMN
--   search_document_text` suivi du DROP/CREATE du MV sans elle.
-- TEST CI : tests/test_global_search.sql (étendu).
-- =====================================================================
BEGIN;

-- ---- 1) La colonne texte brut ------------------------------------------------
-- Pas de DEFAULT ⇒ pas de réécriture de table. Pas d'index : cf. le ponytail en tête.
ALTER TABLE IF EXISTS object ADD COLUMN IF NOT EXISTS search_document_text TEXT;

COMMENT ON COLUMN object.search_document_text IS
'§197 — même contenu public agrégé que object.search_document, mais en TEXTE BRUT normalisé (minuscules, sans accents, espaces compactés). Source des trigrammes pg_trgm de la recherche tolérante aux fautes : un tsvector ne conserve que des lexèmes racinisés, donc pas la forme réelle des mots. Maintenu par api.refresh_object_filter_caches, depuis le MÊME CTE que search_document.';

-- ---- 2) La fonction de cache produit les DEUX représentations -----------------
--       (corps complet — identique à schema_unified.sql, alias §192 inclus)
CREATE OR REPLACE FUNCTION api.refresh_object_filter_caches(p_object_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_cached_amenity_codes TEXT[];
  v_cached_payment_codes TEXT[];
  v_cached_environment_tags TEXT[];
  v_cached_language_codes TEXT[];
  v_cached_classification_codes TEXT[];
  v_cached_taxonomy_codes TEXT[];
  v_search_document tsvector;
  v_search_document_text TEXT;
BEGIN
  IF p_object_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT ra.code ORDER BY ra.code)
    FROM object_amenity oa
    JOIN ref_amenity ra ON ra.id = oa.amenity_id
    WHERE oa.object_id = p_object_id
  ), ARRAY[]::TEXT[])
  INTO v_cached_amenity_codes;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT pm.code ORDER BY pm.code)
    FROM object_payment_method opm
    JOIN ref_code_payment_method pm ON pm.id = opm.payment_method_id
    WHERE opm.object_id = p_object_id
  ), ARRAY[]::TEXT[])
  INTO v_cached_payment_codes;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT et.code ORDER BY et.code)
    FROM object_environment_tag oet
    JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id
    WHERE oet.object_id = p_object_id
  ), ARRAY[]::TEXT[])
  INTO v_cached_environment_tags;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT rl.code ORDER BY rl.code)
    FROM object_language ol
    JOIN ref_language rl ON rl.id = ol.language_id
    WHERE ol.object_id = p_object_id
  ), ARRAY[]::TEXT[])
  INTO v_cached_language_codes;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT (s.code || ':' || v.code) ORDER BY (s.code || ':' || v.code))
    FROM object_classification oc
    JOIN ref_classification_scheme s ON s.id = oc.scheme_id
    JOIN ref_classification_value v ON v.id = oc.value_id
    WHERE oc.object_id = p_object_id
      AND oc.status = 'granted'
      AND (
        COALESCE(s.is_distinction, FALSE)
        OR COALESCE(s.display_group, '') IN ('sustainability_labels', 'accessibility_labels')
      )
  ), ARRAY[]::TEXT[])
  INTO v_cached_classification_codes;

  SELECT COALESCE((
    SELECT array_agg(DISTINCT (ot.domain || ':' || anc.code) ORDER BY (ot.domain || ':' || anc.code))
    FROM object_taxonomy ot
    JOIN ref_code_taxonomy_closure cl
      ON cl.domain = ot.domain
     AND cl.descendant_id = ot.ref_code_id
    JOIN ref_code anc
      ON anc.id = cl.ancestor_id
     AND anc.domain = cl.domain
    WHERE ot.object_id = p_object_id
      AND anc.is_assignable = TRUE
  ), ARRAY[]::TEXT[])
  INTO v_cached_taxonomy_codes;

  -- Aggregated weighted full-text search document (§109). Child-sourced ONLY
  -- (name/city stay on their generated vectors, composed at query time).
  -- FR canonical labels/prose; menus & descriptions honor public visibility.
  --   B = taxonomy + classification/label names
  --   C = amenities + tags + environment + cuisines + menus + dishes + dietary + allergens
  --   D = canonical public description prose (markdown-stripped) + dish descriptions
  -- §197 : ce MÊME CTE alimente aussi search_document_text (texte brut normalisé).
  -- Ne JAMAIS dupliquer ces sous-requêtes pour la variante texte : les deux
  -- représentations dériveraient silencieusement l'une de l'autre.
  WITH doc AS (
    SELECT
      (
        -- §192 — les alias de vocabulaire source (Berta) sont indexés AVEC le
        -- libellé canonique. Sans cela, renommer un nœud fait disparaître
        -- l'ancien terme de la recherche : retirer « / gîte » de
        -- `location_saisonniere` retirerait le token `git` du doc_b de ses 376
        -- porteurs. Le renommage et l'alias searchable sont indissociables.
        -- Le CASE protège d'un `aliases` mal typé (jsonb_array_elements est
        -- évalué en FROM, donc avant tout WHERE : le garde doit être sur l'argument).
        COALESCE((SELECT string_agg(DISTINCT anc.name || COALESCE(
              (SELECT ' ' || string_agg(al.value #>> '{}', ' ')
                 FROM jsonb_array_elements(
                        CASE WHEN jsonb_typeof(anc.metadata -> 'aliases') = 'array'
                             THEN anc.metadata -> 'aliases' ELSE '[]'::jsonb END) al), ''), ' ')
          FROM object_taxonomy ot
          JOIN ref_code_taxonomy_closure cl ON cl.domain = ot.domain AND cl.descendant_id = ot.ref_code_id
          JOIN ref_code anc ON anc.id = cl.ancestor_id AND anc.domain = cl.domain
          WHERE ot.object_id = p_object_id AND anc.is_assignable = TRUE), '')
        || ' ' ||
        COALESCE((SELECT string_agg(DISTINCT s.name || ' ' || v.name, ' ')
          FROM object_classification oc
          JOIN ref_classification_scheme s ON s.id = oc.scheme_id
          JOIN ref_classification_value v ON v.id = oc.value_id
          WHERE oc.object_id = p_object_id AND oc.status = 'granted'), '')
      ) AS doc_b,
      (
        COALESCE((SELECT string_agg(DISTINCT ra.name, ' ')
          FROM object_amenity oa JOIN ref_amenity ra ON ra.id = oa.amenity_id
          WHERE oa.object_id = p_object_id), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT t.name, ' ')
          FROM tag_link tl JOIN ref_tag t ON t.id = tl.tag_id
          WHERE tl.target_table = 'object' AND tl.target_pk = p_object_id), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT et.name, ' ')
          FROM object_environment_tag oet JOIN ref_code_environment_tag et ON et.id = oet.environment_tag_id
          WHERE oet.object_id = p_object_id), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT ct.name, ' ')
          FROM object_cuisine_type oct JOIN ref_code_cuisine_type ct ON ct.id = oct.cuisine_type_id
          WHERE oct.object_id = p_object_id), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT m.name || ' ' || COALESCE(mi.name, ''), ' ')
          FROM object_menu m LEFT JOIN object_menu_item mi ON mi.menu_id = m.id
          WHERE m.object_id = p_object_id AND m.is_active AND (m.visibility IS NULL OR m.visibility = 'public')), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT dt.name, ' ')
          FROM object_menu m
          JOIN object_menu_item mi ON mi.menu_id = m.id
          JOIN object_menu_item_dietary_tag mid ON mid.menu_item_id = mi.id
          JOIN ref_code_dietary_tag dt ON dt.id = mid.dietary_tag_id
          WHERE m.object_id = p_object_id AND m.is_active AND (m.visibility IS NULL OR m.visibility = 'public')), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT al.name, ' ')
          FROM object_menu m
          JOIN object_menu_item mi ON mi.menu_id = m.id
          JOIN object_menu_item_allergen mia ON mia.menu_item_id = mi.id
          JOIN ref_code_allergen al ON al.id = mia.allergen_id
          WHERE m.object_id = p_object_id AND m.is_active AND (m.visibility IS NULL OR m.visibility = 'public')), '')
      ) AS doc_c,
      (
        COALESCE((SELECT string_agg(DISTINCT
            COALESCE(api.strip_markdown(d.description), '') || ' '
            || COALESCE(api.strip_markdown(d.description_chapo), '') || ' '
            || COALESCE(api.strip_markdown(d.description_mobile), '') || ' '
            || COALESCE(api.strip_markdown(d.description_adapted), ''), ' ')
          FROM object_description d
          WHERE d.object_id = p_object_id AND d.org_object_id IS NULL
            AND (d.visibility IS NULL OR d.visibility = 'public')), '')
        || ' ' || COALESCE((SELECT string_agg(DISTINCT api.strip_markdown(mi.description), ' ')
          FROM object_menu m JOIN object_menu_item mi ON mi.menu_id = m.id
          WHERE m.object_id = p_object_id AND m.is_active AND (m.visibility IS NULL OR m.visibility = 'public')
            AND mi.description IS NOT NULL), '')
      ) AS doc_d
  )
  SELECT
       setweight(to_tsvector('french', immutable_unaccent(lower(doc.doc_b))), 'B')
    || setweight(to_tsvector('french', immutable_unaccent(lower(doc.doc_c))), 'C')
    || setweight(to_tsvector('french', immutable_unaccent(lower(doc.doc_d))), 'D'),
       -- §197 — même contenu, forme brute. NULLIF('') : une fiche sans contenu
       -- enfant porte NULL, pas une chaîne vide (les lecteurs COALESCE de toute façon).
       NULLIF(btrim(regexp_replace(
         immutable_unaccent(lower(doc.doc_b || ' ' || doc.doc_c || ' ' || doc.doc_d)),
         '\s+', ' ', 'g')), '')
  INTO v_search_document, v_search_document_text
  FROM doc;

  UPDATE object o
  SET
    cached_amenity_codes = v_cached_amenity_codes,
    cached_payment_codes = v_cached_payment_codes,
    cached_environment_tags = v_cached_environment_tags,
    cached_language_codes = v_cached_language_codes,
    cached_classification_codes = v_cached_classification_codes,
    cached_taxonomy_codes = v_cached_taxonomy_codes,
    search_document = v_search_document,
    search_document_text = v_search_document_text
  WHERE o.id = p_object_id
    AND (
      o.cached_amenity_codes IS DISTINCT FROM v_cached_amenity_codes
      OR o.cached_payment_codes IS DISTINCT FROM v_cached_payment_codes
      OR o.cached_environment_tags IS DISTINCT FROM v_cached_environment_tags
      OR o.cached_language_codes IS DISTINCT FROM v_cached_language_codes
      OR o.cached_classification_codes IS DISTINCT FROM v_cached_classification_codes
      OR o.cached_taxonomy_codes IS DISTINCT FROM v_cached_taxonomy_codes
      OR o.search_document IS DISTINCT FROM v_search_document
      OR o.search_document_text IS DISTINCT FROM v_search_document_text
    );
END;
$$;

-- ---- 3) Backfill des fiches existantes ---------------------------------------
--       Triggers « changement métier » éteints le temps du remplissage : voir
--       l'en-tête (sinon 846 bumps d'updated_at ⇒ re-synchro partenaires complète).
--       Nommage guardé : la migration ne casse pas si un trigger a été renommé.
DO $backfill$
DECLARE
  v_trg   TEXT;
  v_off   TEXT[] := ARRAY[]::TEXT[];
  v_count INTEGER;
BEGIN
  FOREACH v_trg IN ARRAY ARRAY[
    'update_object_updated_at',      -- BEFORE UPDATE : pose updated_at = now()
    'trg_increment_object_version',  -- BEFORE UPDATE : incrémente current_version
    'trg_object_version'             -- AFTER  UPDATE : écrit un snapshot object_version
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgrelid = 'public.object'::regclass AND tgname = v_trg AND NOT tgisinternal) THEN
      EXECUTE format('ALTER TABLE object DISABLE TRIGGER %I', v_trg);
      v_off := v_off || v_trg;
    END IF;
  END LOOP;

  PERFORM api.refresh_object_filter_caches(o.id) FROM object o;

  FOREACH v_trg IN ARRAY v_off LOOP
    EXECUTE format('ALTER TABLE object ENABLE TRIGGER %I', v_trg);
  END LOOP;

  SELECT count(*) INTO v_count FROM object WHERE search_document_text IS NOT NULL;
  RAISE NOTICE '§197 backfill : % fiches portent search_document_text (triggers metier remis : %)',
    v_count, array_to_string(v_off, ', ');
END
$backfill$;

-- ---- 4) Le MV du chemin rapide porte le texte + la commune normalisée ---------
--       DROP/CREATE obligatoire : on ne peut pas ALTER les colonnes d'un MV.
--       PAS de CASCADE : si un consommateur apparaissait un jour, la migration
--       doit échouer bruyamment plutôt que l'emporter silencieusement.
--       `city_normalized` : jusqu'ici le bras MV de get_filtered_object_ids renvoyait
--       NULL (le filtre `city_any` force use_mv = FALSE, donc c'était inerte) ; il est
--       désormais réellement projeté pour que le score flou « commune » existe aussi
--       sur le chemin publié. Le filtre `city_any` reste inchangé (toujours hors MV).
DROP MATERIALIZED VIEW IF EXISTS internal.mv_filtered_objects;
CREATE MATERIALIZED VIEW internal.mv_filtered_objects AS
SELECT
  o.id,
  o.object_type,
  o.status,
  o.commercial_visibility,
  o.updated_at,
  o.name_normalized,
  o.name_search_vector,
  ol.city_search_vector,
  ol.latitude,
  ol.longitude,
  ol.geog2,
  o.cached_min_price,
  o.cached_main_image_url,
  o.cached_rating,
  o.cached_is_open_now,
  o.cached_amenity_codes,
  o.cached_payment_codes,
  o.cached_environment_tags,
  o.cached_language_codes,
  o.cached_classification_codes,
  o.cached_taxonomy_codes,
  o.search_document,
  o.search_document_text,
  public.immutable_unaccent(lower(ol.city)) AS city_normalized
FROM object o
LEFT JOIN object_location ol
  ON ol.object_id = o.id
 AND ol.is_main_location IS TRUE
WHERE o.status = 'published';

-- Les 12 index d'origine, tous recréés à l'identique. L'UNIQUE est indispensable :
-- le cron `refresh-mv-filtered-objects` (*/5) fait un REFRESH ... CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_filtered_objects_id
ON internal.mv_filtered_objects(id);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_name_search_gin
ON internal.mv_filtered_objects USING GIN(name_search_vector);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_city_search_gin
ON internal.mv_filtered_objects USING GIN(city_search_vector);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_search_doc_gin
ON internal.mv_filtered_objects USING GIN(search_document);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_geog_gist
ON internal.mv_filtered_objects USING GIST(geog2);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_amenity_codes_gin
ON internal.mv_filtered_objects USING GIN(cached_amenity_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_payment_codes_gin
ON internal.mv_filtered_objects USING GIN(cached_payment_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_environment_tags_gin
ON internal.mv_filtered_objects USING GIN(cached_environment_tags);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_language_codes_gin
ON internal.mv_filtered_objects USING GIN(cached_language_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_classification_codes_gin
ON internal.mv_filtered_objects USING GIN(cached_classification_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_taxonomy_codes_gin
ON internal.mv_filtered_objects USING GIN(cached_taxonomy_codes);
CREATE INDEX IF NOT EXISTS idx_mv_filtered_objects_updated_at_id
ON internal.mv_filtered_objects(updated_at, id);

-- OBLIGATOIRE après un DROP/CREATE : un MV neuf n'a AUCUNE statistique, et
-- CREATE MATERIALIZED VIEW n'analyse pas. Sans cela le planificateur travaille à
-- l'aveugle jusqu'au prochain autovacuum — mesuré : le chemin chaud SANS recherche
-- passe de 15 ms à 162 ms, soit une régression qui n'a rien à voir avec la recherche
-- floue. Idem sur `object` : la nouvelle colonne n'a pas de statistiques.
ANALYZE internal.mv_filtered_objects;
ANALYZE object;

-- ---- 5) api.get_filtered_object_ids (corps complet §157+§162+§173+§197) -------
CREATE OR REPLACE FUNCTION api.get_filtered_object_ids(
  p_filters JSONB,
  p_types object_type[],
  p_status object_status[],
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE(object_id TEXT, label_rank INTEGER, label_match JSONB, relevance REAL)
LANGUAGE sql
STABLE
-- SECURITY DEFINER: required because this function accesses internal.mv_filtered_objects
-- (a materialized view used as a hot-path cache). The `authenticated` role has no USAGE
-- on schema `internal` by design — the internal schema is a private performance layer.
-- Running as the function owner (postgres) is safe here: the function is read-only
-- (STABLE), returns only filtered object IDs, and has a fixed search_path.
-- §197: `extensions` (déjà présent) porte pg_trgm ⇒ word_similarity() résout. NE PAS
-- le retirer du search_path : la panne serait à l'exécution, pas au déploiement (§29).
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, extensions, auth, audit, crm, ref
AS $$
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
      m.search_document_text
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
      o.search_document_text
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
    ) AS armed
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
    AND (params.tags_any IS NULL OR EXISTS (
      SELECT 1
      FROM tag_link tl
      JOIN ref_tag t ON t.id = tl.tag_id
      WHERE tl.target_table = 'object'
        AND tl.target_pk = src.object_id
        AND t.slug = ANY(params.tags_any)
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
$$;

-- ---- 6) Auto-assertions de déploiement ---------------------------------------
--       Elles figent ce qui casserait SILENCIEUSEMENT : une colonne oubliée dans le
--       MV rendrait le flou muet pour les visiteurs anonymes sans aucune erreur ;
--       un `extensions` retiré du search_path ne tomberait qu'à l'exécution (§29).
DO $assert$
DECLARE
  v_cfg TEXT;
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'object'
                   AND column_name = 'search_document_text' AND data_type = 'text'),
         '§197 : object.search_document_text absente ou mal typée';

  ASSERT EXISTS (SELECT 1 FROM pg_attribute
                 WHERE attrelid = 'internal.mv_filtered_objects'::regclass
                   AND attname = 'search_document_text' AND NOT attisdropped),
         '§197 : internal.mv_filtered_objects ne porte pas search_document_text (le flou serait muet sur le chemin publié)';
  ASSERT EXISTS (SELECT 1 FROM pg_attribute
                 WHERE attrelid = 'internal.mv_filtered_objects'::regclass
                   AND attname = 'city_normalized' AND NOT attisdropped),
         '§197 : internal.mv_filtered_objects ne porte pas city_normalized';

  -- Le cron */5 fait un REFRESH ... CONCURRENTLY : sans index UNIQUE il échouerait.
  ASSERT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname = 'internal' AND tablename = 'mv_filtered_objects'
                   AND indexname = 'idx_mv_filtered_objects_id'),
         '§197 : index UNIQUE du MV manquant — REFRESH CONCURRENTLY (cron */5) casserait';
  ASSERT (SELECT count(*) FROM pg_indexes
          WHERE schemaname = 'internal' AND tablename = 'mv_filtered_objects') = 12,
         '§197 : le MV ne porte pas ses 12 index (un DROP/CREATE en a perdu)';

  -- Signature inchangée : 4 arguments, même type de retour ⇒ aucun re-GRANT requis.
  ASSERT (SELECT pronargs FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'api' AND p.proname = 'get_filtered_object_ids') = 4,
         '§197 : api.get_filtered_object_ids n''a plus 4 arguments';

  SELECT array_to_string(p.proconfig, ' ') INTO v_cfg
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'api' AND p.proname = 'get_filtered_object_ids';
  ASSERT v_cfg LIKE '%extensions%',
         '§197 : `extensions` a disparu du search_path de get_filtered_object_ids — word_similarity() serait introuvable À L''EXÉCUTION (§29)';

  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'api' AND p.proname = 'get_filtered_object_ids'
                   AND p.prosrc LIKE '%word_similarity%'),
         '§197 : le corps déployé de get_filtered_object_ids ne contient pas le bras approximatif';
  ASSERT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'api' AND p.proname = 'refresh_object_filter_caches'
                   AND p.prosrc LIKE '%search_document_text%'),
         '§197 : le corps déployé de refresh_object_filter_caches ne remplit pas search_document_text';

  -- pg_trgm doit réellement être résoluble depuis ce search_path (garde §29 vivante).
  PERFORM extensions.word_similarity('jaccusy', 'jacuzzi');
END
$assert$;

COMMIT;
