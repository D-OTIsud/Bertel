-- migration_sustainability_v5.sql
-- Adds ref_sustainability_action_group, extends ref_sustainability_action (group_id, external_code,
-- action_ui_priority, sort_order), creates ref_classification_equivalent_group and
-- ref_classification_equivalent_action, and two search-expansion views.
--
-- PREREQUISITE: Apply schema_unified.sql first (ref_sustainability_action_category,
-- ref_classification_scheme, ref_sustainability_action must exist).
-- IDEMPOTENT: All DDL uses IF NOT EXISTS / CREATE OR REPLACE.
-- TRANSACTION SAFE: All standard DDL — no CREATE INDEX CONCURRENTLY — wrapped in BEGIN/COMMIT.

-- V5 migration aligned to schema_unified.sql
-- Adds sustainability action groups, action-level external codes, UI sorting,
-- and scheme-to-equivalent action/group lookup tables for DD search expansion.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ref_sustainability_action_group (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES ref_sustainability_action_category(id) ON DELETE RESTRICT,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  icon_url TEXT,
  position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name_i18n JSONB,
  description_i18n JSONB,
  extra JSONB
);

ALTER TABLE IF EXISTS ref_sustainability_action
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES ref_sustainability_action_group(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS external_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS action_ui_priority INTEGER,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_sustainability_action_external_code
  ON ref_sustainability_action(external_code)
  WHERE external_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ref_sustainability_action_group_id
  ON ref_sustainability_action(group_id);

CREATE TABLE IF NOT EXISTS ref_classification_equivalent_group (
  scheme_id UUID NOT NULL REFERENCES ref_classification_scheme(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES ref_sustainability_action_group(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'macro_group',
  requirement_type TEXT NOT NULL DEFAULT 'recommandé',
  match_scope TEXT NOT NULL DEFAULT 'search_expansion',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scheme_id, group_id),
  CONSTRAINT chk_ref_classification_equivalent_group_relation_type
    CHECK (relation_type IN ('macro_group','equivalent_group')),
  CONSTRAINT chk_ref_classification_equivalent_group_requirement_type
    CHECK (requirement_type IN ('obligatoire','confort','points','recommandé')),
  CONSTRAINT chk_ref_classification_equivalent_group_match_scope
    CHECK (match_scope IN ('search_expansion','coverage','both'))
);

CREATE TABLE IF NOT EXISTS ref_classification_equivalent_action (
  scheme_id UUID NOT NULL REFERENCES ref_classification_scheme(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES ref_sustainability_action(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'equivalent_action',
  requirement_type TEXT NOT NULL DEFAULT 'recommandé',
  match_scope TEXT NOT NULL DEFAULT 'search_expansion',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scheme_id, action_id),
  CONSTRAINT chk_ref_classification_equivalent_action_relation_type
    CHECK (relation_type IN ('equivalent_action','direct_action')),
  CONSTRAINT chk_ref_classification_equivalent_action_requirement_type
    CHECK (requirement_type IN ('obligatoire','confort','points','recommandé')),
  CONSTRAINT chk_ref_classification_equivalent_action_match_scope
    CHECK (match_scope IN ('search_expansion','coverage','both'))
);

CREATE INDEX IF NOT EXISTS idx_ref_classification_equivalent_group_group_id
  ON ref_classification_equivalent_group(group_id);
CREATE INDEX IF NOT EXISTS idx_ref_classification_equivalent_action_action_id
  ON ref_classification_equivalent_action(action_id);

CREATE OR REPLACE VIEW v_object_classification_or_equivalent_scheme AS
WITH equivalent_actions AS (
  SELECT rcea.scheme_id, rcea.action_id
  FROM ref_classification_equivalent_action rcea
  UNION
  SELECT rceg.scheme_id, rsa.id AS action_id
  FROM ref_classification_equivalent_group rceg
  JOIN ref_sustainability_action rsa ON rsa.group_id = rceg.group_id
), explicit_labels AS (
  SELECT DISTINCT oc.object_id, oc.scheme_id, 'classification'::TEXT AS match_source
  FROM object_classification oc
), equivalent_matches AS (
  SELECT DISTINCT osa.object_id, ea.scheme_id, 'equivalent_action'::TEXT AS match_source
  FROM object_sustainability_action osa
  JOIN equivalent_actions ea ON ea.action_id = osa.action_id
)
SELECT * FROM explicit_labels
UNION
SELECT * FROM equivalent_matches;

CREATE OR REPLACE VIEW v_object_classification_coverage AS
WITH expected_actions AS (
  SELECT scheme_id, action_id, requirement_type
  FROM ref_classification_equivalent_action
  UNION
  SELECT rceg.scheme_id, rsa.id AS action_id, rceg.requirement_type
  FROM ref_classification_equivalent_group rceg
  JOIN ref_sustainability_action rsa ON rsa.group_id = rceg.group_id
), expected_dedup AS (
  SELECT scheme_id, action_id,
         CASE
           WHEN BOOL_OR(requirement_type = 'obligatoire') THEN 'obligatoire'
           WHEN BOOL_OR(requirement_type = 'confort') THEN 'confort'
           WHEN BOOL_OR(requirement_type = 'points') THEN 'points'
           ELSE 'recommandé'
         END AS requirement_type
  FROM expected_actions
  GROUP BY scheme_id, action_id
), object_pool AS (
  SELECT DISTINCT object_id FROM object_sustainability_action
), covered AS (
  SELECT osa.object_id, ed.scheme_id, ed.action_id, ed.requirement_type
  FROM object_sustainability_action osa
  JOIN expected_dedup ed ON ed.action_id = osa.action_id
)
SELECT
  op.object_id,
  s.id AS scheme_id,
  s.code AS scheme_code,
  COUNT(ed.action_id) AS expected_action_count,
  COUNT(c.action_id) AS covered_action_count,
  CASE WHEN COUNT(ed.action_id) = 0 THEN 0
       ELSE ROUND((COUNT(c.action_id)::NUMERIC / COUNT(ed.action_id)::NUMERIC) * 100, 1)
  END AS coverage_pct,
  COUNT(ed.action_id) FILTER (WHERE ed.requirement_type = 'obligatoire') AS expected_obligatoire_count,
  COUNT(c.action_id) FILTER (WHERE c.requirement_type = 'obligatoire') AS covered_obligatoire_count,
  COUNT(ed.action_id) FILTER (WHERE ed.requirement_type = 'confort') AS expected_confort_count,
  COUNT(c.action_id) FILTER (WHERE c.requirement_type = 'confort') AS covered_confort_count,
  COUNT(ed.action_id) FILTER (WHERE ed.requirement_type = 'points') AS expected_points_count,
  COUNT(c.action_id) FILTER (WHERE c.requirement_type = 'points') AS covered_points_count,
  COUNT(ed.action_id) FILTER (WHERE ed.requirement_type = 'recommandé') AS expected_recommande_count,
  COUNT(c.action_id) FILTER (WHERE c.requirement_type = 'recommandé') AS covered_recommande_count
FROM object_pool op
JOIN ref_classification_scheme s ON EXISTS (
  SELECT 1 FROM expected_dedup e2 WHERE e2.scheme_id = s.id
)
LEFT JOIN expected_dedup ed ON ed.scheme_id = s.id
LEFT JOIN covered c ON c.object_id = op.object_id AND c.scheme_id = s.id AND c.action_id = ed.action_id
GROUP BY op.object_id, s.id, s.code;

COMMIT;
