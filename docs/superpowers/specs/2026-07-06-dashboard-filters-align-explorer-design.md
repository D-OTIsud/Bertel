# Aligner les filtres du Dashboard sur ceux de l'Explorer

**Date :** 2026-07-06
**Statut :** design validé (brainstorming) — à relire avant plan d'implémentation
**Portée :** frontend uniquement — **aucune migration SQL**

---

## Problème

Le Dashboard (`/dashboard`) a son propre panneau de filtres (`DashboardFiltersPanel` + `dashboard-filter-store` + type `DashboardFilters`), plus pauvre que celui de l'Explorer : type/statut/commune/lieu-dit/période/PMR/animaux + un bloc « avancés » (taxonomie, distinctions, langues, familles d'équipements, tags). L'Explorer (`FiltersPanel` + `explorer-store` + `facets.ts`) est bien plus travaillé : facettes par famille de type (capacité HEB/RES, difficulté/distance ITI, dates FMA, salles de réunion…), barres de niveaux de classement (§174), sections « Distinctions » groupées (§176), accessibilité, environnement, ouvert-maintenant, etc.

**Objectif PO :** le Dashboard doit exposer la **même richesse de filtres** que l'Explorer, en **conservant** son unique spécificité : la **période** (`updated_at` from/to + préréglages + plage personnalisée).

## Découverte de cadrage (dé-risque)

Les 6 RPC de stats du Dashboard (`api.get_dashboard_scorecards`, `_type_breakdown`, `_actualisation`, `_completeness`, `_city_distribution`, `_distinction_overview`) **résolvent déjà leur périmètre via `api.get_filtered_object_ids(p_filters, p_types, p_status)`** — le **même moteur** que l'Explorer. Le `p_filters` (jsonb) qu'ils acceptent est **le même contrat** que le payload de facettes de l'Explorer.

Conséquence : le SQL sous-jacent comprend **déjà** tout le vocabulaire de l'Explorer. Aligner = **frontend seul** : monter le panneau riche de l'Explorer sur le Dashboard et lui faire envoyer le payload de facettes que les RPC savent déjà lire. Pas de write-trap : chaque facette affichée filtrera réellement les stats (elles passent toutes par `get_filtered_object_ids`).

## Décisions (validées avec le PO)

1. **État des filtres : indépendant par page.** Filtrer sur le Dashboard ne modifie pas l'Explorer et inversement.
2. **Alignement strict sur l'Explorer.** Statuts limités à **Publié / Brouillon** (jeu de l'Explorer) ; on **retire** Archivé/Masqué du Dashboard.
3. **Conserver la période** (`updated_at` from/to) comme unique bloc propre au Dashboard.

## Architecture

### 1. Réutiliser le vrai `FiltersPanel` de l'Explorer (composant paramétré par store)

`FiltersPanel` lit `useExplorerStore` **46 fois** ; `explorer-store` est un **singleton** (`create<ExplorerState>()`). On **ne** contextualise **pas** le store (casserait l'API `.getState()` utilisée par tous les tests Explorer). À la place :

- Ajouter à `FiltersPanel` une prop **`useStore`** (hook de store) **défaut = `useExplorerStore`**. Nom en `use*` pour satisfaire `eslint-plugin-react-hooks`. Remplacer les 46 `useExplorerStore(...)` par `useStore(...)`. L'Explorer et ses tests (qui ne passent pas la prop) restent **strictement inchangés**.
- Idem pour `ExplorerActiveFilters` (les chips actives) : prop `useStore` (défaut = singleton), pour réutiliser les chips sur le Dashboard.

### 2. Instance de store indépendante (zéro duplication de logique)

Transformer l'export de `explorer-store.ts` en **factory** :

```ts
const createExplorerStore = () => create<ExplorerState>((set) => ({ /* corps inchangé */ }));
export const useExplorerStore = createExplorerStore();          // Explorer (singleton, inchangé)
export const useDashboardExplorerStore = createExplorerStore(); // Dashboard (2ᵉ instance indépendante)
```

Le corps du store n'utilise que `set` (pur) ⇒ deux instances totalement indépendantes, `.getState()` préservé sur les deux, aucune logique de filtre dupliquée. Le Dashboard monte `<FiltersPanel useStore={useDashboardExplorerStore} />`.

> `useExplorerUrlSync` reste branché uniquement sur le singleton de l'Explorer ⇒ l'instance Dashboard n'est **pas** synchronisée à l'URL de l'Explorer (état en mémoire de session, comme l'actuel `dashboard-filter-store`). URL-sync du Dashboard = hors scope (voir Différés).

### 3. Bloc Période — Dashboard-only

La période **n'entre pas** dans le store Explorer partagé. Un store Dashboard **réduit** (`dashboard-filter-store` conservé mais amaigri) porte : `updatedAtFrom`, `updatedAtTo`, `activeTab` (onglets Qualité/Offre), `sidebarCollapsed`. Une petite section `DashboardPeriodSection` (préréglages 7j/30j/3 mois/1 an + plage « Du/Au ») rendue au-dessus du `FiltersPanel` réutilisé, adossée à ce store réduit.

### 4. Références du panneau

`FiltersPanel` attend des `ExplorerReferences` (service `explorer-reference.ts`). Le Dashboard charge donc **les mêmes** références que l'Explorer (une query `getExplorerReferences`) au lieu des RPC d'options spécifiques Dashboard. Les loaders spécifiques (`get_dashboard_filter_options`, `get_dashboard_advanced_filter_options` côté service `dashboard-reference.ts`) deviennent **candidats au retrait** s'ils n'ont plus d'autre consommateur (à vérifier à l'implémentation).

### 5. Sérialisation vers les RPC de stats

Un mapper **pur** `dashboardFiltersToStatsParams(explorerState, période) → { p_types, p_status, p_filters, p_updated_at_from, p_updated_at_to }` :

- `p_types` = union des types des buckets sélectionnés (+ narrowing sous-types HOT), même logique que l'Explorer. Aucun bucket sélectionné ⇒ tous les types (hors ORG).
- `p_status` = statuses de l'état Explorer, restreints à `published`/`draft`.
- `p_filters` = payload de facettes réutilisant la logique existante (`facets.ts` : `buildBucketRpcFilters` / helpers), **fusionné en un seul objet** (voir §7 pour les facettes spécifiques).
- `p_updated_at_from/to` = depuis la période.

Remplace `buildRpcParams(DashboardFilters)` (retiré). `dashboard-rpc.ts` passe désormais ce payload aux 6 RPC (signatures RPC **inchangées**).

### 6. Nettoyage (suppression > ajout)

Retirer le stack devenu inutile :
- `components/dashboard/DashboardFiltersPanel.tsx` (remplacé par `FiltersPanel` réutilisé + `DashboardPeriodSection`).
- Le type `DashboardFilters` + `buildRpcParams` (dans `dashboard-rpc.ts`).
- `lib/dashboard-to-explorer.ts` (le pont : même modèle des deux côtés ⇒ un éventuel « voir dans l'Explorer » devient une simple copie d'état ; à recâbler ou retirer selon usage réel — vérifier les consommateurs).
- Chips actives : `ActiveFilterStrip` (dashboard) → réutiliser `ExplorerActiveFilters` paramétré.
- Tests associés retirés/portés.

### 7. Facettes spécifiques par type en multi-bucket — comportement figé (option 7b)

**Preuve SQL** (`api_views_functions.sql`, `get_filtered_object_ids`) : chaque facette spécifique est gardée par `NOT (params.filters ? '<clé>') OR EXISTS(SELECT 1 FROM <table_enfant> WHERE object_id = src.object_id AND …)` — ex. `itinerary` (l.1669), `meeting_room` (l.1608), `capacity_filters` (l.1620s). Donc **dès que la clé est présente, TOUT objet candidat doit porter la ligne enfant** : en une seule passe avec plusieurs types, une facette spécifique (capacité HEB, difficulté ITI…) **exclut tous les objets des autres types** (leur `EXISTS` est faux).

L'Explorer évite ça en interrogeant **par bucket** (chaque facette spécifique scopée à sa requête, puis fusion). Le Dashboard fait **une passe** (RPC pré-agrégées). Décision :

- **Facettes transverses** (localisation, distinctions §176, taxonomie, langues, familles d'équipements, accessibilité, environnement, ouvert-maintenant, tags, statut, période) : **toujours** envoyées ⇒ fonctionnent parfaitement en une passe, quel que soit le nombre de buckets.
- **Facettes spécifiques par type** (capacité HEB/RES, difficulté/distance/boucle/pratiques ITI, dates FMA, salles de réunion) : **rendues et envoyées uniquement quand exactement UN bucket est sélectionné.** Avec 0 ou ≥2 buckets, les sections spécifiques sont **masquées** (pas juste ignorées — pas de contrôle affiché-mais-inerte, invariant « no silent write-trap »).

Implémentation : une prop `FiltersPanel` `typeSpecificFacets?: boolean` (défaut **true** ⇒ Explorer inchangé). Le Dashboard passe `typeSpecificFacets={selectedBuckets.length === 1}`. Le mapper de sérialisation applique la même règle (n'émet les clés spécifiques que si un seul bucket).

> Rejeté — **7c (N passes fusionnées)** : fidèle en tout cas mais nécessite de fusionner des stats pré-agrégées (moyennes pondérées, distributions) sur N requêtes ⇒ complexité disproportionnée pour un cas rare sur un dashboard (YAGNI). **7a (passe unique, narrowing silencieux)** rejeté : sélectionner une capacité HEB ferait disparaître les autres types des stats sans le dire.

## Flux de données

```
[Dashboard]
  useDashboardExplorerStore (facettes, indépendant)  ─┐
  dashboard-filter-store réduit (période, tab)        ├─► dashboardFiltersToStatsParams()
                                                       │      → { p_types, p_status, p_filters, p_updated_at_* }
  <FiltersPanel useStore={useDashboardExplorerStore}   │
      typeSpecificFacets={buckets.length===1} />       │
  <DashboardPeriodSection store={dashboard-filter} />  │
  <ExplorerActiveFilters useStore={…} />               │
                                                       ▼
                              useDashboardQuery(widget, params, getDashboardX)
                                          │  (6 RPC, signatures inchangées)
                                          ▼
                              api.get_dashboard_* → api.get_filtered_object_ids
```

## Composants & fichiers

| Fichier | Action |
|---|---|
| `store/explorer-store.ts` | factory `createExplorerStore()` + export `useExplorerStore` (défaut) + `useDashboardExplorerStore` |
| `components/explorer/FiltersPanel.tsx` | props `useStore` (défaut singleton) + `typeSpecificFacets` (défaut true) ; les sections spécifiques par type gardées derrière `typeSpecificFacets` |
| `components/explorer/ExplorerActiveFilters.tsx` | prop `useStore` (défaut singleton) |
| `store/dashboard-filter-store.ts` | amaigri : période + `activeTab` + `sidebarCollapsed` (retire types/status/cities/facettes) |
| `components/dashboard/DashboardPeriodSection.tsx` | **nouveau** : préréglages + plage Du/Au |
| `lib/dashboard-filters-to-stats-params.ts` | **nouveau** : mapper pur état→params RPC (règle §7) |
| `services/dashboard-rpc.ts` | retire `buildRpcParams` ; les 6 getters prennent les params du mapper |
| `views/DashboardPage.tsx` | monte le panneau réutilisé + période + chips ; charge `ExplorerReferences` |
| `components/dashboard/DashboardFiltersPanel.tsx`, `ActiveFilterStrip.tsx`, `lib/dashboard-to-explorer.ts`, type `DashboardFilters` | **retirés** (après vérif consommateurs) |

## Tests

- **Unit (mapper)** : `dashboard-filters-to-stats-params` — types→p_types (+HOT subtypes), statuts restreints published/draft, facettes transverses toujours émises, facettes spécifiques émises ssi 1 bucket, période→p_updated_at.
- **RTL (panneau Dashboard)** : facettes riches présentes ; bloc Période conservé ; statuts limités à Publié/Brouillon ; sections spécifiques masquées à 0/≥2 buckets, visibles à 1 bucket ; indépendance vs Explorer (modifier l'un ne touche pas l'autre — deux instances de store).
- **RTL (FiltersPanel Explorer)** : inchangé (défaut de prop) — régression zéro.
- `tsc` + suite jest complète verte.

## Hors périmètre / différés

- **URL-sync des filtres Dashboard** (partage/lien profond) — l'actuel n'en a pas ; à faire dans une passe dédiée si besoin.
- **7c per-bucket merge** pour facettes spécifiques en multi-bucket — non retenu (voir §7).
- **Widgets stats stubs** (`get_dashboard_capacity/velocity/contributors/seasonality`) — inchangés, hors sujet.
- **Note latente Dashboard** `DistinctionOverview` (`environmental_label`/`accessibility_label` ≠ valeurs RPC brutes) — pré-existant, non traité ici.

## Risques

- **FiltersPanel = composant central (46 lectures de store).** Le paramétrage par prop de store à défaut = singleton garde l'Explorer intact ; les tests Explorer existants sont le garde-fou (aucun ne passe la prop). Risque maîtrisé, mécanique.
- **Retrait de l'ancien stack Dashboard** : vérifier les consommateurs de `DashboardFilters` / `dashboard-to-explorer` avant suppression (grep) ; porter/retirer leurs tests.
- **Multi-bucket + facette spécifique** : comportement figé et honnête (§7) — documenté, testé.
