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

---

## Phase 3 — Découverte type-aware (Explorer) ✅ (2026-06-23)

### 3.1 — Carte résultat type-aware (`28b75bd`)
- Pastille de type = libellé FR + accent d'archétype (`utils/labels`) ; **corrige le bug** de double-normalisation qui affichait le code de bucket brut (« VIS »).
- Pastille « ouvert/fermé » conditionnée **HEB/RES uniquement** (jamais ITI/FMA/VIS), après le nom.
- Signet « à cheval » : cocarde de classement (étoiles, **réservée aux HEB**) + pastilles-logo de label reconnus. Nouveau `utils/explorer-card-display.ts` (helpers purs, 9 tests TDD).
- **Jamais de donnée fabriquée** : les méta riches (distance ITI, dates FMA, cuisine RES) ne sont pas sur le payload carte → **projection backend documentée comme bloquant** (pas d'invention). Retrait du tiret cadratin proscrit.
- **Vérifié navigateur** : libellés FR par archétype, open seulement sur les 7 cartes HEB/RES (sur 11), 0 code brut.

### 3.3 — Carte géo : légende + reprise d'erreur (`6e3465b`)
- **Reprise d'erreur (audit S10)** : une requête en échec ne remplace PLUS tout l'Explorateur ; bannière inline (`EmptyState` mode=error) + Réessayer ne relançant que la requête fautive ; dernière donnée valide conservée (cache local des cards). Logique pure TDD (`views/explorer-error.ts`).
- **Légende** (`MapLegend`) ancrée bas-gauche, 7 familles, pastilles colorées depuis `defaultMarkerStyles` (= couleur réelle des marqueurs). Marqueurs déjà type-aware (confirmé).
- **Vérifié navigateur** : légende rendue (7 familles) + marqueurs colorés sur la vue Carte.

### 3.2 — Barre de filtres actifs + communes cherchables (`<ce commit>`)
- `ExplorerActiveFilters` : une pastille retirable par condition active (**terme de recherche compris**) + « Tout effacer » ; libellés FR ; dérivation pure TDD (`explorer-active-chips.ts`), retrait par groupe via le store.
- `FilterDropdown` : prop opt-in `searchable` (recherche accent-insensible + nav clavier flèches/Entrée), câblé sur le multi-select communes.
- **Vérifié navigateur** : barre + retrait au clic OK ; communes cherchables (« sai » filtre 6→5).

### Vérifié (phase)
Jest 255/1779 verts · `next build` exit 0 · typecheck sans nouvelle erreur · navigateur (mode démo) pour 3.1/3.2/3.3 · revue adversariale Phase 2 couvrait les helpers partagés.

### Restant (différé avec raison)
- **Sous-types SRV/VIS** (3.2) : nécessitent des champs de store (`vis.subtypes`/`srv.subtypes`) + filtrage RPC par sous-type calqué sur `hot.subtypes` + UI → passe ciblée.
- **Méta riches par type sur la carte** (3.1) : distance/dates/cuisine absentes du payload carte → projection backend (RPC `list_objects`/`get_object_cards_batch`).
- **Anneau de composition des clusters + distinctions dans la popup carte** (3.3) : enrichissements (le cluster actuel est une bulle de densité ; la popup a déjà des chips). Valeur moindre.

---

## Phase 6 — Éditeur (polish) ⏳ (cœur livré, 2026-06-23)

### 6.1 — Barre d'enregistrement re-priorisée ✅ (`<commit 6.1/6.2>`)
- `EditorTopbar` : « Enregistrer » redevient l'**action primaire** (`.btn primary`, teal + anneau de focus global), « Publier » un acte **secondaire distinct** (`.btn`) avec son libellé occupé propre « Publication… ». Ordre repositionné. TDD (2 tests + 6 existants).

### 6.2 — Correctif clobber BlockASC ✅ (même commit)
- Fin du **double-binding** : `durationMin` et `equipmentProvided` étaient écrits par DEUX contrôles chacun (write-trap last-edit-wins). Suppression du grid-3 secondaire + écho ChipSet ; `equipmentProvided` édité par UN champ texte (vide = non fourni) ; `difficultyLevel` remonté dans le bloc primaire. TDD (2 tests).

### Vérifié
Jest 255/1783 verts. Le **focus-visible de la nav éditeur est déjà assuré** par la règle globale de Phase 1 (object-editor.css ne l'override pas).

### Restant (différé avec raison)
- **Disclosure §07 Capacité / §16 Lieux** (6.2) : restructuration des sections denses en disclosures — refactor de composant volumineux, valeur de densité ; passe ciblée.
- **Nav contiguë libellée + roving tabindex** (6.3) : réécriture d'`EditorNav` ; le focus-visible est déjà couvert (Phase 1). 
- **Cibles tactiles 44px** (6.3) : bump risqué dans un layout desktop dense (décalage de mise en page) — nécessite une revue par contrôle ; le responsive a déjà ses media queries (1120/760 px).

---

## Phase 4 — Présentation type-aware (Drawer) ⏳ (4.1 livré, 2026-06-23)

### 4.1 — Fiche Événement : bloc « Prochaines dates » ✅
- Comble « un événement (FMA) sans dates nulle part » (audit P0 §2b) : `EventOccurrencesSection` rend les occurrences **réelles** (`parsed.itinerary.fmaOccurrences`, champs `start_at`/`end_at`/`state`) en tête de la fiche → l'événement mène par le quand. Logique pure TDD (`event-occurrences.ts`, 6 tests) ; format FR, plage « Du … au … », occurrence annulée ; **jamais de date fabriquée**. Injecté dans `GenericDetailView` (que FMA utilise) → null pour les autres types. Intégration vérifiée (drawer FMA vs SRV).

### Restant (différé avec raison)
- **Fiche Restaurant (4.2)** : bloc cuisine + menu structuré — le modèle §104 existe ; la donnée (cuisine/menu/régimes) n'est pas sur le payload drawer actuel ⇒ extension du parser/RPC + bloc. Passe ciblée.
- **Fiche Activité (ASC) / Itinéraire réel (4.3)** : `object_act` non surfacé ; étapes ITI réelles (au lieu d'interpolées) ⇒ extension parser + blocs.
- **Vue config-driven (ARCHETYPE_SECTIONS) remplaçant les 6 clones** : refactor architectural d'un fichier de 3588 lignes, fort risque sur une surface très utilisée ⇒ passe dédiée spec→plan→impl. La consolidation `DRAWER_TYPE_LABELS`/`CLASSIFICATION_SCHEME_LABELS` sur `labels.ts` en fait partie.
- ~~**Retrait des contrôles dead-end** (Modifier/Voir versions sur surface read-only)~~ ✅ **FAIT** (S12) : retrait du « Voir versions » désactivé-en-permanence (Description) + du « Modifier > » sans handler (Horaires) du drawer (view-only) ; param `parsed` inutilisé nettoyé (7 call-sites). Côté Explorer : faux bouton « Trier » → label honnête « Trié par pertinence » ; « Envoyer » trompeur → désactivé-avec-raison visible.

### Note — tiret cadratin (goal #7)
L'UI **ajoutée/redessinée** est sans tiret cadratin (fallbacks « Lieu non renseigné », etc.). Le balayage des **74** `'—'` placeholders **existants** (dont un asservi à un test) est différé : large, risqué (assertions), valeur marginale (le `—` « vide » est une convention lisible) — à faire en passe i18n/copy dédiée.

---

## Phase 5 — Dashboard / CRM / secondaires ⏳ (5.3 partiel, 2026-06-23)

### 5.3 — Nettoyage du login ✅ (partiel)
- **Retrait du texte de debug public** (`Supabase URL: …` + « Mode demo ») sur la page de connexion (fuite d'info + aspect cassé) ; import `env` retiré. Accents FR rétablis (h1, lead, note, panneau démo).
- Ajout de `.muted` (top-level) : la classe était **utilisée app-wide mais non définie** (texte non atténué partout) — corrige aussi de nombreux composants.

### 5.1 — Hiérarchie du bandeau dashboard ✅ (S9)
- `scorecard-strip` : fin des 6 cartes identiques (`repeat(6,1fr)`) → contraste d'échelle (métrique meneuse en colonne 1.6fr, teal pleine, valeur 2.8rem ; secondaires calmes) + repli responsive (3 cols <1200px lead pleine largeur, 2 cols <640px). Vérifié navigateur (lead 486px vs 235px).

### Anti-pattern banni — side-stripe
- `.lifecycle-state` (éditeur §21) : retrait de la bordure latérale colorée (anti-pattern banni) ; l'accent reste porté par le fond teinté + la pastille `__dot`. Les KPI side-stripes du CRM sont un **choix PO délibéré** (commentaire « Peps PO point 1 ») → laissés.

### Restant (différé avec raison)
- **5.2 dé-modalisation CRM** (acteur en drawer) : refonte de composant volumineux. Passe ciblée.
- **Unification Team/RGPD sur le vocabulaire maison** : absorbée par la Phase 7.4 (Team) ; RGPD reste.
- **Pages stub honnêtes** (`EmptyState mode=coming-soon`) : `EmptyState` est livré (Phase 1.2) et prêt à câbler.

---

## Phase 7 — Paramètres (console admin) ⏳ (7.3 P0 livré, 2026-06-23)

### 7.3 — Fournisseurs IA : correction du P0 boutons nus ✅
- `AiProviderSettings` utilisait `.btn`/`.pill-mini`, classes définies **uniquement** sous `.crm-app` ⇒ boutons natifs nus sur `/settings`. Portage sur le vocabulaire de l'app principale : `.primary-button` (Enregistrer), `.ghost-button` (Activer/Modifier/Supprimer/Nouveau/Tester), `.badge badge--ok` (pastille « actif »). Test composant vert (5).

### Restant (différé avec raison)
- **7.1 Hub à rail** (`/settings` en console à panneaux par périmètre) + **7.2 Apparence/Marqueurs** (maître-détail) + **7.4 Team intégré** + **7.5 Listes & référentiels** (nouveaux RPC `SECURITY DEFINER` gated `is_platform_superuser` + UI) : Phase la plus back-end (RPC + RLS + tests) ; chaque module = sa propre passe spec→plan→impl (cf. phase-7-parametres.md). 7.5 exige du nouveau back-end.

---

## Synthèse de session (2026-06-23)

**Livré + vérifié + committé sur `master`** (Jest tout vert à chaque porte, build exit 0, vérif navigateur en mode démo, revue adversariale Phases 1 & 2) :
- **Phase 1** ✅ (fondations a11y/perf/thème + EmptyState) — `4423c82`
- **Phase 2** ✅ (taxonomie unifiée + résolveurs de libellés) — `87f251d`
- **Phase 3** ✅ cœur (3.1 carte type-aware · 3.2 filtres actifs + communes cherchables · 3.3 légende + reprise d'erreur) — `28b75bd`, `6e3465b`, + 3.2
- **Phase 6** ✅ cœur (6.1 barre save re-priorisée · 6.2 clobber BlockASC)
- **Phase 4.1** ✅ (fiche Événement : dates)
- **Phase 5.3** ✅ partiel (login propre) · **Phase 7.3** ✅ (P0 boutons IA)

**Principes tenus** : TDD (≈+90 tests ajoutés, 0 régression — la suite est passée d'environ 1728 à ≈1800 verts) ; aucune donnée fabriquée (méta absentes du payload documentées comme bloquant back-end, jamais inventées) ; aucun write-trap introduit ; un seul registre type→facette ; aucun tiret cadratin dans l'UI ajoutée ; commits par hunks sur `master` sans push, sans trailer co-author.

**Différés** : voir les blocs « Restant » de chaque phase. Les plus lourds (drawer config-driven 3588 lignes, dashboard/CRM, console settings + éditeur de référentiels back-end) sont des passes spec→plan→impl dédiées, sciemment hors d'une seule session sans-régression. Le mode démo (`NEXT_PUBLIC_ENABLE_DEMO_MODE`, gitignoré) reste activable pour la vérif navigateur des phases suivantes.
