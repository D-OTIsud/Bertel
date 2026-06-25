# P2 · I2 — Contraste, alertes sémantiques & correctif token `bg-surface`

**Lacunes comblées :** [P1] contrastes sous AA (`ink-3` ≈ 4.0:1 ; warnings orange ≈ 2.0:1) ; [P2] `bg-surface` → token `--bg-surface` inexistant (systémique, 22 occurrences).
**Phase :** 2 — Lisibilité & intégrité du thème.
**Type :** Frontend + diff tokens (CSS + Tailwind).

## 🎨 Modèle visuel à valider
**Ouvrir :** [`p2-i2-contraste-alertes.html`](p2-i2-contraste-alertes.html) — trois comparaisons **avant/après** : (1) guidance `ink-3`→`ink-2`, (2) avertissements orange illisibles → **chips d'alerte** warn/danger, (3) champ transparent → fond blanc plein.

---

## Fonctionnalités décrites

### 1. Contraste de la guidance
- Tous les textes de corps/guidance passent de `text-ink-3` (#6a7a82, ≈ 4.0:1 sur le fond de page) à `text-ink-2` (#3a525c, ≈ 7:1).
- `ink-3` reste autorisé **uniquement** pour des éléments décoratifs/larges (jamais du texte courant < 18px posé sur le fond de page).
- Concerné : sous-titre d'en-tête (83), hint d'identifiant (121), guidances de mode (133/142), `<summary>` (178), message « accès refusé » (31).

### 2. Avertissements en chips sémantiques
- `text-orange` (#f28b54, ≈ 2.0:1) **supprimé** comme couleur de texte d'alerte.
- Les avertissements stockage/compte (173/176) deviennent des **chips d'alerte** :
  - stockage → variante `warn` (fond `--warn-bg`, texte `--warn-ink` #7a4e12 ≈ 6:1, icône triangle ambre).
  - compte → variante `danger` (échec d'une opération de sécurité = rouge `--danger-ink` #8f3322 ≈ 6.5:1).
- Chaque chip : icône + libellé gras + phrase d'action (« seront repris par le GC », « action manuelle requise »).

### 3. Correctif systémique `bg-surface`
- `tailwind.config.js` mappe `surface → var(--bg-surface)` (**inexistant**) ⇒ `.bg-surface { background-color: var(--bg-surface) }` résout vers `transparent`. Idem `base → --bg-base`, `elevated → --bg-elevated`.
- Correctif : pointer vers les tokens **qui existent** :
```js
base:     'var(--bg)',
surface:  'var(--surface)',       // ⇐ corrige les inputs transparents (RGPD + 21 autres)
elevated: 'var(--panel-strong)',
```

---

## Spec d'implémentation

### Tokens
Familles `warn` + `danger` (plan global §4) ; correctif `surface/base/elevated` ci-dessus.

### Fichiers touchés
- `tailwind.config.js` — correctif `surface/base/elevated` + familles `warn`/`danger`.
- `src/styles.css` — tokens `--warn-*` / `--danger-*`.
- `src/views/RgpdErasurePage.tsx` — `text-ink-3` → `text-ink-2` sur les textes de corps ; bloc résultat : avertissements → `<Callout variant="warn|danger">` (composant de P2-I1).
- Vérification visuelle hors-RGPD : ouvrir l'Explorer / TopBar après le correctif `surface` (les contrôles y étaient déjà blancs car posés sur panneaux blancs ; confirmer aucune régression).

### Tests (TDD)
- Test unitaire/visuel : aucun texte courant n'utilise `ink-3`/`text-orange` comme couleur sur fond de page.
- (Optionnel) test de non-régression Tailwind : `surface` génère bien `var(--surface)`.

### Critère d'acceptation
Tous les textes ≥ 4.5:1 ; plus aucun avertissement en orange-sur-clair ; `bg-surface` rend un blanc plein partout. Contrastes mesurés documentés dans la PR.
