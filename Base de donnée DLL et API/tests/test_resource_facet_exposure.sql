-- test_resource_facet_exposure.sql
-- §101 — get_object_resource now exposes two previously API-invisible facets:
--   * stay_policy  (accommodation check-in / check-out, object_stay_policy) — sibling of pet_policy
--   * activity     (ACT/ASC commercial prestation, object_act) — type-gated like the FMA/ITI blocks
-- Both were authored-but-unexposed (same class as room_types pre-§54: a getter never read the table,
-- so the data was invisible to every consumer RPC incl. get_object_with_deep_data). This guards the
-- exposure contract: the keys appear with correct values, land through compose_object_resource_blocks,
-- are omitted when no row exists, and respect the ACT/ASC type-gate.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE r jsonb;
BEGIN
  -- Published test objects (get_object_resource read gate = published OR extended; published passes for any role).
  INSERT INTO object (id, object_type, name, status) VALUES ('FACETHEB99999901', 'HLO', 'facet heb', 'published');
  INSERT INTO object (id, object_type, name, status) VALUES ('FACETACT99999901', 'ACT', 'facet act', 'published');
  INSERT INTO object (id, object_type, name, status) VALUES ('FACETNOROW999901', 'HLO', 'facet no row', 'published');

  INSERT INTO object_stay_policy (object_id, check_in_from, check_in_until, check_out_until, conditions)
    VALUES ('FACETHEB99999901', '15:00', '20:00', '11:00', 'Caution 200 EUR');
  INSERT INTO object_act (object_id, duration_min, min_participants, max_participants, difficulty_level, guide_required, min_age, equipment_provided)
    VALUES ('FACETACT99999901', 120, 2, 10, 2, TRUE, 8, TRUE);

  -- ---------- stay_policy exposed on the HEB object (through the legal compose block) ----------
  r := api.get_object_resource('FACETHEB99999901')::jsonb;
  ASSERT r ? 'stay_policy', 'stay_policy key missing from get_object_resource (HEB)';
  ASSERT (r->'stay_policy'->>'check_in_from')   = '15:00:00', 'stay_policy.check_in_from wrong: '||COALESCE(r->'stay_policy'->>'check_in_from','NULL');
  ASSERT (r->'stay_policy'->>'check_in_until')  = '20:00:00', 'stay_policy.check_in_until wrong';
  ASSERT (r->'stay_policy'->>'check_out_until') = '11:00:00', 'stay_policy.check_out_until wrong';
  ASSERT (r->'stay_policy'->>'conditions')      = 'Caution 200 EUR', 'stay_policy.conditions wrong';
  ASSERT NOT (r->'stay_policy' ? 'object_id'), 'stay_policy must strip object_id (mirror pet_policy)';
  ASSERT NOT (r ? 'activity'), 'HLO (non ACT/ASC) must NOT carry an activity block';

  -- ---------- activity exposed on the ACT object (through the itinerary compose block) ----------
  r := api.get_object_resource('FACETACT99999901')::jsonb;
  ASSERT r ? 'activity', 'activity key missing from get_object_resource (ACT)';
  ASSERT (r->'activity'->>'duration_min')      = '120',  'activity.duration_min wrong';
  ASSERT (r->'activity'->>'guide_required')    = 'true', 'activity.guide_required wrong';
  ASSERT (r->'activity'->>'max_participants')  = '10',   'activity.max_participants wrong';
  ASSERT (r->'activity'->>'min_age')           = '8',    'activity.min_age wrong';
  ASSERT NOT (r->'activity' ? 'object_id'), 'activity must strip object_id';
  ASSERT NOT (r ? 'stay_policy'), 'ACT object with no stay row must NOT carry stay_policy';

  -- ---------- omit-when-empty: HEB without a stay_policy row gets no key ----------
  r := api.get_object_resource('FACETNOROW999901')::jsonb;
  ASSERT NOT (r ? 'stay_policy'), 'stay_policy must be omitted when no object_stay_policy row exists';
  ASSERT NOT (r ? 'activity'), 'activity must be absent for a non ACT/ASC object';

  RAISE NOTICE 'resource facet exposure assertions passed (stay_policy + activity: presence, values, object_id-strip, compose survival, omit-when-empty, ACT/ASC type-gate).';
END$$;
ROLLBACK;
