# Refonte UI/UX Bertel — Rapport d'implémentation

> Suivi phase par phase de l'exécution du plan [00-plan-global.md](00-plan-global.md).
> Ordre d'exécution : 1 → 2 → (3 puis 6) → 4 → 5 → 7.
> Porte de vérif par phase : `tsc` + `next build` + suite Jest verts · vérif navigateur · revue adversariale du diff.

## Baseline (avant toute modification, 2026-06-23)

- Suite Jest : **248 suites / 1728 tests verts** (`npx jest`).
- `next build --webpack` : exit 0.
- `npm run typecheck` (`tsc -p tsconfig.app.json`) : **erreurs préexistantes dans des fichiers de test** (exclus du build de prod), non causées par cette refonte et présentes sur HEAD :
  - `sections/blocks/BlockITI.test.tsx(87)` — `permissions` manquant dans `SectionProps`.
  - `services/object-workspace-parser.test.ts(859,870)` — `ObjectDetail` non exporté.
  - `services/object-workspace.itinerary.test.ts(106)` — conversion de type.
  - `utils/facets.test.ts(325,332,339)` — `"all"` non assignable à `ObjectTypeCode`.
  Convention adoptée : la porte « tsc vert » de chaque phase = **aucune nouvelle erreur** vs ce baseline ; les erreurs préexistantes sont corrigées dans la phase qui touche le fichier concerné (`facets.test.ts` → Phase 2) ou lors d'une passe de nettoyage finale.
- Fichiers WIP du PO non touchés/non commités : `BlockHEB.test.tsx`, `section-registry.test.tsx`.

---

## Phase 1 — Fondations ✅ (2026-06-23)

### Changements
**1.1 — Design system & fondations** (`src/styles.css`, `src/app/layout.tsx`, `src/features/object-editor/object-editor.css`, `src/lib/theme.ts`, `tailwind.config.js`)
- **Focus visible (S1)** : règle globale `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }`. Anneaux `:focus-visible` explicites ajoutés là où une base `outline:none` sans remplacement neutralisait la règle globale : `.taxo__search input`, `.dashboard-filter-input`, `.workspace-tooltip__trigger`.
- **Contraste (S7)** : tokens statiques relevés (`--text-muted` #66767d→#5c6a71, `--ink-3` #6a7a82→#586770, `--ink-4` #94a1a8→#5f6d74). **Surtout** : la vraie source était `lib/theme.ts` qui **injecte `--text-muted` inline au runtime** (white-label) et écrasait le `:root` — `muted = mixColors(text, background, 0.54)` (#8F9797, 2.9:1) → ratio **0.34** ⇒ #637175, **5.06:1 sur blanc (AA), vérifié au navigateur**.
- **Mouvement (S8)** : garde-fou global `@media (prefers-reduced-motion: reduce)`.
- **Perf (S5)** : migration Google Fonts `@import` → `next/font/google` (Manrope/Sora/IBM Plex Mono, variables `--font-sans/--font-display/--font-mono`). 40 littéraux de police remplacés par `var(--font-*)`. `tailwind.config.js fontFamily` aligné sur les variables. `background-attachment: fixed` → `scroll`.
- **Distinctions (retour PO)** : primitives partagées ajoutées (transposées aux tokens réels, icônes lucide en TSX, pas de police d'icônes) : `.type-pill`+`.acc-*` (7 archétypes), `.thumb`/`.thumb__rating` (cocarde classement à cheval), `.thumb__labels`/`.label-logo`/`.lbl-*` (pastilles-logo de label), `.label-chip`, `.tag-chip`, `.class-text`, `.distinction-row`, `.distinction-highlights`. Nouveaux tokens `:root` : `--acc-heb..fma`, `--gold*`, `--lbl-*`. Doublon `--orange-soft` aliasé sur `--accent-soft`.

**1.2 — États vides & squelettes** (`src/components/common/EmptyState.tsx` + `.test.tsx`, CSS `.ui-empty*`/`.ui-empty-banner*`/`.badge*`/`.skel*`)
- Composant `EmptyState` (TDD, 7 tests) avec 4 modes : `no-data` (CTA primaire), `filtered` (CTA secondaire), `coming-soon` (badge, pas de CTA), `error` (bannière `role="alert"` + Réessayer). Icônes lucide par défaut, surchargeables. Titre en `<p>` (sémantique). Classes transposées aux tokens réels.

### Fichiers
`src/styles.css`, `src/app/layout.tsx`, `src/features/object-editor/object-editor.css`, `src/lib/theme.ts`, `tailwind.config.js`, `src/components/common/EmptyState.tsx` (nouveau), `src/components/common/EmptyState.test.tsx` (nouveau).

### Vérifié
- **Jest** : 249 suites / 1735 tests verts (+1 suite/+7 tests = EmptyState ; 0 régression).
- **Build** : `next build --webpack` exit 0 → **next/font fonctionne dans cet environnement** (risque offline levé).
- **tsc** : aucune nouvelle erreur (baseline préexistant inchangé).
- **Navigateur** (`http://localhost:3000`, dev server) : `bodyFont = Manrope`, `headingFont = Sora` (pas de fallback Times → le correctif du cycle CSS object-editor fonctionne) ; `background-attachment: scroll` ; `--text-muted = #637175` (5.06:1 AA) ; console sans erreur.
- **Revue adversariale** (sous-agent code-reviewer) : 1 CRITIQUE (`object-editor.css` : `sed` avait rendu les tokens `--font-*` locaux **auto-référents cycliques** → éditeur en police par défaut ; corrigé en supprimant la redéfinition locale, héritage de next/font), 2 HIGH (anneaux focus `workspace-tooltip`/`dashboard-filter-input`), 3 MEDIUM (tailwind fontFamily, titre EmptyState `<div>`→`<p>`, `.badge` documenté) — **tous traités**.

### Décisions
- next/font expose les mêmes noms de variables que les tokens locaux de l'éditeur ⇒ suppression de la redéfinition locale (héritage) plutôt que renommage.
- Contraste muted corrigé **à la source du thème** (runtime) et non seulement dans `:root` statique (qui était inopérant).
- Classes de distinction namespacées vers les tokens réels de l'app (jamais d'import de `bertel-ui.css`), icônes fournies par lucide-react côté composants (Phases 3/4).

### Restant (consommé par les phases suivantes, conforme aux dépendances du plan)
- `EmptyState` à câbler dans `ResultsList` (Phase 3), CRM/stubs/`WidgetFrame` (Phase 5).
- Primitives de distinction consommées par les cartes (3.1), la carte géo (3.3), les fiches (4.x).
- Consolidation profonde des tokens (5 familles, ~234 hex) : hors-scope d'une passe sans-régression ; de-dup ciblé fait (`--orange-soft`).

---

## Phase 2 — Taxonomie unifiée & libellés ✅ (2026-06-23)

### Changements
**2.1 — Taxonomie unifiée & résolveur de libellés**
- **Nouveau `src/utils/labels.ts`** (TDD, 16 tests) — source unique des libellés FR et de la couleur de type :
  - `resolveTypeLabel` (TYPE_LABEL ?? `humanizeCode`), `resolveArchetype`, `resolveArchetypeLabel`,
  - `resolveArchetypeAccentClass` → `acc-<archétype>` (acc-heb…acc-fma, tokens Phase 1 ; même couleur sur les 3 surfaces),
  - `resolveRoleLabel` (catalogue ref_* prioritaire, sinon humanise), `resolveSchemeLabel` (V5 `LBL_*` + codes de classement historiques `hot_stars`/`green_key`… → libellés FR ; humanise le reste), `humanizeCode`.
  - `buildExplorerTypeFamilies()` — **dérive** les familles de bucket Explorer de `TYPE_ARCHETYPES` ⇒ Explorer et éditeur **ne peuvent plus diverger** (fin du défaut-racine §2a).
- **`src/utils/facets.ts`** : `EXPLORER_TYPE_CODE_FAMILIES = buildExplorerTypeFamilies()` (était un littéral). Effet : **LOI** ACT→VIS, **ASC** SRV→ACT, **VIL** VIS→SRV ⇒ le bucket d'un type == son archétype éditeur.
- **Codes bruts éliminés** (résolveur câblé) : `ActiveFilterStrip` (chips Type + Distinction), `ActualisationTable`, `CompletenessTable`, `TypeBreakdown` (tables dashboard), `crm-primitives` `TypeTag`, `team/MembersTable` (fallback rôle).

### Fichiers
`src/utils/labels.ts` (nouveau), `src/utils/labels.test.ts` (nouveau), `src/utils/facets.ts`, `src/utils/facets.test.ts`, `src/components/dashboard/{ActiveFilterStrip,ActualisationTable,CompletenessTable,TypeBreakdown}.tsx` (+ tests ActiveFilterStrip), `src/features/crm/crm-primitives.tsx` (+ CrmObjectView.test), `src/features/team/MembersTable.tsx`, `src/lib/dashboard-to-explorer.test.ts`.

### Vérifié
- **Jest** : 250 suites / 1749 tests verts. Tests d'invariant : « le bucket Explorer de chaque type == son archétype », familles alignées, dérivation 18 types / 0 doublon / 0 bucket vide.
- **Build** : `next build` exit 0.
- **tsc** : aucune nouvelle erreur ; **3 erreurs préexistantes corrigées** (`facets.test.ts` `'all'` → `'VIS'`).
- **Navigateur** (mode démo `NEXT_PUBLIC_ENABLE_DEMO_MODE=true`, login auto « Marie D. ») : dashboard « Par type d'objet » + actualisation rendent les libellés FR (Hotel/Restaurant/Loisir/Camping/Fete-manifestation/Itineraire/Hebergement…), `hasRawCode = false` ; le déplacement de bucket est visible (Canyoning/LOI désormais sous VIS).
- **Revue adversariale** (sous-agent) : pas de cycle d'import, dérivation arithmétiquement correcte, classes `acc-*` présentes, pas de régression d'état URL. MEDIUM (libellés de scheme incomplets) **corrigé** (codes de classement historiques ajoutés). LOWs notés pour Phase 4 (doublon `DRAWER_TYPE_LABELS`, `ObjectDetailView` related_objects).

### Décisions
- Source unique = `TYPE_ARCHETYPES` (archetypes.ts, établi §46/§48) ; `labels.ts` (utils) en dérive ; `facets.ts` importe `labels.ts` (le seul bord utils→features est centralisé dans labels.ts ; pas de cycle).
- Couleur de type sur les 3 surfaces = `acc-<archétype>` (système de tokens Phase 1), distinct de l'accent de section éditeur (`acc-teal…rust`) qui reste un concept séparé.
- Rôles/schemes dynamiques : fallback `humanizeCode` (jamais de SNAKE_CASE brut) + maps connues.

### Restant
- Carte résultat Explorer affiche encore le code de bucket brut (« VIS ») → **Phase 3.1** (carte résultat type-aware).
- Consolider `DRAWER_TYPE_LABELS` / `CLASSIFICATION_SCHEME_LABELS` (drawer) sur les résolveurs `labels.ts` → **Phase 4**.
