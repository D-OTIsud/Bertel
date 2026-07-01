-- tests/test_partner_i18n_all.sql
-- Pins the C-5 partner multi-language projection (audit API, Phase 1):
--   api.strip_markdown_i18n(jsonb)  — {lang: markdown} -> {lang: plain text}
--   api.get_object_i18n_all(text)   — object_description free-text family as {field:{lang:plain}}
-- Structural (existence, SECURITY INVOKER, service_role-only grant on the RPC, broad grant on the
-- pure helper) + unit (strip per language, key lowercasing, empty drop, NULL/empty -> NULL) +
-- behavioural (overlay->canonical source, NULL-visibility included, public-only gate, published
-- gate, map-only projection, jsonb_strip_nulls of absent fields).
-- Self-cleaning: seeds a published/draft/private object fixture in a sub-transaction always rolled
-- back (ROLLBACK_PROBE) — leaves NOTHING in object / object_description / object_org_link.
DO $$
DECLARE
  v_org     text := 'ORGRUN9999990C50';
  v_ovl     text := 'HOTRUN9999990C51';  -- published, canonical + org-overlay (overlay wins)
  v_can     text := 'HOTRUN9999990C52';  -- published, canonical only, visibility NULL
  v_draft   text := 'HOTRUN9999990C53';  -- draft
  v_priv    text := 'HOTRUN9999990C54';  -- published, canonical visibility='private'
  v_fronly  text := 'HOTRUN9999990C55';  -- published, plain FR only (no i18n map)
  v_role    uuid;
  u1        jsonb;
  u2        jsonb;
  b_ovl     jsonb;
  b_can     jsonb;
  b_draft   jsonb;
  b_priv    jsonb;
  b_fronly  jsonb;
BEGIN
  -- 1. Both functions exist; get_object_i18n_all is SECURITY INVOKER (least privilege).
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='api' AND p.proname='strip_markdown_i18n') <> 1 THEN
    RAISE EXCEPTION 'api.strip_markdown_i18n missing';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='api' AND p.proname='get_object_i18n_all' AND NOT p.prosecdef) <> 1 THEN
    RAISE EXCEPTION 'api.get_object_i18n_all missing or not SECURITY INVOKER';
  END IF;

  -- 2. Grants: RPC service_role-ONLY; the pure helper is broadly executable (no data access).
  IF has_function_privilege('anon','api.get_object_i18n_all(text)','EXECUTE')
     OR has_function_privilege('authenticated','api.get_object_i18n_all(text)','EXECUTE') THEN
    RAISE EXCEPTION 'get_object_i18n_all must be service_role-only (anon/authenticated denied)';
  END IF;
  IF NOT has_function_privilege('service_role','api.get_object_i18n_all(text)','EXECUTE') THEN
    RAISE EXCEPTION 'get_object_i18n_all must be EXECUTE-able by service_role';
  END IF;
  IF NOT has_function_privilege('anon','api.strip_markdown_i18n(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'strip_markdown_i18n (pure helper) should be anon-executable like strip_markdown';
  END IF;

  -- 3. UNIT: strip per language + key lowercasing (EN -> en).
  u1 := api.strip_markdown_i18n('{"fr":"# Titre **gras**","EN":"## Sous *it*"}'::jsonb);
  IF (u1->>'fr') <> 'Titre gras' THEN RAISE EXCEPTION 'strip fr wrong: %', u1->>'fr'; END IF;
  IF (u1->>'en') <> 'Sous it'    THEN RAISE EXCEPTION 'strip en wrong: %', u1->>'en'; END IF;
  IF (u1 ? 'EN') THEN RAISE EXCEPTION 'key not lowercased: %', u1; END IF;

  -- 4. UNIT: empty/whitespace values dropped; NULL / {} / all-empty -> NULL.
  u2 := api.strip_markdown_i18n('{"fr":"ok","en":"   "}'::jsonb);
  IF u2 <> '{"fr":"ok"}'::jsonb THEN RAISE EXCEPTION 'empty value not dropped: %', u2; END IF;
  IF api.strip_markdown_i18n(NULL)              IS NOT NULL THEN RAISE EXCEPTION 'NULL should map to NULL'; END IF;
  IF api.strip_markdown_i18n('{}'::jsonb)        IS NOT NULL THEN RAISE EXCEPTION 'empty obj should map to NULL'; END IF;
  IF api.strip_markdown_i18n('{"fr":"  "}'::jsonb) IS NOT NULL THEN RAISE EXCEPTION 'all-empty should map to NULL'; END IF;

  -- ---------- Fixture ----------
  SELECT id INTO v_role FROM ref_org_role WHERE code='publisher' LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] missing (seeds not applied)'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org,    'ORG', 'Org C5',   'published'),
    (v_ovl,    'HOT', 'Ovl C5',   'published'),
    (v_can,    'HOT', 'Can C5',   'published'),
    (v_draft,  'HOT', 'Draft C5', 'draft'),
    (v_priv,   'HOT', 'Priv C5',  'published'),
    (v_fronly, 'HOT', 'Fr C5',    'published');

  -- Only v_ovl carries a primary publisher link (so overlay resolution engages there).
  INSERT INTO object_org_link (object_id, org_object_id, role_id, is_primary) VALUES
    (v_ovl, v_org, v_role, TRUE);

  -- v_ovl: canonical (public) + org overlay (public) — overlay MUST win (matches primary org).
  INSERT INTO object_description (object_id, org_object_id, description, description_i18n, visibility) VALUES
    (v_ovl, NULL,  'Canon FR',   '{"fr":"# Canon FR","en":"# Canon EN"}'::jsonb,           'public'),
    (v_ovl, v_org, 'Overlay FR', '{"fr":"# Overlay FR **b**","EN":"# Overlay EN"}'::jsonb, 'public');

  -- v_can: canonical only, visibility NULL (treated as readable) + a chapo map.
  INSERT INTO object_description (object_id, org_object_id, description, description_i18n, description_chapo_i18n, visibility) VALUES
    (v_can, NULL, 'Canon FR', '{"fr":"## Canon *FR*","en":"Canon EN"}'::jsonb, '{"fr":"*chapo*"}'::jsonb, NULL);

  -- v_draft: canonical public i18n (must NOT surface — draft object).
  INSERT INTO object_description (object_id, org_object_id, description, description_i18n, visibility) VALUES
    (v_draft, NULL, 'Draft FR', '{"fr":"# Draft"}'::jsonb, 'public');

  -- v_priv: canonical visibility='private' (must NOT surface — public-only path).
  INSERT INTO object_description (object_id, org_object_id, description, description_i18n, visibility) VALUES
    (v_priv, NULL, 'Priv FR', '{"fr":"# Secret"}'::jsonb, 'private');

  -- v_fronly: plain FR only, NO i18n map (must yield '{}' — map-only projection).
  INSERT INTO object_description (object_id, org_object_id, description, description_i18n, visibility) VALUES
    (v_fronly, NULL, 'FR only', NULL, 'public');

  -- 5. BEHAVIOURAL: overlay wins over canonical; markdown stripped; keys lowercased.
  b_ovl := api.get_object_i18n_all(v_ovl);
  IF (b_ovl->'description'->>'fr') <> 'Overlay FR b' THEN
    RAISE EXCEPTION 'overlay should win + strip bold, got %', b_ovl->'description'->>'fr'; END IF;
  IF (b_ovl->'description'->>'en') <> 'Overlay EN' THEN
    RAISE EXCEPTION 'overlay en wrong (EN->en lowercased?), got %', b_ovl->'description'; END IF;
  IF (b_ovl->'description' ? 'EN') THEN RAISE EXCEPTION 'nested key not lowercased: %', b_ovl->'description'; END IF;

  -- 6. jsonb_strip_nulls: fields with no i18n map are ABSENT (not null keys).
  IF (b_ovl ? 'description_mobile') OR (b_ovl ? 'sanitary_measures') THEN
    RAISE EXCEPTION 'absent fields should be stripped, got keys %', (SELECT string_agg(k,',') FROM jsonb_object_keys(b_ovl) k); END IF;

  -- 7. Canonical path + NULL visibility included + chapo emitted + heading/italic strip.
  b_can := api.get_object_i18n_all(v_can);
  IF (b_can->'description'->>'fr') <> 'Canon FR' THEN
    RAISE EXCEPTION 'canonical (NULL-visibility) fr wrong, got %', b_can->'description'->>'fr'; END IF;
  IF (b_can->'description_chapo'->>'fr') <> 'chapo' THEN
    RAISE EXCEPTION 'chapo not projected/stripped, got %', b_can->'description_chapo'; END IF;

  -- 8. Published gate: a DRAFT object => NULL (never surfaces).
  b_draft := api.get_object_i18n_all(v_draft);
  IF b_draft IS NOT NULL THEN RAISE EXCEPTION 'draft object must yield NULL, got %', b_draft; END IF;

  -- 9. Public-only gate: a PUBLISHED object whose only description is private => empty block.
  b_priv := api.get_object_i18n_all(v_priv);
  IF b_priv <> '{}'::jsonb THEN RAISE EXCEPTION 'private description must NOT surface, got %', b_priv; END IF;

  -- 10. Map-only projection: FR authored only in the plain column (no i18n map) => empty block.
  b_fronly := api.get_object_i18n_all(v_fronly);
  IF b_fronly <> '{}'::jsonb THEN RAISE EXCEPTION 'plain-only object should yield empty block, got %', b_fronly; END IF;

  -- 11. Unknown id => NULL.
  IF api.get_object_i18n_all('HOTRUN0000000XZZ') IS NOT NULL THEN RAISE EXCEPTION 'unknown id must yield NULL'; END IF;

  RAISE EXCEPTION 'ROLLBACK_PROBE'; -- leave no fixture rows behind
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'ROLLBACK_PROBE' THEN RAISE; END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'test_partner_i18n_all.sql: OK'; END $$;
