# Réintégration de l'historique fiable de remplissage

La correction du périmètre réel/test avait exclu toutes les archives non marquées.
Le remplissage a été examiné séparément pour restaurer ses observations fiables.
L'affichage comptait également depuis le lundi du premier bucket hebdomadaire,
ce qui transformait le seul relevé du vendredi 30 octobre en quatre jours.

Projet : Bertel V3 uniquement, `ryycrdhlkmzpxwwwwupy`.
Migration appliquée : `20261030141523_restore_verified_completeness_history`.

## Provenance et sélection

- Le journal des objets remonte au 11 avril 2026. Son premier événement de test
  est le 4 septembre 2026 à 07:18:02, heure de La Réunion, comme la date de création des 270 fiches
  de test actuellement présentes.
- La capture quotidienne de 07:00, heure de La Réunion, passe par
  `api.get_dashboard_completeness(NULL, ARRAY['published'], '{}', ...)` et le
  moteur commun, dont ce cas utilise la vue matérialisée des fiches publiées.
  Le compte de capture était réservé à `postgres` et `service_role`.
- L'installation transactionnelle `migration_test_org_isolation.sql` ajoute le
  marquage et recrée cette vue avec `o.is_test = false` avant le semis de test.
  Avant ce semis, aucun objet officiel de test n'apparaît dans le journal.
- Les **133 journées archivées** ont été vérifiées : même instant de capture,
  dénominateur égal au corpus publié, somme des effectifs par type identique,
  moyenne globale égale à la moyenne pondérée des types. Aucun écart n'a été trouvé.
  Les pourcentages de complétude portent aussi les mêmes dénominateurs et instants
  que leurs moyennes par type ; aucun couple incohérent n'a été trouvé.

La migration sélectionne les **132 journées du 19 juin au 29 octobre** par leurs
identifiants de source et l'empreinte de tous leurs relevés de remplissage.
Elle recontrôle les empreintes et le dénominateur publié avant toute copie.
Ces identifiants de production ne créent aucune donnée dans une base fraîche.

**3 224 observations** `completeness_avg` et `completeness_complete_pct`, globales
ou par type, sont copiées dans le réel avec leurs valeurs, dénominateurs et dates
de capture d'origine. Aucune capture ancienne n'est recalculée avec les données
d'aujourd'hui. Une journée déjà présente dans le périmètre réel est entièrement
conservée : cela évite de mélanger les états de deux captures du même jour.
Le 30 octobre garde donc son relevé actuel. La migration peut être rejouée sans
écraser les observations déjà classées.

Les **6 564 archives d'origine** restent intactes. Leurs lignes ne sont ni modifiées
ni supprimées. Les **118 observations réel/test actuelles** gardent aussi la même
empreinte. Aucun autre indicateur ancien ni aucun relevé de test n'est réattribué.

## Dates de la courbe

La nouvelle RPC invoker `api.get_metric_snapshot_series_with_bounds` renvoie les
points de l'ancienne RPC, plus `first_snapshot_date` et `last_snapshot_date`,
calculés sur la même métrique, la même période et le même périmètre réel/test.
La RLS reste active et l'accès anonyme est révoqué. L'ancienne RPC tabulaire et
son type de retour restent disponibles sans changement.

Le graphique garde ses points hebdomadaires. La durée correspond à l'écart en
jours entre les dates sources, sans utiliser les lundis des buckets ni l'horloge
du navigateur. Pour un seul jour de données, la carte indique « Premier relevé
disponible — l’historique débute. ». La clé de cache distingue le nouveau contrat.
Les états de chargement et le changement de métrique conservent leur comportement.

Résultat observé le 30 octobre 2026 :

- Réel : 133 relevés quotidiens disponibles, du 19 juin au 30 octobre ; 20 points
  hebdomadaires et **133 jours écoulés entre les dates sources**.
- Test : un relevé du 30 octobre ; aucune reprise de l'historique réel.
- Les historiques des autres métriques restent séparés à partir du 30 octobre.
  L'historique du sous-ensemble prestataires reste indisponible, comme auparavant.

## Vérification

Une suite SQL ciblée a été exécutée sur la base normale, avec fixtures d'agrégats
et transaction annulée : `tests/test_completeness_history.sql`. Elle vérifie les
dates réelles face aux buckets, les plages demandées, le cas vide, les deux
périmètres sous le rôle `authenticated`, la RLS, les droits et la compatibilité
avec les points de l'ancienne RPC.

Les copies ont été comparées à toutes leurs sources : aucun écart de valeur,
dénominateur, date ou contenu. Les empreintes des archives, des relevés actuels
et des cinq fonctions de chargement des fiches et de leurs droits restent identiques.
Les compteurs CRM gardent 3 en réel et 125 en test dans les deux modes.

Contrôles TypeScript, 45 tests frontend ciblés et compilation de production
réussis sur la version intégrant `35564dc` (PR de simplification #71).
Aucun nouveau signalement des conseillers de sécurité. Les graphes de code et de
base sont actualisés. Les preuves agrégées sont dans
`2026-10-30-completeness-history-verification.json`.
