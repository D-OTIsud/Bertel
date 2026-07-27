-- test_pet_policy_single_source.sql
-- Proves migration_pet_policy_single_source.sql (§196, manifest step pets1):
--   (a) « Animaux acceptés » n'a plus qu'UNE surface de saisie — l'équipement doublon
--       `ref_amenity.pet_friendly` est retiré du catalogue (sinon le sélecteur
--       d'équipements le réoffre et cocher la case reste sans effet sur le filtre) ;
--   (b) les vrais équipements animaliers (panier, gamelles) survivent — on retire un
--       doublon de concept, pas la famille ;
--   (c) NON VACUITÉ — le prédicat `pet_accepted` de get_filtered_object_ids remonte
--       bien un objet porteur de object_pet_policy.accepted = true, et écarte un
--       porteur `false`. C'est CE test qui rougit si la chaîne filtre casse à nouveau.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_hits text[];
BEGIN
  -- ---------- (a) Le doublon de saisie est retiré ----------
  ASSERT NOT EXISTS (SELECT 1 FROM ref_amenity WHERE code = 'pet_friendly'),
         'ref_amenity.pet_friendly est de retour : le concept « animaux acceptés » a de nouveau '
         'deux surfaces de saisie (équipement + object_pet_policy) et le filtre Explorer ne voit que la seconde';

  -- ---------- (b) La famille pets n'a pas été rasée ----------
  ASSERT (SELECT count(*) FROM ref_amenity WHERE code IN ('pet_bed', 'pet_bowls')) = 2,
         'pet_bed / pet_bowls doivent rester : ce sont de vrais équipements, pas la politique d''accueil';

  -- ---------- (c) Le filtre fonctionne de bout en bout ----------
  INSERT INTO object (id, object_type, name, status, published_at)
    VALUES ('PETFLT9999999901', 'HLO', 'Pet filter — accepte', 'published', now()),
           ('PETFLT9999999902', 'HLO', 'Pet filter — refuse',  'published', now());
  INSERT INTO object_pet_policy (object_id, accepted)
    VALUES ('PETFLT9999999901', true),
           ('PETFLT9999999902', false);

  SELECT array_agg(f.object_id ORDER BY f.object_id) INTO v_hits
  FROM api.get_filtered_object_ids(
         '{"pet_accepted": true}'::jsonb,
         NULL::object_type[],
         ARRAY['published']::object_status[],
         NULL
       ) AS f
  WHERE f.object_id LIKE 'PETFLT%';

  ASSERT v_hits = ARRAY['PETFLT9999999901'],
         format('le filtre pet_accepted=true doit remonter exactement le porteur accepted=true ; obtenu: %s', v_hits);

  RAISE NOTICE 'pet policy single-source assertions passed (doublon retiré + famille préservée + filtre non vacant).';
END$$;
ROLLBACK;
