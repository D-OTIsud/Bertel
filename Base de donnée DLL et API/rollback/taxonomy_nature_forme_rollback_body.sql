-- Transactional rollback body for §190.
-- Preconditions: caller owns the transaction and has loaded
-- taxonomy_nature_forme_before_state.sql in the same transaction.

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '15min';

CREATE TEMP TABLE _taxonomy_nature_forme_rollback_context (
  mode TEXT CHECK (mode IS NULL OR mode IN ('fresh', 'live')),
  published_hlo INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO _taxonomy_nature_forme_rollback_context(mode, published_hlo)
SELECT CASE count(*)
         WHEN 0 THEN 'fresh'
         WHEN 476 THEN 'live'
         ELSE NULL
       END,
       count(*)::INTEGER
FROM object
WHERE object_type = 'HLO' AND status = 'published';

DO $rollback_mode_gate$
DECLARE
  v_mode TEXT;
  v_count INTEGER;
  v_bad TEXT;
BEGIN
  SELECT mode, published_hlo INTO v_mode, v_count
  FROM _taxonomy_nature_forme_rollback_context;

  IF v_mode IS NULL THEN
    RAISE EXCEPTION 'taxonomy rollback drift: published HLO=% (expected 0 or 476)', v_count;
  END IF;

  IF v_mode = 'live' THEN
    SELECT string_agg(b.object_id || ':' || COALESCE(rc.code, '<missing>'), ', ' ORDER BY b.object_id)
    INTO v_bad
    FROM _taxonomy_nature_forme_before_state b
    LEFT JOIN object_taxonomy ot
      ON ot.object_id = b.object_id
     AND ot.domain = b.domain
    LEFT JOIN ref_code rc
      ON rc.id = ot.ref_code_id
     AND rc.domain = ot.domain
    WHERE rc.code IS NULL
       OR rc.code NOT IN (b.old_code, b.target_code);

    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'taxonomy rollback unexpected current assignments: %', v_bad;
    END IF;
  END IF;
END
$rollback_mode_gate$;

-- 1. Reactivate every old destination before assignment restoration.
UPDATE ref_code
SET is_active = TRUE,
    is_assignable = TRUE,
    updated_at = NOW()
WHERE domain = 'taxonomy_hlo'
  AND code IN (
    'gite_villa', 'bungalow_chalet',
    'cottage', 'rez_de_chaussee_d_une_maison'
  )
  AND (NOT is_active OR NOT is_assignable);

-- 2. Restore exact UUID/source/note from the frozen cloud snapshot.
UPDATE object_taxonomy ot
SET ref_code_id = b.old_ref_code_id,
    source = b.old_source,
    note = b.old_note,
    updated_at = NOW()
FROM _taxonomy_nature_forme_before_state b,
     ref_code old_code,
     ref_code current_code
WHERE ot.object_id = b.object_id
  AND ot.domain = b.domain
  AND old_code.id = b.old_ref_code_id
  AND old_code.domain = b.domain
  AND old_code.code = b.old_code
  AND current_code.id = ot.ref_code_id
  AND current_code.domain = ot.domain
  AND current_code.code IN (b.old_code, b.target_code)
  AND (
    ot.ref_code_id IS DISTINCT FROM b.old_ref_code_id
    OR ot.source IS DISTINCT FROM b.old_source
    OR ot.note IS DISTINCT FROM b.old_note
  );

DO $rollback_assignment_gate$
DECLARE
  v_mode TEXT;
  v_bad TEXT;
BEGIN
  SELECT mode INTO v_mode FROM _taxonomy_nature_forme_rollback_context;
  IF v_mode = 'live' THEN
    SELECT string_agg(b.object_id || ':' || COALESCE(rc.code, '<missing>'), ', ' ORDER BY b.object_id)
    INTO v_bad
    FROM _taxonomy_nature_forme_before_state b
    LEFT JOIN object_taxonomy ot
      ON ot.object_id = b.object_id
     AND ot.domain = b.domain
    LEFT JOIN ref_code rc
      ON rc.id = ot.ref_code_id
     AND rc.domain = ot.domain
    WHERE rc.code IS DISTINCT FROM b.old_code
       OR ot.source IS DISTINCT FROM b.old_source
       OR ot.note IS DISTINCT FROM b.old_note;

    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'taxonomy rollback did not restore before-state: %', v_bad;
    END IF;
  END IF;
END
$rollback_assignment_gate$;

-- 3. Restore the four previous parents.
WITH moves(child_code, parent_code) AS (VALUES
  ('chambre_d_hotes', 'root'),
  ('location_saisonniere', 'root'),
  ('gite_de_groupe', 'gite_d_etape_et_de_randonnee'),
  ('gite_de_randonnee', 'gite_d_etape_et_de_randonnee')
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

-- Restore the five exact previous labels captured from cloud.
WITH labels(code, old_name) AS (VALUES
  ('lodges', 'Lodges'),
  ('hebergement_insolite', 'Hébergement Insolite'),
  ('location_saisonniere', 'Location saisonnière'),
  ('maison', 'Maison'),
  ('gite_de_randonnee', 'Gîte de randonnée')
)
UPDATE ref_code rc
SET name = l.old_name,
    description = l.old_name,
    name_i18n = jsonb_set(
      COALESCE(rc.name_i18n, '{}'::JSONB),
      '{fr}',
      to_jsonb(l.old_name),
      TRUE
    ),
    description_i18n = jsonb_set(
      COALESCE(rc.description_i18n, '{}'::JSONB),
      '{fr}',
      to_jsonb(l.old_name),
      TRUE
    ),
    updated_at = NOW()
FROM labels l
WHERE rc.domain = 'taxonomy_hlo'
  AND rc.code = l.code
  AND (
    rc.name IS DISTINCT FROM l.old_name
    OR rc.description IS DISTINCT FROM l.old_name
    OR rc.name_i18n->>'fr' IS DISTINCT FROM l.old_name
    OR rc.description_i18n->>'fr' IS DISTINCT FROM l.old_name
  );

-- 4. Explicit closure belt after restoring parents.
SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_hlo');

-- 5. The seven created nodes must now be empty; disable, never delete.
DO $rollback_disable_gate$
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
      'hebergement_locatif', 'cdh_maison', 'cdh_bungalow',
      'bungalow', 'chalet', 'hebergement_collectif', 'auberge_collective'
    )
    AND counts.n <> 0;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'taxonomy rollback refuses to disable carried created nodes: %', v_bad;
  END IF;
END
$rollback_disable_gate$;

UPDATE ref_code
SET is_active = FALSE,
    is_assignable = FALSE,
    updated_at = NOW()
WHERE domain = 'taxonomy_hlo'
  AND code IN (
    'hebergement_locatif', 'cdh_maison', 'cdh_bungalow',
    'bungalow', 'chalet', 'hebergement_collectif', 'auberge_collective'
  )
  AND (is_active OR is_assignable);

-- 6. Recompute every HLO taxonomy carrier search/filter cache.
DO $rollback_cache_refresh$
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
$rollback_cache_refresh$;

-- 7. Re-bump public HLO so incremental partners observe the rollback.
CREATE TEMP TABLE _taxonomy_nature_forme_rollback_bump_count (n INTEGER NOT NULL) ON COMMIT DROP;
WITH bumped AS (
  UPDATE object
  SET updated_at = NOW()
  WHERE object_type = 'HLO' AND status = 'published'
  RETURNING 1
)
INSERT INTO _taxonomy_nature_forme_rollback_bump_count(n)
SELECT count(*)::INTEGER FROM bumped;

DO $rollback_bump_gate$
DECLARE
  v_mode TEXT;
  v_count INTEGER;
BEGIN
  SELECT mode INTO v_mode FROM _taxonomy_nature_forme_rollback_context;
  SELECT n INTO v_count FROM _taxonomy_nature_forme_rollback_bump_count;
  IF (v_mode = 'live' AND v_count <> 476) OR (v_mode = 'fresh' AND v_count <> 0) THEN
    RAISE EXCEPTION 'taxonomy rollback unexpected published HLO bump count: % in mode %', v_count, v_mode;
  END IF;
END
$rollback_bump_gate$;
