-- =============================================================================
-- migration_motorhome_service_amenities.sql
-- §200 lot 6 — les trois capacités d'une aire de services camping-car, DISTINCTES.
-- Manifest : taxo7 (après taxo6 `migration_accommodation_unit_type.sql`)
-- =============================================================================
--
-- LA RÈGLE QUE CE FICHIER MATÉRIALISE
--   La NUITÉE est une propriété de la NATURE de l'établissement.
--   Les SERVICES (eau, vidange, électricité) sont des ÉQUIPEMENTS.
--   Les deux sont indépendants, dans les deux sens :
--     - une fiche peut disposer des trois services sans autoriser la nuitée ;
--     - une « Aire d'accueil camping-car » autorise la nuitée sans posséder le
--       moindre service.
--   `taxonomy_spu.motorhome_services` (aire de SERVICES autonome) reste donc une
--   nature de service public, jamais une nature d'hébergement — et ne prouve
--   jamais qu'on peut y dormir.
--
-- POURQUOI TROIS CODES ET PAS UN
--   Le corpus ne portait AUCUN des trois. Les deux codes voisins ne les
--   couvrent pas :
--     - `drinking_water` = point d'eau POTABLE, pas l'alimentation d'un réservoir ;
--     - `electric_charging` (famille parking) = recharge de véhicule ÉLECTRIQUE,
--       pas un branchement 220 V d'emplacement.
--   Les fusionner en un « équipements camping-car » unique rendrait le filtre
--   incapable de répondre à « où puis-je vidanger ? », qui est la question
--   réellement posée.
--
-- CE QUE CE FICHIER NE FAIT PAS
--   Aucun code `gratuit` / `payant` : la gratuité vit dans `object_price`
--   (montant, unité de facturation, période). La créer ici en ferait un second
--   lieu de vérité, et le jour où un tarif change, la taxonomie mentirait.
--
-- IDEMPOTENT et fresh-safe.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

INSERT INTO ref_amenity (code, name, family_id, scope, description, position, name_i18n, description_i18n)
SELECT v.code, v.name, fam.id, 'object', v.description, v.position,
       jsonb_build_object('fr', v.name), jsonb_build_object('fr', v.description)
FROM (VALUES
  ('motorhome_water_supply',    'Alimentation en eau (camping-car)', 116,
   'Point de remplissage du réservoir d''eau d''un camping-car. Distinct d''un simple point d''eau potable.'),
  ('motorhome_waste_drain',     'Vidange des eaux usées (camping-car)', 117,
   'Borne ou regard de vidange des eaux grises et de la cassette sanitaire.'),
  ('motorhome_electric_hookup', 'Branchement électrique (camping-car)', 118,
   'Prise d''emplacement permettant le raccordement électrique d''un camping-car. Distinct d''une borne de recharge de véhicule électrique.')
) AS v(code, name, position, description)
CROSS JOIN LATERAL (
  SELECT id FROM ref_code WHERE domain = 'amenity_family' AND code = 'services'
) AS fam
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      family_id = EXCLUDED.family_id,
      scope = EXCLUDED.scope,
      description = EXCLUDED.description,
      position = EXCLUDED.position,
      name_i18n = COALESCE(ref_amenity.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
      description_i18n = COALESCE(ref_amenity.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n;

-- -----------------------------------------------------------------------------
-- Asserts fail-closed
-- -----------------------------------------------------------------------------
DO $motorhome_asserts$
DECLARE v_n INT; v_bad TEXT;
BEGIN
  -- 1. Les trois capacités existent et sont DISTINCTES.
  SELECT count(*) INTO v_n FROM ref_amenity
   WHERE code IN ('motorhome_water_supply','motorhome_waste_drain','motorhome_electric_hookup');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'lot6: % équipement(s) camping-car au lieu de 3 — les trois capacités doivent rester séparées', v_n;
  END IF;

  -- 2. Elles vivent dans le catalogue d'ÉQUIPEMENTS, jamais dans une taxonomie.
  SELECT string_agg(domain || '.' || code, ', ') INTO v_bad
    FROM ref_code
   WHERE domain LIKE 'taxonomy\_%'
     AND code IN ('motorhome_water_supply','motorhome_waste_drain','motorhome_electric_hookup');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'lot6: capacité camping-car créée dans une taxonomie: %', v_bad;
  END IF;

  -- 3. L'aire de SERVICES reste une nature de service public, hors hébergement.
  IF NOT EXISTS (
    SELECT 1 FROM ref_code
     WHERE domain = 'taxonomy_spu' AND code = 'motorhome_services' AND is_active
  ) THEN
    RAISE EXCEPTION 'lot6: taxonomy_spu.motorhome_services a disparu';
  END IF;
  IF EXISTS (
    SELECT 1 FROM ref_code
     WHERE domain = 'taxonomy_spu' AND code = 'motorhome_services'
       AND (metadata ? 'famille' OR metadata->>'axis' IN ('nature','sous_type'))
  ) THEN
    RAISE EXCEPTION 'lot6: l''aire de services a été rattachée à une famille d''hébergement — elle ne prouve pas la nuitée';
  END IF;

  -- 4. Aucun vocabulaire tarifaire n'a été introduit dans le catalogue
  --    d'équipements : le prix vit dans object_price.
  SELECT string_agg(code, ', ') INTO v_bad
    FROM ref_amenity
   WHERE code ~* '(^|_)(gratuit|payant|free|paid)($|_)';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'lot6: vocabulaire tarifaire dans ref_amenity: %', v_bad;
  END IF;
END
$motorhome_asserts$;

COMMIT;

-- =============================================================================
-- APRÈS COMMIT : NOTIFY pgrst, 'reload schema'; (catalogue additif, pas de MV)
-- =============================================================================
