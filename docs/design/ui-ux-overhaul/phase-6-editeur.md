# Phase 6 — Éditeur (polish)

> Surface la plus forte de l'app ; il s'agit de polir la priorité d'action, la densité, la navigation et le mobile.
> Peut démarrer en parallèle des phases 3/4/5 dès que la Phase 1 est faite.

## Objectif
Re-prioriser l'enregistrement, alléger les sections les plus denses, rendre la navigation lisible et
clavier-utilisable, et adapter l'éditeur aux tablettes.

## Lacunes couvertes
Save-bar (Publier en primaire), §07/§16 trop denses, nav à numéros non contigus sans focus/roving, absence de responsive, BlockASC clobber.

## Implémentations

### 6.1 — Barre d'enregistrement re-priorisée
Maquette : [mockups/p6-01-barre-save.html](mockups/p6-01-barre-save.html)
- « Enregistrer » devient l'action primaire (teal + anneau de focus), « Publier » un acte secondaire distinct avec son propre libellé occupé (« Publication… ») ; pastille de modifs + horodatage relatif conservés.
- **Fichiers** : `shell/EditorTopbar.tsx`. **Acceptation** : sauvegarder est l'affordance primaire ; publier est délibéré ; états occupé/désactivé/focus corrects.

### 6.2 — Sections denses en disclosure
Maquette : [mockups/p6-02-sections-disclosure.html](mockups/p6-02-sections-disclosure.html)
- §07 Capacité : StatCards + disclosures « Détails capacité / Politique groupes / Politique animaux ». §16 Lieux : trois disclosures (Sous-lieux / Étapes / Communes) avec états vides qui enseignent. Correctif BlockASC : un seul contrôle par champ (fin du clobber `durationMin`/`equipmentProvided`).
- **Fichiers** : `SectionCapacity.tsx`, `SectionPlaces.tsx`, `sections/blocks/BlockASC.tsx`. **Acceptation** : §07/§16 ne déversent plus tout ; un contrôle par champ ; disclosures avec états vides.

### 6.3 — Navigation éditeur & responsive
Maquette : [mockups/p6-03-nav-responsive.html](mockups/p6-03-nav-responsive.html)
- Nav groupée et libellée (fin des numéros à trous), `:focus-visible` + navigation clavier (roving), raison de désactivation visible (plus dans un `title`) ; layout responsive (nav repliée < ~1024px, corps en une colonne) ; cibles tactiles 44px.
- **Fichiers** : `shell/EditorNav.tsx`, `section-config.ts`, `object-editor.css` (media queries, 44px). **Acceptation** : nav lue comme contiguë ; roving + focus visible ; utilisable sur tablette.

## Séquencement
Après Phase 1 (focus/motion/EmptyState). Indépendant des phases 2/3/4/5 ; peut être mené en parallèle. Ordre interne : 6.1 → 6.2 → 6.3.

## Critères de réussite de la phase
Enregistrer = primaire ; §07/§16 respirables ; un contrôle par champ ; nav contiguë clavier-accessible ; éditeur utilisable en tablette.
