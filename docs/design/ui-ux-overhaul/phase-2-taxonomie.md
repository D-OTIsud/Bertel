# Phase 2 — Taxonomie unifiée & libellés

> Petite phase, fort impact : elle supprime le défaut-racine derrière la plupart des problèmes par type.

## Objectif
Une **seule** table type→famille partagée par l'Explorer, l'éditeur et le drawer, et un résolveur de
libellés FR unique pour ne plus jamais afficher de code brut.

## Lacunes couvertes
§2a (deux taxonomies divergentes), S2 (codes affichés comme libellés).

## Le défaut-racine
Il existe aujourd'hui **deux groupements 7-voies des mêmes 19 types qui ne coïncident pas** :
- `archetypes.ts` (éditeur/drawer) : HEB / RES / ASC / ITI / VIS / SRV / FMA.
- `utils/facets.ts:24-32` (Explorer) : où `LOI` est rangé sous « Activités », `ASC` sous « Services », `VIL` sous « Visites ».

Conséquence : on classe une fiche d'une façon pour la trouver et d'une autre pour l'éditer.

## Implémentation

### 2.1 — Taxonomie unifiée & résolveur de libellés
Maquette : [mockups/p2-01-taxonomie-libelles.html](mockups/p2-01-taxonomie-libelles.html)
- Table canonique `type → (libellé FR, archétype, couleur, icône)` unique, source de vérité partagée.
- Résolveurs : `resolveTypeLabel`, `resolveArchetype`, `resolveRoleLabel`, `resolveSchemeLabel`.
- Alignement des buckets Explorer sur les archétypes (LOI→VIS, ASC→ASC, VIL→SRV).
- **Fichiers** : nouveau `src/utils/labels.ts` (ou extension de `archetypes.ts`), `utils/facets.ts` (buckets), `ActiveFilterStrip.tsx`, `ActualisationTable.tsx`, `CompletenessTable.tsx`, `MembersTable.tsx`, `crm-primitives.tsx`.
- **Acceptation** : aucun code brut affiché comme libellé ; le bucket Explorer d'un type == son archétype éditeur ; couleurs de type identiques sur les 3 surfaces.

## Séquencement
Après Phase 1 (consomme les tokens couleur d'archétype). Consommée ensuite par les phases 3, 4 et 5
(pastilles de type, libellés, couleurs).

## Critères de réussite de la phase
Une seule taxonomie ; pastilles `type-pill acc-*` cohérentes Explorer ↔ éditeur ↔ drawer ; zéro code brut.
