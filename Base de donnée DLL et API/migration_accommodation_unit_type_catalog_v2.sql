-- =============================================================================
-- migration_accommodation_unit_type_catalog_v2.sql
-- §201 lot 5B — catalogue complet des types de logement + extraction des
-- anciennes formes encore rangées dans taxonomy_hlo.
-- Manifest : taxo6b (APRÈS migration_accommodation_unit_type.sql).
--
-- Décision PO 2026-07-29 :
--   * le libellé long « Hébergement insolite de plein air — autre » devient
--     simplement « Insolite » ;
--   * « Autre » est une valeur distincte ;
--   * maison, appartement, studio, bungalow, chalet, mobil-home, roulotte et
--     les principales formes de plein air doivent être sélectionnables ;
--   * les 333 porteurs live de formes HLO sont déplacés vers l'axe multi-valué
--     sans perdre leur nature d'établissement.
--
-- Aucun changement de schéma : RLS, FK, index et RPC restent ceux de taxo6.
-- Idempotente, transactionnelle et fresh-safe.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';

DO $unit_v2_prereq$
BEGIN
  IF to_regclass('public.object_accommodation_unit_type') IS NULL
     OR to_regclass('public.ref_code_accommodation_unit_type') IS NULL THEN
    RAISE EXCEPTION
      'taxo6b: appliquer d''abord migration_accommodation_unit_type.sql';
  END IF;
END
$unit_v2_prereq$;

-- Un type décrit la forme physique dans laquelle le visiteur dort. Les
-- catégories de chambre (single/double/suite) restent dans room_type : elles ne
-- sont pas dupliquées ici. Les alias gardent les mots métier sans multiplier
-- des choix synonymes (cottage, écolodge, kabanon, etc.).
INSERT INTO ref_code (
  domain, code, name, description, position, is_active, is_assignable,
  name_i18n, description_i18n, metadata
)
VALUES
  ('accommodation_unit_type', 'house_villa', 'Maison / villa',
   'Maison, villa, gîte entier ou cottage proposé comme logement.', 1, TRUE, TRUE,
   '{"fr":"Maison / villa"}'::jsonb,
   '{"fr":"Maison, villa, gîte entier ou cottage proposé comme logement."}'::jsonb,
   jsonb_build_object('aliases', '["Maison","Villa","Gîte","Cottage"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'apartment', 'Appartement',
   'Logement indépendant situé dans un bâtiment comprenant un ou plusieurs logements.', 2, TRUE, TRUE,
   '{"fr":"Appartement"}'::jsonb,
   '{"fr":"Logement indépendant situé dans un bâtiment comprenant un ou plusieurs logements."}'::jsonb,
   jsonb_build_object('aliases', '["Appartement","Appart"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'studio', 'Studio',
   'Logement autonome dont la pièce principale réunit séjour et couchage.', 3, TRUE, TRUE,
   '{"fr":"Studio"}'::jsonb,
   '{"fr":"Logement autonome dont la pièce principale réunit séjour et couchage."}'::jsonb,
   jsonb_build_object('aliases', '["Studio"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'room', 'Chambre',
   'Chambre proposée comme unité de couchage, sans préjuger de la nature de l’établissement.', 4, TRUE, TRUE,
   '{"fr":"Chambre"}'::jsonb,
   '{"fr":"Chambre proposée comme unité de couchage, sans préjuger de la nature de l’établissement."}'::jsonb,
   jsonb_build_object('aliases', '["Chambre"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'bungalow', 'Bungalow',
   'Petite construction indépendante de plain-pied utilisée comme logement.', 5, TRUE, TRUE,
   '{"fr":"Bungalow"}'::jsonb,
   '{"fr":"Petite construction indépendante de plain-pied utilisée comme logement."}'::jsonb,
   jsonb_build_object('aliases', '["Bungalow"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'chalet', 'Chalet',
   'Construction indépendante de type chalet.', 6, TRUE, TRUE,
   '{"fr":"Chalet"}'::jsonb,
   '{"fr":"Construction indépendante de type chalet."}'::jsonb,
   jsonb_build_object('aliases', '["Chalet"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'mobile_home', 'Mobil-home',
   'Résidence mobile installée sur un terrain de camping ou un parc résidentiel de loisirs.', 7, TRUE, TRUE,
   '{"fr":"Mobil-home"}'::jsonb,
   '{"fr":"Résidence mobile installée sur un terrain de camping ou un parc résidentiel de loisirs."}'::jsonb,
   jsonb_build_object('aliases', '["Mobil-home","Mobile home","Résidence mobile"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'caravan', 'Roulotte',
   'Roulotte ou caravane fixe aménagée et proposée comme logement.', 8, TRUE, TRUE,
   '{"fr":"Roulotte"}'::jsonb,
   '{"fr":"Roulotte ou caravane fixe aménagée et proposée comme logement."}'::jsonb,
   jsonb_build_object('aliases', '["Roulotte","Caravane aménagée"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'dormitory', 'Dortoir',
   'Pièce de couchage collective proposant plusieurs lits ou couchettes.', 9, TRUE, TRUE,
   '{"fr":"Dortoir"}'::jsonb,
   '{"fr":"Pièce de couchage collective proposant plusieurs lits ou couchettes."}'::jsonb,
   jsonb_build_object('aliases', '["Dortoir","Chambre partagée"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'bare_pitch', 'Emplacement nu',
   'Emplacement sans hébergement fourni, destiné à la tente, la caravane ou le camping-car du visiteur.', 10, TRUE, TRUE,
   '{"fr":"Emplacement nu"}'::jsonb,
   '{"fr":"Emplacement sans hébergement fourni, destiné à la tente, la caravane ou le camping-car du visiteur."}'::jsonb,
   jsonb_build_object('aliases', '["Emplacement nu","Emplacement tente","Emplacement caravane"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'equipped_pitch', 'Emplacement équipé',
   'Emplacement de plein air équipé pour l’accueil du visiteur ou de son véhicule de loisirs.', 11, TRUE, TRUE,
   '{"fr":"Emplacement équipé"}'::jsonb,
   '{"fr":"Emplacement de plein air équipé pour l’accueil du visiteur ou de son véhicule de loisirs."}'::jsonb,
   jsonb_build_object('aliases', '["Emplacement équipé","Emplacement camping-car"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),

  ('accommodation_unit_type', 'bubble', 'Bulle',
   'Unité transparente ou semi-transparente, généralement gonflable.', 20, TRUE, TRUE,
   '{"fr":"Bulle"}'::jsonb,
   '{"fr":"Unité transparente ou semi-transparente, généralement gonflable."}'::jsonb,
   jsonb_build_object('aliases', '["Bulle","Bubble"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'cabin', 'Cabane',
   'Cabane au sol, perchée ou flottante proposée comme logement.', 21, TRUE, TRUE,
   '{"fr":"Cabane"}'::jsonb,
   '{"fr":"Cabane au sol, perchée ou flottante proposée comme logement."}'::jsonb,
   jsonb_build_object('aliases', '["Cabane","Cabane perchée","Kabanon"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'lodge', 'Lodge',
   'Unité de type lodge, éventuellement toilée.', 22, TRUE, TRUE,
   '{"fr":"Lodge"}'::jsonb,
   '{"fr":"Unité de type lodge, éventuellement toilée."}'::jsonb,
   jsonb_build_object('aliases', '["Lodge","Lodge toilé","Écolodge"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'tipi', 'Tipi',
   'Habitat conique inspiré du tipi, proposé comme logement.', 23, TRUE, TRUE,
   '{"fr":"Tipi"}'::jsonb,
   '{"fr":"Habitat conique inspiré du tipi, proposé comme logement."}'::jsonb,
   jsonb_build_object('aliases', '["Tipi"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'yurt', 'Yourte',
   'Habitat circulaire de type yourte proposé comme logement.', 24, TRUE, TRUE,
   '{"fr":"Yourte"}'::jsonb,
   '{"fr":"Habitat circulaire de type yourte proposé comme logement."}'::jsonb,
   jsonb_build_object('aliases', '["Yourte"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'furnished_tent', 'Tente aménagée',
   'Tente déjà installée et équipée pour le séjour.', 25, TRUE, TRUE,
   '{"fr":"Tente aménagée"}'::jsonb,
   '{"fr":"Tente déjà installée et équipée pour le séjour."}'::jsonb,
   jsonb_build_object('aliases', '["Tente aménagée","Tente lodge","Glamping"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'dome', 'Dôme',
   'Dôme géodésique ou structure arrondie rigide proposée comme logement.', 26, TRUE, TRUE,
   '{"fr":"Dôme"}'::jsonb,
   '{"fr":"Dôme géodésique ou structure arrondie rigide proposée comme logement."}'::jsonb,
   jsonb_build_object('aliases', '["Dôme","Dôme géodésique"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'tiny_house', 'Tiny house',
   'Petite maison autonome et compacte proposée comme logement.', 27, TRUE, TRUE,
   '{"fr":"Tiny house"}'::jsonb,
   '{"fr":"Petite maison autonome et compacte proposée comme logement."}'::jsonb,
   jsonb_build_object('aliases', '["Tiny house","Micro-maison"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'boat', 'Péniche / bateau',
   'Bateau, péniche ou autre unité flottante proposée comme logement.', 28, TRUE, TRUE,
   '{"fr":"Péniche / bateau"}'::jsonb,
   '{"fr":"Bateau, péniche ou autre unité flottante proposée comme logement."}'::jsonb,
   jsonb_build_object('aliases', '["Péniche","Bateau","Voilier","Logement flottant"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),

  -- Code conservé pour ne casser aucun filtre ni lien existant ; seul le
  -- libellé métier devient volontairement court.
  ('accommodation_unit_type', 'unusual_outdoor_unit', 'Insolite',
   'Logement insolite dont la forme n’est pas couverte par un choix plus précis.', 90, TRUE, TRUE,
   '{"fr":"Insolite"}'::jsonb,
   '{"fr":"Logement insolite dont la forme n’est pas couverte par un choix plus précis."}'::jsonb,
   jsonb_build_object('aliases', '["Insolite","Hébergement insolite"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729')),
  ('accommodation_unit_type', 'other', 'Autre',
   'Autre type de logement ne correspondant à aucun choix proposé.', 99, TRUE, TRUE,
   '{"fr":"Autre"}'::jsonb,
   '{"fr":"Autre type de logement ne correspondant à aucun choix proposé."}'::jsonb,
   jsonb_build_object('aliases', '["Autre"]'::jsonb, 'source', 'taxonomy_unit_type_v2_20260729'))
ON CONFLICT (domain, code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      position = EXCLUDED.position,
      is_active = EXCLUDED.is_active,
      is_assignable = EXCLUDED.is_assignable,
      name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
      description_i18n = COALESCE(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
      metadata = COALESCE(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata;

-- Gel transactionnel des porteurs encore logés sur l'ancien axe. La table
-- temporaire rend les contrôles indépendants d'un éventuel nouvel import lancé
-- pendant la migration (les verrous de lignes sont pris par l'UPDATE ensuite).
CREATE TEMP TABLE tmp_unit_v2_move ON COMMIT DROP AS
SELECT ot.object_id,
       rc.code AS legacy_code,
       m.unit_code,
       m.target_nature
FROM object_taxonomy ot
JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
JOIN (VALUES
  ('maison',        'house_villa', 'location_saisonniere'),
  ('appartement',   'apartment',   'location_saisonniere'),
  ('studio',        'studio',      'location_saisonniere'),
  ('bungalow',      'bungalow',    'location_saisonniere'),
  ('chalet',        'chalet',      'location_saisonniere'),
  ('roulotte',      'caravan',     'location_saisonniere'),
  ('cdh_maison',    'house_villa', 'chambre_d_hotes'),
  ('cdh_bungalow',  'bungalow',    'chambre_d_hotes'),
  -- « Gîte rural » est une appellation de Meublé de tourisme, pas une forme.
  ('gite_rural',    NULL,          'location_saisonniere')
) AS m(legacy_code, unit_code, target_nature) ON m.legacy_code = rc.code
WHERE ot.domain = 'taxonomy_hlo';

-- La forme est écrite AVANT de retirer l'ancienne feuille : aucune perte
-- d'information possible si une référence est absente ou invalide.
INSERT INTO object_accommodation_unit_type (object_id, unit_type_id)
SELECT m.object_id, ut.id
FROM tmp_unit_v2_move m
JOIN ref_code ut
  ON ut.domain = 'accommodation_unit_type' AND ut.code = m.unit_code
WHERE m.unit_code IS NOT NULL
ON CONFLICT (object_id, unit_type_id) DO NOTHING;

DO $unit_v2_links$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(m.object_id || ':' || m.unit_code, ', ' ORDER BY m.object_id)
    INTO v_bad
  FROM tmp_unit_v2_move m
  WHERE m.unit_code IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM object_accommodation_unit_type ou
      JOIN ref_code ut ON ut.id = ou.unit_type_id
      WHERE ou.object_id = m.object_id
        AND ut.domain = 'accommodation_unit_type'
        AND ut.code = m.unit_code
    );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'taxo6b: type de logement non confirmé pour %', v_bad;
  END IF;
END
$unit_v2_links$;

-- La même ligne object_taxonomy retrouve sa NATURE réelle. Son trigger met à
-- jour les caches Explorer objet par objet ; aucun refresh global n'est lancé.
UPDATE object_taxonomy ot
SET ref_code_id = target.id,
    source = 'taxonomy_unit_type_v2_20260729',
    note = CASE
      WHEN m.unit_code IS NULL
        THEN 'Normalisation 2026-07-29 — « Gîte rural » devient un alias de Meublé de tourisme'
      ELSE 'Normalisation 2026-07-29 — la forme « ' || m.legacy_code || ' » passe dans Type de logement'
    END,
    updated_at = now()
FROM tmp_unit_v2_move m
JOIN ref_code target
  ON target.domain = 'taxonomy_hlo' AND target.code = m.target_nature
WHERE ot.object_id = m.object_id
  AND ot.domain = 'taxonomy_hlo';

-- Les anciennes feuilles ne doivent plus être proposées. replacement_code est
-- explicite pour l'audit et les futurs imports.
UPDATE ref_code rc
SET is_active = FALSE,
    is_assignable = FALSE,
    metadata = COALESCE(rc.metadata, '{}'::jsonb)
               || jsonb_build_object(
                    'retired', 'taxonomy_unit_type_v2_20260729',
                    'replacement_domain', 'accommodation_unit_type',
                    'replacement_code', CASE rc.code
                      WHEN 'maison' THEN 'house_villa'
                      WHEN 'appartement' THEN 'apartment'
                      WHEN 'studio' THEN 'studio'
                      WHEN 'bungalow' THEN 'bungalow'
                      WHEN 'chalet' THEN 'chalet'
                      WHEN 'roulotte' THEN 'caravan'
                      WHEN 'cdh_maison' THEN 'house_villa'
                      WHEN 'cdh_bungalow' THEN 'bungalow'
                    END,
                    'reason', 'forme extraite de la nature vers Type de logement')
WHERE rc.domain = 'taxonomy_hlo'
  AND rc.code IN ('maison','appartement','studio','bungalow','chalet','roulotte',
                  'cdh_maison','cdh_bungalow')
  AND NOT EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id);

UPDATE ref_code rc
SET is_active = FALSE,
    is_assignable = FALSE,
    metadata = COALESCE(rc.metadata, '{}'::jsonb)
               || jsonb_build_object(
                    'retired', 'taxonomy_unit_type_v2_20260729',
                    'replacement_domain', 'taxonomy_hlo',
                    'replacement_code', 'location_saisonniere',
                    'reason', 'appellation versée comme alias de Meublé de tourisme')
WHERE rc.domain = 'taxonomy_hlo' AND rc.code = 'gite_rural'
  AND NOT EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id);

-- L'alias est porté par la vraie nature : la recherche historique « Gîte rural »
-- reste utile sans fabriquer une catégorie concurrente.
UPDATE ref_code
SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{aliases}',
      COALESCE(metadata->'aliases', '[]'::jsonb) || '["Gîte rural"]'::jsonb,
      TRUE)
WHERE domain = 'taxonomy_hlo' AND code = 'location_saisonniere'
  AND NOT COALESCE(metadata->'aliases', '[]'::jsonb) @> '["Gîte rural"]'::jsonb;

-- Décision PO : une fois la transition terminée, les anciens types d'unité ne
-- restent pas comme un deuxième catalogue « masqué ». Ils sont réellement
-- supprimés. Les lignes de closure partent par CASCADE ; les gardes ci-dessous
-- interdisent la suppression si un porteur, un enfant ou un crosswalk existe.
DELETE FROM ref_code rc
WHERE (rc.domain, rc.code) IN (
        ('taxonomy_hlo','maison'), ('taxonomy_hlo','appartement'),
        ('taxonomy_hlo','studio'), ('taxonomy_hlo','bungalow'),
        ('taxonomy_hlo','chalet'), ('taxonomy_hlo','roulotte'),
        ('taxonomy_hlo','cdh_maison'), ('taxonomy_hlo','cdh_bungalow'),
        ('taxonomy_hlo','gite_rural'), ('taxonomy_hlo','bulle'),
        ('taxonomy_hlo','lodges'), ('taxonomy_hlo','hebergement_insolite'),
        ('taxonomy_hpa','outdoor_glamping')
      )
  AND NOT EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id=rc.id)
  AND NOT EXISTS (SELECT 1 FROM ref_code child WHERE child.parent_id=rc.id)
  AND NOT EXISTS (
    SELECT 1 FROM ref_interop_crosswalk x
    WHERE x.taxonomy_domain=rc.domain AND x.taxonomy_code=rc.code
  );

DO $unit_v2_asserts$
DECLARE v_n int; v_bad text;
BEGIN
  SELECT count(*) INTO v_n
  FROM ref_code
  WHERE domain = 'accommodation_unit_type' AND is_active AND is_assignable;
  IF v_n <> 22 THEN
    RAISE EXCEPTION 'taxo6b: % types de logement actifs au lieu de 22', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ref_code
    WHERE domain='accommodation_unit_type' AND code='unusual_outdoor_unit'
      AND name='Insolite' AND name_i18n->>'fr'='Insolite'
  ) OR NOT EXISTS (
    SELECT 1 FROM ref_code
    WHERE domain='accommodation_unit_type' AND code='other' AND name='Autre'
  ) THEN
    RAISE EXCEPTION 'taxo6b: « Insolite » et « Autre » doivent être deux choix distincts';
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
    RAISE EXCEPTION 'taxo6b: ancien catalogue de types d''unité non supprimé: %', v_bad;
  END IF;

  SELECT count(*) INTO v_n FROM tmp_unit_v2_move;
  RAISE NOTICE 'taxo6b: % ancienne(s) affectation(s) normalisée(s), catalogue à 22 choix', v_n;
END
$unit_v2_asserts$;

COMMIT;

-- Après commit live :
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
--   NOTIFY pgrst, 'reload schema';
-- Le filtre des types de logement joint la table vive ; mv_filtered_objects
-- n'a pas besoin d'être rafraîchie pour ces nouveaux codes.
