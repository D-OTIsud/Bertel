-- Transactional body for migration_taxonomy_nature_forme.sql (§190).
-- Preconditions:
--   * caller owns the transaction;
--   * taxonomy_nature_forme_manifest_20260724.sql has populated
--     _taxonomy_nature_forme_manifest in the same transaction.
-- No COMMIT/ROLLBACK and no concurrent MV refresh in this file.

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '15min';

CREATE TEMP TABLE _taxonomy_nature_forme_context (
  mode TEXT CHECK (mode IS NULL OR mode IN ('fresh', 'live')),
  published_hlo INTEGER NOT NULL,
  legacy_carriers INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO _taxonomy_nature_forme_context (mode, published_hlo, legacy_carriers)
SELECT CASE
         WHEN counts.published_hlo = 0 AND counts.legacy_carriers = 0 THEN 'fresh'
         WHEN counts.published_hlo = 476 AND counts.legacy_carriers IN (0, 231) THEN 'live'
         ELSE NULL
       END,
       counts.published_hlo,
       counts.legacy_carriers
FROM (
  SELECT (SELECT count(*) FROM object WHERE object_type = 'HLO' AND status = 'published')::INTEGER AS published_hlo,
         (
           SELECT count(*)
           FROM object_taxonomy ot
           JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
           WHERE ot.domain = 'taxonomy_hlo'
             AND rc.code IN ('gite_villa', 'bungalow_chalet')
         )::INTEGER AS legacy_carriers
) counts;

DO $mode_gate$
DECLARE
  v_mode TEXT;
  v_published INTEGER;
  v_legacy INTEGER;
  v_bad TEXT;
BEGIN
  SELECT mode, published_hlo, legacy_carriers
  INTO v_mode, v_published, v_legacy
  FROM _taxonomy_nature_forme_context;

  IF v_mode IS NULL THEN
    RAISE EXCEPTION
      'taxonomy nature/forme drift: published HLO=%, legacy carriers=%; expected fresh 0/0 or live 476/(231|0)',
      v_published, v_legacy;
  END IF;

  IF v_mode = 'live' THEN
    SELECT string_agg(m.object_id, ', ' ORDER BY m.object_id)
    INTO v_bad
    FROM _taxonomy_nature_forme_manifest m
    LEFT JOIN object o ON o.id = m.object_id
    WHERE o.id IS NULL OR o.object_type <> 'HLO';

    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'taxonomy nature/forme live manifest objects missing/wrong type: %', v_bad;
    END IF;

    SELECT string_agg(ot.object_id || ':' || rc.code, ', ' ORDER BY ot.object_id)
    INTO v_bad
    FROM object_taxonomy ot
    JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
    LEFT JOIN _taxonomy_nature_forme_manifest m
      ON m.object_id = ot.object_id
     AND m.expected_old_code = rc.code
    WHERE ot.domain = 'taxonomy_hlo'
      AND rc.code IN ('gite_villa', 'bungalow_chalet')
      AND m.object_id IS NULL;

    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'taxonomy nature/forme uncovered legacy carriers: %', v_bad;
    END IF;

    SELECT string_agg(m.object_id || ':' || COALESCE(rc.code, '<missing>'), ', ' ORDER BY m.object_id)
    INTO v_bad
    FROM _taxonomy_nature_forme_manifest m
    LEFT JOIN object_taxonomy ot
      ON ot.object_id = m.object_id
     AND ot.domain = 'taxonomy_hlo'
    LEFT JOIN ref_code rc
      ON rc.id = ot.ref_code_id
     AND rc.domain = ot.domain
    WHERE rc.code IS NULL
       OR rc.code NOT IN (m.expected_old_code, m.target_code);

    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'taxonomy nature/forme unexpected current assignments: %', v_bad;
    END IF;
  END IF;
END
$mode_gate$;

-- 1. Seven target nodes. Branches must exist before their children.
WITH branches(code, name, description, position, parent_code, metadata) AS (VALUES
  ('hebergement_locatif', 'Hébergement locatif', 'Hébergement locatif non hôtelier', 100, 'root', '{"source":"taxonomy_nature_forme_20260724","axis":"nature"}'::JSONB),
  ('hebergement_collectif', 'Hébergement collectif', 'Hébergement collectif non hôtelier', 200, 'root', '{"source":"taxonomy_nature_forme_20260724","axis":"nature"}'::JSONB)
)
INSERT INTO ref_code (
  domain, code, name, description, position, parent_id,
  is_active, is_assignable, name_i18n, description_i18n, metadata
)
SELECT 'taxonomy_hlo', b.code, b.name, b.description, b.position, p.id,
       TRUE, TRUE,
       jsonb_build_object('fr', b.name),
       jsonb_build_object('fr', b.description),
       b.metadata
FROM branches b
JOIN ref_code p ON p.domain = 'taxonomy_hlo' AND p.code = b.parent_code
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    position = EXCLUDED.position,
    parent_id = EXCLUDED.parent_id,
    is_active = TRUE,
    is_assignable = TRUE,
    name_i18n = COALESCE(ref_code.name_i18n, '{}'::JSONB) || EXCLUDED.name_i18n,
    description_i18n = COALESCE(ref_code.description_i18n, '{}'::JSONB) || EXCLUDED.description_i18n,
    metadata = COALESCE(ref_code.metadata, '{}'::JSONB) || EXCLUDED.metadata,
    updated_at = NOW();

WITH leaves(code, name, description, position, parent_code, axis) AS (VALUES
  ('cdh_maison', 'Maison d''hôtes', 'Maison exploitée en chambre d''hôtes', 1001, 'chambre_d_hotes', 'forme'),
  ('cdh_bungalow', 'Bungalow', 'Bungalow exploité en chambre d''hôtes', 1002, 'chambre_d_hotes', 'forme'),
  ('bungalow', 'Bungalow / mobil-home', 'Bungalow ou mobil-home en location autonome', 1004, 'location_saisonniere', 'forme'),
  ('chalet', 'Chalet', 'Chalet en location autonome', 1005, 'location_saisonniere', 'forme'),
  ('auberge_collective', 'Auberge collective', 'Auberge à vocation d''hébergement collectif', 1003, 'hebergement_collectif', 'nature')
)
INSERT INTO ref_code (
  domain, code, name, description, position, parent_id,
  is_active, is_assignable, name_i18n, description_i18n, metadata
)
SELECT 'taxonomy_hlo', l.code, l.name, l.description, l.position, p.id,
       TRUE, TRUE,
       jsonb_build_object('fr', l.name),
       jsonb_build_object('fr', l.description),
       jsonb_build_object('source', 'taxonomy_nature_forme_20260724', 'axis', l.axis)
FROM leaves l
JOIN ref_code p ON p.domain = 'taxonomy_hlo' AND p.code = l.parent_code
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    position = EXCLUDED.position,
    parent_id = EXCLUDED.parent_id,
    is_active = TRUE,
    is_assignable = TRUE,
    name_i18n = COALESCE(ref_code.name_i18n, '{}'::JSONB) || EXCLUDED.name_i18n,
    description_i18n = COALESCE(ref_code.description_i18n, '{}'::JSONB) || EXCLUDED.description_i18n,
    metadata = COALESCE(ref_code.metadata, '{}'::JSONB) || EXCLUDED.metadata,
    updated_at = NOW();

-- 2. Four re-parentings.
WITH moves(child_code, parent_code) AS (VALUES
  ('chambre_d_hotes', 'hebergement_locatif'),
  ('location_saisonniere', 'hebergement_locatif'),
  ('gite_de_groupe', 'hebergement_collectif'),
  ('gite_de_randonnee', 'hebergement_collectif')
)
UPDATE ref_code child
SET parent_id = parent.id,
    updated_at = NOW()
FROM moves m
JOIN ref_code parent
  ON parent.domain = 'taxonomy_hlo'
 AND parent.code = m.parent_code
WHERE child.domain = 'taxonomy_hlo'
  AND child.code = m.child_code
  AND child.parent_id IS DISTINCT FROM parent.id;

-- Explicit closure belt immediately after parent changes.
SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_hlo');

-- 3. Five display-label changes. Codes remain stable identities.
WITH labels(code, new_name) AS (VALUES
  ('lodges', 'Lodge'),
  ('hebergement_insolite', 'Autre hébergement insolite'),
  ('location_saisonniere', 'Meublé de tourisme / gîte'),
  ('maison', 'Maison / villa'),
  ('gite_de_randonnee', 'Refuge et gîte d''étape')
)
UPDATE ref_code rc
SET name = l.new_name,
    description = l.new_name,
    name_i18n = jsonb_set(
      COALESCE(rc.name_i18n, '{}'::JSONB),
      '{fr}',
      to_jsonb(l.new_name),
      TRUE
    ),
    description_i18n = jsonb_set(
      COALESCE(rc.description_i18n, '{}'::JSONB),
      '{fr}',
      to_jsonb(l.new_name),
      TRUE
    ),
    updated_at = NOW()
FROM labels l
WHERE rc.domain = 'taxonomy_hlo'
  AND rc.code = l.code
  AND (
    rc.name IS DISTINCT FROM l.new_name
    OR rc.description IS DISTINCT FROM l.new_name
    OR rc.name_i18n->>'fr' IS DISTINCT FROM l.new_name
    OR rc.description_i18n->>'fr' IS DISTINCT FROM l.new_name
  );

DO $target_gate$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(DISTINCT m.target_code, ', ' ORDER BY m.target_code)
  INTO v_bad
  FROM _taxonomy_nature_forme_manifest m
  LEFT JOIN ref_code rc
    ON rc.domain = 'taxonomy_hlo'
   AND rc.code = m.target_code
   AND rc.is_active
   AND rc.is_assignable
  WHERE rc.id IS NULL;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'taxonomy nature/forme missing or unassignable target codes: %', v_bad;
  END IF;
END
$target_gate$;

-- 4. Frozen tri-state recoding. This also records PO-approved no-op rows.
UPDATE object_taxonomy ot
SET ref_code_id = target.id,
    source = m.source,
    note = m.motif,
    updated_at = NOW()
FROM _taxonomy_nature_forme_manifest m,
     ref_code target,
     ref_code current_code
WHERE ot.object_id = m.object_id
  AND ot.domain = 'taxonomy_hlo'
  AND current_code.id = ot.ref_code_id
  AND current_code.domain = ot.domain
  AND current_code.code IN (m.expected_old_code, m.target_code)
  AND target.domain = 'taxonomy_hlo'
  AND target.code = m.target_code
  AND (
    ot.ref_code_id IS DISTINCT FROM target.id
    OR ot.source IS DISTINCT FROM m.source
    OR ot.note IS DISTINCT FROM m.motif
  );

DO $recode_gate$
DECLARE
  v_mode TEXT;
  v_bad TEXT;
BEGIN
  SELECT mode INTO v_mode FROM _taxonomy_nature_forme_context;
  IF v_mode = 'live' THEN
    SELECT string_agg(m.object_id || ':' || COALESCE(rc.code, '<missing>'), ', ' ORDER BY m.object_id)
    INTO v_bad
    FROM _taxonomy_nature_forme_manifest m
    LEFT JOIN object_taxonomy ot
      ON ot.object_id = m.object_id
     AND ot.domain = 'taxonomy_hlo'
    LEFT JOIN ref_code rc
      ON rc.id = ot.ref_code_id
     AND rc.domain = ot.domain
    WHERE rc.code IS DISTINCT FROM m.target_code
       OR ot.source IS DISTINCT FROM m.source
       OR ot.note IS DISTINCT FROM m.motif;

    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'taxonomy nature/forme recoding did not converge: %', v_bad;
    END IF;
  END IF;
END
$recode_gate$;

-- 5. Disable emptied legacy/micro nodes; never delete referential codes.
DO $disable_gate$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(rc.code || '=' || counts.n::TEXT, ', ' ORDER BY rc.code)
  INTO v_bad
  FROM ref_code rc
  CROSS JOIN LATERAL (
    SELECT count(*) AS n FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id
  ) counts
  WHERE rc.domain = 'taxonomy_hlo'
    AND rc.code IN (
      'gite_villa', 'bungalow_chalet',
      'cottage', 'rez_de_chaussee_d_une_maison'
    )
    AND counts.n <> 0;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'taxonomy nature/forme refuses to disable carried codes: %', v_bad;
  END IF;
END
$disable_gate$;

UPDATE ref_code
SET is_active = FALSE,
    is_assignable = FALSE,
    updated_at = NOW()
WHERE domain = 'taxonomy_hlo'
  AND code IN (
    'gite_villa', 'bungalow_chalet',
    'cottage', 'rez_de_chaussee_d_une_maison'
  )
  AND (is_active OR is_assignable);

-- 6. Partner-visible incremental signal: all published HLO paths may change.
CREATE TEMP TABLE _taxonomy_nature_forme_bump_count (n INTEGER NOT NULL) ON COMMIT DROP;
WITH bumped AS (
  UPDATE object
  SET updated_at = NOW()
  WHERE object_type = 'HLO' AND status = 'published'
  RETURNING 1
)
INSERT INTO _taxonomy_nature_forme_bump_count(n)
SELECT count(*)::INTEGER FROM bumped;

DO $bump_gate$
DECLARE
  v_mode TEXT;
  v_count INTEGER;
BEGIN
  SELECT mode INTO v_mode FROM _taxonomy_nature_forme_context;
  SELECT n INTO v_count FROM _taxonomy_nature_forme_bump_count;
  IF (v_mode = 'live' AND v_count <> 476) OR (v_mode = 'fresh' AND v_count <> 0) THEN
    RAISE EXCEPTION 'taxonomy nature/forme unexpected published HLO bump count: % in mode %', v_count, v_mode;
  END IF;
END
$bump_gate$;

-- 7. Search-document refresh for every HLO taxonomy carrier, all statuses.
DO $cache_refresh$
DECLARE v_id TEXT;
BEGIN
  FOR v_id IN
    SELECT DISTINCT ot.object_id
    FROM object_taxonomy ot
    JOIN object o ON o.id = ot.object_id AND o.object_type = 'HLO'
    WHERE ot.domain = 'taxonomy_hlo'
    ORDER BY ot.object_id
  LOOP
    PERFORM api.refresh_object_filter_caches(v_id);
  END LOOP;
END
$cache_refresh$;

-- 8. Permanent live-data nature guard. PO decisions are explicit exemptions.
DO $nature_guard$
DECLARE
  v_bad TEXT;
BEGIN
  WITH mismatches AS (
    SELECT o.id, o.name, o.extra->>'source_category' AS berta, leaf.code AS leaf_code
    FROM object o
    JOIN object_taxonomy ot
      ON ot.object_id = o.id
     AND ot.domain = 'taxonomy_hlo'
     AND COALESCE(ot.source, '') NOT IN (
       'taxonomy_audit_lot_c_20260717',
       'taxonomy_nature_forme_arbitrage_20260724'
     )
    JOIN ref_code leaf ON leaf.id = ot.ref_code_id AND leaf.domain = ot.domain
    LEFT JOIN ref_code_taxonomy_closure cl
      ON cl.domain = 'taxonomy_hlo'
     AND cl.descendant_id = leaf.id
    LEFT JOIN ref_code nature
      ON nature.id = cl.ancestor_id
     AND nature.domain = cl.domain
     AND nature.code = CASE o.extra->>'source_category'
       WHEN 'Chambre d''hôtes' THEN 'chambre_d_hotes'
       WHEN 'Location saisonnière' THEN 'location_saisonniere'
       WHEN 'Gîte d''étape et de randonnée' THEN 'hebergement_collectif'
     END
    WHERE o.object_type = 'HLO'
      AND o.status = 'published'
      AND o.extra->>'source_category' IS NOT NULL
    GROUP BY o.id, o.name, o.extra->>'source_category', leaf.code
    HAVING count(nature.id) = 0
  )
  SELECT string_agg(id || ':' || leaf_code || '<>' || berta, ', ' ORDER BY id)
  INTO v_bad
  FROM mismatches;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'taxonomy nature/forme final guard failed: %', v_bad;
  END IF;
END
$nature_guard$;
