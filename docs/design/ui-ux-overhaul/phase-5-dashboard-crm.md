# Phase 5 — Dashboard, CRM & surfaces secondaires

> La où se concentre le « slop » : hiérarchie absente, modales lourdes, deux design systems, pages stub cassées en prod.

## Objectif
Donner au dashboard une vraie hiérarchie type-aware, dé-modaliser le CRM, unifier le langage visuel
(Team/RGPD sur le vocabulaire maison) et rendre honnêtes les pages non livrées.

## Lacunes couvertes
S9 (grille hero-metric 6×), dashboard non type-aware, CRM modal-lourd + états vides nus, S3 (deux design systems), pages stub « cassées » en prod, texte debug du login.

## Implémentations

### 5.1 — Bandeau résumé dashboard
Maquette : [mockups/p5-01-dashboard.html](mockups/p5-01-dashboard.html)
- Une métrique meneuse (grand format) + 2 secondaires + une carte d'attention (demandes) + une barre « Corpus par type » + un tableau « Complétude par type ». Remplace les 6 cartes égales.
- **Fichiers** : `ScorecardStrip.tsx`, nouveau `TypeBreakdown.tsx`, `views/DashboardPage.tsx`. **Acceptation** : contraste d'échelle (une métrique domine) ; corpus ventilé par type ; libellés (pas de codes).

### 5.2 — Éditeur acteur en drawer (dé-modalisation)
Maquette : [mockups/p5-02-crm-acteur.html](mockups/p5-02-crm-acteur.html)
- L'édition d'un acteur (identité + coordonnées + adresses + portrait) passe d'une modale 560px à un drawer latéral avec barre de sauvegarde collante ; la modale d'interaction abandonne le formulaire de tâche imbriqué au profit d'un « + Ajouter une relance » après sauvegarde ; états vides qui enseignent.
- **Fichiers** : `CrmActorModals.tsx` → drawer, `CrmInteractionModal.tsx`, `CrmAnnuaire.tsx`. **Acceptation** : plus de formulaire-dans-formulaire-dans-modale ; place pour respirer ; barre de save collante.

### 5.3 — Unification design system & pages secondaires
Maquette : [mockups/p5-03-unification.html](mockups/p5-03-unification.html)
- Team et RGPD portés sur le vocabulaire maison (`panel/btn/chip`, `ConfirmDialog` thémé) ; pages stub (audits/moderation/publications) rendent l'`EmptyState` « disponible au lot N » en prod (au lieu d'un hero sur une liste vide à boutons inertes) ; login nettoyé (pas de texte debug, accents FR).
- **Fichiers** : `features/team/*`, `views/TeamAdminPage.tsx`, `views/RgpdErasurePage.tsx`, pages stub, `views/LoginPage.tsx`. **Acceptation** : un seul vocabulaire visuel ; aucun module inerte en prod ; aucun texte debug public.

## Séquencement
Après Phases 1 (EmptyState, focus, contraste) et 2 (libellés/couleurs). Ordre interne libre ; 5.3 dépend de l'`EmptyState` (1.2).

## Critères de réussite de la phase
Dashboard hiérarchisé et type-aware ; CRM sans modale lourde ; un seul design system app-wide ; pages non livrées honnêtes ; login propre.
