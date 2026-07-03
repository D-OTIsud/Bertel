-- test_accessibility_label_filter.sql
-- §162 — Le filtre PMR doit remonter les objets labellisés Tourisme & Handicap
-- même sans équipement accessibilité saisi (directive PO 2026-07-03) :
--   * accessibility_any (toggle PMR) : équipement famille `accessibility` OU
--     LBL_TOURISME_HANDICAP `granted` — clé dédiée, jamais clobbée par le filtre
--     transverse Services & équipements (§159).
--   * disability_types_any : bras équipement (acc_* extra.disability_types) OU
--     bras label (subvalue_ids typés) OU label à couverture inconnue
--     (subvalue_ids vides — état de l'import : le label seul suffit).
--   * amenity_families_any=['accessibility'] reste équipement-PUR (ne matche
--     pas un objet label-seul) — la sémantique élargie vit dans accessibility_any.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_label_only   text := 'HOTACCLBL0000001';  -- T&H granted, subvalue_ids NULL, 0 équipement
  v_label_typed  text := 'HOTACCLBL0000002';  -- T&H granted, subvalue motor
  v_amenity_only text := 'HOTACCLBL0000003';  -- équipement acc_* motor, pas de label
  v_none         text := 'HOTACCLBL0000004';  -- ni label ni équipement
  v_th_scheme    uuid;
  v_th_granted   uuid;
  v_th_motor     uuid;
  v_acc_amenity  uuid;
  v_ids          text[];
BEGIN
  SELECT id INTO v_th_scheme
  FROM ref_classification_scheme
  WHERE code = 'LBL_TOURISME_HANDICAP';
  ASSERT v_th_scheme IS NOT NULL, 'Missing LBL_TOURISME_HANDICAP scheme seed';

  SELECT id INTO v_th_granted
  FROM ref_classification_value
  WHERE scheme_id = v_th_scheme AND code = 'granted';
  ASSERT v_th_granted IS NOT NULL, 'Missing LBL_TOURISME_HANDICAP granted value seed';

  SELECT id INTO v_th_motor
  FROM ref_classification_value
  WHERE scheme_id = v_th_scheme AND metadata->>'disability_type' = 'motor'
  LIMIT 1;
  ASSERT v_th_motor IS NOT NULL, 'Missing motor subvalue for LBL_TOURISME_HANDICAP';

  -- Équipement accessibilité couvrant motor mais PAS visual (l'assertion 3
  -- vérifie l'exclusion sur visual sans dépendre du contenu du catalogue).
  SELECT ra.id INTO v_acc_amenity
  FROM ref_amenity ra
  JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
  WHERE fam.code = 'accessibility'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(ra.extra->'disability_types', '[]'::jsonb)) AS dt(val)
      WHERE dt.val = 'motor'
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(ra.extra->'disability_types', '[]'::jsonb)) AS dt(val)
      WHERE dt.val = 'visual'
    )
  LIMIT 1;
  ASSERT v_acc_amenity IS NOT NULL, 'Missing accessibility amenity with motor-only disability_types';

  INSERT INTO object (id, object_type, name, status)
  VALUES
    (v_label_only,   'HOT', 'accesslabelregression labelonly',   'published'),
    (v_label_typed,  'HOT', 'accesslabelregression labeltyped',  'published'),
    (v_amenity_only, 'HOT', 'accesslabelregression amenityonly', 'published'),
    (v_none,         'HOT', 'accesslabelregression none',        'published');

  INSERT INTO object_classification (object_id, scheme_id, value_id, subvalue_ids, status)
  VALUES
    (v_label_only,  v_th_scheme, v_th_granted, NULL,                          'granted'),
    (v_label_typed, v_th_scheme, v_th_granted, ARRAY[v_th_motor]::uuid[],     'granted');

  INSERT INTO object_amenity (object_id, amenity_id)
  VALUES (v_amenity_only, v_acc_amenity);

  -- 1) Toggle PMR (accessibility_any) : label OU équipement — jamais v_none.
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_ids
  FROM api.get_filtered_object_ids(
    '{"accessibility_any": true}'::jsonb,
    ARRAY['HOT']::object_type[],
    ARRAY['published']::object_status[],
    'accesslabelregression'
  ) f;
  ASSERT v_ids = ARRAY[v_label_only, v_label_typed, v_amenity_only],
    format('accessibility_any: expected label-only + label-typed + amenity-only, got %s', v_ids);

  -- 2) Chips type de handicap (motor) : les trois voies matchent
  --    (équipement typé / subvalue label / label couverture inconnue).
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_ids
  FROM api.get_filtered_object_ids(
    '{"disability_types_any": ["motor"]}'::jsonb,
    ARRAY['HOT']::object_type[],
    ARRAY['published']::object_status[],
    'accesslabelregression'
  ) f;
  ASSERT v_ids = ARRAY[v_label_only, v_label_typed, v_amenity_only],
    format('disability_types_any motor: expected all three accessibility fixtures, got %s', v_ids);

  -- 3) Chips visual : seul le label à couverture inconnue matche —
  --    le label typé motor et l'équipement motor-only sont exclus.
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_ids
  FROM api.get_filtered_object_ids(
    '{"disability_types_any": ["visual"]}'::jsonb,
    ARRAY['HOT']::object_type[],
    ARRAY['published']::object_status[],
    'accesslabelregression'
  ) f;
  ASSERT v_ids = ARRAY[v_label_only],
    format('disability_types_any visual: expected only unknown-coverage label, got %s', v_ids);

  -- 4) amenity_families_any reste équipement-pur (§159) : pas de bras label ici.
  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_ids
  FROM api.get_filtered_object_ids(
    '{"amenity_families_any": ["accessibility"]}'::jsonb,
    ARRAY['HOT']::object_type[],
    ARRAY['published']::object_status[],
    'accesslabelregression'
  ) f;
  ASSERT v_ids = ARRAY[v_amenity_only],
    format('amenity_families_any accessibility: expected equipment-only match, got %s', v_ids);

  RAISE NOTICE 'Accessibility label filter (§162) assertions passed.';
END$$;
ROLLBACK;
