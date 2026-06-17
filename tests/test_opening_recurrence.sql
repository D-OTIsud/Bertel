-- tests/test_opening_recurrence.sql
-- Périodes d'ouverture : récurrence explicite + cascade de priorité (manifest 14n).
-- À exécuter en transaction ; ROLLBACK final (aucune donnée de test ne persiste).
-- Toute assertion non tenue lève une EXCEPTION ⇒ psql sort en erreur ⇒ le gate échoue.
BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- Fonctions pures : rang / largeur / chevauchement partiel / garde d'écriture
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Rang de priorité : closure 4 > fixe 3 > cyclique 2 > base 1
  IF api.opening_period_rank(true, true,  NULL, NULL)                       <> 4 THEN RAISE EXCEPTION 'rank: closure'; END IF;
  IF api.opening_period_rank(false, false, '2025-01-15', '2025-12-15')      <> 3 THEN RAISE EXCEPTION 'rank: fixed'; END IF;
  IF api.opening_period_rank(false, true,  '2000-05-01', '2000-09-30')      <> 2 THEN RAISE EXCEPTION 'rank: cyclic'; END IF;
  IF api.opening_period_rank(false, true,  NULL, NULL)                      <> 1 THEN RAISE EXCEPTION 'rank: base'; END IF;

  -- Largeur : une fenêtre imbriquée est plus étroite (gagne le départage)
  IF api.opening_period_width(true, '2000-08-01', '2000-08-15')
     >= api.opening_period_width(true, '2000-05-01', '2000-09-30')          THEN RAISE EXCEPTION 'width: nesting order'; END IF;

  -- Chevauchement PARTIEL (même rang) : croisement = TRUE, imbrication = FALSE
  IF NOT api.periods_partial_overlap(true, '2000-05-01','2000-09-30','2000-08-01','2000-10-31') THEN RAISE EXCEPTION 'overlap: cyclic cross'; END IF;
  IF     api.periods_partial_overlap(true, '2000-05-01','2000-09-30','2000-08-01','2000-08-15') THEN RAISE EXCEPTION 'overlap: cyclic nested flagged'; END IF;
  -- Wrap déc.→fév. : croisement avec fév.→mars = TRUE, contenance de janv. = FALSE
  IF NOT api.periods_partial_overlap(true, '2000-12-15','2001-02-15','2000-02-01','2000-03-31') THEN RAISE EXCEPTION 'overlap: wrap cross'; END IF;
  IF     api.periods_partial_overlap(true, '2000-12-15','2001-02-15','2000-01-01','2000-01-31') THEN RAISE EXCEPTION 'overlap: wrap nested flagged'; END IF;
  -- Fixe d'années différentes = disjoint
  IF     api.periods_partial_overlap(false,'2025-06-01','2025-08-01','2026-06-01','2026-08-01') THEN RAISE EXCEPTION 'overlap: fixed diff-year flagged'; END IF;

  -- Garde d'écriture : rejette le croisement partiel de même couche (ERRCODE 23514)
  BEGIN
    PERFORM api.assert_no_period_overlap('[
      {"all_years":true,"date_start":"2000-05-01","date_end":"2000-09-30"},
      {"all_years":true,"date_start":"2000-08-01","date_end":"2000-10-31"}
    ]'::jsonb);
    RAISE EXCEPTION 'guard: partial cross was not rejected';
  EXCEPTION WHEN sqlstate '23514' THEN NULL; -- attendu
  END;
  -- Garde : tolère l'imbrication et les fermetures qui se chevauchent
  PERFORM api.assert_no_period_overlap('[
    {"all_years":true,"date_start":"2000-05-01","date_end":"2000-09-30"},
    {"all_years":true,"date_start":"2000-08-01","date_end":"2000-08-15"}
  ]'::jsonb);
  PERFORM api.assert_no_period_overlap('[
    {"is_closure":true,"all_years":false,"date_start":"2025-06-01","date_end":"2025-06-10"},
    {"is_closure":true,"all_years":false,"date_start":"2025-06-05","date_end":"2025-06-15"}
  ]'::jsonb);
  -- Garde : deux fenêtres IDENTIQUES de même couche = conflit (la stricte containment seule est tolérée)
  IF NOT api.periods_partial_overlap(true,'2000-05-01','2000-09-30','2000-05-01','2000-09-30') THEN RAISE EXCEPTION 'overlap: identical windows not flagged'; END IF;
  BEGIN
    PERFORM api.assert_no_period_overlap('[
      {"all_years":true,"date_start":"2000-05-01","date_end":"2000-09-30"},
      {"all_years":true,"date_start":"2000-05-01","date_end":"2000-09-30"}
    ]'::jsonb);
    RAISE EXCEPTION 'guard: identical windows were not rejected';
  EXCEPTION WHEN sqlstate '23514' THEN NULL; -- attendu
  END;

  -- Type « Annuelle » retiré ; colonne is_closure présente
  IF EXISTS (SELECT 1 FROM ref_code WHERE domain='opening_period_type' AND code='year_round') THEN RAISE EXCEPTION 'year_round not retired'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='opening_period' AND column_name='is_closure'
  ) THEN RAISE EXCEPTION 'is_closure column missing'; END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- Moteur de statut : base 24/7 ouverte ; fermeture active force fermé ;
-- build_opening_period_json émet is_closure.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_obj  text := 'TSTOPENREC000001';
  v_pid  uuid; v_sid uuid; v_tpid uuid;
  v_reg  uuid := (SELECT id FROM ref_code_opening_schedule_type WHERE code='regular' LIMIT 1);
  v_open boolean;
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Indian/Reunion')::date;
BEGIN
  INSERT INTO object (id, object_type, name, status, business_timezone)
  VALUES (v_obj, 'HOT', 'Test ouverture recurrence', 'published', 'Indian/Reunion');

  -- Base ouverte 24/7 tous les jours
  INSERT INTO opening_period (object_id, all_years, is_closure) VALUES (v_obj, true, false) RETURNING id INTO v_pid;
  INSERT INTO opening_schedule (period_id, schedule_type_id) VALUES (v_pid, v_reg) RETURNING id INTO v_sid;
  INSERT INTO opening_time_period (schedule_id, closed) VALUES (v_sid, false) RETURNING id INTO v_tpid;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id) SELECT v_tpid, id FROM ref_code_weekday;
  INSERT INTO opening_time_frame (time_period_id, start_time, end_time) VALUES (v_tpid, '00:00', '23:59');

  PERFORM api.refresh_open_status();
  SELECT cached_is_open_now INTO v_open FROM object WHERE id=v_obj;
  IF v_open IS DISTINCT FROM true THEN RAISE EXCEPTION 'engine: base 24/7 expected open (got %)', v_open; END IF;

  -- Fermeture couvrant aujourd'hui : doit primer la base
  INSERT INTO opening_period (object_id, all_years, is_closure, date_start, date_end)
  VALUES (v_obj, false, true, v_today, v_today);
  PERFORM api.refresh_open_status();
  SELECT cached_is_open_now INTO v_open FROM object WHERE id=v_obj;
  IF v_open IS DISTINCT FROM false THEN RAISE EXCEPTION 'engine: active closure expected closed (got %)', v_open; END IF;

  -- Lecture : is_closure émis
  IF (api.build_opening_period_json(v_pid, v_obj, NULL, NULL, 1)::jsonb ->> 'is_closure')::boolean IS DISTINCT FROM false
     THEN RAISE EXCEPTION 'build_json: is_closure not emitted'; END IF;
END $$;

ROLLBACK;
