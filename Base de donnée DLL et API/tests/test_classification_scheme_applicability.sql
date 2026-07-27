-- test_classification_scheme_applicability.sql
-- Garde permanente du registre d'applicabilité des distinctions (manifest 16n).
--
-- Contexte : `ref_classification_scheme` ne portait aucune applicabilité par type
-- d'objet, donc le filtre Explorer « Distinctions » et le sélecteur de l'éditeur §08
-- proposaient les 33 schemes quel que soit le contexte — « Classement hôtelier » et
-- « Classement camping » s'affichaient avec la seule catégorie Visites cochée
-- (signalement PO, audit filtres 2026-07-27 §3.2).
--
-- Ce que ce test protège :
--  (1) le PLANCHER DE DONNÉES — aucune fiche déjà labellisée ne peut devenir
--      infiltrable parce que le mapping métier a oublié son type ;
--  (2) l'ABSENCE DE LIGNE VIDE — un scheme présent dans la table avec zéro type
--      serait « applicable à rien » : impossible par la PK, mais on vérifie
--      qu'aucun scheme non-distinction n'y a été glissé ;
--  (3) les couples strictement type-bornés qui portent tout le bénéfice du
--      signalement : les classements d'hébergement ne doivent JAMAIS toucher un
--      type du bucket Visites (PCU/PNA/LOI/VIL).
--
-- NON testé volontairement : l'exhaustivité du mapping métier. Un scheme sans
-- aucune ligne reste applicable partout (fail-open assumé, cf. la migration) — c'est
-- un défaut sûr, pas une erreur.
DO $$
DECLARE
  v_missing  int;
  v_intruder int;
  v_leak     text;
BEGIN
  -- (1) Plancher de données : tout couple (scheme, type) observé est déclaré.
  SELECT count(*) INTO v_missing
  FROM (
    SELECT DISTINCT oc.scheme_id, o.object_type
    FROM public.object_classification oc
    JOIN public.object o ON o.id = oc.object_id
    JOIN public.ref_classification_scheme s ON s.id = oc.scheme_id
    WHERE s.is_distinction IS TRUE
  ) obs
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ref_classification_scheme_applicability a
    WHERE a.scheme_id = obs.scheme_id AND a.object_type = obs.object_type
  );
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'applicabilité incomplète : % couple(s) (scheme, type) portés en données mais absents du registre', v_missing;
  END IF;

  -- (2) Le registre ne pilote que les distinctions.
  SELECT count(*) INTO v_intruder
  FROM public.ref_classification_scheme_applicability a
  JOIN public.ref_classification_scheme s ON s.id = a.scheme_id
  WHERE s.is_distinction IS NOT TRUE;
  IF v_intruder > 0 THEN
    RAISE EXCEPTION '% ligne(s) d''applicabilité pointent un scheme non-distinction (vocabulaire de typologie)', v_intruder;
  END IF;

  -- (3) Le cas qui a motivé le registre : aucun classement d'hébergement sur un
  --     type du bucket Visites. Si ce test casse, le filtre reproposera
  --     « Classement hôtelier » sur un musée.
  SELECT string_agg(DISTINCT s.code || '→' || a.object_type::text, ', ') INTO v_leak
  FROM public.ref_classification_scheme_applicability a
  JOIN public.ref_classification_scheme s ON s.id = a.scheme_id
  WHERE s.code IN ('hot_stars', 'camp_stars', 'meuble_stars', 'residence_tourisme_stars',
                   'village_vacances_stars', 'prl_stars', 'clevacances_keys')
    AND a.object_type IN ('PCU', 'PNA', 'LOI', 'VIL');
  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'classement d''hébergement applicable à un type du bucket Visites : %', v_leak;
  END IF;

  RAISE NOTICE 'test_classification_scheme_applicability OK';
END $$;
