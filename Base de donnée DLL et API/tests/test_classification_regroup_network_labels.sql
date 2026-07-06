-- test_classification_regroup_network_labels.sql
-- Garde permanente pour le regroupement §175→§176 des distinctions de réseau privé.
--
-- État final (§176) : Gîtes de France (`gites_epics`, épis 1-5), Clévacances
-- (`clevacances_keys`, clés 1-5) et Logis (`logis`, cheminées/cocottes 1-3) sont des
-- objets CLASSÉS (notés) par un réseau PRIVÉ — pas par l'État. Ils vivent dans le
-- groupe dédié `graded_label` (« Labels notés »), JAMAIS dans `official_classification`
-- (classement officiel Atout France) ni dans `quality_label` (labels binaires).
--
-- Contexte : retour métier OTI 2026-07-06. `display_group` pilote les en-têtes de
-- regroupement (filtre Explorer « Distinctions », Dashboard DistinctionOverview,
-- sélecteur éditeur §08). Aucun RPC ne branche sur ces groupes (seuls
-- sustainability_labels / accessibility_labels sont testés en dur) ⇒ regroupement
-- inerte pour la logique de filtrage/badge/cocarde/barre de niveaux.
DO $$
DECLARE
  v_graded int;
  v_leak   int;
BEGIN
  -- (1) Les trois labels-réseau notés portent bien le groupe graded_label.
  SELECT count(*) INTO v_graded
  FROM public.ref_classification_scheme
  WHERE display_group = 'graded_label'
    AND code IN ('gites_epics', 'clevacances_keys', 'logis');
  IF v_graded <> 3 THEN
    RAISE EXCEPTION 'attendu 3 labels notés en graded_label (gites_epics/clevacances_keys/logis), obtenu %', v_graded;
  END IF;

  -- (2) Aucun ne subsiste dans official_classification (réservé au classement
  --     officiel de l'État) ni dans quality_label (labels binaires).
  SELECT count(*) INTO v_leak
  FROM public.ref_classification_scheme
  WHERE display_group IN ('official_classification', 'quality_label')
    AND code IN ('gites_epics', 'clevacances_keys', 'logis');
  IF v_leak <> 0 THEN
    RAISE EXCEPTION 'un label noté (gites_epics/clevacances_keys/logis) subsiste hors graded_label (% ligne(s))', v_leak;
  END IF;

  -- (3) official_classification reste les classements OFFICIELS gradués de l'État.
  IF NOT EXISTS (
    SELECT 1 FROM public.ref_classification_scheme
    WHERE code = 'hot_stars' AND display_group = 'official_classification'
  ) THEN
    RAISE EXCEPTION 'hot_stars devrait rester en official_classification';
  END IF;

  RAISE NOTICE 'test_classification_regroup_network_labels: OK (gites_epics + clevacances_keys + logis = graded_label)';
END $$;
