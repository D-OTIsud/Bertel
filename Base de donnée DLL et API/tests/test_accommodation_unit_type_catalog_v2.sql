-- =============================================================================
-- Garde permanente taxo6b — catalogue des types de logement et retrait de
-- l'ancien axe taxonomy_hlo. Transactionnelle, aucune écriture persistante.
-- =============================================================================
\set ON_ERROR_STOP on

BEGIN;

DO $unit_v2_test$
DECLARE v_n int; v_bad text;
BEGIN
  SELECT count(*) INTO v_n FROM ref_code
  WHERE domain='accommodation_unit_type' AND is_active AND is_assignable;
  IF v_n <> 22 THEN
    RAISE EXCEPTION 'taxo6b-test: % choix actifs au lieu de 22', v_n;
  END IF;

  SELECT string_agg(e.code || '=' || COALESCE(rc.name, '(absent)'), ', ' ORDER BY e.position)
    INTO v_bad
  FROM (VALUES
    ('house_villa','Maison / villa',1), ('apartment','Appartement',2),
    ('studio','Studio',3), ('room','Chambre',4), ('bungalow','Bungalow',5),
    ('chalet','Chalet',6), ('mobile_home','Mobil-home',7), ('caravan','Roulotte',8),
    ('dormitory','Dortoir',9), ('bare_pitch','Emplacement nu',10),
    ('equipped_pitch','Emplacement équipé',11), ('bubble','Bulle',20),
    ('cabin','Cabane',21), ('lodge','Lodge',22), ('tipi','Tipi',23),
    ('yurt','Yourte',24), ('furnished_tent','Tente aménagée',25),
    ('dome','Dôme',26), ('tiny_house','Tiny house',27),
    ('boat','Péniche / bateau',28), ('unusual_outdoor_unit','Insolite',90),
    ('other','Autre',99)
  ) AS e(code, expected_name, position)
  LEFT JOIN ref_code rc
    ON rc.domain='accommodation_unit_type' AND rc.code=e.code
   AND rc.name=e.expected_name AND rc.position=e.position
   AND rc.is_active AND rc.is_assignable
  WHERE rc.id IS NULL;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'taxo6b-test: choix manquant ou incorrect: %', v_bad;
  END IF;

  IF EXISTS (
    SELECT 1 FROM ref_code
    WHERE domain='accommodation_unit_type'
      AND name='Hébergement insolite de plein air — autre'
      AND is_active
  ) THEN
    RAISE EXCEPTION 'taxo6b-test: ancien libellé long encore actif';
  END IF;

  SELECT string_agg(rc.domain || '.' || rc.code, ', ' ORDER BY rc.domain, rc.code) INTO v_bad
  FROM ref_code rc
  WHERE (rc.domain, rc.code) IN (
          ('taxonomy_hlo','maison'), ('taxonomy_hlo','appartement'),
          ('taxonomy_hlo','studio'), ('taxonomy_hlo','bungalow'),
          ('taxonomy_hlo','chalet'), ('taxonomy_hlo','roulotte'),
          ('taxonomy_hlo','cdh_maison'), ('taxonomy_hlo','cdh_bungalow'),
          ('taxonomy_hlo','gite_rural'), ('taxonomy_hlo','bulle'),
          ('taxonomy_hlo','lodges'), ('taxonomy_hlo','hebergement_insolite'),
          ('taxonomy_hpa','outdoor_glamping')
        );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'taxo6b-test: ancien catalogue encore présent: %', v_bad;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ref_code
    WHERE domain='taxonomy_hlo' AND code='location_saisonniere'
      AND COALESCE(metadata->'aliases','[]'::jsonb) @> '["Gîte rural"]'::jsonb
  ) THEN
    RAISE EXCEPTION 'taxo6b-test: alias « Gîte rural » absent de Meublé de tourisme';
  END IF;

  RAISE NOTICE 'taxo6b-test: 22 choix, libellés courts et ancien axe retiré';
END
$unit_v2_test$;

ROLLBACK;

DO $$ BEGIN RAISE NOTICE 'test_accommodation_unit_type_catalog_v2.sql: OK'; END $$;
