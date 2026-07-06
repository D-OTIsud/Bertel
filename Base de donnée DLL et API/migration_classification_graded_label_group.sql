-- migration_classification_graded_label_group.sql
-- §176 — Groupe dédié « Labels notés » (`graded_label`) pour les distinctions de
-- réseau privé qui NOTENT leurs membres sur une échelle numérique :
--   • gites_epics      — Gîtes de France (1→5 épis)
--   • clevacances_keys — Clévacances     (1→5 clés)
--   • logis            — Logis           (1→3 cheminées / 1→3 cocottes)
--
-- Pourquoi un 3ᵉ groupe : ce sont des objets CLASSÉS (notés), mais par un réseau
-- privé, pas par l'État. Ils ne sont donc ni des « Classements officiels »
-- (étoiles Atout France — display_group `official_classification`) ni des « Labels
-- qualité » binaires (obtenu/pas obtenu — `quality_label`). Retour métier OTI
-- 2026-07-06 : séparer les distinctions notées des labels binaires. Supersède le
-- placement §175 (gites/cleva étaient passés en `quality_label`) — ils rejoignent
-- ce groupe avec Logis.
--
-- Portée : DONNÉE de référence seule (colonne display_group), aucun DDL. `display_group`
-- ne pilote que les EN-TÊTES de regroupement (filtre Explorer « Distinctions »,
-- Dashboard DistinctionOverview, sélecteur éditeur §08). AUCUN RPC ne branche sur
-- `official_classification`/`quality_label`/`graded_label` (seuls `sustainability_labels`
-- et `accessibility_labels` sont testés en dur ; les autres partagent le bras
-- « tout le reste ») ⇒ inerte pour le filtrage (`classifications_any` matche les codes
-- `scheme:value`), le badge carte (code/label inchangés), la cocarde §133 et la barre
-- de niveaux §174. Idempotent. Foldé dans `seeds_data.sql` (⇒ no-op sur base fraîche).
-- Live-applied 2026-07-06. Couvert par `tests/test_classification_regroup_network_labels.sql`.

UPDATE ref_classification_scheme
SET display_group = 'graded_label'
WHERE code IN ('gites_epics', 'clevacances_keys', 'logis')
  AND display_group IS DISTINCT FROM 'graded_label';
