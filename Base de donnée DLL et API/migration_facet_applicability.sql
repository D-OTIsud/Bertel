-- migration_facet_applicability.sql
-- §46 — Single machine-readable type->facet applicability registry.
-- One source of truth for "which object_type may carry rows in which type-specific facet table",
-- consumed by (a) a generic BEFORE INSERT/UPDATE trigger on the 13 enrolled tables, (b) a guard on
-- object.object_type changes, (c) the editor's module gating (frontend reads ref_facet_applicability),
-- (d) api.facet_applicability_violations() for ops/CI reporting.
-- PREREQUISITES: schema_unified.sql (step 1: object + facet tables), rls_policies.sql (step 6:
--   api.is_platform_superuser). APPLY AFTER step 8l -- manifest step 8m.
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS / ON CONFLICT DO UPDATE / CREATE OR REPLACE FUNCTION /
--   DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- REVERSIBLE: DROP TRIGGER trg_guard_object_type_change ON object; DROP TRIGGER
--   trg_assert_facet_applicable ON <each of the 13 tables>; DROP FUNCTION
--   api.assert_facet_applicable(), api.assert_object_type_change_consistent(),
--   api.facet_applicability_violations(); DROP TABLE ref_facet_applicability, ref_facet_registry;
--   (rpc_create_object side-fix reverts by re-applying rls_policies.sql.)
-- ADMIN ESCAPE HATCH: bulk type-correction scripts (cf. old_data_enrichment) can disable triggers
--   for the session via SET session_replication_role = replica; (superuser only -- use deliberately).
-- NOTE: object.id's first 3 letters conventionally mirror the type (api.generate_object_id) but
--   chk_object_id_shape is shape-only -- nothing binds the prefix to object_type, so a type change
--   already desyncs the convention. Pre-existing, out of scope here -- the guard below only
--   protects facet-table consistency.
-- LIVE PRE-FLIGHT (2026-06-10): only one facet row exists on live (object_meeting_room/HOT, an
--   allowed baseline pair) -> seed matrix = baseline verbatim; facet_applicability_violations() = 0.

BEGIN;

-- == 1. Registry tables ======================================================
CREATE TABLE IF NOT EXISTS ref_facet_registry (
  facet_table       TEXT PRIMARY KEY,
  object_id_column  TEXT NOT NULL DEFAULT 'object_id',
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE ref_facet_registry IS
  '§46 -- type-specific facet tables enrolled in applicability enforcement. Enrolled = row here + trg_assert_facet_applicable attached. Second-level children (menu items, room amenities, stage media...) inherit through their FK parent and are NOT enrolled.';

CREATE TABLE IF NOT EXISTS ref_facet_applicability (
  facet_table  TEXT NOT NULL REFERENCES ref_facet_registry(facet_table) ON DELETE CASCADE,
  object_type  object_type NOT NULL,
  PRIMARY KEY (facet_table, object_type)
);
COMMENT ON TABLE ref_facet_applicability IS
  '§46 -- allowed (facet_table, object_type) pairs. Loosening = INSERT a row. The editor reads this to gate type-specific modules; api.assert_facet_applicable() enforces it on write.';

-- == 2. Seeds (baseline matrix; live-observed pairs subset of baseline -- see plan Task 1) ====
INSERT INTO ref_facet_registry (facet_table, object_id_column, description) VALUES
  ('object_iti',                   'object_id',        'Trace ITI (1:1)'),
  ('object_iti_info',              'object_id',        'Infos pratiques ITI (1:1)'),
  ('object_iti_practice',          'object_id',        'Pratiques ITI (M:N)'),
  ('object_iti_stage',             'object_id',        'Etapes ITI'),
  ('object_iti_profile',           'object_id',        'Profil altimetrique ITI'),
  ('object_iti_associated_object', 'object_id',        'Objets associes ITI'),
  ('object_iti_section',           'parent_object_id', 'Sections ITI (cle parent_object_id)'),
  ('object_fma',                   'object_id',        'Extension FMA -- evenements (1:1)'),
  ('object_fma_occurrence',        'object_id',        'Occurrences FMA'),
  ('object_act',                   'object_id',        'Extension ACT -- prestation encadree (1:1)'),
  ('object_room_type',             'object_id',        'Types de chambre (famille HEB)'),
  ('object_meeting_room',          'object_id',        'Salles de reunion / MICE'),
  ('object_menu',                  'object_id',        'Menus restaurant')
ON CONFLICT (facet_table) DO UPDATE
  SET object_id_column = EXCLUDED.object_id_column,
      description      = EXCLUDED.description,
      updated_at       = NOW();

INSERT INTO ref_facet_applicability (facet_table, object_type)
SELECT v.facet_table, v.object_type::object_type
FROM (VALUES
  ('object_iti','ITI'), ('object_iti_info','ITI'), ('object_iti_practice','ITI'),
  ('object_iti_stage','ITI'), ('object_iti_profile','ITI'),
  ('object_iti_associated_object','ITI'), ('object_iti_section','ITI'),
  ('object_fma','FMA'), ('object_fma_occurrence','FMA'),
  ('object_act','ACT'),
  ('object_room_type','HOT'), ('object_room_type','HPA'), ('object_room_type','HLO'),
  ('object_room_type','CAMP'), ('object_room_type','RVA'),
  ('object_meeting_room','HOT'), ('object_meeting_room','HPA'), ('object_meeting_room','HLO'),
  ('object_meeting_room','CAMP'), ('object_meeting_room','RVA'),
  ('object_menu','RES')
  -- (Task 1 live audit found no observed pairs outside this baseline -- no extensions.)
) AS v(facet_table, object_type)
ON CONFLICT DO NOTHING;

-- == 3. RLS: standard ref_* pub-read / admin-write pair (§39 form) ===========
-- (FOR ALL is the house style for ref_* admin policies -- the per-command rule of §47 targets
--  object-child tables; the USING(true) read policy short-circuits ahead of the admin predicate,
--  so no P0.3 EXECUTE grant is needed.)
ALTER TABLE ref_facet_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_facet_registry_read" ON ref_facet_registry;
CREATE POLICY "pub_ref_facet_registry_read" ON ref_facet_registry
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_write_ref_facet_registry" ON ref_facet_registry;
CREATE POLICY "admin_write_ref_facet_registry" ON ref_facet_registry
  FOR ALL USING (
    (select auth.role()) = 'service_role'
    OR (select auth.role()) = 'admin'
    OR api.is_platform_superuser()
  );
ALTER TABLE ref_facet_applicability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pub_ref_facet_applicability_read" ON ref_facet_applicability;
CREATE POLICY "pub_ref_facet_applicability_read" ON ref_facet_applicability
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "admin_write_ref_facet_applicability" ON ref_facet_applicability;
CREATE POLICY "admin_write_ref_facet_applicability" ON ref_facet_applicability
  FOR ALL USING (
    (select auth.role()) = 'service_role'
    OR (select auth.role()) = 'admin'
    OR api.is_platform_superuser()
  );

-- == 4. Generic applicability trigger ========================================
-- Pattern B validator (cf. api.validate_object_taxonomy_assignment): SECURITY INVOKER,
-- house search_path. Cost per row: 2 PK probes + 1 two-key PK probe -- hot-path safe (§37).
CREATE OR REPLACE FUNCTION api.assert_facet_applicable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $fn$
DECLARE
  v_col TEXT;
  v_object_id TEXT;
  v_type object_type;
BEGIN
  SELECT r.object_id_column INTO v_col
  FROM ref_facet_registry r WHERE r.facet_table = TG_TABLE_NAME;
  IF v_col IS NULL THEN
    -- Fail closed: an enrolled table (trigger attached) must have a registry row.
    RAISE EXCEPTION 'ref_facet_registry has no row for enrolled table % -- seed the registry', TG_TABLE_NAME;
  END IF;
  v_object_id := to_jsonb(NEW)->>v_col;
  IF v_object_id IS NULL THEN
    RETURN NEW;  -- nullable key: NOT NULL / FK constraints own that case
  END IF;
  SELECT o.object_type INTO v_type FROM object o WHERE o.id = v_object_id;
  IF v_type IS NULL THEN
    RETURN NEW;  -- unknown object: the FK raises the canonical error
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ref_facet_applicability a
    WHERE a.facet_table = TG_TABLE_NAME AND a.object_type = v_type
  ) THEN
    RAISE EXCEPTION 'facet table % does not accept object_type % (object %) -- see ref_facet_applicability',
      TG_TABLE_NAME, v_type, v_object_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti_info;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti_info
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti_practice;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti_practice
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti_stage;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti_stage
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti_profile;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti_profile
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti_associated_object;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti_associated_object
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_iti_section;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_iti_section
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_fma;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_fma
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_fma_occurrence;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_fma_occurrence
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_act;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_act
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_room_type;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_room_type
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_meeting_room;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_meeting_room
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();
DROP TRIGGER IF EXISTS trg_assert_facet_applicable ON object_menu;
CREATE TRIGGER trg_assert_facet_applicable BEFORE INSERT OR UPDATE ON object_menu
  FOR EACH ROW EXECUTE FUNCTION api.assert_facet_applicable();

-- == 5. Guard on object.object_type changes ==================================
CREATE OR REPLACE FUNCTION api.assert_object_type_change_consistent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $fn$
DECLARE
  r RECORD;
  v_exists BOOLEAN;
BEGIN
  IF NEW.object_type IS NOT DISTINCT FROM OLD.object_type THEN
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT reg.facet_table, reg.object_id_column
    FROM ref_facet_registry reg
    WHERE NOT EXISTS (
      SELECT 1 FROM ref_facet_applicability a
      WHERE a.facet_table = reg.facet_table AND a.object_type = NEW.object_type
    )
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE %I = $1)', r.facet_table, r.object_id_column)
      INTO v_exists USING NEW.id;
    IF v_exists THEN
      RAISE EXCEPTION 'cannot change object % to type %: rows exist in % which does not accept % -- clean them first or extend ref_facet_applicability',
        NEW.id, NEW.object_type, r.facet_table, NEW.object_type
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_object_type_change ON object;
CREATE TRIGGER trg_guard_object_type_change
  BEFORE UPDATE OF object_type ON object
  FOR EACH ROW EXECUTE FUNCTION api.assert_object_type_change_consistent();

-- == 6. Violations report (ops/CI; legacy rows are NOT auto-deleted) =========
CREATE OR REPLACE FUNCTION api.facet_applicability_violations()
RETURNS TABLE (facet_table TEXT, object_id TEXT, object_type object_type)
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $fn$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT reg.facet_table, reg.object_id_column FROM ref_facet_registry reg LOOP
    RETURN QUERY EXECUTE format(
      'SELECT DISTINCT %L::text, f.%I::text, o.object_type
         FROM %I f JOIN object o ON o.id = f.%I
        WHERE NOT EXISTS (SELECT 1 FROM ref_facet_applicability a
                          WHERE a.facet_table = %L AND a.object_type = o.object_type)',
      r.facet_table, r.object_id_column, r.facet_table, r.object_id_column, r.facet_table);
  END LOOP;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION api.facet_applicability_violations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.facet_applicability_violations() TO service_role;

-- == 7. §46 side-fix: rpc_create_object now derives the valid-type list from pg_enum (was hardcoded pre-ACT) ==
-- Kept identical to the rls_policies.sql source (fresh == live).
CREATE OR REPLACE FUNCTION api.rpc_create_object(
  p_object_type text,
  p_name        text,
  p_region_code text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_new_id      text;
  v_valid_types text;
BEGIN
  -- 0. Contexte utilisateur requis
  -- auth.uid() est NULL en appel service_role pur (sans JWT applicatif).
  -- Dans ce cas : created_by = NULL, trigger auto-attach no-op, données incohérentes.
  -- On refuse explicitement plutôt que de laisser passer silencieusement.
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION
      'NO_AUTH_CONTEXT: rpc_create_object requiert un utilisateur authentifié (auth.uid() est NULL). Appel service_role sans JWT applicatif non supporté par cette RPC';
  END IF;

  -- 1. Contrôle Niveau 1+2 : membership ORG actif + permission create_object
  IF NOT api.user_can_create_object() THEN
    RAISE EXCEPTION
      'FORBIDDEN: création d''objet refusée — vérifiez votre membership ORG actif et la permission create_object';
  END IF;

  -- 2. Validation du type objet (comparaison sur pg_enum pour un message propre)
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'object_type'::regtype
      AND enumlabel = p_object_type
  ) THEN
    -- §46: derive the valid-type list from pg_enum (was a hardcoded list that omitted ACT/others).
    SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
    INTO v_valid_types
    FROM pg_enum e
    WHERE e.enumtypid = 'object_type'::regtype;
    RAISE EXCEPTION 'INVALID_OBJECT_TYPE: type d''objet inconnu : %. Types valides : %',
      p_object_type, v_valid_types
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validation du nom
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION
      'MISSING_REQUIRED_FIELD: le champ name est obligatoire et ne peut pas être vide';
  END IF;

  -- 4. Insertion
  --   - id       : NULL → généré par trg_before_insert_object_generate_id
  --   - status   : forcé à 'draft' (publication = rpc_publish_object)
  --   - created_by / updated_by : forcé à auth.uid()
  --   - trg_auto_attach_object_to_creator_org s'exécute en AFTER INSERT
  INSERT INTO object (
    object_type,
    name,
    region_code,
    status,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  VALUES (
    p_object_type::object_type,
    trim(p_name),
    p_region_code,
    'draft',
    v_caller_id,
    v_caller_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMIT;
