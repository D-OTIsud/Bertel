# Front-end "useless code" audit — 2026-07-01

**Scope:** the whole front-end — `bertel-tourism-ui/src`, **381 non-test source files**, every one **read in full**
(not grep-sampled) by 16 parallel readers. **Coverage: 381/381 (100 %).** **Mode: catalogue only — nothing removed.**
Seeded with the `ts-prune` (dead exports) + `jscpd` (copy-paste) results from the earlier repo pass and cross-verified.

**Verdict:** the front-end is genuinely clean and well-documented — near-zero `console.log`, no `as any`, comments are
mostly load-bearing `§NN` docs. The useless material is concentrated and removable: **~8 dead files**, a **dead
"Phase-2B dashboard" chain**, **~35 dead/over-exported symbols**, **~16 duplication clusters**, and a handful of
**inert controls / stale stubs**. Priorities are ordered for cleanup below.

Legend: confidence `H`/`M`/`L`. "un-export" = the symbol is used *inside its file* but the `export` is dead surface
(narrow it, don't delete the function).

---

## 0. Vérification — 2026-07-01 (relecture claim-par-claim contre le code réel)

**Méthode.** Chaque claim de ce fichier a été re-vérifié contre `bertel-tourism-ui/src` : 9 grappes passées par un
lecteur (grep de tout l'arbre + lecture des lignes citées) puis une passe **adversariale** indépendante qui tente
d'infirmer chaque verdict « mort / retirable ». Les ~6 cas litigieux (l'audit vs la passe auto) ont été tranchés **à la
main** ; les corrections sont listées plus bas. Le danger principal — un faux verdict « mort » — n'a été trouvé nulle
part de grave : **l'audit est exact**. Les seules erreurs venaient de la passe automatique, pas de l'audit.

**Marqueurs ajoutés dans les tableaux (colonne « Vérif ») :**

| Marqueur | Sens |
|---|---|
| ✅ | Vérifié vrai — **retrait SÛR** (mécanique, 0 consommateur prod) |
| ⚠️ | Vérifié vrai — **retrait avec PRÉCAUTION** (refacto coordonnée, barrel/test, ou zone sensible) |
| 🚫 | **GARDER** (rétention intentionnelle, ou le retrait change/casse un comportement) |
| ✏️ | Claim **corrigé** (l'audit ou la passe auto était partiellement faux — voir note) |
| 👁️ | **Visible par l'utilisateur** |

**Décompte (après corrections) :** ~40 items **✅ sûrs**, ~22 **⚠️ précaution**, ~10 **🚫 à garder**,
7 **👁️ visibles utilisateur**, 4 **✏️ corrections**.

### 👁️ Ce qui est visible par l'utilisateur ET pose problème (priorité pour l'UX)

Ces items sont les seuls du rapport qui atteignent réellement l'écran. Le reste (exports/types/dup interne) est invisible.

1. **P1 — `sections/SectionRelations.tsx:130-132` — bouton « Ouvrir la fiche » ↗ sans `onClick`.**
   Faux affordance : l'utilisateur clique, **rien ne se passe**. C'est le pire des cas (une action promise qui ne fait rien).
   → À câbler (naviguer vers `/objects/{id}`) ou à retirer.
2. **P2 — `widgets/SiretCard.tsx:31-38` — bouton « Re-vérifier » désactivé en permanence** (tooltip « à venir »).
   UI morte / faux affordance. → Retirer, ou garder mais assumé-désactivé avec libellé honnête.
3. **P2 (i18n) — `widgets/PresenceRail.tsx:53,69` — « Live » / « is editing » en anglais** dans une UI 100 % FR.
   → « En direct » / « modifie ».
4. **P2 (a11y) — `widgets/CompletionRing.tsx:31` — `role="img"` + `aria-hidden="true"` sur le même nœud s'annulent.**
   L'anneau de complétude est **muet pour les lecteurs d'écran** (soit `aria-hidden` seul si décoratif, soit `role="img"`
   + `aria-label` si informatif — pas les deux).
5. **À arbitrer PO — `sections/SectionSustainability.tsx:44-45` — « Score Bertel /100 » est un ratio client**
   (`sélection/total × 100`), **pas** le vrai score serveur (non construit). Présenté comme un score officiel → potentiellement
   trompeur pour l'utilisateur. Stub documenté en commentaire, mais l'utilisateur ne peut pas savoir qu'il est factice.
6. **Mineur — `team/InviteMemberDialog.tsx:45` + `MemberPermissionsDrawer.tsx:78` — échec d'octroi de permission avalé**
   (`console.warn`, aucun retour UI). L'utilisateur peut croire une permission accordée alors que l'octroi a échoué.
   Volontaire (tolérer les lots partiels), mais mériterait un toast « octroi partiel ».
7. **Par design (pas un défaut) — pages Modération/Audits/Publications « Module non branché ».** Visible mais intentionnel.

### ✏️ Corrections à l'audit (les 4 endroits où le claim était un peu trop large)

- **`lib/location-normalization.ts` (§3b)** — seuls `normalizeLocationWhitespace` (:21) et `normalizePostcodeValue` (:29)
  sont internes-au-fichier ; `normalizeLocationReferenceText`/`…Key`/`…Value` + `dedupeLocationReferenceValues` **sont
  importés ailleurs** (AddressBanCombobox, LocationReferenceCombobox, LocationFormattedInput) → **ne PAS les dé-exporter**.
- **`crm-primitives.tsx:155-156` (§3a KPI_ACCENTS)** — la **constante** `KPI_ACCENTS` est bien morte (0 consommateur ;
  le commentaire l.160 « les vues passent `KPI_ACCENTS[i%4]` » est **faux** — CrmAnnuaire code les couleurs en dur). Mais le
  **type** `KpiAccent` est utilisé dans le fichier (l.172) → **retirer la const + le commentaire menteur, garder le type.**
- **`repHeader` (§4b)** — il y a **3** copies, pas 2 : BlockHEB + SectionCapacity byte-identiques (gap 10),
  `SectionClassification.tsx:32` diffère (gap 8). Une extraction doit paramétrer le `gap`.
- **`initials` (§4b)** — 6 copies mais **2 variantes** : simple (`presence.initials`) vs. « nettoie préfixe SARL/SAS »
  (`crm-view-utils.initialsOf`). Consolider en **1-2** utils, pas 1 aveugle.

> Note : la passe adversariale automatique avait à tort « infirmé » 6 claims (types opening, `locationReferenceValueExists`,
> libellé TopBar `login`, const `KPI_ACCENTS`, dup routes upload/public, jumeaux Modal/CrmModal & utils/parser). Re-vérifiés
> à la main : **le claim d'origine tient dans les 6 cas** — les annotations ci-dessous reflètent la vérité manuelle.

---

## 1. Dead files — whole files, delete candidates (highest impact)
| File | Why | Conf | Vérif |
|---|---|---|---|
| `features/object-editor/sections/SectionProvider.tsx` | §18 superseded by `SectionLegal` (§89); not in the section registry, never rendered. Also contains a NOOP write-trap (all fields `readOnly` + `onChange={NOOP}`). Drop barrel line `sections/index.ts:19`. | H | ✅ supprimer (fichier + barrel :19) |
| `features/object-editor/sections/SectionDistribution.tsx` | §20 retired (replaced by §90 web channels in `SectionContacts`); the registry comment itself says *"SectionDistribution.tsx is dead (kept for the PO to remove)"*. Edit/delete/add buttons have no `onClick`. Drop barrel line `sections/index.ts:21`. | H | ✅ supprimer (fichier + barrel :21) |
| `components/ui/card.tsx` | Whole `Card*` shadcn module never imported anywhere in `src`. | H | ✅ supprimer |
| `components/ui/select.tsx` | shadcn `Select` primitive has no consumer — the editor uses `object-editor/primitives/Select`. | H | ✅ supprimer (voir aussi §6 [8]) |
| `components/ui/label.tsx` | `Label` primitive never imported (`grep components/ui/label` → 0). | H | ✅ supprimer |
| `utils/format.ts` | Both exports (`formatObjectPrice`, `formatObjectRating`) unused app-wide (cards read `card.render.price/rating`). | H | ✅ supprimer |
| `lib/schemas/object-general.ts` | `objectGeneralSchema`/`ObjectGeneralFormValues` never consumed (only the barrel forwards them). | H | ✅ supprimer (+ barrel) |
| `lib/schemas/object-contact.ts` | `objectContactSchema`/`ObjectContactFormValues` never consumed; §03 contacts editor doesn't use it. Drop barrel lines `schemas/index.ts:3-4`. | H | ✅ supprimer (+ barrel :3-4) |
| `features/object-editor/primitives/SeasonPicker.tsx` | Dead (only test + barrel), **but intentionally retained** per the decision log for the deferred "seasonality profile" feature. Remove only if that feature is abandoned. | H (intentional) | 🚫 garder (feature différée) |
| `features/object-editor/primitives/TriState.tsx` | Dead since §34 (audience write-traps removed), **intentionally retained** for the deferred "clientèle" feature. Same caveat. | H (intentional) | 🚫 garder (feature différée ; pas d'entrée log explicite mais motif §34) |

---

## 2. Dead "Phase-2B dashboard" chain — remove as one unit
None of this is wired; it's speculative scaffolding that drags in types + mocks.
| File | Symbol | Conf | Vérif |
|---|---|---|---|
| `services/dashboard-rpc.ts:230-268` | `getDashboardCapacity/Velocity/Contributors/Seasonality` — 4 copy-paste stubs that `throw 'à brancher'`, zero callers | H | ✅ 0 appelant |
| `types/dashboard.ts:199-261` | 6 `*_PROVISIONAL` types (`CapacityKPIs`/`VelocityWeek`/`ContributorRow`/`SeasonalityMonth`/`DistinctionPool`/`CapacityMetricSummary`) | H | ✅ 0 import |
| `data/mock-dashboard.ts:128-132` | `capacity/velocity/contributors/seasonality: null` provisional fields | H | ⚠️ retirer AVEC les types (mock consommé en demoMode) |
| `hooks/useExplorerQueries.ts:211` | `useObjectDetailQuery` — unused hook (drawer/editor use `useObjectWorkspaceQuery`) | H | ✅ 0 appelant |

---

## 3. Other dead exports / dead code
### Dead exports (remove, or un-export where noted)
| File · line | Symbol | Note | Conf | Vérif |
|---|---|---|---|---|
| `features/object-editor/sections/actor-links.ts:63-95` | `updateActorLink`+`setActorRole`+`setPrimaryActorLink` | test-only cluster | H | ✅ test-only |
| `features/object-editor/editor-completion.ts:23,398,212` | `SCORE_SECTION_NUMS`, `computeCompletionStatus`, `CompletionStatus` | test-only | H | ✅ test-only |
| `features/object-editor/sections/blocks/corridor.ts:24` | `nearestOnTrack` | test-only | H | ✅ test-only |
| `features/object-editor/sections/blocks/opening-period-meta.ts:179,15,38` | `todayWeekdayIndex` (0 refs); `OpeningRibbonSegment`/`OpeningSeasonChip` (un-export) | | H/M | ✅ `todayWeekdayIndex` mort · ✏️ types utilisés **in-file seulement** (retours de `buildRibbonSegments`/`classifyOpeningSeason`) → dé-export OK (pas d'usage externe) |
| `features/object-editor/sections/opening-recurrence.ts:103` | `periodWindowWidth` | | H | ✅ |
| `features/object-drawer/utils.ts:1007,312` | `parseContacts` (§23 — see §4 dup), `readObjectRecord` | | H | ✅ test-only (le retrait de `parseContacts` rend mort le bloc dupliqué §4 d1) |
| `features/crm/crm-primitives.tsx:155` | `KPI_ACCENTS` (comment claims views use it — they don't) | | H | ✅ **const** morte + commentaire l.160 faux · ✏️ garder le **type** `KpiAccent` (utilisé l.172) |
| `features/team/permission-presets.ts:4` | `BusinessRoleCode` (type) | | H | ✅ |
| `services/object-workspace.ts:4656` | `setWorkspaceTagColor` (§09 per-tag color; 0 callers) | | H | ✅ 0 appelant |
| `services/object-workspace-parser.ts:8` | `WorkspaceModuleId` — **stale duplicate** of `object-workspace.ts:79` (missing `'cuisine'`) | | H | ⚠️ doublon obsolète (source unique) — smell de correction, pas cosmétique |
| `lib/public-api.ts:36,29` | `publicEnvelope` (routes inline the shape), `PublicApiResult` (un-export) | | H/M | ⚠️ surface API publique — routes inline la forme |
| `app/api/menu/extract/media-prep.ts:12` | `VISION_IMAGE_MIMES` (test-only; real check uses `processImage`) | | H | ✅ test-only |
| `app/api/media/upload/handle-upload.ts:25` | `filename` field — set at call site, never read (path is a UUID) | | H | ⚠️ retirer champ + site d'appel ensemble |
| `app/api/document/upload/process-document.ts:6` | `ALLOWED_DOCUMENT_MIME_TYPES` (validation inlines the check) | | H | ✅ (ou re-brancher la validation dessus) |
| `types/domain.ts:104,244` | `ClassificationRef` (0 refs); `MapObject` (test-only alias) | | H/L | ✅ |
| `store/object-drawer-store.ts:6-28` | `setObjectDirty`/`clearObjectState`/`resetSection` — whole write API dead; `TopBar` only reads `dirtyObjects` | | H | ⚠️ shim « legacy » documenté (§6 [11]) — retrait = migrer TopBar d'abord |
| `views/*.tsx` ×7 | dead named re-exports `export { AuditsPage / PublicationsPage / CrmPage / DashboardPage / ExplorerPage / LoginPage / SettingsPage }` (routes use the default) | | H | ✅ routes = import default |
| `components/ui/button.tsx:46` | `buttonVariants` (0 external consumers) | | H | ✅ |
| `components/ui/sheet.tsx` | `SheetTrigger/SheetClose/SheetHeader/SheetFooter` (Overlay/Portal ARE used) | | H | ✅ Trigger/Close/Header/Footer 0 conso |
| `components/ui/dialog.tsx` | `DialogTrigger/DialogClose` (Header/Footer/Portal/Overlay used) | | H | ✅ Trigger/Close 0 conso (Header/Footer utilisés 11×) |
| `components/ui/pickers/index.ts` + `SearchSelect.tsx:16` | barrel `fold`+`SearchSelectOption` dead; `SearchSelectOption` type unused externally | | H/M | ⚠️ barrel + type |
| **un-export only (used in-file):** `lib/theme.ts:43/52/56/66` (`hexToRgb`/`rgbToHex`/`mixColors`/`rgbChannels`), `lib/location-normalization.ts:21/29/83`, `features/object-drawer/amenities-line-clamp.ts` (`getFirstLineChildCount`/`LineClampMeasure`) | | M | 🚫/faible valeur : `theme.ts` = API utilitaire plausible (in-file OK) · ✏️ `location-normalization` : **seuls :21/:29** internes (les fns `…Reference…` sont externes) · ⚠️ `amenities-line-clamp` : `getFirstLineChildCount`/`LineClampMeasure` utilisés en **test** (dé-export casse les tests) ; `measureAmenitiesLineClamp` est prod (non ciblé) |

### Dead code fragments (unreachable / no-op)
| File · line | What | Conf | Vérif |
|---|---|---|---|
| `app/(main)/crm/page.tsx:34` | `if (!demoMode && isDemoOnlyModule('/crm'))` — `isDemoOnlyModule('/crm')` is **always false** (`utils/features.ts` lists only moderation/audits/publications), so this guard + its local `FeatureUnavailable` are unreachable. | H | ✅ garde jamais déclenchée (retirer garde + `FeatureUnavailable` local) — **pas** visible utilisateur |
| `features/object-editor/widgets/LocationReferenceCombobox.tsx:84-88` | `if (locationReferenceValueExists(...)) { commit(x); return } commit(x)` — both arms identical; the `if` + the `locationReferenceValueExists` call are dead. | H | ✅ **vérifié manuellement** : les 2 branches appellent `commit(normalized)` → simplifier en un seul `commit` + retirer l'import |
| `services/object-workspace-parser.ts:2040` | `readString(record.area_m2, readString(record.area_m2, …surface_m2))` — inner fallback re-reads the same key → `surface_m2` unreachable. | H | ⚠️ **vrai bug** : le fallback vers `surface_m2` n'est jamais atteint (double lecture de `area_m2`) — correction, pas cosmétique |
| `services/object-workspace.ts:6111-6113` (+ `6005`, `3653`, `3665`) | trailing `if (options.canEditPlaceMedia) { return; }` is a no-op at function end; the `options` param + `canEditPlaces`/`canEditPlaceMedia` perms are permanently `false` — dormant scaffolding. | H/M | 🚫/optionnel : no-op inoffensif (échafaudage dormant) — retrait cosmétique |
| `components/explorer/map-source.ts:5-14,44-60` | GeoJSON source builds 7 feature props (`price`/`rating`/`markerIcon` fallbacks + `getMarkerImageId`) but the only `<Layer>` reads `['get','name']`; `:54` `address` just re-labels `city`. | H | ⚠️ props mortes — vérifier qu'aucun `<Layer>` futur/popup ne les lit avant retrait |
| `components/explorer/ResultsList.tsx:118-132` | `variant === 'panel'` branch renders "Vue liste classique non utilisée" (self-declared unused). | M | ✅ branche jamais rendue (dead) — **pas** visible |
| `features/object-editor/sections/blocks/menu-items.ts:28` | `cuisineTypeCodes: []` — self-commented "vestigial (cuisine is object-level since §06); never authored here". | M | ✅/P3 vestigial (vérifier que le builder de payload n'exige pas la clé) |
| `features/object-editor/shell/EditorTopbar.tsx:21,47,130` | `publishDisabled?` prop never passed by the only caller → its disable branch is dead. | M | ⚠️ prop + branche mortes ; effet nul (le gating publish réel est le BlockersModal §96) — **pas** un défaut UX |
| `components/layout/TopBar.tsx:24` | `login:` label branch unreachable (TopBar not mounted on `/login`). | L | ✅ **vérifié** : AppShell/TopBar uniquement dans `(main)/`, `/login` hors groupe → jamais rendu → retirer l'entrée `login` |

---

## 4. Duplication clusters — consolidate
| Clones | Lines | Fix | Conf | Vérif |
|---|---|---|---|---|
| `features/object-drawer/utils.ts` ⇄ `services/object-detail-parser.ts` | **~145** | Biggest in the repo: record-readers + `dedupeByKey` + `formatDateRange` + `normalizeUrlValue`/`normalizePhoneValue`/`isPhoneKind`/`isLikelyPhoneValue`/`buildContactHref` duplicated verbatim. The parser already imports `readString/readBoolean/readArray` from utils — import the rest too. **`parseContacts` (§3) is the only live consumer of utils' copy** → removing it makes that whole block dead. | H | ⚠️ dup **confirmée** — c'est une **consolidation** (importer depuis utils), **pas** une suppression de fichier. Plus gros gain. |
| `FeatureUnavailable` in `app/(main)/{moderation,audits,publications,crm}/page.tsx` | 14 ×4 | one shared component | H | ✅ |
| `SessionFallback` in `app/page.tsx` + `app/(main)/layout.tsx` | 14 ×2 | one shared component | H | ✅ |
| owner-redirect `useEffect`+guard in audits/crm/moderation/publications/explorer pages | ~5 ×5 | one `useRoleGate` wrapper | M | ⚠️ comportement (redirection owner) à **préserver à l'identique** |
| `components/common/Modal.tsx` ⇄ `features/crm/CrmModal.tsx` | ~54 | byte-twins — keep the generic `Modal`, retire `CrmModal` | H | ⚠️ jumeaux **confirmés** (diffèrent seulement par les classes CSS `app-modal*` vs `crm-modal*`) → consolidation OK mais gérer le `className` (5+ consos CRM) |
| `widgets/ClassificationEditModal.tsx` ⇄ `LegalDocumentEditModal.tsx` | ~34 | shared token-effect + justificatif attach/remove block (source even says "mirrors ClassificationEditModal") | H | ✅ extraire un hook `useAccessToken` |
| `widgets/AddressBanCombobox.tsx` ⇄ `LocationReferenceCombobox.tsx` | ~40 | shared headless combobox (keyboard-nav + blur-commit + listbox markup) | M | ⚠️ paramétrer la stratégie de recherche (BAN vs référence) |
| `views/rgpd/SubjectResolver.tsx` ⇄ `widgets/ActorPicker.tsx` | ~19 | shared debounced-actor-search hook + `initials` util | H | ✅ extraire hook + util |
| `features/object-drawer/ObjectDetailView.tsx:374` | — | 3rd copy of the phone-detection heuristic (import the shared predicate) | M | ⚠️ 3e copie **confirmée** (importer le prédicat partagé) |
| `primitives/SortableGrid.tsx` ⇄ `SortableList.tsx` | — | shared `useReorder` (DndContext+sensors+drag-end are identical) | M | ⚠️ extraire `useReorder` (le drag-reorder doit rester intact) |
| `sections/blocks/BlockHEB.tsx` ⇄ `sections/SectionCapacity.tsx` | ~20 | `repHeader` is byte-identical — extract one util | H | ✏️ **3 copies** en fait (+ `SectionClassification.tsx:32`, gap 8 vs 10) → extraire en paramétrant `gap` |
| `dashboard/ActualisationTable.tsx` ⇄ `CompletenessTable.tsx` | ~17 | shared drill-down toggle + table shell (cells differ) | M | ⚠️ coquille + toggle partagés (cellules diffèrent) |
| upload routes `document`/`media`/`actor-photo`/`menu-extract` | ~40 ×4 | `authorizeAsCaller(req)` helper (the auth *predicate* legitimately differs per route; only the plumbing dups) | H | ⚠️ dup **confirmée** (`getServerSupabaseClient`→`getUser(jwt)`→client anon `Bearer`→`rpc(user_can_write_object_canonical)`). `authorizeAsCaller` = helper **proposé** (n'existe pas encore). **Sensible sécurité (§59)** — extraire prudemment. |
| public routes `catalog`/`objects`/`objects/deletions`/`objects/[id]` | ~14 ×4 | `withPartner(req, endpoint, handler)` wrapper | H | ⚠️ dup **confirmée** (partner-auth 401 + rate-limit 429 + headers répétés). `withPartner` = wrapper **proposé**. API publique — préserver statuts/headers exacts. |
| `app/api/objects/delete` ⇄ `app/api/rgpd/erase` | — | shared `lib/storage-sweep.ts` (`storagePathFromPublicUrl` + best-effort bucket sweep) | H | ⚠️ `storagePathFromPublicUrl` identique dans les 2 routes — extraire (2 routes sensibles à tester) |
| `initials` helper | — | reimplemented ~6× (`useBootstrapSession`, `lib/presence`, Sidebar, ProfileDrawer, crm-view-utils, ProviderCards…) — one shared util | M | ✏️ 6 copies mais **2 variantes** (simple vs `initialsOf` qui retire SARL/SAS) → consolider en **1-2** utils |

---

## 5. Inert controls & stale stubs (ship dead UI / mislead)
| File · line | What | Conf | Vérif |
|---|---|---|---|
| `features/object-editor/sections/SectionRelations.tsx:130-132` | "Ouvrir la fiche" `↗` button with no `onClick` — does nothing when clicked | H | 👁️ **P1 — faux affordance** (bouton mort). Câbler la navigation ou retirer. |
| `features/object-editor/widgets/SiretCard.tsx:31-38` | permanently-`disabled` "Re-vérifier" button whose only function is a "coming soon" tooltip | H | 👁️ **P2** UI morte — retirer ou libellé honnête |
| `services/rpc.ts:604-614` | `listAuditTemplate`/`listPublicationBoard` — `// TODO: wire to real backend` demo stubs that return `[]` in live mode | M | 🚫 garder — appelés par AuditsPage/PublicationsPage (demo) ; `[]` en live intentionnel |
| `app/(main)/{moderation,audits,publications}/page.tsx` | intentional "Module non branché" placeholder pages (backend not wired) — flagged so you know they're still stubs | M | 🚫👁️ visible mais **intentionnel** (feature non branchée) |
| `features/object-editor/sections/SectionSustainability.tsx:44-45` | "Score Bertel /100" is a client-side placeholder ratio, not the real (unbuilt) server score | L | 🚫👁️ **à arbitrer PO** — score factice présenté comme réel (potentiellement trompeur) |

---

## 6. Minor nits (React / comments / types / i18n / style)
| File · line | What | Conf | Vérif |
|---|---|---|---|
| `features/team/InviteMemberDialog.tsx:45`, `MemberPermissionsDrawer.tsx:78` | `console.warn('preset grant failed', …)` in production (swallows a permission-grant failure) | M | 👁️ échec avalé (pas de retour UI). Volontaire (lots partiels) mais mériterait un toast « octroi partiel » |
| `widgets/AdaptedDescriptionField.tsx:50` | `setActiveLang(...)` immediately before the modal unmounts — no effect | H | ✅/✏️ **redondant** (state local, non « perdu » : `openModal` le ré-écrit à chaque ouverture) → retrait neutre |
| `widgets/CompletionRing.tsx:31` | `role="img"` + `aria-hidden="true"` on the same node cancel out | M | 👁️ **P2 a11y** — muet aux lecteurs d'écran |
| `widgets/PresenceRail.tsx:53,69` | hard-coded English "Live" / "is editing" in an otherwise all-French UI | M | 👁️ **P2 i18n** |
| `widgets/MenuExtractModal.tsx:50-51` | stale comment ("client-side PDF rasterization is a tracked follow-up") — it already shipped (`lib/pdf-rasterize.ts`) | H | ✅ commentaire périmé (feature livrée) — MAJ du commentaire |
| `sections/SectionSustainability.tsx:32-43` | three gratuitous `useMemo` over small arrays | M | ✅ retirer les `useMemo` inutiles |
| `sections/OpeningPeriodsEditor.tsx:37,75` | import statement mid-file; `useState(currentIndex)` mirrors a prop (won't resync) | M/L | ⚠️ import mid-file cosmétique ; le `useState(prop)` **ne resync pas** si le parent change `currentIndex` (stale-state latent, potentiellement visible) |
| `components/ui/input.tsx:4`, `select.tsx:5` | empty extending interfaces (`interface X extends React.*Attributes {}`) | H | ✅ remplacer par `type` (note : `select.tsx` est déjà candidat suppression §1) |
| `services/rbac.ts:1-2` | two separate imports from the same `'../lib/supabase'` module | H | ✅ fusionner les imports |
| `features/object-drawer/ObjectDetailView.tsx:103` | `type DetailLocation = ParsedLocation` — trivial 1:1 alias | L | ✅ inliner |
| `store/object-drawer-store.ts:3` | self-declared "legacy dirty-state map" shim comment | L | 🚫 garder (shim documenté ; lié à §3b) |

---

## Cross-cutting notes
- **Size smell (not dead):** `components/explorer/FiltersPanel.tsx` = 1318 lines (>800 guideline); two genuinely-distinct variant layouts.
- **Coverage gap:** `sections/SectionRelations.tsx` is the only `Section*` without a co-located `.test.tsx`.
- **Verified NOT slop** (don't touch): `data/mock*.ts` (demoMode fixtures), the `§46` ModuleUnavailableNotice + throwing savers (intentional defense), `lib/utils.ts` `cn`, `supabase.ts` `getApiClient` alias, the `asCaller` security probes (only their plumbing dups), all `§NN` comments, the `primitives/index.ts` barrel (ts-prune's "24 unused" was a false alarm — consumers import the directory), Next.js `default`/`metadata`/`POST`/`GET` route/page exports.

## Suggested removal order (when you decide to act — not done here)
1. **✅ Sûr, gros gain :** delete the 8 dead files (§1) + their 2 barrel lines, remove the dead dashboard chain (§2) as a unit,
   and sweep the ✅ dead exports/fragments (§3). *(The 2 retained primitives + les 🚫 sont un choix produit — ne pas toucher.)*
2. **👁️ UX visible (faire tôt) :** câbler/retirer le bouton « Ouvrir la fiche » (§5, P1), puis les nits visibles —
   PresenceRail i18n, CompletionRing a11y, SiretCard. Arbitrer avec le PO le « Score Bertel /100 » (factice).
3. **⚠️ Corrections avec précaution :** le double-read `area_m2`→`surface_m2` (§3, vrai bug), le doublon `WorkspaceModuleId`
   (source unique), le `useState(prop)` d'OpeningPeriodsEditor.
4. **⚠️ Consolidation (dup §4) :** commencer par le bloc parser/utils de ~145 lignes ; puis les jumeaux Modal/CrmModal,
   `storage-sweep`, et les helpers routes upload/public (**sensibles sécurité — extraire prudemment**), enfin `initials`
   (2 variantes) et `repHeader` (3 copies).
5. **✅ Nits restants (§6)** — imports fusionnés, `useMemo` gratuits, alias triviaux, commentaire PDF périmé.
