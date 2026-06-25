# P4 · I1 — Page assemblée, états & finition

**Lacunes comblées :** [P2/P3] état « accès refusé » nu ; [P3] pas de `:focus-visible`, cible tactile < 44px, rayons/tailles one-off. + composition finale de toutes les phases.
**Phase :** 4 — États, focus & finition.
**Type :** Frontend-only.

## 🎨 Modèle visuel à valider
**Ouvrir :** [`p4-i1-page-assemblee.html`](p4-i1-page-assemblee.html) — la page complète en **état par défaut** (en-tête + icône, encart info, recherche sujet, mode teal, motif, bouton 44px) **et** l'**état « accès refusé »** repensé. Le focus clavier est visible (tabuler dans la page).

---

## Fonctionnalités décrites

### 1. En-tête de page + landmark
- `<main aria-labelledby>` enveloppe la page (landmark), en-tête avec **icône** (UserX, cohérente avec l'item de sidebar), `h1`, sous-titre `ink-2`, et une ligne légale discrète (« Accès réservé au référent RGPD · chaque opération est journalisée »).

### 2. État « accès refusé » pédagogique
- Remplace le `<section><p>` nu (28-36) par une vraie carte : icône cadenas, titre, explication, et **liens d'action** (« contactez votre administrateur / le DPO »).
- `role="alert"`, texte `ink-2` (≥ AA).

### 3. Focus, cibles, échelle (finition transverse)
- **`:focus-visible`** partagé sur liens/boutons/inputs/select/radios (anneau teal, offset 2px) — aujourd'hui inexistant (`box-shadow:none` global, aucun focus).
- **Cibles tactiles ≥ 44px** : bouton de soumission `min-height:44px` (vs ~36px).
- **Échelle de rayons/typo** : remplacer les `rounded-[12px]/[10px]/[8px]` et `text-[13px]` one-off par l'échelle (`rounded-shellXl`=12, `rounded-shellLg`=10, `--radius-*` ; tailles via la grille typo). Cohérence avec le reste de l'app.

### Inventaire des états (tous designés)
| État | Source | Couvert par |
|---|---|---|
| Accès refusé | non référent | P4-I1 (carte) |
| Par défaut (anonymiser) | chargement | P4-I1 |
| Mode suppression | choix delete | P1-I2 (escalade rouge) |
| Confirmation | clic soumettre | P1-I1 (modale + saisie) |
| Traitement | `busy` | P1-I2 (fieldset désactivé + spinner) |
| Succès / avertissements | `result` | P3-I2 (panneau structuré) |

---

## Spec d'implémentation

### Fichiers touchés
- `src/views/RgpdErasurePage.tsx` — en-tête (`<header>` + icône `UserX` de `lucide-react`), `<main>` landmark, état refusé en carte, bouton 44px.
- `src/styles.css` — règle `:focus-visible` partagée (ou utilitaire Tailwind `focus-visible:outline`), si pas déjà globale.
- Remplacer les classes arbitraires par les tokens d'échelle.

### Tests (TDD)
- « l'état refusé rend un titre + des liens d'action (role=alert) » ; « le `<main>` porte le landmark » ; smoke : le bouton a une min-height ≥ 44px ; les éléments interactifs ont un style focus-visible.

### Critère d'acceptation
Tous les états sont designés et cohérents ; navigation clavier visible ; cibles ≥ 44px ; plus de valeurs arbitraires hors échelle. **Score audit cible atteint (18-20/20).**

---

## Vérification finale (après les 4 phases)
- Re-jouer l'audit `impeccable` → viser ≥ 18/20, WCAG AA, 0 token cassé.
- Suite Jest verte ; `tsc` 0 ; `next build` 0.
- Vérif visuelle Explorer/TopBar après le correctif `bg-surface` (P2-I2).
