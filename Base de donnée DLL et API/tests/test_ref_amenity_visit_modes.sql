-- test_ref_amenity_visit_modes.sql
-- Prouve 18b (migration_ref_amenity_visit_modes.sql) — catalogue ref_amenity, familles de
-- visite :
--
-- A) Les trois codes déjà écrits par l'éditeur (VISIT_MODE_CODES dans editor-completion.ts,
--    toggles de BlockVIS.tsx §06) existent dans ref_amenity : visite_libre / visite_guidee /
--    audioguide — chacun EXACTEMENT une fois (contrat porté par ref_amenity_code_key, revérifié
--    ici en creux : un rejeu de la migration ne doit jamais en faire naître un second).
-- B) Libellé FR exact (name) pour chacun des trois.
-- C) FAMILLE : les trois rattachent à `visit_mediation`, PAS à `accessibility` — assertion
--    EXPLICITE sur le code de la famille (via la jointure ref_amenity.family_id ->
--    ref_code_amenity_family.id), pas seulement sur l'existence de la ligne. Les ranger sous
--    accessibility fausserait le filtre public d'accessibilité, qui ne lit QUE cette
--    famille-là (cf. nonAccessibilityAmenityCount() dans editor-completion.ts, qui exclut
--    explicitement `accessibility` du calcul de complétude §06).
-- D) scope='object' pour les trois — un mode de visite est une propriété du site visité,
--    jamais d'une chambre (contrairement aux équipements scope='both'/'meeting_room').
-- E) La famille visit_mediation elle-même n'existe qu'une seule fois (partition
--    ref_code_amenity_family, PK (id, domain) — un rejeu de la migration ne doit pas en semer
--    une seconde).
--
-- Contre une base sans la migration : échec immédiat sur le tout premier ASSERT (les trois
-- codes sont absents du catalogue — 0 ligne, pas 1) — état rouge attendu (TDD), reproduit et
-- l'erreur exacte citée dans le rapport de tâche AVANT l'écriture de la migration.
-- Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste). Lecture seule : ref_amenity /
-- ref_code_amenity_family sont un catalogue de référence partagé, aucune fixture n'est créée
-- ni nécessaire — contrairement à test_moderation_rpcs.sql (dont ce fichier reprend le
-- gabarit \set ON_ERROR_STOP / BEGIN / DO $$ / ROLLBACK), ce test ne bascule aucun rôle : la
-- lecture d'un catalogue de référence n'est gatée par aucune RLS spécifique à une persona.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_count       integer;
  v_name        text;
  v_family_code text;
  v_scope       text;
BEGIN
  -- ============================================================
  -- visite_libre
  -- ============================================================
  SELECT count(*) INTO v_count FROM ref_amenity WHERE code = 'visite_libre';
  ASSERT v_count = 1, 'A: visite_libre doit exister exactement une fois dans ref_amenity';

  SELECT ra.name, fam.code, ra.scope INTO v_name, v_family_code, v_scope
  FROM ref_amenity ra
  JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
  WHERE ra.code = 'visite_libre';
  ASSERT v_name = 'Visite libre', 'B: visite_libre doit porter le libellé "Visite libre"';
  ASSERT v_family_code = 'visit_mediation',
         'C: visite_libre doit rattacher à la famille visit_mediation, PAS accessibility (fausserait le filtre public d''accessibilité)';
  ASSERT v_scope = 'object', 'D: visite_libre doit porter scope=object (propriété du site, jamais d''une chambre)';

  -- ============================================================
  -- visite_guidee
  -- ============================================================
  SELECT count(*) INTO v_count FROM ref_amenity WHERE code = 'visite_guidee';
  ASSERT v_count = 1, 'A: visite_guidee doit exister exactement une fois dans ref_amenity';

  SELECT ra.name, fam.code, ra.scope INTO v_name, v_family_code, v_scope
  FROM ref_amenity ra
  JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
  WHERE ra.code = 'visite_guidee';
  ASSERT v_name = 'Visite guidée', 'B: visite_guidee doit porter le libellé "Visite guidée"';
  ASSERT v_family_code = 'visit_mediation',
         'C: visite_guidee doit rattacher à la famille visit_mediation, PAS accessibility';
  ASSERT v_scope = 'object', 'D: visite_guidee doit porter scope=object';

  -- ============================================================
  -- audioguide
  -- ============================================================
  SELECT count(*) INTO v_count FROM ref_amenity WHERE code = 'audioguide';
  ASSERT v_count = 1, 'A: audioguide doit exister exactement une fois dans ref_amenity';

  SELECT ra.name, fam.code, ra.scope INTO v_name, v_family_code, v_scope
  FROM ref_amenity ra
  JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
  WHERE ra.code = 'audioguide';
  ASSERT v_name = 'Audioguide', 'B: audioguide doit porter le libellé "Audioguide"';
  ASSERT v_family_code = 'visit_mediation',
         'C: audioguide doit rattacher à la famille visit_mediation, PAS accessibility';
  ASSERT v_scope = 'object', 'D: audioguide doit porter scope=object';

  -- ============================================================
  -- E) la famille elle-même : une seule ligne
  -- ============================================================
  SELECT count(*) INTO v_count FROM ref_code_amenity_family WHERE code = 'visit_mediation';
  ASSERT v_count = 1, 'E: la famille visit_mediation doit exister exactement une fois';

  RAISE NOTICE 'test_ref_amenity_visit_modes: TOUS LES ASSERTS PASSENT';
END $$;
ROLLBACK;
