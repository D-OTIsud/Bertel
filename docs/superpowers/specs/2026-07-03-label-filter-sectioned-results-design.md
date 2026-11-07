# Design — Résultats sectionnés pour le filtre Label (labellisés vs démarches équivalentes)

**Date:** 2026-07-03
**Statut:** design validé, en attente relecture avant plan d'implémentation
**Surface:** Explorer (`bertel-tourism-ui`) + `api.get_filtered_object_ids` / `api.list_object_resources_filtered_page`

---

## 1. Problème

Quand on filtre par un **label** (filtre « Classement / label » → `label_scheme_ranked`), l'Explorer remonte
DEUX populations mélangées :

- les objets qui **portent réellement le label** (classification `status='granted'`), et
- les objets qui ont seulement des **preuves équivalentes** — actions de durabilité mappées au label via
  `ref_classification_equivalent_action` / `ref_classification_equivalent_group`, ou équipements d'accessibilité
  pour `LBL_TOURISME_HANDICAP` — **sans détenir le label**.

Le PO veut : (a) les objets labellisés **en premier**, (b) une **distinction visuelle forte** des objets remontés
sans le label, et (c) un **toggle** pour n'afficher que les vrais labellisés afin de les **sélectionner en masse**
rapidement (workflow admin de fiches).

## 2. Constat — l'essentiel du back existe déjà

`api.get_filtered_object_ids` (déjà LIVE, §60/§162) renvoie pour chaque résultat :

- `label_rank` : **0** = label certifié détenu, **1** = preuve équivalente seulement.
- `label_match` jsonb : `{scheme_code, rank, source, evidence_count}` avec
  `source ∈ certified_label | sustainability_action | accessibility_amenity`.

`api.list_object_resources_filtered_page` **trie déjà** `... label_rank, name ...`
([api_views_functions.sql:6161](../../../Base%20de%20donnée%20DLL%20et%20API/api_views_functions.sql)) — donc rank-0 avant rank-1
**quand il n'y a pas de recherche texte** (`relevance = 0`). Chaque carte reçoit déjà `label_match`, et le front
affiche une pastille grise (`Label certifié` / `Actions compatibles` / `Équipements compatibles`,
[explorer-card.ts:151](../../../bertel-tourism-ui/src/utils/explorer-card.ts)).

**Ce qui manque** : (1) la distinction n'est qu'une pastille grise faible ; (2) le tri casse quand une recherche
texte coexiste (relevance passe devant `label_rank`) ; (3) aucun toggle « labellisés uniquement » ; (4) pas de
comptes réels par groupe.

## 3. Comportement cible

Le sectionnement ne s'active **que** lorsque le filtre `label_scheme_ranked` est actif. Les classements
(étoiles/épis/clés) et tous les autres filtres sont inchangés — ils n'ont pas de notion de « preuve équivalente »
(un objet a le classement ou ne l'a pas ; pas de second groupe).

### 3.1 Vue Liste / Cartes (surface principale)

```
Résultats · 23 fiches

  Établissements labellisés (15)
  [carte] [carte] …                          ← rank 0

  Aussi pertinents — actions compatibles (8)
  [carte] [carte] …                          ← rank 1 (équivalent, sans le label)
```

- Les en-têtes de section n'apparaissent **que si les DEUX groupes sont non vides**. Un seul groupe (ex. toggle OFF,
  ou aucun équivalent) ⇒ liste plate, aucun chrome de section.
- Copie rank-1 adaptée au schéma : durabilité → « actions compatibles » ; `LBL_TOURISME_HANDICAP` →
  « équipements compatibles » (même logique de `source` que la pastille existante).
- La pastille par carte reste (jamais une distinction couleur-seule → accessibilité).

### 3.2 Vue Tableau

- Mêmes deux groupes, séparés par une **ligne de groupe** (`<tr>` pleine largeur) : « Établissements labellisés (N) »
  puis « Aussi pertinents — … (N) ».
- Le grouping est l'ordre **externe** : le tri par colonne (`sortCards`, client) s'applique **à l'intérieur** de
  chaque groupe. Sans filtre label ⇒ pas de groupe, tri actuel inchangé.
- La case « sélectionner les fiches chargées » (en-tête) est inchangée ; avec le toggle OFF elle ne sélectionne que
  les vrais labellisés (= workflow admin voulu).

### 3.3 Vue Carte (map)

Inchangée — les marqueurs n'ont pas d'ordre ; le signal par marqueur existant reste.

### 3.4 Toggle « Inclure les objets aux démarches équivalentes »

- Emplacement : panneau de filtres, groupe « Labels & certifications », **juste sous** le select « Classement /
  label » ([FiltersPanel.tsx:604](../../../bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx)). Rendu
  uniquement quand un label est sélectionné (sinon sans objet).
- **ON par défaut** = comportement actuel (rank-0 + rank-1, sectionnés). **Non-breaking.**
- **OFF** = résultats limités à rank-0 (labellisés certifiés). Pas de section « actions compatibles ». Permet à un
  admin de filtrer les vrais labellisés puis « sélectionner les fiches chargées » → sélection de masse.

## 4. Modèle d'état & contrat (front)

- `ExplorerCommonFilters` ([domain.ts:142](../../../bertel-tourism-ui/src/types/domain.ts)) gagne
  `rankedLabelIncludeEquivalents: boolean` (défaut `true`).
- URL (`explorer-search-params.ts`) : paramètre `rankedLabelExact=1` présent **uniquement** quand le toggle est OFF
  (URLs par défaut inchangées, rétro-compatibilité).
- `facets.ts` : émet `label_scheme_ranked_exact_only: true` dans le payload **uniquement** quand le toggle est OFF
  (l'état par défaut n'ajoute rien ⇒ payload byte-identique à aujourd'hui). Émis seulement si un
  `rankedLabelSchemeCode` est présent.
- `explorer-active-chips.ts` : chip « Label obtenu uniquement » quand OFF ; compte dans `labelFilterCount`.
- `ObjectCard.label_match` ([domain.ts:273](../../../bertel-tourism-ui/src/types/domain.ts)) : inchangé (déjà
  `rank: 0 | 1`, `source`, `scheme_code`, `evidence_count`).

## 5. Changements backend (2 fonctions, additifs)

### 5.1 `api.get_filtered_object_ids` — restriction « exact only »

- Lire `exact_only := COALESCE((filters->>'label_scheme_ranked_exact_only')::boolean, false)`.
- Porte finale du label :
  ```sql
  AND (NOT (params.filters ? 'label_scheme_ranked') OR (
        exact_label.evidence_count > 0
        OR (NOT <exact_only> AND (sustainability_evidence.evidence_count > 0
                                  OR accessibility_evidence.evidence_count > 0))
  ))
  ```
- `label_rank` / `label_match` : logique inchangée (avec `exact_only`, seules les lignes rank-0 passent la porte).
- `use_mv` : déjà bypassé dès que `label_scheme_ranked` est présent ; la nouvelle clé n'apparaît qu'avec lui ⇒ aucun
  changement de garde `use_mv`.

### 5.2 `api.list_object_resources_filtered_page` (+ `_since_fast` pour parité) — tri + comptes

- **Tri** : rendre `label_rank` primaire **quand le filtre label est actif**, via un ORDER BY unique (fenêtre
  `ROW_NUMBER` ET tri externe, identiques) :
  ```sql
  ORDER BY
    CASE WHEN v_filters ? 'label_scheme_ranked' THEN f.label_rank ELSE 0 END ASC,
    f.relevance DESC,
    f.label_rank ASC,                 -- no-op tie-break hors filtre (ordre actuel préservé)
    f.name_normalized NULLS LAST,
    f.id
  ```
  Hors filtre : 1re clé = 0 constant ⇒ `relevance DESC, label_rank, name, id` = ordre actuel exact.
  Sous filtre : `label_rank` primaire ⇒ tous les rank-0 avant tous les rank-1, **même avec recherche texte**
  (invariant nécessaire au sectionnement mono-frontière côté client).
- **Comptes** (page fn uniquement, réutilisent le CTE `filt` déjà agrégé pour `total`) :
  ```sql
  meta.label_rank_counts = CASE WHEN v_filters ? 'label_scheme_ranked'
    THEN json_build_object('labelled', COUNT(*) FILTER (WHERE label_rank = 0),
                           'equivalent', COUNT(*) FILTER (WHERE label_rank = 1))
    ELSE NULL END
  ```
- **`_since_fast`** : reçoit le même tri (cohérence des listes) ; **pas** de comptes (seul l'Explorer sectionne).
- Signature/forme de retour inchangées (clés `meta` additives) ⇒ **pas de `NOTIFY pgrst`**.

## 6. Changements frontend

- **Helper pur** `src/utils/explorer-result-sections.ts` : `buildResultSections(cards, { schemeCode, active })` →
  séquence de rendu `Array<{ kind:'header', group:'labelled'|'equivalent', label, count } | { kind:'card', card }>`.
  Sections émises seulement si `active` ET les deux groupes non vides. Compte depuis `meta.label_rank_counts` (fallback
  = comptage des cartes chargées). `schemeCode` → nom « actions » vs « équipements ».
- **`ResultsList.tsx`** : mappe la séquence du helper (en-têtes + cartes). Sentinelle infinite-scroll conservée.
  **Interaction sélection-float** : quand les sections sont actives, on rend l'ordre trié/sectionné (`visibleCards`),
  la remontée des favoris (`orderedCards`) est suspendue (le sectionnement EST un ordre fort ; les mélanger serait
  contradictoire). L'état étoile/case reste fonctionnel — seul le ré-ordonnancement est suspendu. Documenté.
- **`ResultsTableView.tsx`** : split rank-0 / rank-1 (quand actif + 2 groupes), `sortCards` par groupe, ligne
  d'en-tête de groupe insérée avant chaque groupe. `handleExportCsv` inchangé (grouping = affichage).
- **`FiltersPanel.tsx`** : toggle sous le select label ; store `setRankedLabelIncludeEquivalents`.
- **`explorer-store.ts`** / **`explorer-search-params.ts`** / **`explorer-active-chips.ts`** : état + URL + chip.

## 7. Tests

- **Unitaires** (Jest) :
  - `explorer-result-sections` : 2 groupes → en-têtes + frontière ; 1 groupe → plat ; vide ; sans filtre → plat ;
    comptes depuis meta vs fallback ; copie actions/équipements selon schéma.
  - `facets` : `label_scheme_ranked_exact_only` émis **uniquement** OFF + présence d'un schéma ; défaut = rien.
  - `explorer-search-params` : round-trip `rankedLabelExact`.
  - table : split + ordre interne par `sortCards`.
  - suites existantes vertes (`facets.test`, `ResultCardView.test`, `explorer-card.test`).
- **SQL** (`test_ranked_label_search.sql` étendu ou `test_label_filter_sections.sql`) : `exact_only` restreint à
  rank-0 ; rank-0 avant rank-1 **avec** un `p_search` ; `label_rank_counts` corrects ; vérifié live via
  `BEGIN; <DDL>; <DO block asserts>; ROLLBACK;` (recette no-Docker §60).

## 8. Déploiement & docs (invariant intégrité)

- Éditer `api_views_functions.sql` (foldé, fresh==live) pour les 2 fonctions ; migration
  `migration_label_filter_sections.sql` (appliquée live) ; entrée au manifest `docs/SQL_ROLLOUT_RUNBOOK.md` ;
  test CI dans le gate fresh-apply. Signature inchangée ⇒ pas de `NOTIFY`.
- Journaliser la décision dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouveau §).

## 9. Hors périmètre / suites

- « Sélectionner TOUS les résultats (toutes pages) » : la case actuelle ne couvre que les pages chargées. En pratique
  les porteurs d'un label sont peu nombreux (ex. CLEF_VERTE ≈ 8) et tiennent en 1–2 pages (`page_size ≤ 200`). Un
  vrai select-all-across-pages est une amélioration séparée.
- Action « sélectionner ce groupe » par section : nice-to-have, non requis (le toggle OFF couvre le besoin).
- Distinction sur la vue Carte (marqueurs) : non pertinente (pas d'ordre).
