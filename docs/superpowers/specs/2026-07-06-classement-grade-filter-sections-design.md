# Design — Filtre par niveau de classement + résultats groupés par niveau (Phase A)

**Date:** 2026-07-06
**Statut:** design en attente de validation
**Surface:** Explorer (`bertel-tourism-ui`) — **frontend uniquement, aucun changement backend**
**Suite de:** §173 (résultats sectionnés du filtre Label) — réutilise sa mécanique de sections.

---

## 1. Problème / objectif

Depuis §173-addendum, le filtre « Classement / label » expose les classements officiels (hôtelier, meublés, campings, Gîtes de France épis, Clévacances clés…). Mais ces classements ont des **niveaux** (1–5 étoiles / épis / clés ; Catégorie I/II/III pour les OT) et on ne peut filtrer que sur le schéma entier (« tous les meublés »), pas sur le **nombre d'étoiles voulu**.

Objectif (Phase A) :
1. **Filtre par niveau** : quand un classement gradué est sélectionné, une barre inline de ses niveaux (☆1–5 / épis / clés / catégories) cochables ; on filtre sur les niveaux cochés.
2. **Résultats groupés par niveau** : quand un classement gradué est le filtre actif, les résultats s'affichent en **sections repliables** par niveau (« 5 étoiles (N) », « 4 étoiles (N) »…), niveau le plus haut d'abord.

**Hors périmètre (Phase B, plus tard) :** la case « afficher cette section sur la carte » par section — elle demande que `api.list_object_markers` porte le niveau + un état partagé liste↔carte. Documentée en §9.

## 2. Constat — tout est déjà en place côté données (aucun backend)

- **Le filtre backend existe déjà** : `api.get_filtered_object_ids` accepte `classifications_any` = liste de `{scheme_code, value_code}`, matché contre `cached_classification_codes` (format `scheme:value`, ex. `meuble_stars:3`) — vérifié live. Utilise le MV caché (perf). **Aucun changement SQL.**
- **La carte connaît déjà son niveau** : `api.get_object_cards_batch` émet chaque classification comme badge `code = s.code || ':' || v.code` (ex. `meuble_stars:3`), `kind = 'official_classification'`, `label = "Classement meublés · 3 étoiles"`. Donc le niveau d'une carte pour le schéma sélectionné = le badge dont `code` commence par `<scheme>:`. **Aucun ajout de payload.**
- **Format des niveaux** (live) : `value_code` = `1`…`5` (« 1 étoile »…« 5 étoiles » / « N épis » / « N clés ») ; OT = `cat_1`/`cat_2`/`cat_3` (« Catégorie I/II/III »). Schémas gradués = ceux dont `display_group='official_classification'` avec ≥2 valeurs (les labels binaires durabilité/qualité/T&H ont une seule valeur `granted`).

## 3. Comportement cible

### 3.1 Barre de niveaux (filtre)
Sous le sélecteur « Classement / label », **quand le schéma choisi est gradué** (≥2 valeurs), afficher une barre cochable de ses niveaux, libellés depuis la référence (« 1 étoile »…« 5 étoiles » ; « Catégorie I »… pour OT). Multi-sélection (cocher un ou plusieurs). Rien coché = tout le schéma (comportement actuel). Cocher `[3,4,5]` = « 3★ et + » (sémantique OU). Masquée pour les schémas non gradués (labels).

### 3.2 Sections par niveau (résultats)
Quand le filtre actif est un classement gradué, les résultats (vue Liste **et** Tableau) se groupent en **sections par niveau**, niveau le plus haut d'abord : « 5 étoiles (12) », « 4 étoiles (8) »… Chaque section est **repliable** (chevron dans l'en-tête ; état local). Le niveau d'une carte vient de son badge `code` (`<scheme>:<value>`). Une carte sans badge du schéma va dans une section « Non classé » en dernier (défensif ; ne devrait pas arriver sous ce filtre).

Ce mode est **exclusif** des sections rank-0/rank-1 de §173 : un classement n'a pas de « preuve équivalente », donc jamais de sections labellisés/équivalents. Règle unique : schéma gradué → sections par niveau ; schéma label (durabilité/T&H) → sections §173 ; sinon → liste plate.

## 4. État & contrat (frontend)

- `ExplorerCommonFilters` += `rankedLabelValueCodes: string[]` (défaut `[]`). **Réinitialisé à `[]` quand `rankedLabelSchemeCode` change** (setter du schéma). Normalize `?? []`.
- Références (`ExplorerReferences`) += `rankedLabelSchemeValues: Record<string, ExplorerReferenceOption[]>` (par `scheme_code`, valeurs triées par niveau ascendant). Chargé depuis `ref_classification_value` pour les schémas `is_distinction` (petit : ~50 lignes).
- `facets.ts` : quand `rankedLabelSchemeCode` **et** `rankedLabelValueCodes` non vide → `payload.classifications_any = rankedLabelValueCodes.map(vc => ({ scheme_code: rankedLabelSchemeCode, value_code: vc }))`. `label_scheme_ranked` reste émis (inchangé ; le AND avec classifications_any restreint aux niveaux — redondance inoffensive, garde la chip/état simples).
- URL : `rankedLabelValues` = CSV des value_codes, présent seulement si non vide + un schéma est choisi (`explorer-search-params.ts`).
- Chip active : « Niveaux : 3, 4, 5 » (ou libellés) quand non vide (`explorer-active-chips.ts` + retrait → `setRankedLabelValueCodes([])`).

## 5. Helper de sectionnement par niveau (pur, testable)

Nouveau dans `explorer-result-sections.ts` :
```ts
interface GradeSection { valueCode: string; label: string; count: number; cards: ObjectCard[] }
// schemeCode = classement gradué actif ; values = ordre/labels de référence (rankedLabelSchemeValues[schemeCode])
function buildGradeSections(cards: ObjectCard[], schemeCode: string, values: ExplorerReferenceOption[]): GradeSection[]
```
- Niveau d'une carte = `card.badges.find(b => b.code?.startsWith(schemeCode + ':'))` → `value_code` = partie après `:` ; label = le nom de niveau depuis `values` (fallback : la partie après « · » du badge.label).
- Sections ordonnées par ordinal décroissant (ordinal = nombre en tête du `value_code`, sinon index dans `values`). Cartes sans badge du schéma → section « Non classé » en fin.
- `count` = nombre de cartes chargées du niveau (pas de comptes corpus en Phase A ; on affiche le chargé — cohérent avec la pagination lazy ; note honnête). Sections vides omises.

## 6. Rendu (Liste + Tableau)

Un sélecteur unique décide du mode dans chaque vue :
- `rankedLabelSchemeCode` est un schéma gradué (présent dans `rankedLabelSchemeValues` avec ≥2 valeurs) → `buildGradeSections` → sections repliables.
- sinon → §173 `buildResultSections` (labellisés/équivalents) — inchangé.
- sinon → liste plate.

`ResultsList` : en-têtes de section = ligne repliable (chevron + libellé + count), réutilise le style des en-têtes §173 ; l'état replié est un `Set<string>` local (`useState`), la section repliée masque ses cartes. Float sélection suspendu quand groupé (invariant §173).
`ResultsTableView` : lignes de groupe par niveau (même primitive que §173) + repli.

## 7. Tests

- `buildGradeSections` (unitaire) : groupe par badge `scheme:value` ; ordre décroissant ; libellés depuis `values` + fallback badge ; « Non classé » en fin ; sections vides omises ; cartes multi-classées prennent le bon schéma.
- `facets` : `classifications_any` émis (paires scheme/value) seulement si schéma + niveaux ; rien sinon ; `label_scheme_ranked` conservé.
- store : `setRankedLabelScheme` remet `rankedLabelValueCodes` à `[]`.
- URL round-trip `rankedLabelValues`.
- FiltersPanel : barre de niveaux rendue seulement pour un schéma gradué ; coche → setter.
- ResultsList/Table : sections par niveau rendues + repli ; suite existante verte.

## 8. Découpage d'implémentation

Frontend-only, réutilise §173. Fichiers : `explorer-reference.ts` (+valeurs), `domain.ts` (types), `explorer-store.ts` (setter+reset), `facets.ts` (payload+normalize), `explorer-search-params.ts` (URL), `explorer-active-chips.ts` (chip), `FiltersPanel.tsx` (barre), `explorer-result-sections.ts` (helper), `ResultsList.tsx` + `ResultsTableView.tsx` (rendu+repli). Aucun SQL.

## 9. Hors périmètre — Phase B (toggle carte par section)

Case « afficher sur la carte » par section : la carte a sa **propre** requête (`api.list_object_markers`, tous les marqueurs, minimaux sans niveau) découplée des cartes paginées. Il faudra (a) que `list_object_markers` porte le `value_code` du schéma actif quand un classement gradué est filtré (petit ajout backend conditionnel), (b) un état partagé « niveaux masqués sur la carte » (store) lu par le filtre de marqueurs de `MapPanel`, (c) la case dans l'en-tête de section. Sa propre passe spec→plan→build.
