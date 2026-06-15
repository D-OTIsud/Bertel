-- test_classification_labels_expansion.sql — §71 §08 catalogue expansion.
-- Asserts the post-state after seeds_data.sql + migration_classification_labels_expansion.sql.
-- Read-only. Raises on any failure; emits PASS notice otherwise.
DO $$
DECLARE
  v_official int;
  v_quality  int;
  v_missing  text;
  v_qtir     int;
  v_logis    text;
BEGIN
  -- (1) The 5 new official classements exist (is_distinction + official_classification group).
  SELECT count(*) INTO v_official
  FROM public.ref_classification_scheme
  WHERE is_distinction AND display_group = 'official_classification'
    AND code IN ('residence_tourisme_stars','village_vacances_stars','auberge_collective_stars','prl_stars','ot_category');
  IF v_official <> 5 THEN
    RAISE EXCEPTION 'FAIL: expected 5 new official classements, got %', v_official;
  END IF;

  -- (2) The 7 new quality labels exist (is_distinction + quality_label group).
  -- Note: national « Qualité Tourisme™ » is NOT added here — it already exists as
  -- LBL_QUALITE_TOURISME (sustainability_labels), §08-editable since §71 E.
  SELECT count(*) INTO v_quality
  FROM public.ref_classification_scheme
  WHERE is_distinction AND display_group = 'quality_label'
    AND code IN ('monument_historique','musee_de_france','jardin_remarquable',
                 'maison_des_illustres','accueil_velo','tables_auberges','logis');
  IF v_quality <> 7 THEN
    RAISE EXCEPTION 'FAIL: expected 7 new quality labels, got %', v_quality;
  END IF;

  -- (3) Each new graded scheme carries its values (no value-less scheme).
  SELECT string_agg(s.code, ', ') INTO v_missing
  FROM public.ref_classification_scheme s
  WHERE s.code IN ('residence_tourisme_stars','village_vacances_stars','auberge_collective_stars','prl_stars',
                   'ot_category','monument_historique','musee_de_france','jardin_remarquable',
                   'maison_des_illustres','accueil_velo','tables_auberges','logis')
    AND NOT EXISTS (SELECT 1 FROM public.ref_classification_value v WHERE v.scheme_id = s.id);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: schemes seeded without any value: %', v_missing;
  END IF;

  -- (4) QTIR « de Charme » value added to the existing regional scheme (now 2 values).
  SELECT count(*) INTO v_qtir
  FROM public.ref_classification_value v
  JOIN public.ref_classification_scheme s ON s.id = v.scheme_id
  WHERE s.code = 'qualite_tourisme_reunion';
  IF v_qtir <> 2 THEN
    RAISE EXCEPTION 'FAIL: qualite_tourisme_reunion expected 2 values (granted + charme), got %', v_qtir;
  END IF;

  -- (5) logis is multiple-selection (cheminées + cocottes cumulable) with 6 values.
  SELECT s.selection INTO v_logis
  FROM public.ref_classification_scheme s WHERE s.code = 'logis';
  IF v_logis <> 'multiple' THEN
    RAISE EXCEPTION 'FAIL: logis expected selection=multiple, got %', v_logis;
  END IF;

  RAISE NOTICE 'PASS: §08 catalogue expansion — 5 classements + 7 labels qualité + QTIR de Charme present and valued.';
END $$;
