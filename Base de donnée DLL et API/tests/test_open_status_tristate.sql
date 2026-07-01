-- test_open_status_tristate.sql
-- Prouve migration_open_status_tristate.sql (§128) : api.refresh_open_status calcule un
-- TRI-ÉTAT dans object.cached_is_open_now —
--   * A : AUCUNE donnée d'ouverture (aucun opening_period)              -> NULL  (pas de pastille)
--   * B : période « toute l'année », jour = aujourd'hui, SANS horaire   -> TRUE  (ouvert sans horaire, §93)
--   * C : période « toute l'année », horaires un AUTRE jour             -> FALSE (a des données, fermé maintenant)
-- Deux couches d'assertion :
--   * STRUCTURAL  — le corps de la fonction porte la garde tri-état (aucun opening_period → NULL).
--                   Contre une base SANS la migration, l'ASSERT est FALSE -> rouge.
--   * BEHAVIOURAL — après refresh, A IS NULL, B IS TRUE, C IS FALSE.
-- Cas B/C indépendants de l'heure (B = sans horaire ; C = mauvais jour de la semaine).
-- Self-contained + transactionnel (ROLLBACK ; rien ne persiste). Miroir de test_open_status_timezone.sql.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_A text := 'OPNSTA0000000001';  -- aucune donnée d'ouverture
  v_B text := 'OPNSTA0000000002';  -- période sans horaire, jour = aujourd'hui
  v_C text := 'OPNSTA0000000003';  -- horaires un AUTRE jour → fermé maintenant
  v_sched_type uuid;
  v_wd_today   uuid;
  v_wd_other   uuid;
  v_today_dow  int;
  v_period uuid;
  v_sched  uuid;
  v_tp     uuid;
  v_A_val  boolean;  v_A_null boolean;
  v_B_val  boolean;
  v_C_val  boolean;
BEGIN
  -- ---------- STRUCTURAL : la branche tri-état NULL est présente (migration appliquée) ----------
  ASSERT (
    SELECT p.prosrc ILIKE '%p2.object_id = o.id%'
    FROM pg_proc p
    WHERE p.proname = 'refresh_open_status' AND p.pronamespace = 'api'::regnamespace
  ), 'refresh_open_status doit porter la garde tri-état (aucun opening_period → NULL) — migration non appliquée';

  -- ---------- Résolution des références (jour local, catalogue horaire) ----------
  v_today_dow := EXTRACT(ISODOW FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Indian/Reunion'))::int;

  SELECT id INTO v_sched_type FROM ref_code_opening_schedule_type ORDER BY code LIMIT 1;
  ASSERT v_sched_type IS NOT NULL, 'aucun ref_code_opening_schedule_type seedé';

  SELECT id INTO v_wd_today FROM ref_code_weekday
   WHERE COALESCE(dow_number, CASE code
           WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
           WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
           WHEN 'sunday' THEN 7 ELSE NULL END) = v_today_dow
   LIMIT 1;
  SELECT id INTO v_wd_other FROM ref_code_weekday
   WHERE COALESCE(dow_number, CASE code
           WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
           WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6
           WHEN 'sunday' THEN 7 ELSE NULL END) = ((v_today_dow % 7) + 1)
   LIMIT 1;
  ASSERT v_wd_today IS NOT NULL AND v_wd_other IS NOT NULL, 'ref_code_weekday: jour(s) introuvable(s)';

  -- ---------- Fixtures (superuser : RLS contournée, contraintes appliquées) ----------
  INSERT INTO object (id, object_type, name, status, business_timezone) VALUES
    (v_A, 'PNA', 'tri-état: sans données',           'published', 'Indian/Reunion'),
    (v_B, 'PNA', 'tri-état: période sans horaire',    'published', 'Indian/Reunion'),
    (v_C, 'RES', 'tri-état: horaires un autre jour',  'published', 'Indian/Reunion');

  -- B : opening_period toute l'année → schedule → time_period ouvert → jour = aujourd'hui, AUCUN time_frame
  INSERT INTO opening_period (id, object_id, name, all_years)
    VALUES (gen_random_uuid(), v_B, 'Toute l''année', true) RETURNING id INTO v_period;
  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
    VALUES (gen_random_uuid(), v_period, v_sched_type) RETURNING id INTO v_sched;
  INSERT INTO opening_time_period (id, schedule_id, closed)
    VALUES (gen_random_uuid(), v_sched, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id) VALUES (v_tp, v_wd_today);

  -- C : idem mais jour = AUTRE que today + une plage 08:00–18:00 (⇒ arm1 échoue: mauvais jour ; arm2 échoue: a un frame)
  INSERT INTO opening_period (id, object_id, name, all_years)
    VALUES (gen_random_uuid(), v_C, 'Toute l''année', true) RETURNING id INTO v_period;
  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
    VALUES (gen_random_uuid(), v_period, v_sched_type) RETURNING id INTO v_sched;
  INSERT INTO opening_time_period (id, schedule_id, closed)
    VALUES (gen_random_uuid(), v_sched, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id) VALUES (v_tp, v_wd_other);
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
    VALUES (gen_random_uuid(), v_tp, '08:00'::time, '18:00'::time);

  -- ---------- Exécution ----------
  PERFORM api.refresh_open_status();

  SELECT cached_is_open_now, cached_is_open_now IS NULL INTO v_A_val, v_A_null FROM object WHERE id = v_A;
  SELECT cached_is_open_now INTO v_B_val FROM object WHERE id = v_B;
  SELECT cached_is_open_now INTO v_C_val FROM object WHERE id = v_C;

  -- ---------- BEHAVIOURAL ----------
  ASSERT v_A_null,        format('A (aucune donnée) doit être NULL (pas de pastille), obtenu %s', COALESCE(v_A_val::text, 'NULL'));
  ASSERT v_B_val IS TRUE, format('B (période sans horaire, aujourd''hui) doit être TRUE, obtenu %s', COALESCE(v_B_val::text, 'NULL'));
  ASSERT v_C_val IS FALSE, format('C (horaires un autre jour) doit être FALSE (a des données mais fermé), obtenu %s', COALESCE(v_C_val::text, 'NULL'));

  RAISE NOTICE 'open-status tri-état: A=NULL, B=TRUE (sans horaire), C=FALSE (fermé) — assertions OK.';
END$$;
ROLLBACK;
