-- =====================================================================
-- migration_media_visibility_gate.sql — manifest step 14a (§59, 2026-06-11)
--
-- Closes the §51-deferred media.visibility field gate, found again by the
-- §05 Médias editor review consumer sweep:
--
--   (A) RLS: `read_media` (8t, §38 split form) gated its published arm on
--       `is_published` + parent status only — `visibility` was NOT consulted,
--       so anon direct PostgREST could read 'private'/'partners' media rows
--       of PUBLISHED objects (URL, title, credit). The §49 doctrine applies:
--       the field flag COMPOSES inside the published arm, never substitutes.
--
--   (B) Cover cache: `update_object_cached_main_image()` (and the
--       maintenance.sql recompute) picked the is_main media WITHOUT a
--       visibility filter — a 'private' cover became the PUBLIC card image
--       (object.cached_main_image_url feeds get_object_cards_batch /
--       get_object_map_item / explorer cards).
--
-- NULL semantics (deliberate, documented): for media, NULL visibility is
-- treated as PUBLIC — `(visibility IS NULL OR visibility = 'public')` — to
-- match the long-standing consumer contract (get_object_resource anon arm,
-- get_media_for_web) and the live data (4014/4014 rows are NULL: these ARE
-- the public galleries). This deliberately diverges from object_description,
-- where 8t treats NULL as extended-only (import-private rows). The editor
-- preserves NULL on save since the §05 lot-1 fix (no silent widening).
--
-- Live magnitude at gate time: 0 'private'/'partners' rows, 0 private covers
-- (probe 2026-06-11) ⇒ forward-looking correctness, closed BEFORE the §05
-- visibility select puts real private rows in the table (8v/8w precedent).
--
-- Folded into rls_policies.sql + schema_unified.sql + maintenance.sql
-- (8s/8t/8v/8w precedent) ⇒ idempotent no-op on a fresh build.
-- Covered by tests/test_media_visibility_gate.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (A) read_media: compose visibility into the published arm (both the
--     object leg and the place leg — media is object-XOR-place keyed).
--     Extended arms unchanged: org members keep reading their own
--     private/partners/unpublished rows (the §05 editor loads them).
--     Outer columns in subqueries stay table-qualified (§55 invariant).
-- ---------------------------------------------------------------------
DO $$ BEGIN
  BEGIN DROP POLICY IF EXISTS "read_media" ON media; EXCEPTION WHEN others THEN NULL; END;
END $$;

CREATE POLICY "read_media" ON media FOR SELECT USING (
  (
    is_published IS TRUE
    AND (visibility IS NULL OR visibility = 'public')
    AND (
      (object_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM object o WHERE o.id = media.object_id AND o.status = 'published'))
      OR
      (place_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM object_place p JOIN object o ON o.id = p.object_id
        WHERE p.id = media.place_id AND o.status = 'published'))
    )
  )
  OR (object_id IS NOT NULL AND object_id IN (SELECT api.current_user_extended_object_ids()))
  OR (place_id IS NOT NULL AND place_id IN (
    SELECT p.id FROM object_place p
    WHERE p.object_id IN (SELECT api.current_user_extended_object_ids())))
);

-- ---------------------------------------------------------------------
-- (B) Cover cache trigger: the is_main pick must only consider media the
--     public may see — is_published AND (NULL-or-public) visibility.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_object_cached_main_image()
RETURNS TRIGGER
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
DECLARE
  v_new_object_id TEXT;
  v_old_object_id TEXT;
BEGIN
  v_new_object_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.object_id ELSE NULL END;
  v_old_object_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.object_id ELSE NULL END;

  IF v_old_object_id IS NOT NULL THEN
    UPDATE object
    SET cached_main_image_url = (
      SELECT url
      FROM media
      WHERE object_id = v_old_object_id
        AND is_published = TRUE
        AND is_main = TRUE
        AND (kind IS NULL OR kind = 'illustration')
        -- §59: a 'private'/'partners' cover must never become the public card image
        AND (visibility IS NULL OR visibility = 'public')
      ORDER BY position NULLS LAST
      LIMIT 1
    )
    WHERE id = v_old_object_id
      AND cached_main_image_url IS DISTINCT FROM (
        SELECT url
        FROM media
        WHERE object_id = v_old_object_id
          AND is_published = TRUE
          AND is_main = TRUE
          AND (kind IS NULL OR kind = 'illustration')
          AND (visibility IS NULL OR visibility = 'public')
        ORDER BY position NULLS LAST
        LIMIT 1
      );
  END IF;

  IF v_new_object_id IS NOT NULL AND v_new_object_id IS DISTINCT FROM v_old_object_id THEN
    UPDATE object
    SET cached_main_image_url = (
      SELECT url
      FROM media
      WHERE object_id = v_new_object_id
        AND is_published = TRUE
        AND is_main = TRUE
        AND (kind IS NULL OR kind = 'illustration')
        AND (visibility IS NULL OR visibility = 'public')
      ORDER BY position NULLS LAST
      LIMIT 1
    )
    WHERE id = v_new_object_id
      AND cached_main_image_url IS DISTINCT FROM (
        SELECT url
        FROM media
        WHERE object_id = v_new_object_id
          AND is_published = TRUE
          AND is_main = TRUE
          AND (kind IS NULL OR kind = 'illustration')
          AND (visibility IS NULL OR visibility = 'public')
        ORDER BY position NULLS LAST
        LIMIT 1
      );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- (the trigger itself is unchanged — same name, same fn; no re-CREATE needed)

-- ---------------------------------------------------------------------
-- (C) Recompute caches the new filter invalidates (0 rows live today —
--     every media row has visibility NULL — but idempotent for any state).
--     Mirrors the maintenance.sql sweep, restricted to objects whose cache
--     no longer matches the gated pick.
-- ---------------------------------------------------------------------
UPDATE object o
SET cached_main_image_url = sub.pick
FROM (
  SELECT o2.id, (
    SELECT m.url FROM media m
    WHERE m.object_id = o2.id
      AND m.is_published = TRUE
      AND m.is_main = TRUE
      AND (m.kind IS NULL OR m.kind = 'illustration')
      AND (m.visibility IS NULL OR m.visibility = 'public')
    ORDER BY m.position NULLS LAST
    LIMIT 1
  ) AS pick
  FROM object o2
  WHERE o2.cached_main_image_url IS NOT NULL
) sub
WHERE o.id = sub.id
  AND o.cached_main_image_url IS DISTINCT FROM sub.pick;
