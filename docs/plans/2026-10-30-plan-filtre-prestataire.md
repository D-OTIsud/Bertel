# Plan d’exécution du filtre prestataire sur Bertel V3

**Consigne et exécution ultérieures du 30 octobre 2026 :** l’utilisateur a demandé
de travailler directement sur Bertel V3 avec des contrôles ciblés, sans base
locale ni base isolée. Le filtre, la préférence et les trois RPC prestataires ont
été appliqués sous la version `20261030123304`. Les contrôles avant/après des
lecteurs de fiches et les résultats sont dans le
[compte rendu d’exécution](../releases/2026-10-30-filtre-prestataire.md).
Les nouvelles courbes historiques, leur lien de consultation proposé et le
correctif des anciennes RPC globales n’ont pas été inclus dans ce lot ciblé.
Le plan initial ci-dessous reste une trace de la proposition antérieure.

Plan préparé le 30 octobre 2026 à partir de l’[audit de la base réelle](../audits/2026-10-30-filtre-prestataire-faisabilite.md) et des décisions utilisateur. Ce document prépare l’exécution ; il ne déclenche aucune modification de l’application ou de la base.

La cible est **Bertelv3**, projet `ryycrdhlkmzpxwwwwupy`. Les étapes distantes portent uniquement sur ce projet. Espace prestataires reste hors périmètre.

## Résultat attendu et choix retenus

| Sujet | Règle du plan |
| --- | --- |
| Emplacement validé | Toggle dans le bloc Catégorie, sous les choix de catégories, sur le dashboard et l’explorateur. |
| Définition validée | Une fiche est retenue dès qu’elle possède un lien acteur actif, quel que soit le rôle, y compris `content_editor`. Un lien secondaire suffit. |
| Dates proposées | Bornes inclusives, dates absentes non restrictives, date de référence calculée dans `Indian/Reunion` pour ce nouveau critère. Les autres calculs de dates existants gardent leur règle. |
| Compte utilisateur | Choix partagé entre les deux écrans et mémorisé dans `app_user_profile.preferences.provider_only`. Défaut désactivé pour un compte sans préférence. |
| Écriture retenue | Garder la petite RPC de fusion atomique, qui modifie uniquement cette clé et préserve la RLS du profil. |
| Compatibilité | Conserver les noms, arguments, sorties, propriétaires et droits des fonctions existantes. Ajouter les variantes prestataires. |
| Réel et test | Appliquer le corpus de la session aux indicateurs avec et sans filtre prestataire. Le serveur détermine ce corpus. |
| Historique proposé | Ajouter des relevés pour les nouveaux périmètres dans `metric_snapshot`, à partir de la mise en service. Conserver les anciens relevés et leur lecture. |

La livraison comprend le filtre, sa préférence, la correction du mélange réel/test et la cohérence des nouvelles courbes. Elle conserve les tables et colonnes actuelles. L’extension des autres filtres de catégories ou de période aux indicateurs d’activité reste un chantier distinct.

La préparation locale existante est une base à finaliser : elle ne doit pas être réécrite intégralement ni appliquée telle quelle.

## Étape 1 Préparer le lot et son état de référence

1. Sauvegarder les modifications locales et distinguer les fichiers du filtre des autres travaux en cours. Préparer un environnement de travail isolé et une branche `codex/filtre-prestataire` à partir d’un état fidèle du projet courant. Un départ du seul HEAD ne doit pas faire perdre les dépendances locales nécessaires.
2. Recontrôler l’identité du projet avant toute opération distante. Relire les définitions, signatures, droits, paramètres de sécurité, index, déclencheurs et dépendances des fonctions concernées.
3. Rapprocher les versions de migrations locales et distantes. Les écarts relevés dans l’audit ne justifient ni de rejouer toutes les migrations locales ni de réparer leur historique automatiquement.
4. Capturer les résultats de référence et les définitions SQL nécessaires au retour arrière. Vérifier le chemin de sauvegarde et de restauration du projet.
5. Relever le collecteur historique et sa planification effective, en limitant la lecture aux informations utiles. Identifier les appels qui comparent aujourd’hui le compteur CRM à la série `global`.

**Livrable :** inventaire ciblé, état de référence daté, liste exacte des fichiers du lot et procédure de retour arrière préparée. Une évolution distante depuis l’audit entraîne une nouvelle comparaison avant modification.

## Étape 2 Préparer les changements SQL compatibles

### Filtre commun des objets

Compléter `api.get_filtered_object_ids` avec le critère `has_provider=true`, fondé sur un `EXISTS` dans `actor_object_role`. La date de validité est celle retenue pour le nouveau filtre. Plusieurs liens doivent conserver une seule occurrence de la fiche.

La clé absente ou désactivée laisse le résultat du moteur inchangé. Préserver la recherche exacte et approximative, les autres facettes, les statuts, le classement, les quatre colonnes de sortie et les chemins réel/test déjà présents.

Les onze fonctions appelantes héritent du critère : six statistiques dashboard, pagination, marqueurs, synchronisation, carte et listes dynamiques. Vérifier aussi l’ordre de création sur une base neuve : une fonction SQL ne doit pas référencer un nouveau helper créé plus tard dans le manifeste.

### Préférence du compte

Finaliser `api.set_provider_only_preference(boolean)` en `SECURITY INVOKER`. Cibler uniquement le compte authentifié, valider le booléen et le profil, fusionner la clé dans l’objet JSON et confirmer la valeur enregistrée. Les autres clés, les rôles et le lien compte/acteur restent conservés.

### Activité réelle et de test

Corriger la sélection des sources dans les trois RPC existantes :

- `get_dashboard_crm_open()` ;
- `get_dashboard_crm_activity()` ;
- `get_dashboard_team_activity()`.

Leurs signatures et formats JSON restent identiques. La différence attendue porte sur l’exclusion du corpus opposé. Les statuts ouverts, les fenêtres de calcul, les délais nets, les jours éditeur et les autres formules restent conservés. Les sources doivent garder les types d’objets et statuts admis auparavant ; le correctif de corpus ne doit pas ajouter d’autres restrictions.

Pour les interactions, réutiliser la règle de corpus des ancrages objet/acteur et ses helpers existants lorsque leurs droits et leur coût conviennent. Pour l’activité éditoriale, vérifier les versions et leurs liens vers les objets, y compris les cas de suppression, avant de retenir la jointure de corpus. Toute différence de résultat supplémentaire doit être expliquée par une fixture ou une lecture de référence.

### Variantes prestataires

Finaliser les trois nouvelles RPC `get_dashboard_provider_crm_open`, `get_dashboard_provider_crm_activity` et `get_dashboard_provider_team_activity`. Leur sélection d’entrée ajoute la règle prestataire au corpus de la session ; leurs calculs et sorties suivent les RPC de référence corrigées.

Une interaction avec objet suit cet objet. Une interaction sans objet entre dans le périmètre si son acteur possède un lien actif vers une fiche qualifiante. Les tâches suivent leur objet, conformément au contrat actuel de création.

Les helpers internes restent privés. Les RPC dashboard restent réservées aux rôles autorisés. Les fonctions qui s’exécutent avec les privilèges de leur propriétaire doivent porter explicitement la sélection de corpus ; elles ne peuvent pas compter sur la RLS des tables pour la réaliser.

### Index et organisation des migrations

Mesurer le coût du nouveau prédicat avant de retenir l’index proposé. Le retirer de la préparation s’il n’est pas justifié ; cela ne supprime aucun index installé. Si un index est utile, choisir ses colonnes et son mode de création selon les mesures et le volume réel.

Finaliser la migration locale du filtre, puis générer les éventuels fichiers complémentaires avec la CLI Supabase au moment de l’implémentation. Garder les corrections de corpus et la collecte historique identifiables dans la revue, avec leurs dépendances et leur retour arrière. Reporter les changements dans les sources canoniques et dans le manifeste de création complète.

**Livrable :** migrations ciblées, sources canoniques cohérentes, contrats comparés et scripts de vérification/retour arrière. Cette étape prépare les fichiers sans appliquer la production.

## Étape 3 Ajouter une collecte historique cohérente

Conserver les anciens scopes `global`, `type`, `status` et `commune`, leurs données et leurs contrats de lecture. Ajouter un scope dédié aux séries du dashboard contextualisées, par exemple `dashboard_context`, avec des clés distinctes pour réel/test et tous objets/avec acteur. Les noms définitifs seront fixés dans la migration et le contrat client du lot.

Le nouveau collecteur doit :

1. Mesurer séparément les corpus réel et test, avec et sans le critère prestataire, à partir de règles de sélection communes aux compteurs.
2. Produire au minimum les quatre métriques affichées dans les widgets actuels : `completeness_avg`, `classified_count`, `corpus_count` et `crm_backlog`. Conserver leurs définitions métier et leurs dénominateurs ; les différences historiques de corpus ou de statut doivent rester explicites.
3. Déterminer la date du relevé selon la date métier retenue et rendre le rejeu du jour idempotent.
4. Utiliser des calculs internes explicitement paramétrés pour les deux corpus, sans fabriquer une session utilisateur pour contourner les droits.
5. Être intégré à une planification vérifiée. Conserver la collecte historique existante ; ne pas écraser d’anciens relevés avec les chiffres actuels.

Étendre les lecteurs de séries nécessaires sans changer leurs signatures ni leurs sorties. Pour les nouveaux scopes, résoudre ou contrôler le corpus côté serveur. L’interface ne choisit pas librement un corpus opposé par un paramètre de lecture.

La correction du compteur CRM et cette collecte doivent être validées ensemble. Les tests qui associent actuellement la carte à `global` devront viser la nouvelle série réellement affichée, en gardant l’assertion d’égalité et la vérification du prédicat des statuts. Tester séparément la compatibilité des anciens scopes.

**Livrable :** collecte, lecture et planification testées. Les séries filtrées commencent à leur première capture ; les dates antérieures restent sans valeur pour ce nouveau périmètre.

## Étape 4 Finaliser l’interface approuvée

Réutiliser le toggle et les composants préparés localement. Conserver les styles, dimensions, couleurs et interactions de Bertel.

- Position : sous les boutons de catégories, à l’intérieur du même bloc.
- Libellé : « Avec prestataire uniquement ».
- Aide : « Choix mémorisé pour votre compte ».
- États : activé/désactivé, sauvegarde en cours, erreur visible avec possibilité de réessayer ; commande utilisable au clavier et sur mobile.

Restaurer la préférence avant les premières requêtes. Vérifier les déconnexions, changements de compte, renouvellements de session et erreurs de lecture du profil. Une préférence indisponible ne doit pas être présentée comme chargée ou enregistrée avec succès.

Partager le choix explicite entre le dashboard et l’explorateur, tout en conservant leurs autres filtres indépendants. La réinitialisation des filtres de recherche conserve ce choix personnel. Une URL peut remplacer temporairement le périmètre de l’explorateur sans enregistrer une nouvelle préférence ; un ancien lien sans le critère hérite du choix du compte.

Les listes dynamiques et le passage dashboard → explorateur conservent le critère. Les clés de cache doivent distinguer le périmètre et le contexte de session. Une ancienne série globale ne doit jamais apparaître sous le libellé du nouveau périmètre pendant le chargement : limiter `keepPreviousData` aux contextes compatibles.

### Proposition complémentaire pour l’historique

Afficher les nouvelles séries correspondant au contexte courant. Avant la première capture, afficher « Historique disponible à partir de la première collecte » ; une absence de données ne vaut pas zéro.

Pour conserver l’accès à l’ancien historique, proposer sous le widget un lien discret « Consulter l’historique global antérieur ». Cette consultation réutilise le graphique avec la mention « Historique global non filtré, incluant les données de test ». Elle ne modifie ni le toggle ni la préférence. Cette petite extension est une proposition du présent plan ; elle n’a pas été appliquée.

**Livrable :** aperçu fonctionnel fidèle à l’emplacement validé, avec les comportements de préférence, de chargement et d’historique vérifiables.

## Étape 5 Valider sur un environnement isolé complet

Reproduire le chemin existant de `.github/workflows/sql-fresh-apply.yml` : une base Supabase locale complète, PostgreSQL 17, Auth, Storage, rôles, extensions et manifeste `ci_fresh_apply.sql`. Ne pas démarrer ce contrôle en appliquant automatiquement tous les patchs incrémentaux du dossier local.

Exécuter deux parcours : installation neuve et mise à niveau d’un état de schéma représentatif de Bertel V3. Vérifier le rejeu et le retour arrière. Le harnais PGlite existant reste utile pour les calculs isolés ; il complète ce contrôle et ne le remplace pas.

| Vérification | Critère de réussite |
| --- | --- |
| Compatibilité du moteur | Même résultat et même ordre sans clé ou avec `has_provider=false`, pour les mêmes données et le même contexte. |
| Règle prestataire | Inclusion de chacun des rôles, dont `content_editor`, liens secondaires et multiples ; exclusion des liens futurs/expirés ; bornes et minuit Réunion couverts. |
| Fonctions dépendantes | Pagination sans doublons, marqueurs cohérents, filtres combinés, recherche, synchronisation et listes dynamiques corrects. |
| Activité | Calculs conservés, interactions uniquement liées à un acteur couvertes, tâches inchangées, semaines vides à zéro et délai net vérifié. |
| Corpus | Fixtures présentes dans les deux corpus ; chaque persona reçoit seulement son corpus, avec le toggle actif ou inactif. |
| Préférences | Reconnexion, deux comptes, autres clés JSON, concurrence et erreurs ; aucun enregistrement sur le compte précédent après changement de session. |
| Historique | Compteur et relevé concordants à données figées et périmètre comparable ; ancien scope préservé, nouveaux relevés sans doublons, absence de passé inventé. |
| Droits | Signatures et sorties conservées, droits nécessaires maintenus, aucun nouveau lecteur dashboard anonyme ni élargissement de la RLS. |
| Performance | Comparer des mesures répétées des recherches et six statistiques, avec filtre actif/inactif, avant de décider l’index. |

Exécuter les tests SQL existants concernés, notamment `test_crm_lifecycle.sql`, `test_dashboard_crm_open.sql`, `test_dashboard_activity.sql`, `test_dashboard_scorecards.sql`, `test_metric_snapshot.sql`, les tests de filtres/listes et `test_provider_scope_preference.sql`. Actualiser les assertions rendues obsolètes par le nouveau contexte affiché en conservant leurs garanties métier.

Côté application, lancer les suites Jest affectées, `npm run typecheck` et `npm run build` dans `bertel-tourism-ui`, puis une vérification intégrée avec comptes authentifiés et consultation desktop/mobile. Les chiffres 835/758 et 529/170 de l’audit servent de points de comparaison datés ; les résultats attendus doivent être recalculés indépendamment sur les fixtures et l’état observé.

**Passage à la suite :** contrôles concernés réussis, différences expliquées, performances acceptables et retour arrière réellement essayé sur l’environnement isolé.

## Étape 6 Préparer la livraison ciblée

Préparer un dossier de livraison contenant le diff du lot, les migrations exactes, leurs préconditions, les résultats de validation et le retour arrière. Relire les changements pour exclure les modifications locales étrangères au filtre.

L’ordre prévu est :

1. Revérifier Bertel V3, les sauvegardes et les définitions distantes de référence.
2. Appliquer uniquement les migrations retenues, dans leur ordre de dépendance. Arrêter sur une précondition différente de celle validée.
3. Recharger le cache de schéma de l’API après les changements de fonctions et de droits.
4. Vérifier les RPC, exécuter la première collecte réelle du jour avec son contexte contrôlé, puis vérifier la planification future.
5. Livrer l’interface après confirmation de la disponibilité des RPC et des séries.
6. Vérifier deux comptes, les deux positions du toggle, la reconnexion et la cohérence résultats/carte/compteurs/courbes. Contrôler les erreurs, durées et avis de sécurité liés au lot.

Cette étape décrit une future livraison ; la demande actuelle porte sur le plan. Aucune commande de déploiement n’est exécutée à sa préparation.

## Étape 7 Retour arrière et documentation

En cas d’échec de migration avant validation de sa transaction, interrompre l’application du lot. Après livraison, retirer l’interface nouvelle avant de restaurer les définitions SQL dont elle dépend.

Restaurer les définitions, droits, paramètres et éventuelle planification capturés à l’étape 1, sans restauration destructive de l’ensemble de la base. Conserver les préférences enregistrées, les relations acteurs/objets et tous les relevés historiques. Maintenir les nouvelles RPC tant qu’un client encore actif peut les appeler ; le nettoyage éventuel fait l’objet d’une intervention distincte.

Le retour à l’état antérieur peut rétablir le défaut de mélange réel/test décrit dans l’audit : il doit être signalé comme tel, avec les fonctions effectivement restaurées. Une correction validée indépendante peut être conservée si le retour arrière testé le prévoit explicitement.

Après une livraison réussie, mettre à jour le runbook, `docs/provider-scope.md`, le manifeste et les graphes : `graphify update .` après le code, puis régénération du graphe DB selon `tools/db-graph/README.md` après la modification effective de la base.

## Fichiers principaux du lot

| Partie | Fichiers à reprendre ou compléter pendant l’exécution |
| --- | --- |
| SQL central | `Base de donnée DLL et API/api_views_functions.sql`, préparation `supabase/migrations/20261030123304_provider_scope_preference.sql` et éventuelles nouvelles migrations générées par CLI. |
| Activité et historique | Sources `migration_dashboard_activity.sql`, `migration_dashboard_crm_open.sql`, `migration_metric_snapshot.sql` selon les définitions retenues ; nouvelle collecte et lecture contextualisée. |
| Installation et tests | `Base de donnée DLL et API/ci_fresh_apply.sql`, tests SQL concernés, `tools/provider-scope-validation.mjs`. |
| Filtre et état | `src/utils/facets.ts`, `src/types/domain.ts`, `src/store/explorer-store.ts`, `src/store/provider-scope-store.ts`, `src/lib/explorer-search-params.ts`. |
| Compte et interface | `src/services/provider-preference.ts`, `src/hooks/useBootstrapSession.ts`, `src/components/explorer/ProviderScopeToggle.tsx`, `FiltersPanel.tsx`, filtres actifs et tests associés. |
| Dashboard | `src/services/dashboard-rpc.ts`, `src/views/DashboardPage.tsx`, composants de compteurs et d’historique. |
| Séries | `src/types/metric-snapshot.ts`, `src/services/metric-snapshot-rpc.ts`, `src/hooks/useMetricSnapshotSeries.ts` et leurs tests. |

Les chemins `src/` sont relatifs à `bertel-tourism-ui/`. Les étapes 1 à 7 restent à exécuter ; l’audit, la règle de rôle et l’emplacement du toggle sont déjà établis.
