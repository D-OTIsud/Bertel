# Dashboard : même périmètre réel/test avec ou sans prestataire

La carte « À traiter » affichait 128 sans filtre et 3 avec prestataire : les anciennes
RPC d'activité additionnaient le réel et le test, alors que les nouvelles RPC
prestataires respectaient déjà le périmètre du compte. Les 125 éléments de test
correspondaient à 36 demandes récentes et 89 tâches ouvertes.

## Correction appliquée

Projet exclusif : Bertel V3, `ryycrdhlkmzpxwwwwupy`.
Migration appliquée : `20261030133440_dashboard_realm_consistency`.

- Les RPC globales CRM ouvert, activité CRM et activité d'équipe utilisent le
  périmètre retourné par `api.current_user_test_realm()`, comme leurs homologues
  prestataires. Les helpers privés communs fournissent le même corpus de départ.
- Une interaction rattachée seulement à un acteur reste comprise dans le mode
  global si cet acteur est du bon périmètre. Chaque ancrage renseigné doit être du
  bon périmètre ; une ligne orpheline ou incohérente est exclue.
- Le mode prestataires ajoute seulement les règles de rattachement existantes.
  Les statuts ouverts, la frontière de 90 jours, le temps net, les douze semaines
  et les calculs de jours-éditeur restent identiques. L'activité de saisie porte
  sur les objets touristiques hors ORG dans les deux modes.
- Les six KPI sur les fiches utilisaient déjà le moteur de filtres cloisonné.
  Aucun de leurs calculs n'a été modifié.

## Audit des historiques

Les anciens relevés n'avaient pas de colonne de périmètre. Le corpus excluait déjà
les tests dans la fonction installée, mais le backlog CRM, les classements,
l'accessibilité et la durabilité ne les excluaient pas systématiquement. Les
lecteurs servaient les mêmes relevés aux comptes réels et de test. Une attribution
rétroactive fiable de tous les relevés n'est donc pas possible.

`metric_snapshot.is_test` vaut maintenant `false` pour le réel, `true` pour le
test, et `NULL` pour les archives anciennes dont le découpage n'est pas garanti.
Les **6 564 lignes anciennes sont conservées sans modification**. L'unicité inclut
le périmètre, ce qui permet de garder les archives et les deux nouveaux relevés
pour une même date. La RLS et les deux RPC de lecture excluent les archives non
segmentées et l'autre périmètre.

La capture quotidienne existante conserve sa signature, son accès réservé et sa
planification ; elle calcule désormais les deux périmètres explicitement, sans
modifier les claims de l'appelant. Les nouveaux relevés commencent le
**30 octobre 2026**, avec une capture initiale des données courantes. Aucun passé
n'est reconstruit à partir des données d'aujourd'hui. La complétude conserve les
arrondis et la pondération du KPI vivant. L'historique du sous-ensemble
prestataires reste indisponible comme avant cette correction.

## Vérifications sur la base normale

- Une seule suite SQL ciblée exécutée sur Bertel V3, en transaction annulée :
  `Base de donnée DLL et API/tests/test_dashboard_realm.sql`. Elle vérifie les deux
  périmètres, les deux modes, les compteurs, les tranches et sujets CRM, chaque
  mois de flux, chaque semaine d'activité, la cohérence des relevés, l'idempotence
  de capture, la RLS et les droits d'exécution. Aucun utilisateur ni objet fictif
  n'est ajouté ; les captures du test sont annulées.
- Réel : **3 / 3** pour le grand compteur (2 demandes récentes + 1 tâche),
  **169 / 169** demandes ouvertes, dont 167 anciennes.
- Test : **125 / 125** pour le grand compteur (36 + 89), **270 / 270** demandes
  ouvertes. Ces égalités sont propres aux rattachements présents aujourd'hui.
- Les 12 réponses de KPI objets (six KPI, deux positions du toggle), dans chacun
  des deux périmètres, ont la même empreinte avant/après. L'activité prestataires
  existante conserve également ses réponses.
- Les cinq lecteurs `get_object_resource`, `get_object_with_deep_data`,
  `get_object_resource_adapted`, `get_object_resources_batch` et
  `get_object_cards_batch` gardent exactement leur définition et leurs droits.
- Contrôle TypeScript et 43 tests frontend ciblés réussis. Aucune base locale
  n'a été créée ou utilisée.

La chaîne `ci_fresh_apply.sql` applique cette migration après le filtre
prestataires et exécute la nouvelle garde de non-régression. Les tests des étapes
historiques antérieures restent placés avant le changement de contrat de périmètre.
