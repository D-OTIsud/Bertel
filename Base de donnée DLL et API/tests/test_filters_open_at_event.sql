-- =====================================================================
-- test_filters_open_at_event.sql — garde CI du §157 (manifest 16i)
-- 1. Parité moteur/cache : internal.compute_open_status(now()) == cached_is_open_now
--    (même moteur, deux lectures — le cache vient d'être rafraîchi par le même calcul).
-- 2. Parité filtre : get_filtered_object_ids(open_at=now) == (open_now=true).
-- 3. Invariant §133 : le tri-état NULL n'est JAMAIS matché par open_at.
-- 4. Filtre Événements : recouvrement de plage sur object_fma (fixture rollback).
-- =====================================================================

\echo '== test_filters_open_at_event : refresh + parité moteur/cache =='

SELECT api.refresh_open_status();

DO $$
DECLARE
  v_mismatch INT;
  v_open_now_count INT;
  v_open_at_count INT;
  v_null_matched INT;
BEGIN
  -- 1. Parité moteur/cache (fenêtre de course ~ms entre les deux now() : négligeable).
  SELECT count(*) INTO v_mismatch
  FROM object o
  JOIN internal.compute_open_status(now()) s ON s.object_id = o.id
  WHERE o.status = 'published'
    AND o.cached_is_open_now IS DISTINCT FROM s.is_open;
  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'compute_open_status(now()) diverge du cache sur % objet(s) publiés', v_mismatch;
  END IF;

  -- 2. Parité filtre open_at(now) == open_now (cache tout juste rafraîchi).
  SELECT count(*) INTO v_open_now_count
  FROM api.get_filtered_object_ids('{"open_now": true}'::jsonb, NULL, ARRAY['published']::object_status[], NULL);
  SELECT count(*) INTO v_open_at_count
  FROM api.get_filtered_object_ids(
    jsonb_build_object('open_at', now()::text), NULL, ARRAY['published']::object_status[], NULL);
  IF v_open_now_count IS DISTINCT FROM v_open_at_count THEN
    RAISE EXCEPTION 'open_at(now)=% ≠ open_now=% (parité moteur attendue)', v_open_at_count, v_open_now_count;
  END IF;

  -- 3. Invariant §133 : aucun objet SANS donnée d'ouverture (tri-état NULL) ne matche open_at.
  SELECT count(*) INTO v_null_matched
  FROM api.get_filtered_object_ids(
    jsonb_build_object('open_at', now()::text), NULL, ARRAY['published']::object_status[], NULL) f
  JOIN object o ON o.id = f.object_id
  WHERE o.cached_is_open_now IS NULL;
  IF v_null_matched > 0 THEN
    RAISE EXCEPTION 'open_at a matché % objet(s) au tri-état NULL (invariant §133 violé)', v_null_matched;
  END IF;

  RAISE NOTICE 'open_at OK — % objets ouverts (parité cache/moteur/filtre)', v_open_at_count;
END $$;

\echo '== test_filters_open_at_event : filtre Événements (fixture rollback) =='

BEGIN;

DO $$
DECLARE
  v_id TEXT := 'FMATESTOPENAT001';
  v_in_range INT;
  v_out_range INT;
BEGIN
  INSERT INTO object (id, object_type, name, status, created_by)
  VALUES (v_id, 'FMA', 'Test événement §157', 'published', NULL);

  INSERT INTO object_fma (object_id, event_start_date, event_end_date)
  VALUES (v_id, DATE '2030-07-10', DATE '2030-07-12');

  -- Plage demandée recouvrant l'événement → il matche.
  SELECT count(*) INTO v_in_range
  FROM api.get_filtered_object_ids(
    '{"event": {"from": "2030-07-11", "to": "2030-07-20"}}'::jsonb,
    ARRAY['FMA']::object_type[], ARRAY['published']::object_status[], NULL) f
  WHERE f.object_id = v_id;
  IF v_in_range <> 1 THEN
    RAISE EXCEPTION 'event overlap attendu (from=2030-07-11) — non matché';
  END IF;

  -- Plage disjointe (après l'événement) → exclu.
  SELECT count(*) INTO v_out_range
  FROM api.get_filtered_object_ids(
    '{"event": {"from": "2030-08-01"}}'::jsonb,
    ARRAY['FMA']::object_type[], ARRAY['published']::object_status[], NULL) f
  WHERE f.object_id = v_id;
  IF v_out_range <> 0 THEN
    RAISE EXCEPTION 'event disjoint (from=2030-08-01) aurait dû exclure la fixture';
  END IF;

  -- Borne to seule : événement APRÈS la borne → exclu.
  SELECT count(*) INTO v_out_range
  FROM api.get_filtered_object_ids(
    '{"event": {"to": "2030-07-09"}}'::jsonb,
    ARRAY['FMA']::object_type[], ARRAY['published']::object_status[], NULL) f
  WHERE f.object_id = v_id;
  IF v_out_range <> 0 THEN
    RAISE EXCEPTION 'event to=2030-07-09 aurait dû exclure la fixture (démarre le 10)';
  END IF;

  RAISE NOTICE 'event range OK (overlap / disjoint / borne to)';
END $$;

ROLLBACK;

\echo '== test_filters_open_at_event : OK =='
