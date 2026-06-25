# P1 · I2 — Sélecteur de mode à escalade visuelle + bouton contextuel

**Lacunes comblées :** [P1] chemin destructeur indiscernable du chemin sûr ; bouton de soumission identique pour les deux modes.
**Phase :** 1 — Sécurité & prévention d'erreur.
**Type :** Frontend-only.

## 🎨 Modèle visuel à valider
**Ouvrir :** [`p1-i2-mode-escalade.html`](p1-i2-mode-escalade.html) — interactif : cliquer « Supprimer définitivement » fait basculer le mode **et** le bouton en rouge danger ; « Anonymiser » revient au teal.

---

## Fonctionnalités décrites

### Comportement
- Les deux radios texte actuels (lignes 124-143) deviennent deux **cartes-option** sélectionnables (`role="radio"` dans un `role="radiogroup"`), chacune avec icône + titre + description courte.
- **Escalade visuelle du mode** :
  - *Anonymiser* sélectionné → bordure + fond teal (`--teal` / `--teal-tint`), badge `Recommandé`.
  - *Supprimer définitivement* sélectionné → bordure + fond **danger** (`--red` / `--danger-bg`), badge `Irréversible` (icône triangle).
- **Bouton de soumission contextuel** : libellé + couleur suivent le mode.
  - anonymiser → teal, « Anonymiser le sujet ».
  - supprimer → rouge `--red`, « Supprimer le sujet ».
- **Note de pied contextuelle** sous le bouton : neutre en anonymisation (« Action journalisée. Une confirmation sera demandée. »), danger en suppression (« Irréversible — confirmation par saisie requise. »).
- **Désactivation du formulaire pendant le traitement** : pendant `busy`, tous les contrôles (`fieldset disabled`) + le bouton passent en « Traitement… » avec spinner (corrige le fait qu'aujourd'hui on peut modifier les champs en cours d'envoi).

### Accessibilité
- `radiogroup` + `radio` avec gestion clavier : flèches pour naviguer, Espace/Entrée pour choisir, `tabindex` roving (l'option active = `0`, l'autre = `-1`).
- L'escalade ne repose pas **que** sur la couleur : badge texte (`Recommandé`/`Irréversible`) + icône + libellé du bouton portent aussi l'information (WCAG 1.4.1).
- Cible tactile du bouton ≥ 44px (corrige le P3 « bouton ~36px »).
- `:focus-visible` sur cartes et bouton.

### États
| Mode | Carte | Bouton | Note |
|---|---|---|---|
| Anonymiser (défaut) | teal, badge Recommandé | teal « Anonymiser le sujet » | neutre |
| Supprimer | rouge, badge Irréversible | rouge « Supprimer le sujet » | danger |
| Traitement (`busy`) | `fieldset` désactivé | « Traitement… » + spinner, désactivé | — |

---

## Spec d'implémentation

### Fichiers touchés
- `src/views/RgpdErasurePage.tsx` :
  - remplacer le `<fieldset>` radios (124-144) par le composant `ModeSelect` (cartes-option).
  - bouton de soumission : classe/couleur dérivée de `mode` (`mode === 'delete' ? danger : primary`), libellé déjà conditionnel.
  - envelopper les contrôles dans un `<fieldset disabled={busy}>`.
- Nouveau `src/views/rgpd/ModeSelect.tsx` (présentational pur, props `value: ErasureMode`, `onChange`).
- CSS : nouvelles classes `.rgpd-mode*`, `.rgpd-submit` (styles dans la maquette) — ou utilitaires Tailwind équivalents (`border-teal bg-teal-tint` / `border-[--red] bg-danger-bg`).

### Tokens
Réutilise `--teal`/`--teal-soft`/`--teal-tint` et la famille `danger` (Phase 2). Le bouton danger = `--red`. Zéro couleur en dur.

### Tests (TDD)
- `ModeSelect.test.tsx` : « sélectionner Supprimer émet `onChange('delete')` » ; « le clavier flèche/Espace bascule le mode » ; « aria-checked suit la sélection ».
- `RgpdErasurePage` : « en mode delete le bouton porte la classe danger et le libellé Supprimer » ; « `busy` désactive le fieldset ».

### Critère d'acceptation
À tout instant, le mode destructeur est visuellement distinct (couleur **+** texte **+** icône) ; le bouton de soumission reflète le mode ; le formulaire est verrouillé pendant l'envoi. Lien avec P1-I1 : le clic sur ce bouton ouvre la modale de confirmation (saisie-pour-confirmer si delete).
