# RGPD — Plan de refonte par phases (combler toutes les lacunes de l'audit)

**Page cible :** `bertel-tourism-ui/src/views/RgpdErasurePage.tsx` (route `/rgpd`)
**Audit source :** [`../rgpd-page-design-audit-2026-06-23.md`](../rgpd-page-design-audit-2026-06-23.md) — score **14/20** (Good)
**Registre :** Produit (outil interne, thème clair uniquement)
**Date :** 2026-06-23

> Ce dossier contient **un fichier de plan global** (ce fichier) **+ un fichier par implémentation**.
> Chaque fichier d'implémentation porte **un modèle visuel haute-fidélité à valider** (maquette `.html` ouvrable, rendue avec les **vrais tokens** du produit — pas un wireframe) **et** les fonctionnalités décrites.

---

## 1. Principe directeur

L'audit a montré que le problème n'est pas l'« AI-slop » mais un **décalage entre l'enjeu de l'action et le poids de l'UI** : c'est l'écran le plus dangereux de l'application (effacement définitif de données personnelles, suppression en cascade dure), et ce sont précisément les chemins les plus risqués qui reçoivent le moins de design.

**Objectif de la refonte :** porter le poids visuel et les garde-fous d'interaction au niveau de l'enjeu, **sans** alourdir l'outil. Cible : **18-20/20**, WCAG AA atteint, zéro token cassé, zéro write-trap de prévention d'erreur.

Contrainte transverse (CLAUDE.md) : aucune logique de couleur/affordance codée en dur — tout passe par des **tokens** ; le danger réutilise `--red` (#c85c48, déjà destructif dans le design system) ; les modales réutilisent le `ConfirmDialog`/`Dialog` existant.

---

## 2. Cartographie lacunes → phase → implémentation

| Lacune (audit) | Sév. | Phase | Implémentation |
|---|---|---|---|
| Encart périmètre sans fond ni bordure (`info-bg`/`info-border` non définis) | P1 | 2 | [`p2-i1-encart-perimetre`](p2-i1-encart-perimetre.md) |
| Chemin destructeur indiscernable du chemin sûr | P1 | 1 | [`p1-i2-mode-escalade`](p1-i2-mode-escalade.md) |
| `window.confirm()` pour une action irréversible | P1 | 1 | [`p1-i1-modale-confirmation`](p1-i1-modale-confirmation.md) |
| Contrastes sous AA (`ink-3` ≈ 4.0:1 ; warnings orange ≈ 2.0:1) | P1 | 2 | [`p2-i2-contraste-alertes`](p2-i2-contraste-alertes.md) |
| `bg-surface` → token `--bg-surface` inexistant (systémique) | P2 | 2 | [`p2-i2-contraste-alertes`](p2-i2-contraste-alertes.md) |
| Champ sujet : UUID brut, pas de résolution, pas d'aperçu | P1/P2 | 3 | [`p3-i1-champ-sujet`](p3-i1-champ-sujet.md) |
| Hint dupliqué (placeholder + span) non associé | P2 | 3 | [`p3-i1-champ-sujet`](p3-i1-champ-sujet.md) |
| `JSON.stringify` brut comme seul résultat lisible | P2 | 3 | [`p3-i2-panneau-resultat`](p3-i2-panneau-resultat.md) |
| État « accès refusé » nu, sans en-tête/landmark | P2/P3 | 4 | [`p4-i1-page-assemblee`](p4-i1-page-assemblee.md) |
| Pas de `:focus-visible`, cible tactile < 44px, rayons one-off | P3 | 4 | [`p4-i1-page-assemblee`](p4-i1-page-assemblee.md) |

---

## 3. Les 4 phases

### Phase 1 — Sécurité & prévention d'erreur *(le cœur de l'action irréversible)*
**Pourquoi en premier :** valeur la plus haute, traite le décalage enjeu↔poids.
- [`p1-i1-modale-confirmation`](p1-i1-modale-confirmation.md) — remplace `window.confirm` par le `ConfirmDialog` du produit + **saisie-pour-confirmer** en mode suppression (taper l'identifiant ou `SUPPRIMER`), récap explicite (type · id · mode).
- [`p1-i2-mode-escalade`](p1-i2-mode-escalade.md) — sélecteur de mode à **escalade visuelle** (l'option « Supprimer définitivement » devient rouge/danger) + bouton de soumission **contextuel** (teal = anonymiser, rouge = supprimer). Désactivation du formulaire pendant le traitement.

**Critère de sortie :** impossible de déclencher une suppression dure sans un acte de confirmation explicite et proportionné ; le mode destructeur est visuellement distinct à tout moment.

### Phase 2 — Lisibilité & intégrité du thème
- [`p2-i1-encart-perimetre`](p2-i1-encart-perimetre.md) — encart « périmètre » reconstruit avec une **famille de tokens `info` sémantique** réelle (fond + bordure + texte), icône, hiérarchie.
- [`p2-i2-contraste-alertes`](p2-i2-contraste-alertes.md) — passage du corps guidance `ink-3`→`ink-2`, **alertes** en chips `danger`/`warn` (fin de l'orange illisible), et **correctif systémique** du token `bg-surface` (aligner `surface/base/elevated` sur les tokens qui existent).

**Critère de sortie :** tous les textes ≥ 4.5:1 ; aucune classe de couleur ne résout vers `transparent`/absent ; un seul référentiel de tokens.

### Phase 3 — Clarté : saisie du sujet & résultat
- [`p3-i1-champ-sujet`](p3-i1-champ-sujet.md) — champ sujet repensé : **résolution par nom/email** (recherche → choix → l'UUID est rempli), validation de format, **aperçu** de ce qui sera effacé avant l'action, hint unique associé via `aria-describedby`.
- [`p3-i2-panneau-resultat`](p3-i2-panneau-resultat.md) — panneau de résultat **structuré** (récap lisible : lignes/fichiers/compte supprimés, avertissements en chips) + JSON brut en repli dans un `<details>`.

**Critère de sortie :** l'opérateur peut résoudre un sujet sans connaître l'UUID, voir l'impact **avant** de confirmer, et lire le résultat sans JSON.

### Phase 4 — États, focus & finition
- [`p4-i1-page-assemblee`](p4-i1-page-assemblee.md) — page complète assemblée : en-tête de page (titre + landmark + icône), **état « accès refusé » pédagogique**, `:focus-visible` partagé, cibles tactiles 44px, échelle de rayons/typo (fin des `rounded-[12px]`/`text-[13px]` one-off).

**Critère de sortie :** chaque état (par défaut, suppression, traitement, succès, refusé) est designé ; navigation clavier visible ; cohérence avec le reste de l'app.

---

## 4. Additions au design system (introduites par cette refonte)

Tokens à ajouter dans `src/styles.css` (`:root`) **et** à mapper dans `tailwind.config.js`. Dérivés des couleurs déjà présentes (bleu de glow #327090, rouge destructif #c85c48, ambre #d6933a) pour rester on-brand. Contrastes vérifiés AA.

```css
/* Famille INFO (encart périmètre, notices) — dérivée du bleu de marque #327090 */
--info-bg:      #e9f0f7;   /* fond pâle */
--info-border:  #cdddea;   /* bordure */
--info-ink:     #21465e;   /* texte ≈ 8.2:1 sur --info-bg */
--info-accent:  #327090;   /* icône / filet */

/* Famille DANGER (alertes destructives, chips) — dérivée de --red #c85c48 */
--danger-bg:     #fbece9;
--danger-border: #eccabf;
--danger-ink:    #8f3322;  /* texte ≈ 6.5:1 sur --danger-bg */
--danger-strong: #c85c48;  /* = --red (bouton, filet) */

/* Famille WARNING (avertissements stockage/auth) — dérivée de --warning #d6933a */
--warn-bg:     #fbf0dd;
--warn-border: #ecd3a6;
--warn-ink:    #7a4e12;    /* texte ≈ 6.0:1 sur --warn-bg */
--warn-strong: #d6933a;
```

```js
// tailwind.config.js — exposer les familles + CORRIGER la dérive surface/base/elevated
colors: {
  // … existant …
  // Correctif P2 : ces 3 pointaient vers des tokens inexistants (--bg-surface/base/elevated).
  base:     'var(--bg)',            // était var(--bg-base)  ❌
  surface:  'var(--surface)',       // était var(--bg-surface) ❌  ⇒ rendait les inputs transparents
  elevated: 'var(--panel-strong)',  // était var(--bg-elevated) ❌
  info:   { bg: 'var(--info-bg)',   border: 'var(--info-border)',   ink: 'var(--info-ink)',   accent: 'var(--info-accent)' },
  danger: { bg: 'var(--danger-bg)', border: 'var(--danger-border)', ink: 'var(--danger-ink)', strong: 'var(--danger-strong)' },
  warn:   { bg: 'var(--warn-bg)',   border: 'var(--warn-border)',   ink: 'var(--warn-ink)',   strong: 'var(--warn-strong)' },
}
```

> Le correctif `surface/base/elevated` touche **22 occurrences hors RGPD** (Explorer, TopBar, FiltersPanel…). Il est masqué ailleurs (contrôles posés sur des panneaux déjà blancs) mais réel. À faire dans la même passe, avec une vérification visuelle rapide de l'Explorer.

---

## 5. Séquencement & dépendances

```
Phase 1 (sécurité) ─┐
                    ├─► indépendantes au niveau code (fichiers/props distincts)
Phase 2 (thème)    ─┘     mais Phase 2 fournit les tokens info/danger/warn
                          consommés par P1-i2 (bouton danger) et P3 (chips).
Phase 3 (clarté)   ──► dépend des tokens de Phase 2 (chips danger/warn).
Phase 4 (assemblage) ──► dépend de toutes : compose l'écran final.
```

Ordre de livraison recommandé : **tokens (extrait de P2) → P1 → reste de P2 → P3 → P4**.
Les tokens info/danger/warn sont livrés en premier (petit diff CSS/Tailwind) pour débloquer P1-i2 et P3.

---

## 6. Validation & tests (par implémentation)

Chaque implémentation est livrée en TDD (cf. règles projet) :
- **Visuel à valider** : ouvrir la maquette `.html` du fichier (rendu fidèle, tokens réels) — c'est l'étape de validation design **avant** code.
- **Tests** : specs Jest/RTL par comportement (ex. « le bouton Confirmer reste désactivé tant que la saisie ne correspond pas à l'identifiant »), contraste vérifié, focus clavier vérifié.
- **Frontend-only** quand le contrat backend ne change pas (la plupart : modale, mode, encart, contraste, résultat, états). La résolution de sujet (P3-i1) peut réutiliser un RPC de recherche existant (`search_actors`) ; à confirmer au moment du plan d'implémentation.

---

## 7. Index des fichiers

| Phase | Fichier | Maquette |
|---|---|---|
| — | `00-plan-global.md` (ce fichier) | — |
| 1 | [`p1-i1-modale-confirmation.md`](p1-i1-modale-confirmation.md) | `p1-i1-modale-confirmation.html` |
| 1 | [`p1-i2-mode-escalade.md`](p1-i2-mode-escalade.md) | `p1-i2-mode-escalade.html` |
| 2 | [`p2-i1-encart-perimetre.md`](p2-i1-encart-perimetre.md) | `p2-i1-encart-perimetre.html` |
| 2 | [`p2-i2-contraste-alertes.md`](p2-i2-contraste-alertes.md) | `p2-i2-contraste-alertes.html` |
| 3 | [`p3-i1-champ-sujet.md`](p3-i1-champ-sujet.md) | `p3-i1-champ-sujet.html` |
| 3 | [`p3-i2-panneau-resultat.md`](p3-i2-panneau-resultat.md) | `p3-i2-panneau-resultat.html` |
| 4 | [`p4-i1-page-assemblee.md`](p4-i1-page-assemblee.md) | `p4-i1-page-assemblee.html` |
