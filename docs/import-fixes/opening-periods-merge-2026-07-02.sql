-- merge_fix.sql — fusion des périodes d'ouverture éclatées par l'import (audit 2026-07-02)
-- 38 objets : N périodes « toute l'année » (une par source_period_id) → 1 période fusionnée.
-- Chaque bloc est gardé par l'état exact audité (nb périodes + source_period_ids) : si l'objet a
-- été modifié depuis l'audit, le bloc SKIP (NOTICE) au lieu d'écraser.
-- Traçabilité : extra.merged_from_sources + extra.merge_pass sur la période fusionnée.
-- Sauvegarde complète de l'état avant fix : docs/import-fixes/openings-backup-2026-07-02.json

-- LOIRUN00000000T8 — Eric Le Forgeron (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['3a890599', 'b9f81ee6']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'LOIRUN00000000T8';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP LOIRUN00000000T8: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'LOIRUN00000000T8';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'LOIRUN00000000T8', true, false,
          jsonb_build_object('merged_from_sources', '["3a890599","b9f81ee6"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '08:30:00'::time, '12:00:00'::time),
         (gen_random_uuid(), v_tp, '13:30:00'::time, '16:00:00'::time);
END $blk$;

-- LOIRUN00000000TK — Bitasyon Bio du Souffleur d'Arbonne (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['79aec8cb', 'a09a9f20']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'LOIRUN00000000TK';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP LOIRUN00000000TK: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'LOIRUN00000000TK';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'LOIRUN00000000TK', true, false,
          jsonb_build_object('merged_from_sources', '["79aec8cb","a09a9f20"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '09:00:00'::time, '12:00:00'::time),
         (gen_random_uuid(), v_tp, '14:00:00'::time, '17:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '09:00:00'::time, '12:00:00'::time);
END $blk$;

-- LOIRUN00000000YS — Jardin de Vandas (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['a890ebce', 'f45a472a']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'LOIRUN00000000YS';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP LOIRUN00000000YS: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'LOIRUN00000000YS';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'LOIRUN00000000YS', true, false,
          jsonb_build_object('merged_from_sources', '["a890ebce","f45a472a"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('wednesday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '09:00:00'::time, '12:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '09:00:00'::time, '17:00:00'::time);
END $blk$;

-- LOIRUN00000000ZQ — Coopérative Agricole des Huiles Essentielles de Bourbon - CAHEB (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['13a23819', '7fae4bbf']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'LOIRUN00000000ZQ';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP LOIRUN00000000ZQ: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'LOIRUN00000000ZQ';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'LOIRUN00000000ZQ', true, false,
          jsonb_build_object('merged_from_sources', '["13a23819","7fae4bbf"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '09:00:00'::time, '12:00:00'::time),
         (gen_random_uuid(), v_tp, '14:00:00'::time, '17:30:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '09:00:00'::time, '12:00:00'::time),
         (gen_random_uuid(), v_tp, '14:00:00'::time, '17:00:00'::time);
END $blk$;

-- LOIRUN0000000106 — TI BRUN NATURE (4 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 4
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['083674a5', '52a61164', '7f731479', 'de00bdfb']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'LOIRUN0000000106';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP LOIRUN0000000106: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'LOIRUN0000000106';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'LOIRUN0000000106', true, false,
          jsonb_build_object('merged_from_sources', '["083674a5","52a61164","7f731479","de00bdfb"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'thursday', 'friday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '08:00:00'::time, '16:00:00'::time);
END $blk$;

-- LOIRUN000000010R — Escale Bleue - Atelier Vanille (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['a8b7fc1e', 'd1a6def4']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'LOIRUN000000010R';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP LOIRUN000000010R: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'LOIRUN000000010R';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'LOIRUN000000010R', true, false,
          jsonb_build_object('merged_from_sources', '["a8b7fc1e","d1a6def4"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'thursday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '09:30:00'::time, '17:30:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '09:30:00'::time, '16:00:00'::time);
END $blk$;

-- LOIRUN000000010S — La maison de la tresse et du terroir (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['3edf0e4f', 'adc18cdf']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'LOIRUN000000010S';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP LOIRUN000000010S: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'LOIRUN000000010S';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'LOIRUN000000010S', true, false,
          jsonb_build_object('merged_from_sources', '["3edf0e4f","adc18cdf"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '08:00:00'::time, '12:00:00'::time),
         (gen_random_uuid(), v_tp, '13:00:00'::time, '16:30:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '08:30:00'::time, '12:00:00'::time),
         (gen_random_uuid(), v_tp, '13:00:00'::time, '16:30:00'::time);
END $blk$;

-- LOIRUN000000011O — Far Far de Bézaves (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['4ca56086', '8b7a3f55']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'LOIRUN000000011O';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP LOIRUN000000011O: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'LOIRUN000000011O';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'LOIRUN000000011O', true, false,
          jsonb_build_object('merged_from_sources', '["4ca56086","8b7a3f55"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'wednesday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '09:15:00'::time, '13:45:00'::time);
END $blk$;

-- LOIRUN000000015H — Natur'Run (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['5f4e96cd', 'c7cc97a1']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'LOIRUN000000015H';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP LOIRUN000000015H: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'LOIRUN000000015H';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'LOIRUN000000015H', true, false,
          jsonb_build_object('merged_from_sources', '["5f4e96cd","c7cc97a1"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '13:00:00'::time, '18:30:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('tuesday', 'wednesday', 'thursday', 'friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '10:00:00'::time, '18:30:00'::time);
END $blk$;

-- LOIRUN000000017O — Aux Chalets du Tourneur (3 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 3
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['83c32e00', 'c793db52', 'ebfa0323']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'LOIRUN000000017O';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP LOIRUN000000017O: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'LOIRUN000000017O';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'LOIRUN000000017O', true, false,
          jsonb_build_object('merged_from_sources', '["83c32e00","c793db52","ebfa0323"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('tuesday', 'wednesday', 'thursday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '08:00:00'::time, '17:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('friday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '13:30:00'::time, '17:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('saturday', 'sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '06:00:00'::time, '13:00:00'::time);
END $blk$;

-- RESRUN00000000NL — Le Longboard (2 périodes → 1, type by_appointment)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['0461d5f7', '0d71d26a']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000NL';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000NL: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000NL';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000NL', true, false,
          jsonb_build_object('merged_from_sources', '["0461d5f7","0d71d26a"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'by_appointment'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('tuesday', 'wednesday', 'thursday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:45:00'::time, '13:15:00'::time),
         (gen_random_uuid(), v_tp, '18:45:00'::time, '21:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:45:00'::time, '13:15:00'::time),
         (gen_random_uuid(), v_tp, '18:45:00'::time, '21:15:00'::time);
END $blk$;

-- RESRUN00000000NM — La Kaz (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['891539b2', 'ce9d2936']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000NM';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000NM: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000NM';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000NM', true, false,
          jsonb_build_object('merged_from_sources', '["891539b2","ce9d2936"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '15:30:00'::time),
         (gen_random_uuid(), v_tp, '19:00:00'::time, '22:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '14:00:00'::time);
END $blk$;

-- RESRUN00000000NX — Le Gadjak (2 périodes → 1, type by_appointment)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['01f23422', 'e9360d3b']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000NX';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000NX: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000NX';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000NX', true, false,
          jsonb_build_object('merged_from_sources', '["01f23422","e9360d3b"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'by_appointment'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'thursday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:30:00'::time, '14:00:00'::time),
         (gen_random_uuid(), v_tp, '18:30:00'::time, '20:30:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('friday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:30:00'::time, '14:00:00'::time);
END $blk$;

-- RESRUN00000000O1 — Le Vieux Bardeau (4 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 4
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['86094fae', 'b051b601', 'e0bc37d9', 'f602e1e0']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000O1';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000O1: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000O1';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000O1', true, false,
          jsonb_build_object('merged_from_sources', '["86094fae","b051b601","e0bc37d9","f602e1e0"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '14:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('thursday', 'friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '14:00:00'::time),
         (gen_random_uuid(), v_tp, '18:00:00'::time, '20:00:00'::time);
END $blk$;

-- RESRUN00000000O4 — Chez Jim (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['470f438e', 'b39fd999']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000O4';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000O4: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000O4';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000O4', true, false,
          jsonb_build_object('merged_from_sources', '["470f438e","b39fd999"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'thursday', 'friday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '09:00:00'::time, '15:30:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('saturday', 'sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '09:00:00'::time, '16:00:00'::time);
END $blk$;

-- RESRUN00000000OH — Snack Bigdil Family (3 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 3
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['437261bb', 'a5744c15', 'd809c8d8']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000OH';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000OH: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000OH';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000OH', true, false,
          jsonb_build_object('merged_from_sources', '["437261bb","a5744c15","d809c8d8"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:00:00'::time, '14:00:00'::time),
         (gen_random_uuid(), v_tp, '17:00:00'::time, '21:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '17:00:00'::time, '21:00:00'::time);
END $blk$;

-- RESRUN00000000OK — L'Arbre à Palabres (2 périodes → 1, type by_appointment)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['09eed410', '1c4b9142']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000OK';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000OK: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000OK';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000OK', true, false,
          jsonb_build_object('merged_from_sources', '["09eed410","1c4b9142"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'by_appointment'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('wednesday', 'thursday', 'sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '14:30:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '14:30:00'::time),
         (gen_random_uuid(), v_tp, '19:00:00'::time, '21:30:00'::time);
END $blk$;

-- RESRUN00000000OS — L'Olivier (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['383e26ee', 'dbddef81']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000OS';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000OS: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000OS';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000OS', true, false,
          jsonb_build_object('merged_from_sources', '["383e26ee","dbddef81"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('wednesday', 'thursday', 'friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '13:45:00'::time),
         (gen_random_uuid(), v_tp, '19:00:00'::time, '20:45:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '14:00:00'::time);
END $blk$;

-- RESRUN00000000P5 — Diables Ô Thym (3 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 3
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['ac5dc8f5', 'b285dbd0', 'b76ca928']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000P5';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000P5: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000P5';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000P5', true, false,
          jsonb_build_object('merged_from_sources', '["ac5dc8f5","b285dbd0","b76ca928"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('tuesday', 'wednesday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '14:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('thursday', 'friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '14:00:00'::time),
         (gen_random_uuid(), v_tp, '19:00:00'::time, '21:30:00'::time);
END $blk$;

-- RESRUN00000000PE — Les Sens Ciel (2 périodes → 1, type by_appointment)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['6d266567', 'a1044b1b']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000PE';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000PE: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000PE';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000PE', true, false,
          jsonb_build_object('merged_from_sources', '["6d266567","a1044b1b"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'by_appointment'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('tuesday', 'wednesday', 'thursday', 'friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '15:00:00'::time),
         (gen_random_uuid(), v_tp, '19:00:00'::time, '23:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '16:00:00'::time);
END $blk$;

-- RESRUN00000000PF — Le Panoramic (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['bbdaeaac', 'db4b258a']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000PF';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000PF: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000PF';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000PF', true, false,
          jsonb_build_object('merged_from_sources', '["bbdaeaac","db4b258a"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '18:30:00'::time, '21:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('wednesday', 'thursday', 'friday', 'saturday', 'sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:30:00'::time, '14:00:00'::time),
         (gen_random_uuid(), v_tp, '18:30:00'::time, '21:00:00'::time);
END $blk$;

-- RESRUN00000000PP — Les Géraniums (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['6835b5f8', 'c25b1d31']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000PP';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000PP: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000PP';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000PP', true, false,
          jsonb_build_object('merged_from_sources', '["6835b5f8","c25b1d31"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '13:30:00'::time),
         (gen_random_uuid(), v_tp, '19:00:00'::time, '20:30:00'::time);
END $blk$;

-- RESRUN00000000PS — La Terrasse Créole (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['ecfbd2d8', 'f68bb0de']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000PS';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000PS: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000PS';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000PS', true, false,
          jsonb_build_object('merged_from_sources', '["ecfbd2d8","f68bb0de"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:30:00'::time, '14:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('wednesday', 'thursday', 'friday', 'saturday', 'sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:00:00'::time, '14:00:00'::time),
         (gen_random_uuid(), v_tp, '17:00:00'::time, '21:00:00'::time);
END $blk$;

-- RESRUN00000000PW — Snack Le Boi Zoly (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['7a92559c', 'dcaec188']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000PW';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000PW: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000PW';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000PW', true, false,
          jsonb_build_object('merged_from_sources', '["7a92559c","dcaec188"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'thursday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '08:30:00'::time, '14:00:00'::time),
         (gen_random_uuid(), v_tp, '17:30:00'::time, '21:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '08:30:00'::time, '14:00:00'::time),
         (gen_random_uuid(), v_tp, '17:30:00'::time, '22:00:00'::time);
END $blk$;

-- RESRUN00000000Q0 — Ô Délices (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['2086bbe7', '87eeb9a6']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000Q0';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000Q0: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000Q0';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000Q0', true, false,
          jsonb_build_object('merged_from_sources', '["2086bbe7","87eeb9a6"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '10:00:00'::time, '14:00:00'::time),
         (gen_random_uuid(), v_tp, '17:30:00'::time, '20:30:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '10:00:00'::time, '14:00:00'::time);
END $blk$;

-- RESRUN00000000UT — Restaurant des Laves (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['8485ad23', 'e8c4b471']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000UT';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000UT: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000UT';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000UT', true, false,
          jsonb_build_object('merged_from_sources', '["8485ad23","e8c4b471"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('tuesday', 'wednesday', 'thursday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:30:00'::time, '16:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('saturday', 'sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:15:00'::time, '16:00:00'::time);
END $blk$;

-- RESRUN00000000UV — Le Ti Comptoir (4 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 4
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['24463aad', '732f62c5', '90180aad', 'dd84886a']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000UV';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000UV: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000UV';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000UV', true, false,
          jsonb_build_object('merged_from_sources', '["24463aad","732f62c5","90180aad","dd84886a"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('tuesday', 'friday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:45:00'::time, '14:00:00'::time),
         (gen_random_uuid(), v_tp, '18:30:00'::time, '22:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('wednesday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '18:30:00'::time, '22:00:00'::time);
END $blk$;

-- RESRUN00000000V0 — Le QG (3 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 3
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['5f1a9084', '96c237c9', 'c4233833']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000V0';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000V0: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000V0';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000V0', true, false,
          jsonb_build_object('merged_from_sources', '["5f1a9084","96c237c9","c4233833"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'thursday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:30:00'::time, '16:00:00'::time),
         (gen_random_uuid(), v_tp, '18:30:00'::time, '22:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('friday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:30:00'::time, '16:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:30:00'::time, '17:00:00'::time);
END $blk$;

-- RESRUN00000000WY — Le Comptoir des arts (4 périodes → 1, type by_appointment)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 4
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['063d9ebd', '44a49f47', '4f7fe135', 'f3fcd551']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000WY';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000WY: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000WY';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000WY', true, false,
          jsonb_build_object('merged_from_sources', '["063d9ebd","44a49f47","4f7fe135","f3fcd551"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'by_appointment'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('wednesday', 'sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '10:00:00'::time, '14:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('thursday', 'friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '10:00:00'::time, '14:00:00'::time),
         (gen_random_uuid(), v_tp, '18:00:00'::time, '22:00:00'::time);
END $blk$;

-- RESRUN00000000X0 — Restaurant La Table d'Elvina (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['4890b770', '48df910b']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000X0';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000X0: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000X0';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000X0', true, false,
          jsonb_build_object('merged_from_sources', '["4890b770","48df910b"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('tuesday', 'wednesday', 'thursday', 'friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '14:30:00'::time),
         (gen_random_uuid(), v_tp, '19:30:00'::time, '21:30:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '14:30:00'::time);
END $blk$;

-- RESRUN00000000XC — Chez Moustache et Rose-May (2 périodes → 1, type by_appointment)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['5f2d3b5a', 'c823e98b']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000XC';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000XC: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000XC';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000XC', true, false,
          jsonb_build_object('merged_from_sources', '["5f2d3b5a","c823e98b"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'by_appointment'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'thursday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:30:00'::time, '14:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('saturday', 'sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:30:00'::time, '15:00:00'::time);
END $blk$;

-- RESRUN00000000XK — Le Macabit (3 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 3
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['576ec10c', '7ae3cadf', 'c19a4662']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000XK';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000XK: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000XK';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000XK', true, false,
          jsonb_build_object('merged_from_sources', '["576ec10c","7ae3cadf","c19a4662"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '10:00:00'::time, '14:30:00'::time),
         (gen_random_uuid(), v_tp, '17:30:00'::time, '21:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('thursday', 'friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '10:00:00'::time, '14:00:00'::time),
         (gen_random_uuid(), v_tp, '18:00:00'::time, '21:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '10:00:00'::time, '14:00:00'::time);
END $blk$;

-- RESRUN00000000XM — Côté Sauvage (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['1922cd89', '39eb7863']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000XM';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000XM: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000XM';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000XM', true, false,
          jsonb_build_object('merged_from_sources', '["1922cd89","39eb7863"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '18:45:00'::time, '21:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('tuesday', 'wednesday', 'thursday', 'friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:45:00'::time, '14:00:00'::time),
         (gen_random_uuid(), v_tp, '18:45:00'::time, '21:00:00'::time);
END $blk$;

-- RESRUN00000000Z1 — Djoossy's (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['081aad44', 'db9fd6f7']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN00000000Z1';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN00000000Z1: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN00000000Z1';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN00000000Z1', true, false,
          jsonb_build_object('merged_from_sources', '["081aad44","db9fd6f7"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'thursday', 'sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '10:30:00'::time, '21:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '10:30:00'::time, '22:00:00'::time);
END $blk$;

-- RESRUN0000000116 — Bar A 4 (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['114f4465', 'fd148b65']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN0000000116';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN0000000116: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN0000000116';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN0000000116', true, false,
          jsonb_build_object('merged_from_sources', '["114f4465","fd148b65"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'tuesday', 'wednesday', 'thursday', 'saturday', 'sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '08:00:00'::time, '18:00:00'::time);
END $blk$;

-- RESRUN0000000117 — L'Auberge du Volcan (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['ce1e1eae', 'ff605b67']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN0000000117';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN0000000117: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN0000000117';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN0000000117', true, false,
          jsonb_build_object('merged_from_sources', '["ce1e1eae","ff605b67"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('tuesday', 'wednesday', 'thursday', 'friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '09:00:00'::time, '21:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '09:00:00'::time, '14:00:00'::time);
END $blk$;

-- RESRUN0000000119 — L'Impériale Pirun Pizzeria (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['40960c6a', 'ca8f3e77']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN0000000119';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN0000000119: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN0000000119';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN0000000119', true, false,
          jsonb_build_object('merged_from_sources', '["40960c6a","ca8f3e77"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '17:00:00'::time, '21:00:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('tuesday', 'wednesday', 'thursday', 'friday', 'saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '11:00:00'::time, '21:00:00'::time);
END $blk$;

-- RESRUN000000017L — Casa Trattoria 23 (2 périodes → 1, type regular)
DO $blk$
DECLARE v_ok boolean; v_period_id uuid; v_schedule_id uuid; v_tp uuid;
BEGIN
  SELECT count(*) = 2
     AND bool_and(all_years AND NOT is_closure)
     AND array_agg(COALESCE(source_period_id, '∅') ORDER BY COALESCE(source_period_id, '∅'))
         = ARRAY['aab536ee', 'c03166b1']::text[]
    INTO v_ok
  FROM opening_period WHERE object_id = 'RESRUN000000017L';
  IF v_ok IS DISTINCT FROM true THEN
    RAISE NOTICE 'SKIP RESRUN000000017L: état inattendu (déjà modifié ?)';
    RETURN;
  END IF;

  DELETE FROM opening_period WHERE object_id = 'RESRUN000000017L';

  INSERT INTO opening_period (id, object_id, all_years, is_closure, extra)
  VALUES (gen_random_uuid(), 'RESRUN000000017L', true, false,
          jsonb_build_object('merged_from_sources', '["aab536ee","c03166b1"]'::jsonb,
                             'merge_pass', 'audit-horaires-2026-07-02'))
  RETURNING id INTO v_period_id;

  INSERT INTO opening_schedule (id, period_id, schedule_type_id)
  SELECT gen_random_uuid(), v_period_id, id
  FROM ref_code_opening_schedule_type WHERE lower(code) = 'regular'
  RETURNING id INTO v_schedule_id;

  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('monday', 'sunday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '13:30:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('friday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '19:00:00'::time, '20:30:00'::time);
  INSERT INTO opening_time_period (id, schedule_id, closed)
  VALUES (gen_random_uuid(), v_schedule_id, false) RETURNING id INTO v_tp;
  INSERT INTO opening_time_period_weekday (time_period_id, weekday_id)
    SELECT v_tp, id FROM ref_code_weekday WHERE code IN ('saturday');
  INSERT INTO opening_time_frame (id, time_period_id, start_time, end_time)
  VALUES (gen_random_uuid(), v_tp, '12:00:00'::time, '13:30:00'::time),
         (gen_random_uuid(), v_tp, '19:00:00'::time, '20:30:00'::time);
END $blk$;
