# P2 · I1 — Encart « périmètre » reconstruit (tokens `info` réels)

**Lacune comblée :** [P1] l'encart périmètre rend sans fond ni bordure — `bg-info-bg` / `border-info-border` ne sont définis ni dans `tailwind.config.js` ni dans `styles.css` (utilisés **uniquement** sur cette page).
**Phase :** 2 — Lisibilité & intégrité du thème.
**Type :** Frontend + petit diff tokens (CSS + Tailwind).

## 🎨 Modèle visuel à valider
**Ouvrir :** [`p2-i1-encart-perimetre.html`](p2-i1-encart-perimetre.html) — montre **avant** (le bloc actuel, transparent) puis **après** (encart info reconstruit : icône, titre, corps, chips « touche / ne touche pas »).

---

## Fonctionnalités décrites

### Comportement
- L'encart devient un vrai composant `<Callout variant="info">` : icône d'information, **titre** (« Ce que cet outil touche — et ce qu'il ne touche pas »), corps, et **3 chips** qui résument visuellement le périmètre (✓ données du sujet · ✗ référentiel public · ⊕ tracé au registre).
- Le contenu existant (déjà juste) est conservé ; on lui donne enfin la **hiérarchie et la surface** qui en font un vrai « stop and read ».

### Accessibilité
- `role="note"` + `aria-label="Périmètre de l'outil"`.
- Texte `--info-ink` (#21465e) sur `--info-bg` (#e9f0f7) ≈ **8.2:1** (AAA).
- L'information « touche / ne touche pas » n'est pas portée que par la couleur : icônes ✓/✗ + libellés.

---

## Spec d'implémentation

### Tokens (fix de la cause racine)
Ajouter la famille `info` (dérivée du bleu de marque #327090 déjà présent dans le glow `body`) :
```css
/* src/styles.css :root */
--info-bg:#e9f0f7; --info-border:#cdddea; --info-ink:#21465e; --info-accent:#327090;
```
```js
// tailwind.config.js → colors
info: { bg:'var(--info-bg)', border:'var(--info-border)', ink:'var(--info-ink)', accent:'var(--info-accent)' }
```
Après ce diff, `bg-info-bg` / `border-info-border` résolvent réellement (et deviennent réutilisables ailleurs : notices, bandeaux).

### Composant
`src/components/ui/Callout.tsx` — réutilisable, `variant: 'info' | 'warn' | 'danger'` (les variantes warn/danger servent en P2-I2 et P3-I2). Slots : `icon`, `title`, `children`, `chips?`.

### Fichiers touchés
- `src/styles.css`, `tailwind.config.js` — tokens `info` (+ `warn`/`danger` mutualisés, cf. plan global §4).
- `src/views/RgpdErasurePage.tsx` — remplacer le `<div className="… bg-info-bg …">` (88-95) par `<Callout variant="info" title=… chips=… >`.
- Nouveau `src/components/ui/Callout.tsx` (+ `.callout*` CSS).

### Tests (TDD)
- `Callout.test.tsx` : rend le `role="note"`, le titre, les enfants, les chips.
- Garde anti-régression : un test qui vérifie que la classe info **résout** (snapshot de style calculé non vide) — ou, plus simple, qu'on n'utilise plus `bg-info-bg` littéral mais la famille Tailwind `info`.

### Critère d'acceptation
L'encart a un fond + une bordure + une icône + une hiérarchie ; aucune classe ne résout vers `transparent`. La famille `info` est un token réel, réutilisable.
