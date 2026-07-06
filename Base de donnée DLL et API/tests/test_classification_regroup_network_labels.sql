-- test_classification_regroup_network_labels.sql
-- Garde permanente pour le reclassement §175 : Gîtes de France (`gites_epics`) et
-- Clévacances (`clevacances_keys`) sont des LABELS de réseau privés, pas des
-- classements officiels de l'État (étoiles Atout France). Ils doivent vivre dans
-- le groupe d'affichage `quality_label` (comme « Logis », label-réseau comparable),
-- jamais dans `official_classification`.
--
-- Contexte : retour métier OTI 2026-07-06 — « classement » (registre pro) = le
-- classement officiel Atout France uniquement. Le regroupement pilote les en-têtes
-- de menu (filtre Explorer, Dashboard DistinctionOverview, sélecteur éditeur §08).
-- Aucun RPC ne branche sur `official_classification` (seuls sustainability_labels /
-- accessibility_labels sont testés en dur) ⇒ reclassement inerte pour la logique.
DO $$
DECLARE
  v_group_gites text;
  v_group_cle   text;
  v_leak        int;
BEGIN
  -- (1) Les deux labels-réseau portent bien le groupe quality_label.
  SELECT display_group INTO v_group_gites
  FROM public.ref_classification_scheme WHERE code = 'gites_epics';
  IF v_group_gites IS DISTINCT FROM 'quality_label' THEN
    RAISE EXCEPTION 'gites_epics display_group attendu quality_label, obtenu %', v_group_gites;
  END IF;

  SELECT display_group INTO v_group_cle
  FROM public.ref_classification_scheme WHERE code = 'clevacances_keys';
  IF v_group_cle IS DISTINCT FROM 'quality_label' THEN
    RAISE EXCEPTION 'clevacances_keys display_group attendu quality_label, obtenu %', v_group_cle;
  END IF;

  -- (2) Aucun label-réseau privé connu ne subsiste dans official_classification :
  --     ce groupe est réservé aux classements officiels de l'État (Atout France + OT).
  SELECT count(*) INTO v_leak
  FROM public.ref_classification_scheme
  WHERE display_group = 'official_classification'
    AND code IN ('gites_epics', 'clevacances_keys');
  IF v_leak <> 0 THEN
    RAISE EXCEPTION 'un label-réseau (gites_epics/clevacances_keys) subsiste dans official_classification (% ligne(s))', v_leak;
  END IF;

  RAISE NOTICE 'test_classification_regroup_network_labels: OK (gites_epics + clevacances_keys = quality_label)';
END $$;
