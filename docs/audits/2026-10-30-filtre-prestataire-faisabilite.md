# Audit du filtre prestataire sur Bertel V3

**État décrit : avant la migration.** Le filtre a ensuite été appliqué directement
sur Bertel V3 à la demande de l’utilisateur, sous la version `20261030123304`.
Voir le [compte rendu d’exécution](../releases/2026-10-30-filtre-prestataire.md)
pour l’état livré et la comparaison avant/après des lecteurs de fiches.

Le filtre est réalisable avec les tables et colonnes existantes. Un complément SQL est nécessaire pour filtrer les objets et les indicateurs d’activité. Les fonctions en place peuvent conserver leurs noms, leurs paramètres et leurs formats de réponse. Aucune suppression de données ou de fonction n’est nécessaire.

L’emplacement retenu reste celui validé dans la conversation : dans le bloc Catégorie, sous les choix de catégories, sur le dashboard et l’explorateur. Le choix est personnel et durable.

## Périmètre et preuves

Audit du 30 octobre 2026, sur le projet Supabase **Bertelv3**, référence `ryycrdhlkmzpxwwwwupy`. L’URL du projet a été vérifiée par le serveur MCP avant les requêtes. Le projet Espace prestataires reste hors périmètre.

Les constats distants proviennent de requêtes SELECT sur le catalogue PostgreSQL, les droits, les politiques RLS, les déclencheurs, l’historique de migrations et des comptages agrégés. Les sources des fonctions réellement installées ont été comparées à la préparation locale. Les données métier individuelles et les identifiants de connexion ne sont pas reproduits ici.

Les premiers comptages ont été effectués entre 13 h 54 et 14 h 04, heure de La Réunion. La base utilise UTC. Les chiffres constituent un état daté et ne sont pas des valeurs à figer dans les tests.

## Données déjà disponibles

`public.actor_object_role` relie un acteur à un objet avec un rôle, une priorité, une visibilité et des dates `valid_from` et `valid_to`. Les clés étrangères vers `actor`, `object` et `ref_actor_role` sont présentes. Le déclencheur `internal.guard_actor_object_realm()` interdit les liens entre un acteur de test et un objet réel, ou inversement. Aucun lien entre ces deux corpus n’a été trouvé.

Un critère calculé à partir de cette relation suffit. Il n’est pas nécessaire de créer une colonne `is_provider`, de recopier cette information sur chaque objet ni de modifier la vue matérialisée de recherche.

| Corpus hors objets ORG | Objets | Avec acteur actif tous rôles | Avec exploitant actif | Sans acteur actif |
| --- | ---: | ---: | ---: | ---: |
| Réel publié | 835 | 758 | 758 | 77 |
| Réel brouillon | 58 | 16 | 16 | 42 |
| Réel archivé | 18 | 16 | 16 | 2 |
| Test publié | 270 | 270 | 0 | 0 |

Les 270 objets de test possèdent un lien actif de rôle `content_editor`. Les liens réels sont tous de rôle `operator` au moment du contrôle : 804 liens pour 790 objets, tous statuts confondus. Quatorze objets réels ont chacun deux liens. Un filtre par simple jointure pourrait donc multiplier les lignes ; un prédicat `EXISTS` conserve une seule occurrence par objet.

La règle validée retient aussi les 270 fiches liées à un éditeur de contenu lorsqu’on consulte le corpus de test. La séparation réel/test continue de déterminer quel corpus l’utilisateur consulte.

## Définition du prestataire

Le référentiel contient cinq rôles : `operator`, `guide`, `sales_manager`, `receptionist` et `content_editor`. Aucun attribut ne désigne directement un acteur comme prestataire métier.

**Décision utilisateur du 30 octobre 2026 : tout acteur rattaché à la fiche suffit, quel que soit son rôle, y compris un éditeur de contenu.** Le filtre retient une fiche dès qu’elle possède au moins un lien acteur actif. Le lien n’a pas besoin d’être principal. Cette règle s’applique à la recherche, aux statistiques et aux variantes d’activité CRM.

La préparation locale correspond déjà à cette décision. Les cinq rôles existants et les éventuels rôles futurs sont traités de la même manière. Pour les données réelles au moment du contrôle, « tout acteur actif » et « exploitant actif » donnent le même résultat ; la colonne exploitant du tableau sert uniquement à documenter la répartition constatée.

Les dates peuvent être prises en compte avec des bornes inclusives, sans exiger un lien principal. Il faut employer la même date de référence dans tous les calculs. L’emploi de `CURRENT_DATE` dans la préparation suit la date UTC de la base ; les tests doivent couvrir la frontière de journée si la règle attendue est la date de La Réunion.

## Recherche et indicateurs sur les objets

La fonction installée `api.get_filtered_object_ids(jsonb, object_type[], object_status[], text)` ne traite aucune clé de filtre prestataire et ne consulte pas `actor_object_role`.

Une vérification sur les ensembles réels publiés a donné :

| Appel actuel | Résultat |
| --- | ---: |
| Filtres vides | 835 objets |
| `has_provider=true` | Les mêmes 835 objets |
| Intersection avec les liens exploitant actifs | 758 objets |

La règle validée « tout acteur actif » donne également 758 fiches réelles publiées au moment de l’audit, puisque tous leurs liens acteurs sont de rôle `operator`.

Envoyer seulement une nouvelle clé depuis l’interface ne suffit donc pas. Il faut compléter cette fonction, en conservant sa signature et ses quatre colonnes de sortie : `object_id`, `label_rank`, `label_match`, `relevance`.

Onze fonctions installées font référence à ce moteur :

- Les six statistiques `get_dashboard_scorecards`, `get_dashboard_type_breakdown`, `get_dashboard_completeness`, `get_dashboard_actualisation`, `get_dashboard_city_distribution` et `get_dashboard_distinction_overview`.
- La pagination `list_object_resources_filtered_page` et les marqueurs `list_object_markers`.
- La synchronisation `list_object_resources_filtered_since_fast` et la carte `list_objects_map_view`.
- Le résolveur de listes dynamiques `internal.resolve_list_object_ids`, qui transmet les filtres stockés au même moteur.

Un seul complément central couvre ces chemins. Il n’est pas nécessaire de créer six nouvelles fonctions statistiques ou de réécrire la pagination. Les filtres déjà disponibles, le classement des résultats, le repli de recherche approximative et la séparation réel/test du moteur restent à conserver. La sonde de recherche approximative ignore volontairement les facettes dans le code actuel ; son comportement ne doit pas être modifié implicitement par ce chantier.

Quand la clé est absente ou désactivée, les ensembles retournés doivent rester identiques. Le lien prestataire est évalué à la lecture ; un changement de relation n’exige pas d’ajouter un cache de prestataires.

## Préférence personnelle

`public.app_user_profile.preferences` existe en JSONB. Les treize profils examinés y contiennent un objet JSON. Les droits effectifs sur la colonne autorisent sa mise à jour par un utilisateur authentifié ; les politiques SELECT et UPDATE limitent l’accès à son profil ou à un propriétaire de plateforme. Le contrôle a porté sur les droits par colonne, en plus de la RLS.

Le service existant `updateCurrentUserProfile` accepte déjà un champ `preferences`. La synchronisation installée `api.sync_app_user_profile_from_auth_user` conserve les préférences existantes dès que leur objet JSON n’est plus vide. Un choix `provider_only=false` reste lui aussi un objet non vide et n’est donc pas réinitialisé par cette synchronisation.

Deux solutions sont possibles sans nouvelle colonne :

| Solution | Conséquence |
| --- | --- |
| Réutiliser la mise à jour du profil | Aucune nouvelle RPC de préférence ; lire et conserver les autres clés lors de l’écriture. Une lecture suivie d’une réécriture complète peut écraser une autre modification concurrente. |
| Garder la petite RPC de fusion atomique préparée localement | Ajout facultatif d’une fonction, sans nouveau droit sur les profils. Elle modifie uniquement `provider_only` et conserve les autres clés au moment de l’écriture. |

La seconde solution réduit le risque de perte de préférences concurrentes. Elle n’est pas un prérequis imposé par le schéma. Elle doit rester `SECURITY INVOKER`, cibler uniquement `auth.uid()` et refuser un utilisateur absent ou une valeur nulle. La fusion JSONB doit conserver un objet JSON ; les règles de [concaténation JSONB de PostgreSQL](https://www.postgresql.org/docs/current/functions-json.html) diffèrent pour les tableaux et les valeurs scalaires.

Le chargement doit restaurer le choix du compte avant les premières requêtes filtrées. Une erreur d’enregistrement doit être visible et ne doit pas être présentée comme un choix mémorisé. Les URL partagées peuvent porter un périmètre temporaire sans modifier la préférence du compte. Les anciens liens sans ce critère héritent de la préférence.

## Activité et échanges CRM

Les fonctions installées `api.get_dashboard_crm_open()`, `api.get_dashboard_crm_activity()` et `api.get_dashboard_team_activity()` sont sans paramètre et lisent des ensembles globaux. Elles ne passent pas par le moteur de filtres des objets. Compléter ce moteur seul ne les filtrera pas.

Pour leur ajouter le périmètre prestataire tout en gardant les appels existants, les trois variantes préparées `get_dashboard_provider_crm_open`, `get_dashboard_provider_crm_activity` et `get_dashboard_provider_team_activity` sont une solution compatible. Les fonctions actuelles restent disponibles. Les variantes doivent conserver les formats JSON et les formules existantes : statuts ouverts, tranches d’âge, flux mensuel, délai net hors attente prestataire, semaines vides à zéro, jours éditeur et seuil des journées de masse.

La définition commune des objets prestataires doit alimenter ces variantes. Les autres facettes du dashboard ne filtrent pas l’activité aujourd’hui ; étendre aussi les catégories et périodes à ces indicateurs serait un changement distinct.

Les interactions peuvent être liées uniquement à un acteur : le corps installé de `save_crm_interaction` autorise cet usage. Leur inclusion dans le périmètre doit donc être définie. La préparation conserve une interaction sans objet si son acteur possède un lien actif qualifiant vers une fiche du périmètre. Lorsqu’un objet est renseigné, cet objet décide ; un lien du même acteur vers une autre fiche ne doit pas faire entrer l’interaction.

Pour les tâches, le contrat actuel diffère : `save_crm_task` exige un `object_id` à la création. Les 154 tâches présentes ont toutes un objet. Le filtrage par objet respecte donc les usages actuellement pris en charge. Ajouter la création de tâches uniquement liées à un acteur n’est pas nécessaire à ce chantier.

## Mélange des données réelles et de test

Les trois fonctions d’activité existantes sont `SECURITY DEFINER` et ne portent pas de condition de corpus réel/test dans leurs sources. Les politiques RLS des tables ne réalisent donc pas cette séparation à leur place.

La lecture de `get_dashboard_crm_open()` a confirmé les valeurs suivantes :

| Éléments ouverts | Réel | Test | Total retourné |
| --- | ---: | ---: | ---: |
| Interactions | 169 | 270 | 439 |
| Tâches | 1 | 89 | 90 |
| Ensemble | 170 | 359 | 529 |

Les 3 158 interactions et les 19 tâches réelles, tous statuts confondus, appartiennent déjà à des objets avec exploitant actif. Le nouveau filtre ne réduirait donc pas ces ensembles réels aujourd’hui. Il réduirait bien le corpus des fiches publiées de 835 à 758. La baisse des compteurs CRM globaux vers 170 viendrait ici de l’exclusion des tests.

Ce défaut de séparation préexiste au toggle. Il doit être traité avant ou avec la livraison, par une correction explicitement identifiée des fonctions concernées, en gardant leurs signatures et leurs calculs métier. Ajouter seulement les variantes prestataires ne corrigerait pas le résultat du mode désactivé. Aucune correction distante n’a été effectuée pendant cet audit.

Les variantes prestataires préparées possèdent déjà une sélection d’objets par `api.current_user_test_realm()`. Cette protection est à conserver, ainsi que les restrictions d’exécution des fonctions internes et l’interdiction des RPC dashboard aux appels anonymes. Aucune ouverture des politiques RLS n’est nécessaire.

## Courbes historiques

`metric_snapshot` contient les périmètres `global`, `type`, `status` et `commune`, avec des relevés du 19 juin au 30 octobre 2026. Aucun relevé prestataire n’est présent.

Les totaux enregistrés ne contiennent pas les identifiants des objets qui les composaient. Ils ne permettent pas, à eux seuls, de reconstruire les anciennes courbes prestataires. Appeler le collecteur actuel avec des dates passées ne résout pas cela : il mesurerait l’état actuel sous une date ancienne.

La table possède déjà des champs texte `scope` et `scope_key`, sans contrainte qui imposerait ces quatre valeurs. La fonction de lecture `get_metric_snapshot_series` filtre sur ces champs sans liste fermée. Une nouvelle collecte peut donc utiliser la même table, avec un périmètre prestataire et une distinction réel/test, tout en conservant les relevés globaux et les RPC de lecture existants. Le raccordement côté interface devra accepter ce nouveau périmètre.

La préparation locale affiche pour l’instant un état explicite d’historique indisponible lorsque le toggle est actif. Ce choix évite d’afficher la courbe globale sous un filtre prestataire. Pour disposer d’une courbe filtrée, il faut ajouter la collecte dédiée ; aucune donnée historique existante n’a besoin d’être supprimée.

## Migration locale et compatibilité

La préparation [20261030123304_provider_scope_preference.sql](../../supabase/migrations/20261030123304_provider_scope_preference.sql) n’est pas déployée. Les six fonctions qu’elle prévoit d’ajouter sont absentes du catalogue distant, et sa version n’est pas dans l’historique Supabase.

Elle contient un index, une fonction de préférence, deux fonctions internes, trois variantes dashboard et un complément de la fonction commune. Elle ne contient aucune suppression de table, colonne, fonction ou donnée métier. Son point d’insertion dans la définition installée de `get_filtered_object_ids` est présent une seule fois.

La règle de rôle est désormais validée et correspond à la préparation locale. La migration doit toutefois être finalisée après la décision de date métier, le traitement du mélange réel/test et le choix de collecte historique. Sa présence locale et les tests isolés déjà disponibles ne suffisent pas à la déclarer prête pour la production.

La mise à jour de la fonction commune doit conserver son identité, son propriétaire, ses droits et ses paramètres d’exécution. [PostgreSQL conserve le propriétaire, les droits et les dépendances lors d’un CREATE OR REPLACE de même signature](https://www.postgresql.org/docs/current/sql-createfunction.html), mais les autres propriétés viennent de la nouvelle définition : le mode de sécurité et le `search_path` doivent donc être repris explicitement. Aucun DROP suivi d’une recréation n’est requis.

Empreintes MD5 des corps installés au début de l’audit :

| Fonction | Empreinte |
| --- | --- |
| `api.get_filtered_object_ids` | `3d46f26d568ec24804b69ff3916abd87` |
| `api.get_dashboard_crm_open` | `ee7e41e8864590e32ce9b34a9eb9e32e` |
| `api.get_dashboard_crm_activity` | `b065bca9ed3c0cb1e20b59daa7757cde` |
| `api.get_dashboard_team_activity` | `ae3d4706ff5bb0c4e0c26aabd140af9b` |

Ces empreintes servent à détecter une évolution depuis cet audit, sans remplacer la sauvegarde des définitions et des droits avant livraison.

L’historique distant contient 176 migrations ; le dossier local contient 26 fichiers. Douze versions locales, dont la préparation prestataire, ne figurent pas sous le même numéro dans l’historique distant. Cela ne prouve pas que leurs effets sont absents : les protections de corpus des acteurs sont installées alors que le numéro du fichier local correspondant ne figure pas dans cet historique. La livraison doit donc être ciblée et contrôler ses prérequis. Un envoi général de tous les fichiers locaux n’est pas une méthode de livraison validée par cet audit.

L’index proposé sur `actor_object_role` est facultatif pour la correction fonctionnelle. Les index actuels sont la clé primaire commençant par `actor_id` et un index partiel par objet/rôle limité aux liens principaux. Le choix d’un index adapté au nouveau prédicat doit suivre une mesure sur une copie représentative ; aucun gain de performance n’est établi ici.

## Vérifications avant livraison

1. Employer la règle validée « au moins un acteur actif, quel que soit son rôle » dans la recherche, les statistiques et l’activité, puis finaliser leur date de référence commune.
2. Finaliser la migration ciblée et conserver les définitions et droits antérieurs pour le retour arrière. Contrôler l’état distant juste avant application.
3. Appliquer et rejouer la migration sur un environnement isolé portant le schéma complet, ses extensions PostGIS, ses droits et ses déclencheurs. Le modèle PGlite existant réduit les facettes de recherche et ne constitue pas ce contrôle complet.
4. Comparer les résultats sans critère et avec critère désactivé, les formats JSON, la pagination, les marqueurs, la synchronisation et les listes dynamiques. Conserver la recherche et les filtres existants.
5. Couvrir les liens multiples, l’inclusion de chaque rôle dont `content_editor`, les dates, les deux corpus, les interactions uniquement liées à un acteur et les contrats actuels des tâches. Comparer les formules CRM et d’activité aux références existantes.
6. Vérifier la préférence sur deux comptes et après reconnexion, les autres clés JSON, les erreurs d’écriture et les liens partagés. Les écritures de préférence n’ont pas été testées sur la production pendant cet audit.
7. Mesurer les plans de recherche et de statistiques avant de retenir l’index. Vérifier l’exécution anonyme et authentifiée ainsi que l’isolation réel/test.
8. Préparer l’ordre SQL puis interface, le rechargement du cache de l’API et le retour arrière. Pour la fonction commune, le retour arrière restaure son ancienne définition ; les préférences et les anciennes données restent conservées. Régénérer le graphe de base après une modification effective du schéma.

Pendant cet audit, seules des lectures distantes et de la documentation locale ont été effectuées. Aucune migration n’a été exécutée sur Bertel V3.
