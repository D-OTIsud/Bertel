# P0.3 — RLS read-gate on object-child tables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the anon/cross-ORG draft-read leak by gating all 40 `USING(true)` object-child tables behind `published OR can_read_extended`, the READ mirror of SP-1b.

**Architecture:** One idempotent, transaction-wrapped SQL migration adds a `SECURITY DEFINER` helper `api.can_read_object(text)` and replaces each table's `USING(true)` SELECT policy with `USING (api.can_read_object(<object-path>))` (parent-`EXISTS` for nested tables, polymorphic for `tag_link`, media-scoped for `media_tag`), plus two missing FK indexes. Two CI SQL tests (coverage + behavioral) guard it. Verification is the existing GitHub Actions `SQL fresh-apply gate` (no local Docker here). Live PROD apply is gated on explicit user go-ahead.

**Tech Stack:** PostgreSQL 17 (Supabase flavour), RLS policies, plpgsql tests run via `psql`, GitHub Actions CI gate. Spec: [2026-06-03-p03-rls-read-gate-design.md](../specs/2026-06-03-p03-rls-read-gate-design.md).

**Branch:** `feat/p03-rls-read-gate` (already created off `origin/master`; the design spec is already committed there).

**Verification model (read this):** This repo has no local Docker, so the SQL can't be applied locally here. The CI gate (`.github/workflows/sql-fresh-apply.yml`) boots a fresh Supabase PG17 DB, runs `ci_fresh_apply.sql` (the full manifest + the new migration), then runs each `test_*.sql`. The "red" baseline is already proven: a read-only live-catalog query confirmed `anon` can `SELECT` draft rows from all 40 tables today (see spec §1). If you DO have Docker, you can run locally first: `supabase start` then `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/ci_fresh_apply.sql"` followed by the two test files.

---

## File Structure

- **Create** `Base de donnée DLL et API/migration_rls_read_gate_p03.sql` — the migration: helper + 40 SELECT policies + 2 FK indexes. One responsibility: the read gate.
- **Create** `Base de donnée DLL et API/tests/test_p03_read_gate_coverage.sql` — structural regression guard (no residual `USING(true)`; every table gated; nested FKs indexed).
- **Create** `Base de donnée DLL et API/tests/test_p03_read_gate_behavior.sql` — behavioral proof (anon/other-ORG/service_role visibility of a published vs draft fixture).
- **Modify** `Base de donnée DLL et API/ci_fresh_apply.sql` — add step `8d` (the migration) after `8c` (SP-1b).
- **Modify** `.github/workflows/sql-fresh-apply.yml` — add two steps running the new tests.
- **Modify** `docs/SQL_ROLLOUT_RUNBOOK.md`, `README.md`, `Base de donnée DLL et API/README.md` — add the migration to the documented apply order after `migration_permission_write_paths_b.sql`.

---

## Task 1: Write the migration (helper + 40 policies + 2 indexes)

**Files:**
- Create: `Base de donnée DLL et API/migration_rls_read_gate_p03.sql`

- [ ] **Step 1: Create the migration file with the exact content below**

```sql
-- migration_rls_read_gate_p03.sql
-- P0.3 — close the anon/cross-ORG draft-read leak on object-child tables.
-- 40 tables shipped a permissive `FOR SELECT USING (true)` policy while anon holds SELECT,
-- so anon could read draft/hidden objects' coordinates, pricing, openings, menus, relations,
-- owning-ORG, capacity, etc. via direct PostgREST. This replaces each USING(true) SELECT policy
-- with the same rule the gated siblings (object/media/contact_channel) already use:
--   published  -> anyone (incl. anon)   |   draft/hidden/archived -> only api.can_read_extended.
-- Centralized in api.can_read_object (READ mirror of api.user_can_write_object_canonical / SP-1).
--
-- PREREQUISITES: schema_unified.sql (tables), rls_policies.sql (defines api.can_read_extended
--   + the USING(true) policies this drops). APPLY AFTER rls_policies.sql; slotted after
--   migration_permission_write_paths_b.sql in the manifest (grouped with the permission work).
-- IDEMPOTENT: DROP POLICY IF EXISTS (old name + new name) + CREATE; CREATE OR REPLACE; CREATE INDEX IF NOT EXISTS.
-- REVERSIBLE: drop the read_* policies and re-CREATE the originals as `FOR SELECT USING (true)`.
-- The app is unaffected: public reads go through SECURITY DEFINER RPCs; the editor reads as
-- `authenticated` and holds can_read_extended on its own objects. RLS only gates direct PostgREST.

BEGIN;

-- 1) Single source of truth for "is this object's data readable by the current caller".
CREATE OR REPLACE FUNCTION api.can_read_object(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $fn$
  SELECT EXISTS (SELECT 1 FROM object o WHERE o.id = p_object_id AND o.status = 'published')
      OR api.can_read_extended(p_object_id);
$fn$;
REVOKE EXECUTE ON FUNCTION api.can_read_object(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION api.can_read_object(text) TO anon, authenticated, service_role;

-- ── Family A — direct object key (24) ───────────────────────────────────────
DROP POLICY IF EXISTS "Lecture publique des places" ON object_place;
DROP POLICY IF EXISTS "read_object_place" ON object_place;
CREATE POLICY "read_object_place" ON object_place FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_price_read" ON object_price;
DROP POLICY IF EXISTS "read_object_price" ON object_price;
CREATE POLICY "read_object_price" ON object_price FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_capacity_read" ON object_capacity;
DROP POLICY IF EXISTS "read_object_capacity" ON object_capacity;
CREATE POLICY "read_object_capacity" ON object_capacity FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_zone_read" ON object_zone;
DROP POLICY IF EXISTS "read_object_zone" ON object_zone;
CREATE POLICY "read_object_zone" ON object_zone FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_org_link_read" ON object_org_link;
DROP POLICY IF EXISTS "read_object_org_link" ON object_org_link;
CREATE POLICY "read_object_org_link" ON object_org_link FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_origin_read" ON object_origin;
DROP POLICY IF EXISTS "read_object_origin" ON object_origin;
CREATE POLICY "read_object_origin" ON object_origin FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_fma_occurrence_read" ON object_fma_occurrence;
DROP POLICY IF EXISTS "read_object_fma_occurrence" ON object_fma_occurrence;
CREATE POLICY "read_object_fma_occurrence" ON object_fma_occurrence FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_pet_policy_read" ON object_pet_policy;
DROP POLICY IF EXISTS "read_object_pet_policy" ON object_pet_policy;
CREATE POLICY "read_object_pet_policy" ON object_pet_policy FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_menu_read" ON object_menu;
DROP POLICY IF EXISTS "read_object_menu" ON object_menu;
CREATE POLICY "read_object_menu" ON object_menu FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_meeting_room_read" ON object_meeting_room;
DROP POLICY IF EXISTS "read_object_meeting_room" ON object_meeting_room;
CREATE POLICY "read_object_meeting_room" ON object_meeting_room FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_iti_practice_read" ON object_iti_practice;
DROP POLICY IF EXISTS "read_object_iti_practice" ON object_iti_practice;
CREATE POLICY "read_object_iti_practice" ON object_iti_practice FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_iti_stage_read" ON object_iti_stage;
DROP POLICY IF EXISTS "read_object_iti_stage" ON object_iti_stage;
CREATE POLICY "read_object_iti_stage" ON object_iti_stage FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_iti_info_read" ON object_iti_info;
DROP POLICY IF EXISTS "read_object_iti_info" ON object_iti_info;
CREATE POLICY "read_object_iti_info" ON object_iti_info FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_iti_associated_read" ON object_iti_associated_object;
DROP POLICY IF EXISTS "read_object_iti_associated_object" ON object_iti_associated_object;
CREATE POLICY "read_object_iti_associated_object" ON object_iti_associated_object FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "Lecture publique des profils ITI" ON object_iti_profile;
DROP POLICY IF EXISTS "read_object_iti_profile" ON object_iti_profile;
CREATE POLICY "read_object_iti_profile" ON object_iti_profile FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_opening_period_read" ON opening_period;
DROP POLICY IF EXISTS "read_opening_period" ON opening_period;
CREATE POLICY "read_opening_period" ON opening_period FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_classification_read" ON object_classification;
DROP POLICY IF EXISTS "read_object_classification" ON object_classification;
CREATE POLICY "read_object_classification" ON object_classification FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_amenity_read" ON object_amenity;
DROP POLICY IF EXISTS "read_object_amenity" ON object_amenity;
CREATE POLICY "read_object_amenity" ON object_amenity FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_environment_tag_read" ON object_environment_tag;
DROP POLICY IF EXISTS "read_object_environment_tag" ON object_environment_tag;
CREATE POLICY "read_object_environment_tag" ON object_environment_tag FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_object_language_read" ON object_language;
DROP POLICY IF EXISTS "read_object_language" ON object_language;
CREATE POLICY "read_object_language" ON object_language FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_payment_method_read" ON object_payment_method;
DROP POLICY IF EXISTS "read_object_payment_method" ON object_payment_method;
CREATE POLICY "read_object_payment_method" ON object_payment_method FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "Lecture publique des liaisons promotions" ON promotion_object;
DROP POLICY IF EXISTS "read_promotion_object" ON promotion_object;
CREATE POLICY "read_promotion_object" ON promotion_object FOR SELECT USING (api.can_read_object(object_id));

DROP POLICY IF EXISTS "pub_relation_read" ON object_relation;
DROP POLICY IF EXISTS "read_object_relation" ON object_relation;
CREATE POLICY "read_object_relation" ON object_relation FOR SELECT USING (api.can_read_object(source_object_id));

DROP POLICY IF EXISTS "pub_iti_section_read" ON object_iti_section;
DROP POLICY IF EXISTS "read_object_iti_section" ON object_iti_section;
CREATE POLICY "read_object_iti_section" ON object_iti_section FOR SELECT USING (api.can_read_object(parent_object_id));

-- ── Family B — object_location (nullable object_id; resolve via place) ───────
DROP POLICY IF EXISTS "Lecture publique des localisations" ON object_location;
DROP POLICY IF EXISTS "read_object_location" ON object_location;
CREATE POLICY "read_object_location" ON object_location FOR SELECT USING (
  api.can_read_object(
    COALESCE(object_location.object_id,
             (SELECT op.object_id FROM object_place op WHERE op.id = object_location.place_id))));

-- ── Family C — reach the object via a parent (EXISTS); join uses parent PK ───
DROP POLICY IF EXISTS "pub_price_period_read" ON object_price_period;
DROP POLICY IF EXISTS "read_object_price_period" ON object_price_period;
CREATE POLICY "read_object_price_period" ON object_price_period FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_price op
          WHERE op.id = object_price_period.price_id AND api.can_read_object(op.object_id)));

DROP POLICY IF EXISTS "pub_menu_item_read" ON object_menu_item;
DROP POLICY IF EXISTS "read_object_menu_item" ON object_menu_item;
CREATE POLICY "read_object_menu_item" ON object_menu_item FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_menu om
          WHERE om.id = object_menu_item.menu_id AND api.can_read_object(om.object_id)));

DROP POLICY IF EXISTS "pub_menu_item_dietary_read" ON object_menu_item_dietary_tag;
DROP POLICY IF EXISTS "read_object_menu_item_dietary_tag" ON object_menu_item_dietary_tag;
CREATE POLICY "read_object_menu_item_dietary_tag" ON object_menu_item_dietary_tag FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id
          WHERE omi.id = object_menu_item_dietary_tag.menu_item_id AND api.can_read_object(om.object_id)));

DROP POLICY IF EXISTS "pub_menu_item_allergen_read" ON object_menu_item_allergen;
DROP POLICY IF EXISTS "read_object_menu_item_allergen" ON object_menu_item_allergen;
CREATE POLICY "read_object_menu_item_allergen" ON object_menu_item_allergen FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id
          WHERE omi.id = object_menu_item_allergen.menu_item_id AND api.can_read_object(om.object_id)));

DROP POLICY IF EXISTS "pub_menu_item_cuisine_read" ON object_menu_item_cuisine_type;
DROP POLICY IF EXISTS "read_object_menu_item_cuisine_type" ON object_menu_item_cuisine_type;
CREATE POLICY "read_object_menu_item_cuisine_type" ON object_menu_item_cuisine_type FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id
          WHERE omi.id = object_menu_item_cuisine_type.menu_item_id AND api.can_read_object(om.object_id)));

DROP POLICY IF EXISTS "pub_menu_item_media_read" ON object_menu_item_media;
DROP POLICY IF EXISTS "read_object_menu_item_media" ON object_menu_item_media;
CREATE POLICY "read_object_menu_item_media" ON object_menu_item_media FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_menu_item omi JOIN object_menu om ON om.id = omi.menu_id
          WHERE omi.id = object_menu_item_media.menu_item_id AND api.can_read_object(om.object_id)));

DROP POLICY IF EXISTS "pub_meeting_room_equipment_read" ON meeting_room_equipment;
DROP POLICY IF EXISTS "read_meeting_room_equipment" ON meeting_room_equipment;
CREATE POLICY "read_meeting_room_equipment" ON meeting_room_equipment FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_meeting_room omr
          WHERE omr.id = meeting_room_equipment.room_id AND api.can_read_object(omr.object_id)));

DROP POLICY IF EXISTS "pub_iti_stage_media_read" ON object_iti_stage_media;
DROP POLICY IF EXISTS "read_object_iti_stage_media" ON object_iti_stage_media;
CREATE POLICY "read_object_iti_stage_media" ON object_iti_stage_media FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_iti_stage ois
          WHERE ois.id = object_iti_stage_media.stage_id AND api.can_read_object(ois.object_id)));

DROP POLICY IF EXISTS "pub_place_description_read" ON object_place_description;
DROP POLICY IF EXISTS "read_object_place_description" ON object_place_description;
CREATE POLICY "read_object_place_description" ON object_place_description FOR SELECT USING (
  EXISTS (SELECT 1 FROM object_place p
          WHERE p.id = object_place_description.place_id AND api.can_read_object(p.object_id)));

DROP POLICY IF EXISTS "pub_opening_schedule_read" ON opening_schedule;
DROP POLICY IF EXISTS "read_opening_schedule" ON opening_schedule;
CREATE POLICY "read_opening_schedule" ON opening_schedule FOR SELECT USING (
  EXISTS (SELECT 1 FROM opening_period p
          WHERE p.id = opening_schedule.period_id AND api.can_read_object(p.object_id)));

DROP POLICY IF EXISTS "pub_opening_time_period_read" ON opening_time_period;
DROP POLICY IF EXISTS "read_opening_time_period" ON opening_time_period;
CREATE POLICY "read_opening_time_period" ON opening_time_period FOR SELECT USING (
  EXISTS (SELECT 1 FROM opening_schedule s JOIN opening_period p ON p.id = s.period_id
          WHERE s.id = opening_time_period.schedule_id AND api.can_read_object(p.object_id)));

DROP POLICY IF EXISTS "pub_opening_time_period_weekday_read" ON opening_time_period_weekday;
DROP POLICY IF EXISTS "read_opening_time_period_weekday" ON opening_time_period_weekday;
CREATE POLICY "read_opening_time_period_weekday" ON opening_time_period_weekday FOR SELECT USING (
  EXISTS (SELECT 1 FROM opening_time_period tp
          JOIN opening_schedule s ON s.id = tp.schedule_id
          JOIN opening_period p ON p.id = s.period_id
          WHERE tp.id = opening_time_period_weekday.time_period_id AND api.can_read_object(p.object_id)));

DROP POLICY IF EXISTS "pub_opening_time_frame_read" ON opening_time_frame;
DROP POLICY IF EXISTS "read_opening_time_frame" ON opening_time_frame;
CREATE POLICY "read_opening_time_frame" ON opening_time_frame FOR SELECT USING (
  EXISTS (SELECT 1 FROM opening_time_period tp
          JOIN opening_schedule s ON s.id = tp.schedule_id
          JOIN opening_period p ON p.id = s.period_id
          WHERE tp.id = opening_time_frame.time_period_id AND api.can_read_object(p.object_id)));

-- ── Family D — polymorphic tag_link (gate object tags; leave other targets) ─
DROP POLICY IF EXISTS "pub_tag_link_read" ON tag_link;
DROP POLICY IF EXISTS "read_tag_link" ON tag_link;
CREATE POLICY "read_tag_link" ON tag_link FOR SELECT USING (
  (target_table = 'object' AND api.can_read_object(target_pk)) OR target_table <> 'object');

-- ── Family E — media_tag (media visibility keys off media.is_published) ──────
DROP POLICY IF EXISTS "Lecture publique des media_tag" ON media_tag;
DROP POLICY IF EXISTS "read_media_tag" ON media_tag;
CREATE POLICY "read_media_tag" ON media_tag FOR SELECT USING (
  EXISTS (SELECT 1 FROM media m
          WHERE m.id = media_tag.media_id
            AND (m.is_published IS TRUE OR api.can_read_extended(m.object_id))));

-- ── FK indexes for the two nested paths missing one (cascade + filter reads;
--     the RLS EXISTS itself probes the parent PK). Empty/tiny tables => instant. ──
CREATE INDEX IF NOT EXISTS idx_object_price_period_price_id     ON object_price_period(price_id);
CREATE INDEX IF NOT EXISTS idx_object_place_description_place_id ON object_place_description(place_id);

COMMIT;
```

- [ ] **Step 2: Commit**

```bash
git -C "C:\Users\dphil\Bertel3.0" add "Base de donnée DLL et API/migration_rls_read_gate_p03.sql"
git -C "C:\Users\dphil\Bertel3.0" commit -m "feat(rls): P0.3 gate 40 object-child read policies behind can_read_object" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Write the coverage test (structural regression guard)

**Files:**
- Create: `Base de donnée DLL et API/tests/test_p03_read_gate_coverage.sql`

- [ ] **Step 1: Create the test file with the exact content below**

```sql
-- test_p03_read_gate_coverage.sql
-- P0.3 regression guard. Run AFTER the full manifest (incl. migration_rls_read_gate_p03.sql).
-- Asserts: (1) none of the 40 object-child tables still has a permissive SELECT/ALL policy with
-- qual = 'true'; (2) every one has a SELECT-capable policy referencing the read gate
-- (can_read_object, or can_read_extended for media_tag); (3) every nested-path (Family C) FK
-- column has a leading-column index (so a dropped index can't silently restore seq-scan risk).
\set ON_ERROR_STOP on
DO $$
DECLARE
  v_tables text[] := ARRAY[
    'object_place','object_price','object_capacity','object_zone','object_org_link','object_origin',
    'object_fma_occurrence','object_pet_policy','object_menu','object_meeting_room','object_iti_practice',
    'object_iti_stage','object_iti_info','object_iti_associated_object','object_iti_profile','opening_period',
    'object_classification','object_amenity','object_environment_tag','object_language','object_payment_method',
    'promotion_object','object_relation','object_iti_section','object_location','object_price_period',
    'object_menu_item','object_menu_item_dietary_tag','object_menu_item_allergen','object_menu_item_cuisine_type',
    'object_menu_item_media','meeting_room_equipment','object_iti_stage_media','object_place_description',
    'opening_schedule','opening_time_period','opening_time_period_weekday','opening_time_frame','tag_link','media_tag'
  ];
  v_bad text;
BEGIN
  -- 1) No residual USING(true) read policy.
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = ANY(v_tables)
    AND cmd IN ('SELECT','ALL') AND qual = 'true';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'P0.3 LEAK OPEN: residual USING(true) read policy on %', v_bad;
  END IF;

  -- 2) Every table has a SELECT-capable policy referencing the read gate.
  SELECT string_agg(t, ', ') INTO v_bad
  FROM unnest(v_tables) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = t AND p.cmd IN ('SELECT','ALL')
      AND COALESCE(p.qual,'') ILIKE ANY (ARRAY['%can_read_object%','%can_read_extended%'])
  );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'P0.3: tables missing a read-gate policy: %', v_bad;
  END IF;

  -- 3) Nested-path FK columns must each have a leading-column index.
  SELECT string_agg(x.tbl || '.' || x.col, ', ') INTO v_bad
  FROM (VALUES
    ('object_price_period','price_id'), ('object_place_description','place_id'),
    ('object_menu_item','menu_id'),
    ('object_menu_item_dietary_tag','menu_item_id'), ('object_menu_item_allergen','menu_item_id'),
    ('object_menu_item_cuisine_type','menu_item_id'), ('object_menu_item_media','menu_item_id'),
    ('meeting_room_equipment','room_id'), ('object_iti_stage_media','stage_id'),
    ('opening_schedule','period_id'), ('opening_time_period','schedule_id'),
    ('opening_time_period_weekday','time_period_id'), ('opening_time_frame','time_period_id'),
    ('object_location','place_id')
  ) AS x(tbl,col)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = 'public' AND c.relname = x.tbl AND a.attname = x.col
  );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'P0.3: nested-path FK column without a leading-column index: %', v_bad;
  END IF;

  RAISE NOTICE 'P0.3 coverage passed: 40 tables gated, nested-path FKs indexed.';
END$$;
```

- [ ] **Step 2: Commit**

```bash
git -C "C:\Users\dphil\Bertel3.0" add "Base de donnée DLL et API/tests/test_p03_read_gate_coverage.sql"
git -C "C:\Users\dphil\Bertel3.0" commit -m "test(rls): P0.3 coverage guard (no USING(true); gated; nested FKs indexed)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Write the behavioral test (anon / other-ORG / service_role)

**Files:**
- Create: `Base de donnée DLL et API/tests/test_p03_read_gate_behavior.sql`

- [ ] **Step 1: Create the test file with the exact content below**

```sql
-- test_p03_read_gate_behavior.sql
-- P0.3 behavioral proof. Run AFTER the full manifest (incl. migration_rls_read_gate_p03.sql + seeds).
-- Self-contained + transactional (ROLLBACK; nothing persists). Mirrors test_sp2 fixture mechanics:
-- inserts run as the connecting superuser (RLS bypassed); SET LOCAL ROLE + request.jwt.claims drive
-- the per-role checks. Against a DB without the migration, the draft rows are visible to anon -> red.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_pub       text := 'HOTRUN9999999801';
  v_draft     text := 'HOTRUN9999999802';
  v_kind      uuid;
  v_pub_price uuid; v_draft_price uuid;
  v_pub_pp    uuid; v_draft_pp    uuid;
  v_other_uid uuid := '00000000-0000-4000-a000-0000000000b1';
BEGIN
  -- ---------- Fixture (as superuser; RLS bypassed) ----------
  SELECT id INTO v_kind FROM ref_code_price_kind LIMIT 1;
  IF v_kind IS NULL THEN RAISE EXCEPTION 'fixture: ref_code_price_kind empty (seeds not applied)'; END IF;

  INSERT INTO object (id, object_type, name, status) VALUES
    (v_pub,   'HOT', 'P03 published', 'published'),
    (v_draft, 'HOT', 'P03 draft',     'draft');

  INSERT INTO object_location (object_id, latitude, longitude) VALUES
    (v_pub, 1.111111, 1.111111), (v_draft, 2.222222, 2.222222);

  INSERT INTO object_price (object_id, kind_id, amount) VALUES (v_pub,   v_kind, 10) RETURNING id INTO v_pub_price;
  INSERT INTO object_price (object_id, kind_id, amount) VALUES (v_draft, v_kind, 20) RETURNING id INTO v_draft_price;
  INSERT INTO object_price_period (price_id, note) VALUES (v_pub_price,   'pub pp')   RETURNING id INTO v_pub_pp;
  INSERT INTO object_price_period (price_id, note) VALUES (v_draft_price, 'draft pp') RETURNING id INTO v_draft_pp;

  -- an authenticated user with NO membership/actor on either object (auth.users trigger auto-creates
  -- the profile; UPSERT to a non-superuser role).
  INSERT INTO auth.users (id, email) VALUES (v_other_uid, 'p03_other_org@test.local')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_other_uid, 'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- ---------- ANON: published visible, draft hidden (direct + nested) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  SET LOCAL ROLE anon;
    ASSERT (SELECT count(*) FROM object_location     WHERE object_id = v_pub)   = 1, 'anon MUST see published location';
    ASSERT (SELECT count(*) FROM object_location     WHERE object_id = v_draft) = 0, 'P0.3 LEAK: anon sees DRAFT location';
    ASSERT (SELECT count(*) FROM object_price_period WHERE id = v_pub_pp)       = 1, 'anon MUST see published price period (nested)';
    ASSERT (SELECT count(*) FROM object_price_period WHERE id = v_draft_pp)     = 0, 'P0.3 LEAK: anon sees DRAFT price period (nested)';
  RESET ROLE;

  -- ---------- AUTHENTICATED other-ORG (no membership/actor): draft hidden ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_uid, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    ASSERT (SELECT count(*) FROM object_location     WHERE object_id = v_pub)   = 1, 'other-ORG user MUST see published location';
    ASSERT (SELECT count(*) FROM object_location     WHERE object_id = v_draft) = 0, 'P0.3 LEAK: other-ORG user sees DRAFT location';
    ASSERT (SELECT count(*) FROM object_price_period WHERE id = v_draft_pp)     = 0, 'P0.3 LEAK: other-ORG user sees DRAFT price period';
  RESET ROLE;

  -- ---------- SERVICE_ROLE: bypasses RLS, sees all (sanity) ----------
  SET LOCAL ROLE service_role;
    ASSERT (SELECT count(*) FROM object_location     WHERE object_id = v_draft) = 1, 'service_role MUST see draft location (bypass)';
    ASSERT (SELECT count(*) FROM object_price_period WHERE id = v_draft_pp)     = 1, 'service_role MUST see draft price period (bypass)';
  RESET ROLE;

  RAISE NOTICE 'P0.3 behavioral assertions passed.';
END$$;
ROLLBACK;
```

- [ ] **Step 2: Commit**

```bash
git -C "C:\Users\dphil\Bertel3.0" add "Base de donnée DLL et API/tests/test_p03_read_gate_behavior.sql"
git -C "C:\Users\dphil\Bertel3.0" commit -m "test(rls): P0.3 behavioral proof (anon/other-ORG hidden, service_role bypass)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire into the manifest, CI workflow, and docs

**Files:**
- Modify: `Base de donnée DLL et API/ci_fresh_apply.sql` (after the `8c` block, ~line 51)
- Modify: `.github/workflows/sql-fresh-apply.yml` (after the SP-2 step, ~line 90)
- Modify: `docs/SQL_ROLLOUT_RUNBOOK.md`, `README.md`, `Base de donnée DLL et API/README.md`

- [ ] **Step 1: Add the migration to `ci_fresh_apply.sql`** — insert immediately after the `migration_permission_write_paths_b.sql` (`8c`) block:

```sql
\echo '== 8d     migration_rls_read_gate_p03.sql  (P0.3 — gate object-child reads behind can_read_object) =='
\ir migration_rls_read_gate_p03.sql
```

- [ ] **Step 2: Add two test steps to `.github/workflows/sql-fresh-apply.yml`** — insert after the "SP-2 behavioral test" step and before "Stop Supabase":

```yaml
      - name: P0.3 coverage assertions (read-gate; no residual USING(true); nested FKs indexed)
        env:
          DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_p03_read_gate_coverage.sql"

      - name: P0.3 behavioral test (anon/other-ORG cannot read draft child rows)
        env:
          DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
        run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_p03_read_gate_behavior.sql"
```

- [ ] **Step 3: Update the apply-order docs.** In each of `docs/SQL_ROLLOUT_RUNBOOK.md`, `README.md`, and `Base de donnée DLL et API/README.md`, locate the manifest/apply-order list and add an entry for `migration_rls_read_gate_p03.sql` **immediately after** the `migration_permission_write_paths_b.sql` entry, matching the surrounding formatting. Suggested description: *"P0.3 — RLS read gate: object-child tables readable only when the parent object is published or `can_read_extended` (closes the anon draft-read leak)."* Read each file's current list first and mirror its exact style (numbered step, table row, or bullet).

- [ ] **Step 4: Commit**

```bash
git -C "C:\Users\dphil\Bertel3.0" add "Base de donnée DLL et API/ci_fresh_apply.sql" ".github/workflows/sql-fresh-apply.yml" "docs/SQL_ROLLOUT_RUNBOOK.md" "README.md" "Base de donnée DLL et API/README.md"
git -C "C:\Users\dphil\Bertel3.0" commit -m "build(ci): wire P0.3 migration + tests into the fresh-apply gate and runbook" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Push and verify the CI gate is green

**Files:** none (verification).

- [ ] **Step 1: Push the branch**

```bash
git -C "C:\Users\dphil\Bertel3.0" push -u origin feat/p03-rls-read-gate
```

- [ ] **Step 2: Watch the fresh-apply gate**

```bash
gh run list --repo D-OTIsud/Bertel --workflow "SQL fresh-apply gate" --branch feat/p03-rls-read-gate --limit 1
gh run watch --repo D-OTIsud/Bertel $(gh run list --repo D-OTIsud/Bertel --workflow "SQL fresh-apply gate" --branch feat/p03-rls-read-gate --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
```

Expected: the job completes green. The two new steps print `P0.3 coverage passed: 40 tables gated, nested-path FKs indexed.` and `P0.3 behavioral assertions passed.` If red, read the failing step's log, fix the SQL (the `RAISE EXCEPTION` message names the offending table/policy/FK), commit, and re-push.

- [ ] **Step 3: Open the PR (base `master`)**

```bash
gh pr create --repo D-OTIsud/Bertel --base master --head feat/p03-rls-read-gate \
  --title "P0.3: RLS read-gate — close the anon draft-read leak on 40 object-child tables" \
  --body "Replaces USING(true) SELECT policies on 40 object-child tables with api.can_read_object (published OR can_read_extended) — the READ mirror of SP-1b. Adds 2 missing FK indexes (object_price_period.price_id, object_place_description.place_id). CI: coverage + behavioral tests in the fresh-apply gate. Spec: docs/superpowers/specs/2026-06-03-p03-rls-read-gate-design.md. App unaffected (public reads via SECURITY DEFINER RPCs; editor reads via can_read_extended)."
```

---

## Task 6: Apply to live PROD (GATED on explicit user go-ahead) + close out

**Files:** Modify `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (§24); refresh MEMORY.

> **STOP — do not run Step 1 until the user explicitly approves the live apply.** This is an outward-facing PROD change. Confirm first.

- [ ] **Step 1: Apply the migration to live PROD** via the Supabase MCP `apply_migration` (name: `p03_rls_read_gate`), passing the body of `migration_rls_read_gate_p03.sql` (without the outer `BEGIN;`/`COMMIT;` — `apply_migration` wraps its own transaction; keep the statements). Documented + gate-verified ⇒ not PROD-only drift, per the deploy-integrity invariant.

- [ ] **Step 2: Read-back verification on live** (Supabase MCP `execute_sql`, read-only):

```sql
-- (a) helper exists
SELECT count(*) AS has_helper FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='api' AND p.proname='can_read_object';
-- (b) zero residual USING(true) on the 40 tables (expect 0)
SELECT count(*) AS residual_true FROM pg_policies
WHERE schemaname='public' AND cmd IN ('SELECT','ALL') AND qual='true'
  AND tablename IN ('object_location','object_price','object_price_period','opening_period','object_menu','object_relation','object_org_link','object_fma_occurrence','object_place','tag_link','media_tag');
-- (c) the two new indexes exist (expect 2)
SELECT count(*) AS new_indexes FROM pg_indexes
WHERE schemaname='public' AND indexname IN ('idx_object_price_period_price_id','idx_object_place_description_place_id');
```

Then spot-check the leak is closed: as documented in the spec §8, confirm an anon-context read of a known draft object's `object_location` returns 0 rows (e.g. via a `SET ROLE anon` probe in `execute_sql`, or the project's anon PostgREST key).

- [ ] **Step 3: Merge the PR** (`gh pr merge --repo D-OTIsud/Bertel --merge`).

- [ ] **Step 4: Update §24 + MEMORY.** In `lot1_mapping_decisions.md` §24: correct the S1/P0.3 entry (the leak is 40 tables reaching anon, not just coordinates; wrong line ref 876-877), mark P0.3 done with the CI run id + live migration name, and move the off-path FK-index gaps into the deferred tracker. Refresh `C:\Users\dphil\.claude\projects\C--Users-dphil-Bertel3-0\memory\` (the deploy-integrity / roadmap notes) to reflect P0.3 done.

---

## Self-Review

**Spec coverage:** helper (§3.1)→Task 1; 40 policies incl. families A–E (§3.2)→Task 1; FK indexes (§3.3)→Task 1 + asserted in Task 2; out-of-scope items (§6) not touched ✓; coverage test (§7.1)→Task 2; behavioral test (§7.2)→Task 3; packaging/manifest (§5)→Task 4; definition-of-done incl. gated live apply (§8)→Tasks 5–6. All spec sections map to a task.

**Placeholder scan:** every SQL/YAML/command block is literal and complete. Task 4 Step 3 (apply-order docs) is the one "locate and mirror" instruction — unavoidable without the three files' current text inline; the exact entry text + anchor (after the `_b.sql` entry) are given.

**Type/name consistency:** policy names `read_<table>`; helper `api.can_read_object(text)`; the 40-table array in the coverage test matches the 40 `CREATE POLICY` statements in the migration (24 A + 1 B + 13 C + tag_link + media_tag); FK columns in the index assertion match Family C paths + the 2 added indexes; manifest step `8d` follows `8c`. Behavioral fixture uses verified columns (`object(id,object_type,name,status)`, `object_price(object_id,kind_id,amount)`, `object_price_period(price_id,note)`) and enum values (`HOT`, `published`/`draft`).
