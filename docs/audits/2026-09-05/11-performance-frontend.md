# Audit — Performance du frontend et capacité

Date : 5 septembre 2026. Révision : `5873ec69879e61ff34030d196c65f2eb0ac14de0`.

## Périmètre et méthode

Lecture du chemin explorateur/cartes, des caches et de l'export. Construction de production et observation d'écrans en mode démo local. Aucun test de charge contre Supabase, aucune mesure de latence de production, aucun score Lighthouse ou Core Web Vitals n'est revendiqué.

## Points solides

- Recherche temporisée à 250 ms et annulation propagée vers Supabase (`bertel-tourism-ui/src/hooks/useExplorerQueries.ts:137`, `:197` ; `src/services/rpc.ts:294`).
- Pagination serveur, fusion des appels de catégories lorsque les filtres sont compatibles, concurrence bornée et carte distincte des cartes de résultats (`src/services/rpc.ts:298`, `:417`, `:471`).
- Carte chargée par `lazy`, regroupement géographique des marqueurs, export XLSX différé.
- Export par lots de 50, deux lots en vol au maximum, libération des ressources détaillées après projection (`src/services/export/export-fetch.ts:5`, `:8`, `:69`).
- Persistance navigateur limitée aux requêtes marquées `meta.persist`, avec utilisateur et langues dans le buster (`src/components/Providers.tsx:16`, `:44`).

## Constats

### PERF-01 — P2 — Les pages chargées s'accumulent dans le DOM

**Statut : confirmé dans le code ; impact à mesurer.** Les pages sont aplaties dans `bertel-tourism-ui/src/hooks/useExplorerQueries.ts:205`. `src/components/explorer/ResultsList.tsx:316` et `:319` rendent ensuite toutes les cartes chargées avec `.map`. La sentinelle poursuit le chargement ; aucune fenêtre de virtualisation n'intervient sur ce chemin.

**Scénario et impact :** défilement prolongé sur un grand corpus : croissance des composants, des images et du travail de rendu. La pagination réduit le coût initial, mais ne borne pas le nombre de cartes déjà montées. Les 11 objets de la démo ne permettent pas de quantifier la gêne.

**Recommandation :** mesurer 500, 2 000 puis 10 000 résultats sur un appareil de référence ; virtualiser si le budget de rendu est dépassé, en conservant focus, titres de groupes et sélection accessibles.

**Validation :** temps de défilement, mémoire et nombre de nœuds DOM stabilisés sur une longue session ; aucune perte de sélection ou de position.

### PERF-02 — P2 — La carte charge tout l'ensemble géolocalisé correspondant

**Statut : confirmé ; limite de capacité à établir.** `bertel-tourism-ui/src/services/rpc.ts:395` appelle `list_object_markers` sans emprise visible ni pagination. Les résultats alimentent aussi les identifiants de sélection globale (`src/views/ExplorerPage.tsx:96`).

**Impact :** le clustering améliore l'affichage mais ne réduit pas à lui seul le transfert de tous les marqueurs. À grande échelle, le réseau, les tableaux JS et les transformations géographiques peuvent devenir dominants.

**Recommandation :** établir le volume maximal supporté et mesurer taille transférée, mémoire et latence ; envisager un chemin par emprise ou tuiles vectorielles en conservant un service séparé pour « tout sélectionner ». Un changement de chargement de la carte ne doit pas tronquer silencieusement les exports.

**Validation :** test au volume cible et test de non-régression de sélection/export sur objets hors écran.

### PERF-03 — P2 — Le streaming réseau de l'export ne borne pas la mémoire du classeur final

**Statut : confirmé ; risque de volumétrie.** `bertel-tourism-ui/src/services/export/export-workbook.ts:140` conserve les cellules projetées dans une `Map`, puis `:159` construit le modèle complet avant `:174` et l'écriture du fichier. Le worker interne de la bibliothèque évite une partie du travail sur le thread principal ; il ne supprime pas ces collections en mémoire.

**Impact :** une très grande sélection ou de nombreuses colonnes peut encore saturer le navigateur malgré les lots de récupération bien bornés. Aucun plantage d'export n'a été provoqué dans cet audit.

**Recommandation :** mesurer le pic mémoire réel, afficher une limite explicite fondée sur ces mesures et prévoir un export asynchrone côté serveur si les usages dépassent ce plafond.

**Validation :** export complet au volume contractuel sur navigateur de référence, progression et annulation utilisables, absence de fichier incomplet présenté comme réussi.

### PERF-04 — P2 — Absence de budget de performance automatisé identifié

**Statut : confirmé dans la configuration versionnée inspectée ; observabilité distante à vérifier.** `bertel-tourism-ui/package.json:9`, `jest.config.mjs:9`, `.github/workflows/sql-fresh-apply.yml:1` ne définissent ni budget de bundle ni mesure récurrente des performances utilisateur. La construction a réussi, ce qui n'établit pas la fluidité de l'application.

**Recommandation et validation :** adopter quelques scénarios mesurables (ouverture explorateur, recherche, ouverture éditeur, export), définir des budgets avec un appareil et un jeu de données documentés, et conserver les résultats de référence. Consulter la [checklist de production Next.js](https://nextjs.org/docs/app/guides/production-checklist) pour structurer ces contrôles.
