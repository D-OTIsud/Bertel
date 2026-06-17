-- =====================================================================
-- migration_opening_open_without_hours.sql  (manifest step 14p; decision log §93)
-- §14 "ouvrir un jour sans horaires" (par jour, persisté).
--
-- Besoin métier (PO) : un jour peut être OUVERT sans plage horaire (hôtel, location :
-- arrivée/départ libres, ouvert mais sans horaires précis). Le modèle le supportait déjà
-- côté "open now" (un opening_time_period non fermé SANS time_frame = ouvert toute la
-- journée), mais le round-trip éditeur ne le distinguait pas de "fermé".
--
-- Seul changement DDL : api.get_opening_slots_by_day n'émet plus QUE les jours ouverts
-- (un weekday rattaché à un opening_time_period non fermé). Un jour ouvert sans time_frame
-- ressort en tableau vide [] = "ouvert sans horaire". Les jours fermés/absents sont omis.
--
-- Compat : byte-équivalent à l'ancienne définition sur toutes les données existantes
-- (les 254 time_periods live ont des frames ; 0 ligne ouverte-sans-frame, 0 closed=TRUE ;
-- vérifié 0 écart sur 187 périodes via l'équivalence old∖[] == new). Le nouveau cas
-- n'apparaît qu'une fois l'éditeur (payload ne sérialise que les jours ouverts + parser qui
-- conserve les [] en slot vide) déployé. ⇒ DÉPLOYER CE SQL AVANT le front.
--
-- Côté write : AUCUN changement de api.save_object_openings — il insère déjà la ligne
-- opening_time_period + opening_time_period_weekday même avec time_frames vide.
-- Folded into api_views_functions.sql. Idempotent (CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION api.get_opening_slots_by_day(p_period_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, api, extensions, auth, audit, crm, ref
AS $$
  -- §14 "open without hours": emit ONLY open days (a weekday with a non-closed
  -- opening_time_period). An open day with no time frames is rendered as [] = open
  -- without fixed hours. Closed/absent days are omitted entirely.
  WITH day_state AS (
    SELECT
      w.code,
      w.position,
      EXISTS (
        SELECT 1
        FROM opening_schedule s
        JOIN opening_time_period tp          ON tp.schedule_id = s.id
        JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
        WHERE s.period_id = p_period_id
          AND tpw.weekday_id = w.id
          AND tp.closed = FALSE
      ) AS is_open,
      (
        SELECT jsonb_agg(
                 jsonb_build_object('start', tf.start_time::text, 'end', tf.end_time::text)
                 ORDER BY tf.start_time
               )
        FROM opening_schedule s
        JOIN opening_time_period tp          ON tp.schedule_id = s.id
        JOIN opening_time_period_weekday tpw ON tpw.time_period_id = tp.id
        JOIN opening_time_frame tf           ON tf.time_period_id = tp.id
        WHERE s.period_id = p_period_id
          AND tpw.weekday_id = w.id
          AND tp.closed = FALSE
          AND tf.start_time IS NOT NULL
      ) AS frames
    FROM ref_code_weekday w
  )
  SELECT COALESCE(
    jsonb_object_agg(code, COALESCE(frames, '[]'::jsonb) ORDER BY position)
      FILTER (WHERE is_open),
    '{}'::jsonb
  )
  FROM day_state;
$$;
