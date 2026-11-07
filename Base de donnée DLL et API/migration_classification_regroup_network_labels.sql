-- migration_classification_regroup_network_labels.sql
-- §175 — Reclasser Gîtes de France (`gites_epics`) et Clévacances (`clevacances_keys`)
-- du groupe `official_classification` vers `quality_label`.
--
-- Pourquoi : ce sont des LABELS de réseau privés (avec leur propre grille en épis /
-- en clés), PAS des classements officiels de l'État (étoiles Atout France). Les
-- ranger sous « Classements » (registre pro : « le classement » = Atout France seul)
-- prêtait à confusion — retour métier OTI 2026-07-06. « Logis » (label-réseau
-- comparable) est déjà en quality_label : ce reclassement aligne les deux dessus.
--
-- Portée : DONNÉE de référence uniquement (colonne display_group), pas de DDL.
-- `display_group` pilote les EN-TÊTES de regroupement (filtre Explorer, Dashboard
-- DistinctionOverview, sélecteur éditeur §08). Aucun RPC ne branche sur
-- `official_classification` (seuls `sustainability_labels`/`accessibility_labels`
-- sont testés en dur ; official/quality partagent le même bras « tout le reste »)
-- ⇒ inerte pour le filtrage, le badge carte (code/label), la cocarde §133 et la
-- barre de niveaux §174. Idempotent. Foldé dans `seeds_data.sql` (⇒ no-op sur une
-- base fraîche). Live-applied 2026-07-06. Couvert par
-- `tests/test_classification_regroup_network_labels.sql`.

UPDATE ref_classification_scheme
SET display_group = 'quality_label'
WHERE code IN ('gites_epics', 'clevacances_keys')
  AND display_group IS DISTINCT FROM 'quality_label';
