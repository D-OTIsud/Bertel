# P1 · I1 — Modale de confirmation destructive (remplace `window.confirm`)

**Lacune comblée :** [P1] `window.confirm()` trop faible pour une action irréversible.
**Phase :** 1 — Sécurité & prévention d'erreur.
**Type :** Frontend-only (le contrat backend `requestErasure` ne change pas).

## 🎨 Modèle visuel à valider
**Ouvrir :** [`p1-i1-modale-confirmation.html`](p1-i1-modale-confirmation.html) — rendu fidèle (tokens réels, fonte Manrope/Sora/IBM Plex Mono). La maquette est **interactive** : taper `SUPPRIMER` active le bouton.

État montré : confirmation en **mode suppression** (le cas le plus dangereux), avec récapitulatif + garde « saisie-pour-confirmer ».

---

## Fonctionnalités décrites

### Comportement
- Au clic sur le bouton de soumission, on n'exécute **plus** `window.confirm`. On ouvre le `ConfirmDialog` du produit (`src/features/object-editor/primitives/ConfirmDialog.tsx`), `tone="danger"` en mode suppression, `tone="default"` (teal) en mode anonymisation.
- Le corps de la modale **récapitule explicitement** l'action : `Type de sujet` (label lisible, pas le code), `Identifiant` (mono), `Mode` (chip — « Suppression dure » rouge / « Anonymisation » teal).
- **Garde proportionnée au risque (mode suppression uniquement)** : un champ « saisie-pour-confirmer ». Le bouton `Supprimer le sujet` reste **désactivé** tant que la saisie ≠ identifiant exact **ou** le mot `SUPPRIMER`. C'est l'équivalent UI du `p_confirm_name` exigé par le RPC de hard-delete d'objet (cf. CLAUDE.md).
- En mode **anonymisation**, pas de saisie-pour-confirmer (risque réversible/structure préservée) : simple `Confirmer` / `Annuler`.
- `Annuler`, `Échap`, et le clic sur le scrim ferment sans agir.

### Accessibilité
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (titre) + `aria-describedby` (message).
- **Focus trap** dans la modale ; au montage le focus va sur le champ de saisie (mode suppression) ou sur `Annuler` (mode anonymisation, pour éviter le déclenchement réflexe).
- Le champ a `aria-describedby` vers le hint, qui passe en `aria-live="polite"` pour annoncer « Confirmation validée ».
- `:focus-visible` rouge sur le champ et les boutons.

### États
| État | Rendu |
|---|---|
| Suppression — saisie vide | bouton danger **désactivé**, hint neutre « La saisie doit correspondre exactement. » |
| Suppression — saisie correcte | bouton danger **activé**, hint vert ✓ « Confirmation validée. » |
| Anonymisation | bouton teal `Confirmer`, pas de garde de saisie |
| Traitement | bouton → « Traitement… » + spinner, modale verrouillée (voir P1-I2 pour la désactivation du formulaire sous-jacent) |

---

## Spec d'implémentation

### Composant
Réutiliser `ConfirmDialog` existant, **étendu** d'un mode « garde de saisie » :
```tsx
// nouvelle prop optionnelle
confirmGate?: { expected: string[]; label: ReactNode };  // ex. [subjectId, 'SUPPRIMER']
// le bouton Confirmer est disabled tant que la saisie ∉ expected (trim, sensible à la casse pour 'SUPPRIMER')
```
Si `confirmGate` absent → comportement actuel (anonymisation). Si présent → rendre le champ + gating.

### Fichiers touchés
- `src/features/object-editor/primitives/ConfirmDialog.tsx` — ajout `confirmGate` + champ + état `gateValue`.
- `src/views/RgpdErasurePage.tsx` — remplacer le bloc `window.confirm(...)` (lignes 45-50) par un état `pendingConfirm` + rendu `<ConfirmDialog … />`. `handleSubmit` ne lance plus l'effacement directement : il ouvre la modale ; `onConfirm` appelle l'actuel corps async (`requestErasure`).
- `src/features/object-editor/object-editor.css` — réutilise `.btn`, `.btn.danger`, `.confirm-dialog__message` ; ajouter `.confirm-dialog__recap`, `.confirm-dialog__gate` (styles dans la maquette).

### Tokens
Réutilise `--red` / `--danger-bg` / `--danger-border` / `--danger-ink` (famille `danger` livrée en Phase 2). Aucune couleur en dur.

### Tests (TDD)
- `ConfirmDialog.test.tsx` : « le bouton Confirmer est désactivé tant que la saisie ne figure pas dans `expected` » ; « il s'active sur correspondance exacte » ; « `onConfirm` n'est jamais appelé sans correspondance ».
- `RgpdErasurePage` : « cliquer Soumettre ouvre la modale et n'appelle pas `requestErasure` » ; « confirmer en mode suppression exige la saisie » ; « confirmer en mode anonymisation n'exige pas de saisie ».

### Critère d'acceptation
Aucune suppression dure ne peut partir sans : ouverture de modale + récap + saisie-pour-confirmer validée. `window.confirm` supprimé du fichier.
