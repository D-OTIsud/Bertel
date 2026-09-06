# Audit — Base de données et intégrité métier

Date : 5 septembre 2026. Révision de référence : `5873ec69879e61ff34030d196c65f2eb0ac14de0`.

## Périmètre et méthode

Audit statique, en lecture seule, du modèle PostgreSQL/Supabase : objets et facettes, tarifs, référentiels, caches dérivés, versions, partitions, mutations des sections de l'éditeur et manifeste d'installation. Navigation initiale par `graphify query "Database schema integrity RLS RPC SQL performance"`, puis `db-graph-out/DB_AGENT_INDEX.md`, `FUNCTIONS.md`, `POLICIES.md`, `TYPES.md` et pages `dbdoc/`. Le wiki Graphify n'est pas présent. Les sources SQL et leurs redéfinitions ont été comparées au manifeste `ci_fresh_apply.sql` pour éviter de présenter une ancienne définition corrigée comme un défaut actuel.

Le graphe inventorie 370 tables, 374 fonctions, 537 politiques et 565 triggers ; ces nombres décrivent son instantané, y compris des schémas techniques, et ne certifient pas le catalogue actuellement déployé. Les contrôles se concentrent sur les invariants les plus exposés. Aucun SQL distant, aucune mutation de données, aucun test destructif et aucune modification applicative. Les scénarios ci-dessous sont des critères de reproduction à exécuter ensuite dans une base jetable, pas des tests réalisés pendant cet audit.

Sévérité : P0 critique, P1 élevée, P2 moyenne, P3 faible. **Confirmé (code)** signifie que le mécanisme est établi dans les fichiers ; cela ne signifie pas qu'une donnée incorrecte a été observée en production. **Risque** désigne un impact conditionnel ; **À vérifier** une information d'exploitation non observée.

## Points solides

- Les montants négatifs, inversions de fourchettes et plusieurs plages de dates sont contraints en base : `Base de donnée DLL et API/schema_unified.sql:2357`, `dbdoc/public.object_price.md:31`. Les clés étrangères des prix interdisent les références inexistantes et propagent les suppressions objet/prix/périodes.
- Les facettes ont un registre d'applicabilité et des triggers dédiés : `Base de donnée DLL et API/migration_facet_applicability.sql:1`. L'évolution des types est intégrée au manifeste, dont `Base de donnée DLL et API/ci_fresh_apply.sql:82`.
- La réaffectation d'un prix recalcule les deux objets, ancien et nouveau : `Base de donnée DLL et API/schema_unified.sql:4421`, `Base de donnée DLL et API/schema_unified.sql:4441`. Ce cas ne constitue donc pas un défaut de cache dans la version auditée.
- La maintenance des partitions couvre désormais les versions et le journal d'audit, avec création de politiques dès la naissance des partitions : `Base de donnée DLL et API/migration_partition_maintenance_hardening.sql:45`.
- Les écritures de sections sont regroupées dans une RPC transactionnelle et passent une garde d'autorisation : `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql:386`, `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql:403`.

## Constats

### DB-01 — Le prix minimum peut rester périmé après une transition de date

**P2 — Confirmé (code).**

**Preuves.** `Base de donnée DLL et API/schema_unified.sql:4425` calcule `MIN(amount)` sur les tarifs valides à `CURRENT_DATE` ; `Base de donnée DLL et API/schema_unified.sql:4465` ne déclenche ce calcul qu'après INSERT/UPDATE/DELETE. Dans `Base de donnée DLL et API/maintenance.sql:62`, le recalcul global joint uniquement les objets ayant encore au moins un tarif valide (`GROUP BY object_id`, puis jointure à la ligne 73). Les tâches programmées de `Base de donnée DLL et API/maintenance.sql:153` couvrent MV, ouverture, partitions et métriques, sans recalcul quotidien des tarifs.

**Scénario et impact.** Un tarif expire ce soir et aucun prix n'est modifié demain : le cache conserve l'ancien montant. Même le passage manuel du recalcul global ne remet pas ce cache à NULL si aucun tarif valide ne subsiste. Le prix compact est directement consommé par `Base de donnée DLL et API/api_views_functions.sql:7542`. Un tarif futur peut également entrer en vigueur sans être pris en compte.

**Recommandation.** Définir une actualisation des agrégats dépendant de l'heure et recalculer aussi les objets dont l'ensemble de tarifs valides est devenu vide. Une requête pilotée par les objets et une agrégation nullable évitent de laisser un ancien montant. Préciser la date métier et le fuseau attendus.

**Validation attendue.** Sur fixtures isolées : dernier tarif expiré → cache NULL ; tarif futur devenu valide → nouveau minimum ; plusieurs tarifs dont un expire → minimum restant. Vérifier ensuite que l'API compacte reflète le résultat sans écriture utilisateur.

**Limite.** Un ordonnanceur externe non versionné pourrait réduire la durée de péremption ; il n'a pas été inspecté. Le défaut de remise à NULL du script de maintenance reste démontré.

### DB-02 — Une borne d'âge maximale négative passe le CHECK si le minimum est NULL

**P2 — Confirmé (code).**

**Preuves.** `Base de donnée DLL et API/schema_unified.sql:2373` impose un minimum positif, puis `age_max_enfant IS NULL OR age_max_enfant >= age_min_enfant`, avec la même forme pour les juniors. Le catalogue exporté confirme cette expression dans `dbdoc/public.object_price.md:31`. La RPC convertit directement les valeurs reçues en `smallint` : `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql:612`.

**Scénario et impact.** Avec `age_min_enfant = NULL` et `age_max_enfant = -1`, la comparaison à NULL produit NULL et l'expression globale n'est pas FALSE. PostgreSQL accepte un CHECK évalué à NULL. Une importation ou un client RPC autorisé peut donc enregistrer une tranche d'âge incohérente, même si un formulaire particulier l'interdit. [Règle PostgreSQL sur les CHECK](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS).

**Recommandation.** Contraindre indépendamment chaque borne non NULL à être positive ou nulle ; maintenir séparément la relation minimum ≤ maximum lorsque les deux sont présents. Définir avec le métier un plafond plausible si nécessaire.

**Validation attendue.** Rejeter un maximum négatif avec minimum absent, pour enfant et junior ; accepter une borne maximale positive seule ; rejeter minimum supérieur au maximum ; conserver le cas deux bornes absentes.

**Limite.** Aucun nombre de lignes affectées n'a été mesuré. Le constat porte sur la protection serveur, pas sur l'existence d'un incident utilisateur.

### DB-03 — Le minimum agrège plusieurs devises et peut être publié comme EUR

**P2 — Confirmé (code) ; impact conditionné à un tarif non EUR.**

**Preuves.** `Base de donnée DLL et API/schema_unified.sql:2359` stocke une devise libre sur trois caractères. La RPC conserve la devise fournie : `Base de donnée DLL et API/object_workspace_safe_write_rpcs.sql:609`. L'agrégat `MIN(amount)` à `Base de donnée DLL et API/schema_unified.sql:4425` n'a ni regroupement par devise ni conversion. La représentation compacte associe ensuite ce nombre à la constante `'EUR'` : `Base de donnée DLL et API/api_views_functions.sql:7542`.

**Scénario et impact.** Un tarif de 100 USD, même seul, peut produire `{amount: 100, currency: 'EUR'}` dans cette représentation. Avec plusieurs devises, la comparaison des montants nominaux n'a pas de sens monétaire. Les filtres et cartes fondés sur le cache peuvent devenir trompeurs.

**Recommandation.** Décider explicitement si Bertel est mono-devise. Dans ce cas, contraindre EUR à l'entrée et en base. Sinon, conserver la devise de l'agrégat ou calculer un montant normalisé suivant une règle métier documentée ; le rendu doit utiliser cette information.

**Validation attendue.** Un tarif non EUR doit soit être rejeté explicitement, soit conserver sa devise dans la réponse. Deux tarifs de devises différentes ne doivent jamais être comparés comme de simples nombres sans règle de conversion.

**Limite.** L'audit ne confirme aucun tarif multi-devise en production ; il confirme que le contrat SQL et le rendu compact ne sont pas cohérents pour cette entrée autorisée.

## Suites et limites de couverture

Priorité : couvrir DB-01, puis verrouiller les contrats tarifaires DB-02/DB-03. Les index, autorisations et coûts d'exécution sont traités dans les audits 05 et 06. L'unicité effective des imports, la volumétrie des orphelins, l'état des partitions, l'exécution réelle des crons, les sauvegardes et une restauration complète restent à vérifier sur des environnements appropriés. Aucun constat P0 ou P1 n'est établi par cette revue statique d'intégrité.
