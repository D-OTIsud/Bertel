# Recherche de noms : complément ciblé du 27 novembre 2026

La capture [NAME_SEARCH_CATALOG.json](NAME_SEARCH_CATALOG.json) provient du connecteur Supabase de **Bertelv3**, projet `ryycrdhlkmzpxwwwwupy`, après application des migrations `20261127031632` et `20261127031641`. Elle contient uniquement les métadonnées des trois signatures concernées et leurs empreintes normalisées LF, sans corps de fonction ni lignes métier. Elle ne constitue pas une nouvelle extraction complète du catalogue.

## Comportement installé

- `api.get_filtered_object_ids(jsonb, object_type[], object_status[], text)` accepte un fragment littéral de nom dès deux caractères, même lorsque le dernier mot est incomplet. Le patch conserve les filtres et les protections existants et borne le score pour privilégier les concordances de nom.
- `api.search_objects_by_name(text, integer, object_status[])` filtre les statuts avant le classement et la limite. `NULL` et le tableau vide signifient tous les statuts accessibles ; un lecteur reste sur `published`, et un éditeur voit les statuts non publiés de son périmètre étendu. Les environnements réel et test restent séparés. La surcharge n'a aucun argument par défaut.
- L'entrée historique `api.search_objects_by_name(text, integer DEFAULT 8)` délègue à la surcharge sans filtre de statut. Son propriétaire, ses ACL, sa stabilité et son contexte d'exécution sont conservés. Les appels existants restent valides et PostgREST distingue les deux signatures.

Le client de l'Explorer transmet les statuts résolus pour le menu sous la recherche et le bandeau de concordances directes. Ces surfaces partagent la même requête et retirent les résultats précédents lors d'un changement de statut ou de périmètre. La palette et la navigation depuis les autres pages gardent la recherche dans tout le périmètre autorisé.

## Validation

Sur PostgreSQL **17.10 local**, les deux migrations et leur rejeu passent dans une base isolée issue du catalogue complet. Le moteur de résultats a été éprouvé sur le prédécesseur identique à la production (`d4905c8d789de044d82fe65dba4633c1`) et sur le prédécesseur frais à bonus de nom. Les altérations non reconnues de score, du patch installé et du coût sont refusées sans écrasement.

Les cinq tests SQL `test_explorer_partial_name_search.sql`, `test_search_objects_by_name_status_filter.sql`, `test_search_objects_by_name.sql`, `test_explorer_name_relevance.sql` et `test_explorer_filtered_read_authority.sql` passent dans la base combinée. Les témoins sont transactionnels et annulés. Le harnais historique de classement déclare son rôle de service explicitement ; ses assertions de pertinence restent intactes.

Après installation en production, des assertions en lecture vérifient le cas demandé : une fiche hors ligne apparaît dans les suggestions `hidden`, aucun brouillon ne s'y mélange, et une sélection vide retrouve les deux statuts privés accessibles. La recherche `jardin cré` retrouve les mêmes établissements que `jardin créole`. La normalisation des accents, de la casse et des espaces est vérifiée, ainsi que l'exclusion des statuts privés pour un anonyme.

| Signature | Empreinte `prosrc` normalisée LF |
| --- | --- |
| Moteur de résultats à quatre arguments | `af5d01057ee2cb69272c42fe9a4c7312` |
| Suggestions historiques à deux arguments | `fade5ef9cb8debfad1581ab946da4d60` |
| Suggestions filtrées à trois arguments | `aed9e8eb0237acf6205975409a5ffc39` |

## Portée du graphe

`graph.json` ajoute une fonction et deux relations de lecture. Les notices des fonctions concernées et leurs sources sont mises à jour ; les lectures du wrapper historique sont signalées comme déléguées. Les autres nœuds et relations conservent leur provenance. Les pages de tables tbls, la référence HTML et les autres captures restent sur leurs relevés antérieurs. Un prochain rendu complet devra conserver ou superséder ce complément à partir d'une extraction réelle complète.
