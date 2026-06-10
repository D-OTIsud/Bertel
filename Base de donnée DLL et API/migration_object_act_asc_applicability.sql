-- migration_object_act_asc_applicability.sql
-- §48 — Extend object_act applicability to ASC (decision 2026-06-10).
-- The §46 baseline seeded ('object_act','ACT') only, which orphaned the activity editor:
-- ASC objects render BlockASC (the only object_act UI) but the §46 gate + trigger rejected
-- their saves, while ACT objects rendered BlockSRV (no activity controls) — object_act was
-- authorable by NO type (0 rows live despite 52 ACT objects). Decision: both ASC and ACT
-- legitimately carry object_act rows; the editor remap (ACT→ASC archetype) lands in the same pass.
-- PREREQUISITES: migration_facet_applicability.sql (8m). Manifest step 8q.
-- IDEMPOTENT: ON CONFLICT DO NOTHING.
-- REVERSIBLE: DELETE FROM ref_facet_applicability WHERE facet_table='object_act' AND object_type='ASC';
BEGIN;

INSERT INTO ref_facet_applicability (facet_table, object_type)
VALUES ('object_act', 'ASC'::object_type)
ON CONFLICT DO NOTHING;

COMMIT;
