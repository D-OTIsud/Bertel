# Phase 3 — Découverte type-aware (Explorer)

> Rendre la recherche consciente du type. La donnée existe déjà (les filtres la prouvent) ; il faut l'afficher.

## Objectif
La carte de résultat, la barre de filtres et la carte géo s'adaptent au type d'objet, et une erreur de
requête ne fait plus tomber tout l'Explorer.

## Lacunes couvertes
§2b (carte type-aveugle), buckets fourre-tout + recall (ville sans recherche, pas de filtres actifs), carte sans distinction de type ni légende, S10 (crash plein écran sur erreur).

## Implémentations

### 3.1 — Carte résultat type-aware
Maquette : [mockups/p3-01-carte-resultat.html](mockups/p3-01-carte-resultat.html)
- Un gabarit, un créneau « méta » par archétype : HEB capacité · ITI distance/D+/durée · FMA dates · RES cuisine/couverts · VIS accès · SRV horaires.
- Pastille « ouvert » uniquement quand le statut horaire a du sens (jamais ITI/FMA/VIS).
- **Distinctions conservées (retour PO)** : la carte garde **classement + labels + tags** (déjà portés par `utils/explorer-card.ts` : `readClassificationAndLabelBadges` + `buildTagChips`) et ajoute un **signet « à cheval » sur la miniature** — cocarde étoiles pour un HEB classé, pastilles-logo (Clef Verte, T&H…) pour les objets labellisés, plus une ligne récap classement/labels/tags dans le corps.
- **Fichiers** : `ResultCardView.tsx`, `utils/explorer-card.ts`. **Acceptation** : ligne méta dédiée par type ; pas de pastille ouvert sur ITI/FMA/VIS ; classement/labels/tags visibles ; signet sur les fiches classées/labellisées ; carte cliquable au clavier.

### 3.2 — Barre de filtres actifs & recherche
Maquette : [mockups/p3-02-barre-filtres.html](mockups/p3-02-barre-filtres.html)
- Barre de chips retirables (terme de recherche inclus) + « Tout effacer » + débordement ; multi-select communes avec recherche intégrée (listbox clavier) ; sous-types pour les buckets SRV et VIS (fin du fourre-tout).
- **Fichiers** : `FiltersPanel.tsx`, nouveau `ActiveFilters`, `FilterDropdown.tsx` (recherche + clavier). **Acceptation** : chaque chip se retire seul ; ville cherchable ; SRV/VIS filtrables par sous-type ; recherche visible comme filtre.

### 3.3 — Carte géo type-aware & reprise d'erreur
Maquette : [mockups/p3-03-carte-geo.html](mockups/p3-03-carte-geo.html)
- Marqueurs couleur+icône par archétype ; cluster teinté par composition ; légende des 7 familles ; popup type-aware. Erreur : bannière inline + Réessayer au lieu du remplacement plein écran (`views/ExplorerPage.tsx:61-67`).
- **Fichiers** : `MapPanel.tsx`, `config/map-markers.ts`, `views/ExplorerPage.tsx`, CSS cluster. **Acceptation** : marqueurs/clusters distinguent le type ; légende présente ; erreur inline, Explorer toujours utilisable.

## Séquencement
Après Phases 1 (états/erreur, focus) et 2 (couleurs/libellés de type). Ordre interne : 3.1 → 3.2 → 3.3.

## Critères de réussite de la phase
Chaque type a une carte lisible ; filtres retirables + ville cherchable + sous-types ; carte décodable (légende) ; aucune erreur ne blanchit l'Explorer.
