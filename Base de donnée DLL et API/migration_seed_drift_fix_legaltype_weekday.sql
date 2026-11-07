-- migration_seed_drift_fix_legaltype_weekday.sql
-- §68 ref-seeding audit (2026-06-15): reconciles two VERIFIED live↔source seed drifts.
-- Idempotent; no DDL; safe to re-run. Apply to live (and any DB built before this date).
--
-- (1) ref_legal_type 'raison_sociale' — canonical in schema_unified.sql (17 codes) but MISSING
--     on live (16). A fresh DB has it; live never received it. Any object_legal row keyed to
--     'raison_sociale' would be rejected by the FK on live. Bring live up to source.
--     Source side already correct (schema_unified.sql §"Insert common legal types").
--
-- (2) ref_code weekday.dow_number — NULL for all 7 rows on live AND on a fresh build. The seed
--     INSERT set only `position`; the backfill UPDATE in schema_unified.sql runs BEFORE
--     seeds_data.sql inserts the weekday rows (mis-ordered ⇒ no-op). seeds_data.sql is fixed to
--     set dow_number at insert time (fixes fresh); this UPDATE fixes pre-existing rows on live.
--     CHECK chk_ref_code_weekday_dow_number requires 1..7 — satisfied (ISO Mon=1..Sun=7).

INSERT INTO public.ref_legal_type (code, name, description, category, is_required, is_public, review_interval_days)
VALUES ('raison_sociale', 'Raison sociale', 'Dénomination ou raison sociale de la personne morale exploitante', 'business', false, false, NULL)
ON CONFLICT (code) DO NOTHING;

UPDATE public.ref_code
SET dow_number = CASE code
      WHEN 'monday'    THEN 1
      WHEN 'tuesday'   THEN 2
      WHEN 'wednesday' THEN 3
      WHEN 'thursday'  THEN 4
      WHEN 'friday'    THEN 5
      WHEN 'saturday'  THEN 6
      WHEN 'sunday'    THEN 7
      ELSE dow_number
    END,
    updated_at = now()
WHERE domain = 'weekday' AND dow_number IS NULL;
