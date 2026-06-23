# Phase 4 — Présentation type-aware (Drawer)

> Une fiche correcte par type, pilotée par configuration, en remplacement des six gabarits clonés.

## Objectif
Remplacer les 6 vues quasi-identiques d'`ObjectDetailView.tsx` (3588 lignes) par une vue
**config-driven** lisant `ARCHETYPE_SECTIONS[archetype]` (qui alimente aussi les onglets), et créer les
blocs réellement manquants (Événement, Restaurant, Activité, Itinéraire réel).

## Lacunes couvertes
§2c (6 clones), FMA sans dates, RES sans menu, ASC générique, étapes ITI fabriquées, contrôles dead-end sur une surface read-only, états vides nus.

## Implémentations

### 4.1 — Fiche Événement (FMA)
Maquette : [mockups/p4-01-detail-evenement.html](mockups/p4-01-detail-evenement.html)
- Hero « Prochaine date » (date/heure/lieu + billetterie) + liste des occurrences + badge récurrence. FMA tombe aujourd'hui sur le gabarit générique sans aucune date.
- **Données** : `parsed.fma` / `fma_occurrences` (déjà extraites par le parser). **Fichiers** : `ObjectDetailView.tsx` + `ARCHETYPE_SECTIONS`. **Acceptation** : un événement mène par le quand/où ; pas d'onglet « Tarifs (0) » ; onglets dérivés des sections rendues.

### 4.2 — Fiche Restaurant (RES)
Maquette : [mockups/p4-02-detail-restaurant.html](mockups/p4-02-detail-restaurant.html)
- Aperçu cuisine + régimes + gamme prix ; carte/menu structurée (groupes → plats + prix) ; lien PDF. Aujourd'hui aucun de ces éléments n'est affiché (modèle §104 pourtant rempli).
- **Fichiers** : `ObjectDetailView.tsx` + config. **Acceptation** : cuisine + menu + régimes visibles ; équipements ne sont pas en tête.

### 4.3 — Fiche Activité (ASC) & Itinéraire (ITI)
Maquette : [mockups/p4-03-detail-activite-itineraire.html](mockups/p4-03-detail-activite-itineraire.html)
- Activité : durée/niveau/groupe/âge, point de RDV, encadrement, équipement (`object_act` non surfacé aujourd'hui). Itinéraire : KPIs + étapes **réelles** (`object_iti_stage`, aujourd'hui fabriquées) + profil altimétrique + trace GPX.
- **Fichiers** : `ObjectDetailView.tsx` + config. **Acceptation** : faits d'activité affichés ; étapes ITI réelles (sans interpolation) ; GPX surfacé ou omis honnêtement.

## Transverse à la phase
- **Distinctions conservées (retour PO)** : chaque fiche garde sa section **Classements / Labels / Tags** (groupes `ObjectDetailView.tsx:248-273` : Classements / Engagements durables / Labels / Badges + bandeau highlights) et la miniature/hero porte le **signet à cheval** — cocarde étoiles pour un HEB classé, pastilles-logo de label sinon.
- Vue **config-driven** unique (supprime la dérive des 6 clones et les onglets qui « mentent »).
- Retrait des contrôles dead-end « Modifier/Voir versions » sur une surface read-only ; un seul lien « Modifier la fiche » → éditeur.
- Suppression des 5 fichiers `Object*Panel.tsx` morts + découpe du fichier de 3588 lignes.

## Séquencement
Après Phases 1 (états/typo) et 2 (couleurs/libellés). Ordre interne : 4.1 → 4.2 → 4.3 (la refonte config-driven sous-tend les trois).

## Critères de réussite de la phase
Matrice par type (§2b de l'audit) sans case rouge en présentation ; onglets = sections réellement rendues ; aucune donnée fabriquée ; aucun contrôle dead-end.
