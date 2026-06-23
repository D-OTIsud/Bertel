# Phase 1 — Fondations (design system, a11y, perf, thème)

> Prérequis de toutes les autres phases. Surtout du CSS/config, peu de risque, fort levier.
> Cible : audit technique 8/20 → ~14/20.

## Objectif
Lever la dette transverse relevée par l'audit (accessibilité, performance, thème) et poser les
composants réutilisables (états vides, squelettes) consommés ensuite par l'Explorer, le drawer, le
dashboard et le CRM.

## Lacunes couvertes
S1 (focus), S4 (états vides/skeletons), S5 (perf fonts/dégradé), S6 (sprawl de tokens), S7 (contraste), S8 (mouvement).

## Implémentations

### 1.1 — Design system & fondations
Maquette : [mockups/p1-01-design-system.html](mockups/p1-01-design-system.html) · Référence visuelle de tout le dossier (`assets/bertel-ui.css`).
- **Focus (S1)** : règle globale `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }` + suppression des `outline:none` non remplacés (12 sites). Aujourd'hui seul la sidebar a un anneau.
- **Contraste (S7)** : `--muted` #66767d (4.44:1) → #5c6a71 (5.1:1) ; retrait de #94a1a8 sur du texte.
- **Mouvement (S8)** : `@media (prefers-reduced-motion: reduce)` global ; easing ease-out-expo (fin du bounce sur les marqueurs).
- **Perf (S5)** : `next/font/google` (fin du `@import` Google Fonts bloquant) ; fond dégradé non `background-attachment: fixed` (repaint au scroll).
- **Thème (S6)** : une seule famille de tokens (suppression doublons `--orange-soft`/`--accent-soft`, des 2 échelles radius et ombre, des hex en dur).
- **Distinctions (retour PO)** : jeu de composants partagés — cocarde classement (étoiles/clés/épis) « à cheval » sur la miniature, pastilles-logo de label (Clef Verte, Tourisme & Handicap, Qualité Tourisme, Écolabel UE, Destination Excellence) et puces de tag colorées ; consommés par les cartes (3.1), la carte géo (3.3) et les fiches (4.x). Classes : `.thumb__rating`, `.thumb__labels`/`.label-logo`, `.stars`, `.label-chip`, `.tag-chip`, `.distinction-highlight`.
- **Fichiers** : `src/styles.css`, `src/features/object-editor/object-editor.css`, `src/app/layout.tsx`.
- **Acceptation** : Tab clavier → anneau visible partout ; Lighthouse a11y ≥ 95 ; AA contraste ; OS « réduire animations » respecté ; aucun token dupliqué.

### 1.2 — États vides & squelettes
Maquette : [mockups/p1-02-etats-vides.html](mockups/p1-02-etats-vides.html)
- Composant `EmptyState` réutilisable avec un `mode` : `no-data` (CTA créer), `filtered` (CTA réinitialiser), `coming-soon` (lot à venir), `error` (Réessayer). Remplace tous les « Aucun X » nus.
- Squelettes calqués sur la vraie mise en page (pas de spinner central) ; un état d'erreur conserve la dernière donnée valide.
- **Fichiers** : nouveau `src/components/common/EmptyState.tsx`, `WidgetFrame.tsx`, `CrmAnnuaire.tsx`, `CrmTaches.tsx`, `ResultsList.tsx`, pages stub.
- **Acceptation** : chaque liste distingue « pas de donnée » de « filtré à vide » ; squelette au chargement initial ; l'erreur n'efface pas le reste.

## Séquencement
1.1 d'abord (fondation CSS), 1.2 ensuite (s'appuie sur les tokens/états de 1.1). Aucune dépendance externe.

## Critères de réussite de la phase
Anneau de focus universel · contraste AA · reduced-motion respecté · fonts auto-hébergées · 1 seule famille de tokens · composant `EmptyState` disponible pour les phases 3/4/5.
