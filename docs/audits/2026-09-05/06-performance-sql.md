# Audit — Performance SQL et montée en charge

Date : 5 septembre 2026. Révision : `5873ec69879e61ff34030d196c65f2eb0ac14de0`.

## Périmètre et méthode

Lecture des fonctions RPC, triggers, index exportés, vues matérialisées et scripts de maintenance, orientée par Graphify et le graphe de base de données. Les skills Supabase/Postgres ont été utilisés pour structurer les contrôles : coût RLS, accès ensemblistes, pagination, volume des paramètres, index et amplification des écritures. Les dernières redéfinitions ont été recherchées ; les mesures figurant dans les anciens commentaires SQL sont des éléments historiques, pas des mesures de cet audit.

Aucun benchmark distant, aucune requête `EXPLAIN ANALYZE`, aucun SQL de mutation ni changement d'index. Les délais réels, p95/p99, buffers, volumes, verrous et statistiques `pg_stat_statements` restent inconnus. **Confirmé (code)** décrit une forme de traitement ; les impacts de charge sont des **Risques** à mesurer. P0 critique, P1 élevée, P2 moyenne, P3 faible.

## Points solides

- La RLS des lectures enfants et du jeu d'objets visibles a été réécrite sous forme ensembliste : `Base de donnée DLL et API/ci_fresh_apply.sql:89`, `Base de donnée DLL et API/migration_cards_batch_authorize_definer.sql:45`. L'autorisation des cartes est calculée avant les jointures détaillées, avec une voie rapide pour les objets publiés.
- Plusieurs index de clés étrangères ont été ajoutés explicitement et intégrés au manifeste : `Base de donnée DLL et API/ci_fresh_apply.sql:266`. Le catalogue des prix comporte notamment l'index par objet : `dbdoc/public.object_price.md:46`.
- Les caches évitent les mises à jour sans changement avec `IS DISTINCT FROM` : `Base de donnée DLL et API/schema_unified.sql:4432`. Cela limite les écritures inutiles, même si le calcul doit encore être exécuté.
- Les vues matérialisées et le statut d'ouverture ont une cadence prévue de cinq minutes : `Base de donnée DLL et API/maintenance.sql:159`, `Base de donnée DLL et API/maintenance.sql:178`. Leur existence et leur succès effectifs doivent être contrôlés en exploitation.
- La maintenance des partitions a été consolidée et dispose de tests dans le dépôt : `Base de donnée DLL et API/migration_partition_maintenance_hardening.sql:1`.

## Constats

### SQL-01 — La sauvegarde des tarifs refait tous les agrégats à chaque ligne

**P2 — Confirmé (code), ralentissement à mesurer.**

**Preuves.** `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql:583` supprime tous les tarifs de l'objet, puis les réinsère un par un dans la boucle de la ligne 586. Les périodes sont également réinsérées en boucle à la ligne 623. `Base de donnée DLL et API/schema_unified.sql:4465` pose un trigger AFTER pour chaque ligne. Celui-ci recalcule le minimum, avec une sous-requête dans la valeur affectée et une autre dans le prédicat : `Base de donnée DLL et API/schema_unified.sql:4424`, `Base de donnée DLL et API/schema_unified.sql:4432`.

**Scénario et impact.** Sauvegarder 100 tarifs inchangés produit 100 suppressions et 100 insertions, en plus des périodes. Chaque mutation peut rescanner les tarifs de l'objet et prendre un verrou sur sa ligne d'agrégat. Le coût croît avec la taille de la section et peut retarder les autres modifications du même objet. Il s'agit d'une seule RPC transactionnelle : ce ne sont pas 200 allers-retours réseau.

**Recommandation.** Réconcilier les lignes par identifiant et ne modifier que les différences. Évaluer un recalcul des caches une fois par objet/statement, avec maintien des contraintes et de l'audit. Ne pas désactiver globalement les triggers ou les clés étrangères pour résoudre ce coût.

**Validation attendue.** Mesurer une sauvegarde identique puis une modification unique sur 1, 20 et 100 tarifs : écritures réelles, temps, appels du trigger et blocages. Une sauvegarde identique doit tendre vers zéro mutation ; un changement ne doit pas recréer toutes les périodes. Vérifier le cache en sortie et le rollback d'une entrée invalide.

### SQL-02 — La timeline de versions parcourt l'historique avant pagination et accepte une limite sans plafond

**P2 — Confirmé (code), impact selon profondeur de l'historique.**

**Preuves.** `Base de donnée DLL et API/api_views_functions.sql:10725` calcule `LAG(ov.data)` sur toutes les versions de l'objet. Le tri descendant et le LIMIT/OFFSET n'interviennent qu'ensuite, à `Base de donnée DLL et API/api_views_functions.sql:10748`. `GREATEST(COALESCE(p_limit, 50), 0)` impose un plancher, pas un plafond. Le catalogue possède déjà un index `(object_id, version_number, created_at)` : `dbdoc/public.object_version.md:31`.

**Scénario et impact.** Un objet possédant des milliers de versions oblige la requête à considérer une longue fenêtre même pour la première page. Les pages profondes paient aussi le coût des lignes sautées ; un appel direct peut demander une très grande limite. L'index existant facilite certains accès mais ne supprime pas la fenêtre définie sur tout l'historique. [Coût des lignes sautées avec OFFSET](https://www.postgresql.org/docs/current/queries-limit.html).

**Recommandation.** Fixer un plafond serveur. Lire une tranche par curseur stable et récupérer également la version précédente nécessaire au premier diff. Comparer les plans avant d'ajouter un index qui ferait doublon ; préciser l'ordre de départage `version_number/created_at`.

**Validation attendue.** Sur 100, 10 000 et 100 000 versions synthétiques, mesurer première page et page profonde ; contrôler buffers et temps du WindowAgg. Les champs modifiés doivent rester exacts à la frontière des pages. Une demande supérieure au plafond doit être bornée ou rejetée explicitement.

### SQL-03 — Le RPC de cartes accepte un tableau d'identifiants non borné et réémet les doublons

**P2 — Risque de consommation excessive ; mécanisme confirmé dans le code.**

**Preuves.** `Base de donnée DLL et API/migration_cards_batch_authorize_definer.sql:82` accepte `p_ids TEXT[]`. `Base de donnée DLL et API/migration_cards_batch_authorize_definer.sql:96` déroule le tableau complet avec ordinality. La fonction réduit les identifiants pour calculer les cartes, mais `Base de donnée DLL et API/migration_cards_batch_authorize_definer.sql:406` agrège ensuite sur les entrées initiales et rejoint les cartes à la ligne 408. Aucun plafond de cardinalité n'est présent dans cette définition. Son accessibilité publique est documentée dans le même fichier à la ligne 27.

**Scénario et impact.** Un appel direct du RPC avec un identifiant publié répété un grand nombre de fois produit autant de cartes dans un unique JSON. La déduplication intermédiaire réduit le travail des jointures mais pas la taille finale. Les plafonds d'une route Next.js ou d'un formulaire ne protègent pas automatiquement le RPC direct. Le maximum de lignes PostgREST ne constitue pas, à lui seul, une borne sur la taille d'un JSON agrégé unique.

**Recommandation.** Imposer en SQL un maximum d'identifiants adapté aux consommateurs connus, et définir explicitement si les doublons doivent être conservés. Les exports plus volumineux peuvent utiliser un parcours distinct et paginé. Vérifier l'exposition effective et les limites de requête/temps du service.

**Validation attendue.** Tester 0, 1, plafond, plafond+1 entrées, puis des doublons et des identifiants non autorisés. Le dépassement doit être déterministe ; aucune donnée hors périmètre ne doit apparaître ; une répétition ne doit pas engendrer une réponse disproportionnée. Effectuer les tests de charge sur un environnement isolé.

## Plan de mesure et limites

Avant optimisation, établir une référence par persona (public, lecteur, éditeur, administrateur), nombre de lignes et taille des paramètres. Recueillir p95, buffers, temps de verrouillage et appels de fonctions sur cartes, sauvegardes, historique, recherche et tableaux de bord. Vérifier ensuite une seule correction à la fois. Les tests SQL du dépôt existent mais n'ont pas été relancés dans cette sous-revue ; aucune accélération chiffrée ni saturation actuelle n'est affirmée.

L'absence d'un index supposé n'a pas été déduite d'une recherche partielle : les migrations d'index ont déjà corrigé plusieurs anciens problèmes. Les pools, quotas, autovacuum effectif, bloat, lag MV et charge de production sont **À vérifier**. La péremption du cache tarifaire relève du constat DB-01 de l'audit 04.
