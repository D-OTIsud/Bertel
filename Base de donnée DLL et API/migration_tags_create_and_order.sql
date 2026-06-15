-- ============================================================================
-- migration_tags_create_and_order.sql  (manifest 14h, 2026-06-15)
-- §09 « Tags & étiquettes » editor redesign — backend.
--
-- WHAT THIS DOES (idempotent, CREATE OR REPLACE throughout):
--   1) api.create_tag      — dedup-guarded GLOBAL tag creation (SECURITY DEFINER,
--                            gated per-object). ref_tag is admin-write RLS, so
--                            editor-facing creation must go through a DEFINER fn.
--   2) api.set_tag_color   — set a tag's GLOBAL color (ref_tag.color), gated.
--   3) api.get_object_tags_compact — order by tag_link.position (per-object §09
--                            priority) instead of the global ref_tag.position, so
--                            reordering in the editor actually drives the card/map.
--
-- DEPLOY-INTEGRITY NOTES (the tag aggregate is inlined in MULTIPLE live sites):
--   * The Explorer results grid is served by the SECURITY DEFINER override of
--     api.get_object_cards_batch in migration_cards_batch_authorize_definer.sql
--     (manifest 8j). That file's tags CTE carries the SAME tl.position change and
--     MUST be RE-APPLIED to live alongside this migration. Re-applying it is safe
--     (CREATE OR REPLACE; only the ORDER BY line changed).
--   * api.get_object_resource also emits tags; its ORDER BY is fixed in
--     api_views_functions.sql for fresh-apply, but that function has a pending
--     undeployed change (structured beds, commit ecf6ed8) — its tag-order line
--     ships with the NEXT get_object_resource deploy, NOT this tags-only apply.
--   * Color is already emitted as ref_tag.color (t.color) at every site, so the
--     "color real on the card" half is a pure frontend render change — no SQL.
--
-- Color is GLOBAL per tag (PO decision D3): one ref_tag.color everywhere.
-- The 0028/0029 advisor flag on the executable DEFINER RPCs is expected (§36).
-- After applying: NOTIFY pgrst, 'reload schema';
-- ============================================================================

-- 1) Per-object §09 priority order for the compact tag payload (maps / LCP / list).
CREATE OR REPLACE FUNCTION api.get_object_tags_compact(
  p_object_id TEXT,
  p_lang_prefs TEXT[] DEFAULT ARRAY['fr']::text[]
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'slug', t.slug,
        'name', t.name,
        'color', t.color,
        'icon', t.icon,
        'icon_url', t.icon_url
      )
      -- §09: per-object priority order (tag_link.position), NOT global ref_tag.position.
      ORDER BY COALESCE(tl.position, 999999), t.name, t.slug
    ),
    '[]'::jsonb
  )
  FROM tag_link tl
  JOIN ref_tag t ON t.id = tl.tag_id
  WHERE tl.target_table = 'object'
    AND tl.target_pk = p_object_id;
$$;

COMMENT ON FUNCTION api.get_object_tags_compact(TEXT, TEXT[]) IS
'Compact object tag payload for cards, maps and LCP/list payloads. Ordered by tag_link.position (§09 per-object priority).';

-- 2) Dedup-guarded GLOBAL tag creation.
CREATE OR REPLACE FUNCTION api.create_tag(
  p_anchor_object_id text,
  p_name text,
  p_color text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth
AS $$
DECLARE
  v_name  text := btrim(COALESCE(p_name, ''));
  v_color text := lower(btrim(COALESCE(p_color, '')));
  v_norm  text;
  v_slug  text;
  v_row   public.ref_tag%ROWTYPE;
BEGIN
  -- Per-object canonical-write gate (fail-closed). The function bypasses RLS,
  -- so this probe IS the authorization boundary. Trusts only p_name/p_color.
  PERFORM internal.workspace_assert_can_write_object(p_anchor_object_id);

  IF v_name = '' THEN
    RAISE EXCEPTION 'Tag name is required' USING ERRCODE = '22023';
  END IF;
  -- Color is a HEX #rrggbb (matches 100% of live ref_tag.color, a designed palette;
  -- the old named-variant set was frontend-fallback fiction). Empty -> neutral slate default.
  IF v_color = '' THEN
    v_color := '#64748b';
  ELSIF v_color !~ '^#[0-9a-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid tag color (expect #rrggbb): %', p_color USING ERRCODE = '22023';
  END IF;

  -- Dedup on the NORMALIZED name, NOT the slug: ref_tag.slug UNIQUE is
  -- case-sensitive and idx_ref_tag_slug_ci is NON-unique, so case/accent
  -- variants must converge on name_normalized (a STORED generated column =
  -- immutable_unaccent(lower(name))). Insert-or-return-existing.
  v_norm := immutable_unaccent(lower(v_name));
  SELECT * INTO v_row FROM public.ref_tag WHERE name_normalized = v_norm LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('tag_id', v_row.id, 'slug', v_row.slug,
                              'name', v_row.name, 'color', v_row.color, 'created', false);
  END IF;

  v_slug := btrim(regexp_replace(v_norm, '[^a-z0-9]+', '-', 'g'), '-');
  IF v_slug = '' THEN
    RAISE EXCEPTION 'Tag name yields an empty slug' USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.ref_tag (id, slug, name, color, created_by)
    VALUES (gen_random_uuid(), v_slug, v_name, v_color, (select auth.uid()))
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent same-name create → re-resolve idempotently by normalized name.
    SELECT * INTO v_row FROM public.ref_tag WHERE name_normalized = v_norm LIMIT 1;
    IF NOT FOUND THEN
      -- A DIFFERENT name collided on slug (e.g. 'Vue Mer' vs 'Vue-Mer'): disambiguate.
      v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      INSERT INTO public.ref_tag (id, slug, name, color, created_by)
      VALUES (gen_random_uuid(), v_slug, v_name, v_color, (select auth.uid()))
      RETURNING * INTO v_row;
    END IF;
  END;

  RETURN jsonb_build_object('tag_id', v_row.id, 'slug', v_row.slug,
                            'name', v_row.name, 'color', v_row.color, 'created', true);
END;
$$;

REVOKE ALL ON FUNCTION api.create_tag(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.create_tag(text, text, text) TO authenticated, service_role;
COMMENT ON FUNCTION api.create_tag(text, text, text) IS
'§09: dedup-guarded GLOBAL tag creation. Gated per-object (user_can_write_object_canonical). Dedup on ref_tag.name_normalized (insert-or-return-existing); slug derived inline; gen_random_uuid; created_by set. Returns {tag_id, slug, name, color, created}.';

-- 3) Set a tag's GLOBAL color.
CREATE OR REPLACE FUNCTION api.set_tag_color(
  p_anchor_object_id text,
  p_tag_id uuid,
  p_color text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth
AS $$
DECLARE
  v_color text := lower(btrim(COALESCE(p_color, '')));
  v_row   public.ref_tag%ROWTYPE;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_anchor_object_id);

  IF p_tag_id IS NULL THEN
    RAISE EXCEPTION 'tag_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_color !~ '^#[0-9a-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid tag color (expect #rrggbb): %', p_color USING ERRCODE = '22023';
  END IF;

  -- GLOBAL recolor (D3): changes ref_tag.color for every object/surface.
  UPDATE public.ref_tag
     SET color = v_color, updated_by = (select auth.uid()), updated_at = NOW()
   WHERE id = p_tag_id
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown tag_id: %', p_tag_id USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('tag_id', v_row.id, 'slug', v_row.slug,
                            'name', v_row.name, 'color', v_row.color);
END;
$$;

REVOKE ALL ON FUNCTION api.set_tag_color(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.set_tag_color(text, uuid, text) TO authenticated, service_role;
COMMENT ON FUNCTION api.set_tag_color(text, uuid, text) IS
'§09: set a tag''s GLOBAL color (ref_tag.color), gated per-object. Color is global per tag (D3). SECURITY DEFINER (ref_tag admin-write RLS).';

NOTIFY pgrst, 'reload schema';
