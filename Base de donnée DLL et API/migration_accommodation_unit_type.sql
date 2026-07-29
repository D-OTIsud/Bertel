-- =============================================================================
-- migration_accommodation_unit_type.sql
-- §200 lot 5A — axe « Type d'unité d'hébergement », MULTI-VALUÉ.
-- Manifest : taxo6 (APRÈS taxo5 `migration_taxonomy_accommodation_hierarchy_v2.sql`)
-- =============================================================================
--
-- POURQUOI UNE TABLE ET PAS `object_taxonomy`
--   `object_taxonomy` impose UNE valeur par objet et par domaine
--   (`uq_object_taxonomy_object_domain`). Or un même établissement propose
--   couramment plusieurs formes de couchage — une bulle ET un lodge, des
--   emplacements nus ET des cabanes. Réutiliser `object_taxonomy` obligerait à
--   choisir arbitrairement laquelle des unités « compte », ce qui est
--   exactement l'écrasement d'information que §200 supprime ailleurs.
--
--   C'est aussi pourquoi cet axe n'entre PAS dans `object.cached_taxonomy_codes` :
--   une colonne de cache scalaire ne représente pas un ensemble. Le filtre lit
--   la table de liaison (même forme que `tags_any`), au prix d'un contournement
--   du MV — assumé et documenté.
--
-- CE QUE ÇA RÉPARE
--   Avant §200, « Bulle », « Lodge » et « Hébergement insolite » étaient des
--   NATURES d'établissement (HLO) ou une nature de plein air (HPA
--   `outdoor_glamping`). Un établissement dont la nature réelle est « Chambre
--   d'hôtes » se retrouvait donc classé « Bulle » — sa nature était perdue pour
--   décrire son bâti. Les 7 fiches concernées sont reprises ici, nominativement.
--
-- SÉCURITÉ — ce que ce fichier promet
--   - La partition `ref_code_accommodation_unit_type` garantit STRUCTURELLEMENT
--     le domaine : aucun CHECK à maintenir, et la FK ne peut pas viser un code
--     d'un autre domaine.
--   - RLS activée sur la partition ET sur la table de liaison. Une partition
--     n'hérite NI de `ENABLE ROW LEVEL SECURITY` NI des policies du parent
--     (CLAUDE.md « Partitions are born gated ») : les deux sont posés ici.
--   - Lecture : forme §38 (published OR extended), set-based — jamais un scalaire
--     par ligne.
--   - Écriture : famille PAR COMMANDE (`canonical_ins/upd/del`), jamais `FOR ALL`
--     — un `FOR ALL` s'applique aussi au SELECT et rouvre la classe P0.3.
--   - GRANT explicites, commande par commande. `authenticated` seul n'autorise
--     rien : c'est `api.user_can_write_object_canonical` qui décide.
--
-- IDEMPOTENT et re-jouable. FRESH-SAFE : la reprise des 7 fiches est un no-op
--   documenté quand les objets n'existent pas.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- -----------------------------------------------------------------------------
-- 0. Garde de pré-requis : taxo5 doit être passée.
-- -----------------------------------------------------------------------------
DO $unit_prereq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ref_code
     WHERE domain = 'taxonomy_hpa' AND code = 'outdoor_glamping'
       AND metadata->>'replacement_domain' = 'accommodation_unit_type'
  ) THEN
    RAISE EXCEPTION
      'lot5: appliquer d''abord taxo5 (migration_taxonomy_accommodation_hierarchy_v2.sql) — outdoor_glamping ne pointe pas encore vers accommodation_unit_type';
  END IF;
END
$unit_prereq$;

-- -----------------------------------------------------------------------------
-- 1. Référentiel — partition de `ref_code`.
--    Les deux uniques `(id)` et `(code)` sont OBLIGATOIRES pour qu'une partition
--    puisse être cible de FK (la PK du parent est `(id, domain)`).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ref_code_accommodation_unit_type
  PARTITION OF ref_code FOR VALUES IN ('accommodation_unit_type');

CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_accommodation_unit_type_id
  ON ref_code_accommodation_unit_type (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_code_accommodation_unit_type_code
  ON ref_code_accommodation_unit_type (code);

-- Une partition naît SANS RLS et SANS policy, même quand le parent en a.
ALTER TABLE ref_code_accommodation_unit_type ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pub_ref_code_read ON ref_code_accommodation_unit_type;
CREATE POLICY pub_ref_code_read ON ref_code_accommodation_unit_type
  FOR SELECT USING (true);

DROP POLICY IF EXISTS admin_ref_code_write ON ref_code_accommodation_unit_type;
CREATE POLICY admin_ref_code_write ON ref_code_accommodation_unit_type
  FOR ALL USING ((SELECT auth.role()) = ANY (ARRAY['service_role', 'admin']));

-- -----------------------------------------------------------------------------
-- 2. Vocabulaire initial.
--    Volontairement MINIMAL : seules les formes que le corpus porte réellement,
--    plus une valeur de repli explicite. Un catalogue spéculatif se remplirait de
--    codes que personne ne choisit et rendrait le sélecteur illisible.
--    Maison/villa, Appartement, Studio, Bungalow, Chalet et Roulotte vivent
--    encore dans `taxonomy_hlo` (axe `type_unite`) : leur migration vers cet axe
--    est un lot à part — ne PAS créer un second système concurrent pour elles.
-- -----------------------------------------------------------------------------
INSERT INTO ref_code (domain, code, name, description, position, is_active, is_assignable,
                      name_i18n, description_i18n, metadata)
VALUES
  ('accommodation_unit_type', 'bubble', 'Bulle',
   'Unité transparente ou semi-transparente, généralement gonflable.', 1, TRUE, TRUE,
   '{"fr":"Bulle"}'::jsonb, '{"fr":"Unité transparente ou semi-transparente, généralement gonflable."}'::jsonb,
   jsonb_build_object('aliases', '["Bulle","Dôme","Bubble"]'::jsonb, 'source', 'taxonomy_unit_type_20260729')),
  ('accommodation_unit_type', 'tipi', 'Tipi',
   'Unité de type tipi, yourte ou tente aménagée.', 2, TRUE, TRUE,
   '{"fr":"Tipi"}'::jsonb, '{"fr":"Unité de type tipi, yourte ou tente aménagée."}'::jsonb,
   jsonb_build_object('aliases', '["Tipi","Yourte","Tente aménagée"]'::jsonb, 'source', 'taxonomy_unit_type_20260729')),
  ('accommodation_unit_type', 'lodge', 'Lodge',
   'Unité de type lodge, éventuellement toilée.', 3, TRUE, TRUE,
   '{"fr":"Lodge"}'::jsonb, '{"fr":"Unité de type lodge, éventuellement toilée."}'::jsonb,
   jsonb_build_object('aliases', '["Lodge","Lodge toilé","Écolodge"]'::jsonb, 'source', 'taxonomy_unit_type_20260729')),
  ('accommodation_unit_type', 'cabin', 'Cabane',
   'Unité de type cabane, perchée ou non.', 4, TRUE, TRUE,
   '{"fr":"Cabane"}'::jsonb, '{"fr":"Unité de type cabane, perchée ou non."}'::jsonb,
   jsonb_build_object('aliases', '["Cabane","Cabane perchée","Kabanon"]'::jsonb, 'source', 'taxonomy_unit_type_20260729')),
  ('accommodation_unit_type', 'unusual_outdoor_unit', 'Hébergement insolite de plein air — autre',
   'Unité insolite de plein air non couverte par une forme plus précise.', 9, TRUE, TRUE,
   '{"fr":"Hébergement insolite de plein air — autre"}'::jsonb,
   '{"fr":"Unité insolite de plein air non couverte par une forme plus précise."}'::jsonb,
   jsonb_build_object('aliases', '["Glamping","Hébergement insolite"]'::jsonb, 'source', 'taxonomy_unit_type_20260729'))
ON CONFLICT (domain, code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      position = EXCLUDED.position,
      is_active = EXCLUDED.is_active,
      is_assignable = EXCLUDED.is_assignable,
      name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
      description_i18n = COALESCE(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
      metadata = COALESCE(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata;

-- -----------------------------------------------------------------------------
-- 3. Table de liaison multi-valuée.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS object_accommodation_unit_type (
  object_id     TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  unit_type_id  UUID NOT NULL REFERENCES ref_code_accommodation_unit_type(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- La PK porte l'unicité (object_id, unit_type_id) ET l'index sur object_id.
  PRIMARY KEY (object_id, unit_type_id)
);

COMMENT ON TABLE object_accommodation_unit_type IS
  '§200 — types d''unité d''hébergement d''un objet (multi-valué). Répond à « dans quoi le visiteur dort-il ? », jamais à « quel type d''établissement est-ce ? » (= object_taxonomy).';

-- PostgreSQL n'indexe PAS automatiquement le côté référençant d'une FK : sans
-- cet index, supprimer un code de référence balaierait toute la table de liaison.
CREATE INDEX IF NOT EXISTS idx_object_accommodation_unit_type_unit_type_id
  ON object_accommodation_unit_type (unit_type_id);

ALTER TABLE object_accommodation_unit_type ENABLE ROW LEVEL SECURITY;

-- Lecture — forme §38 : deux bras, `published` d'abord (chemin anonyme), puis
-- l'ensemble étendu résolu UNE fois par requête (InitPlan), jamais un scalaire
-- SECURITY DEFINER évalué par ligne scannée.
DROP POLICY IF EXISTS read_object_accommodation_unit_type ON object_accommodation_unit_type;
CREATE POLICY read_object_accommodation_unit_type ON object_accommodation_unit_type
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM object o
       WHERE o.id = object_accommodation_unit_type.object_id
         AND o.status = 'published'::object_status
    )
    OR object_id IN (SELECT api.current_user_extended_object_ids())
  );

-- Écriture — PAR COMMANDE. Un `FOR ALL` s'appliquerait aussi au SELECT et
-- court-circuiterait la policy de lecture ci-dessus (classe de bug P0.3).
DROP POLICY IF EXISTS canonical_ins_object_accommodation_unit_type ON object_accommodation_unit_type;
CREATE POLICY canonical_ins_object_accommodation_unit_type ON object_accommodation_unit_type
  FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS canonical_upd_object_accommodation_unit_type ON object_accommodation_unit_type;
CREATE POLICY canonical_upd_object_accommodation_unit_type ON object_accommodation_unit_type
  FOR UPDATE USING (api.user_can_write_object_canonical(object_id))
         WITH CHECK (api.user_can_write_object_canonical(object_id));

DROP POLICY IF EXISTS canonical_del_object_accommodation_unit_type ON object_accommodation_unit_type;
CREATE POLICY canonical_del_object_accommodation_unit_type ON object_accommodation_unit_type
  FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- GRANT explicites, commande par commande. `anon` lit (galeries publiques) mais
-- n'écrit jamais ; `authenticated` peut tenter les 3 écritures, que la policy
-- canonique tranche objet par objet. Aucune commande superflue n'est accordée.
REVOKE ALL ON TABLE object_accommodation_unit_type FROM anon, authenticated;
GRANT SELECT                         ON TABLE object_accommodation_unit_type TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE object_accommodation_unit_type TO authenticated;
GRANT ALL                            ON TABLE object_accommodation_unit_type TO service_role;
-- La partition de référence n'est PAS exposée directement via PostgREST (le cache
-- de schéma ignore les partitions filles) : le front lit `ref_code` avec
-- domain = 'accommodation_unit_type'. Le GRANT reste posé pour les jointures SQL.
GRANT SELECT ON TABLE ref_code_accommodation_unit_type TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Reprise nominative des 7 unités historiques (audit live 2026-07-29 §4).
--
--    Chaque ligne vérifie sa NATURE SOURCE avant d'écrire : ces reprises ne
--    changent jamais la nature de l'établissement, elles déplacent seulement
--    l'information de FORME vers le bon axe. Si une fiche a changé de nature
--    depuis le gel, la transaction s'arrête.
--
--    ORDRE IMPOSÉ : on insère l'unité D'ABORD, on retire l'ancienne feuille
--    ENSUITE. L'inverse perdrait l'information si l'insertion échouait.
-- -----------------------------------------------------------------------------
DO $unit_backfill$
DECLARE
  r          RECORD;
  v_unit     uuid;
  v_target   uuid;
  v_current  text;
  v_rows     int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- object_id,          nature attendue AVANT,  unité,     nature APRÈS (NULL = inchangée)
      ('HLORUN000000015Q', 'bulle',                'bubble', 'chambre_d_hotes'),
      ('HLORUN000000013Y', 'lodges',               'lodge',  'chambre_d_hotes'),
      ('HLORUN000000017V', 'hebergement_insolite', 'bubble', 'chambre_d_hotes'),
      ('HLORUN00000000UW', 'chambre_d_hotes',      'lodge',  NULL),
      ('HLORUN000000018Q', 'location_saisonniere', 'cabin',  NULL),
      ('CAMRUN000000013G', 'camping',              'cabin',  NULL),
      ('CAMRUN00000000PH', 'homestay_camping',     'cabin',  NULL)
    ) AS t(object_id, from_code, unit_code, to_code)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM object o WHERE o.id = r.object_id) THEN
      RAISE NOTICE 'lot5: % absent (base fraîche) — reprise ignorée', r.object_id;
      CONTINUE;
    END IF;

    SELECT rc.code INTO v_current
      FROM object_taxonomy ot
      JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
     WHERE ot.object_id = r.object_id
       AND ot.domain IN ('taxonomy_hlo', 'taxonomy_camp', 'taxonomy_hpa');

    -- Tolère le re-jeu : la nature a déjà été ramenée à sa valeur cible.
    IF v_current IS DISTINCT FROM r.from_code
       AND (r.to_code IS NULL OR v_current IS DISTINCT FROM r.to_code) THEN
      RAISE EXCEPTION
        'lot5: % porte « % » au lieu de la nature gelée « % » — la fiche a changé depuis l''audit du 2026-07-29',
        r.object_id, COALESCE(v_current, '(aucune)'), r.from_code;
    END IF;

    SELECT id INTO v_unit FROM ref_code
     WHERE domain = 'accommodation_unit_type' AND code = r.unit_code;
    IF v_unit IS NULL THEN
      RAISE EXCEPTION 'lot5: type d''unité « % » introuvable', r.unit_code;
    END IF;

    -- 4a. L'unité D'ABORD.
    INSERT INTO object_accommodation_unit_type (object_id, unit_type_id)
    VALUES (r.object_id, v_unit)
    ON CONFLICT (object_id, unit_type_id) DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM object_accommodation_unit_type
       WHERE object_id = r.object_id AND unit_type_id = v_unit
    ) THEN
      RAISE EXCEPTION 'lot5: insertion de l''unité % sur % non confirmée', r.unit_code, r.object_id;
    END IF;

    -- 4b. La nature ENSUITE, et seulement pour les trois feuilles à ramener.
    IF r.to_code IS NOT NULL AND v_current = r.from_code THEN
      SELECT id INTO v_target FROM ref_code WHERE domain = 'taxonomy_hlo' AND code = r.to_code;
      IF v_target IS NULL THEN
        RAISE EXCEPTION 'lot5: nature cible taxonomy_hlo.% introuvable', r.to_code;
      END IF;

      UPDATE object_taxonomy
         SET ref_code_id = v_target,
             source = 'taxonomy_unit_type_20260729',
             note = 'Audit live 2026-07-29 — la forme (' || r.unit_code || ') passe à l''axe Type d''unité ; nature PO conservée',
             updated_at = now()
       WHERE object_id = r.object_id AND domain = 'taxonomy_hlo';

      GET DIAGNOSTICS v_rows = ROW_COUNT;
      IF v_rows <> 1 THEN
        RAISE EXCEPTION 'lot5: recodage de % a touché % ligne(s)', r.object_id, v_rows;
      END IF;
    END IF;

    PERFORM api.refresh_object_filter_caches(r.object_id);
    RAISE NOTICE 'lot5: % → unité %, nature %', r.object_id, r.unit_code, COALESCE(r.to_code, v_current);
  END LOOP;
END
$unit_backfill$;

-- -----------------------------------------------------------------------------
-- 5. Retraite des anciennes feuilles devenues exclusivement des types d'unité.
--    GARDÉE sur 0 porteur : une feuille encore portée resterait active, et
--    l'assert 4 plus bas ferait échouer la migration — jamais de désactivation
--    silencieuse qui rendrait une fiche inéditable.
-- -----------------------------------------------------------------------------
UPDATE ref_code rc
   SET is_active = FALSE,
       is_assignable = FALSE,
       metadata = COALESCE(rc.metadata, '{}'::jsonb)
                  || jsonb_build_object(
                       'retired', 'taxonomy_unit_type_20260729',
                       'replacement_domain', 'accommodation_unit_type',
                       'reason', 'forme d''unité promue à son propre axe multi-valué')
 WHERE (rc.domain, rc.code) IN (
         ('taxonomy_hlo', 'bulle'),
         ('taxonomy_hlo', 'lodges'),
         ('taxonomy_hlo', 'hebergement_insolite'),
         ('taxonomy_hpa', 'outdoor_glamping')
       )
   AND rc.is_active
   AND NOT EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id);

-- -----------------------------------------------------------------------------
-- 6. Filtre Explorer — `accommodation_unit_types_any`.
--    Corps repris de la définition LIVE et patché aux trois points d'ancrage
--    (parsing / exclusion MV / prédicat). Voir `.tmp_pgapply/_gen_unit_type.cjs`.
-- -----------------------------------------------------------------------------
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
      -- §200 — types d'unité d'hébergement (axe MULTI-VALUÉ, table de liaison
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
        OR n.filters ? 'accommodation_unit_types_any'   -- §200: jointure vive sur object_accommodation_unit_type
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

-- -----------------------------------------------------------------------------
-- 7. Asserts fail-closed
-- -----------------------------------------------------------------------------
DO $unit_asserts$
DECLARE v_n INT; v_bad TEXT;
BEGIN
  -- 1. Le référentiel existe avec ses 5 codes assignables.
  SELECT count(*) INTO v_n FROM ref_code
   WHERE domain = 'accommodation_unit_type' AND is_active AND is_assignable;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'lot5: % code(s) de type d''unité actifs au lieu de 5', v_n;
  END IF;

  -- 2. RLS activée SUR LA PARTITION comme sur la table de liaison (elle
  --    n'hérite de rien) et policies présentes.
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.ref_code_accommodation_unit_type'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'lot5: RLS désactivée sur la partition ref_code_accommodation_unit_type';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.object_accommodation_unit_type'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'lot5: RLS désactivée sur object_accommodation_unit_type';
  END IF;

  -- 3. Écriture PAR COMMANDE, jamais FOR ALL (un FOR ALL s'applique au SELECT).
  SELECT string_agg(policyname, ', ') INTO v_bad
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'object_accommodation_unit_type' AND cmd = 'ALL';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'lot5: policy FOR ALL sur object_accommodation_unit_type: %', v_bad;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'object_accommodation_unit_type'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'lot5: % policy(ies) d''écriture par commande au lieu de 3', v_n;
  END IF;

  -- 4. Aucune ancienne feuille désactivée ne conserve de porteur.
  SELECT string_agg(rc.domain || '.' || rc.code, ', ') INTO v_bad
    FROM ref_code rc
   WHERE rc.metadata->>'retired' = 'taxonomy_unit_type_20260729'
     AND EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'lot5: feuille(s) retirée(s) mais encore portée(s): %', v_bad;
  END IF;

  -- 5. Les FK sont indexées des DEUX côtés (PostgreSQL n'indexe pas le côté
  --    référençant : sans index, une purge de référentiel scanne toute la table).
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'object_accommodation_unit_type'
       AND indexdef LIKE '%(unit_type_id)%'
  ) THEN
    RAISE EXCEPTION 'lot5: FK unit_type_id non indexée';
  END IF;

  -- 6. Le filtre est branché dans la RPC de l'Explorateur.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'api' AND p.proname = 'get_filtered_object_ids'
       AND pg_get_functiondef(p.oid) LIKE '%accommodation_unit_types_any%'
  ) THEN
    RAISE EXCEPTION 'lot5: api.get_filtered_object_ids ne connaît pas accommodation_unit_types_any';
  END IF;

  -- 7. La reprise, quand le corpus est présent : 7 liens, natures préservées.
  IF EXISTS (SELECT 1 FROM object WHERE id = 'HLORUN000000015Q') THEN
    SELECT count(*) INTO v_n
      FROM object_accommodation_unit_type
     WHERE object_id IN ('HLORUN000000015Q','HLORUN000000013Y','HLORUN000000017V',
                         'HLORUN00000000UW','HLORUN000000018Q','CAMRUN000000013G','CAMRUN00000000PH');
    IF v_n <> 7 THEN
      RAISE EXCEPTION 'lot5: % lien(s) de type d''unité repris au lieu de 7', v_n;
    END IF;

    -- Les trois feuilles HLO reviennent à Chambre d'hôtes — décision PO de juillet.
    SELECT string_agg(o.id, ', ') INTO v_bad
      FROM object o
      JOIN object_taxonomy ot ON ot.object_id = o.id AND ot.domain = 'taxonomy_hlo'
      JOIN ref_code rc ON rc.id = ot.ref_code_id
     WHERE o.id IN ('HLORUN000000015Q','HLORUN000000013Y','HLORUN000000017V')
       AND rc.code <> 'chambre_d_hotes';
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'lot5: nature non ramenée à chambre_d_hotes pour %', v_bad;
    END IF;
  END IF;
END
$unit_asserts$;

COMMIT;

-- =============================================================================
-- APRÈS COMMIT — hors transaction.
--   Les 7 fiches reprises sont déjà rafraîchies DANS la transaction. Reste :
--
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
--   NOTIFY pgrst, 'reload schema';   -- OBLIGATOIRE : nouvelle table exposée
--
-- REVUE ARCHITECTURE ET SÉCURITÉ REQUISE AVANT APPLICATION LIVE (plan §11) :
--   modèle multi-valué, FK, index, GRANT, policies RLS et résultat du backfill.
-- =============================================================================
