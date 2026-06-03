# Editor Shell Audit — full-page object editor (2026-06-03)

**Scope.** The full-page object editor at `bertel-tourism-ui/src/features/object-editor/` — its 22-section registry, the archetype blocks (§05), the shell (topbar/nav/rail/footer + state/save/validation/completion), the backend read/write RPC wiring, and object-surface (data-model) coverage.

**Method.** 7 parallel read-only investigation passes (4 section-group passes §01-06 / §07-12 / §13-17 / §18-22, + shell, + backend-RPC-wiring, + surface-coverage), cross-validated. Every claim below is anchored to `file:line`. This audit is the **first step of B2 / §24 P1.2 (editor completion)** — it does not change code.

**One correction applied during synthesis (spot-check).** The backend pass reported `internal.workspace_assert_can_write_object` authorizes via `is_object_owner` only — that reads the *base* file (`object_workspace_safe_write_rpcs.sql:62`). The **SP-1 migration** (`migration_permission_write_paths.sql:30`) `CREATE OR REPLACE`s the gate to `user_can_write_object_canonical` later in the apply order (asserted by `tests/test_sp1_canonical_write_auth.sql:23`). **The canonical write-path invariant holds on live.** The audit's other "invariant-bypass" notes (direct-PostgREST description/classification writes) are likewise closed by SP-1/SP-1b RLS policies on the base tables — not real gaps.

---

## TL;DR

The **read path is genuinely solid**; the **write path is half-built and riddled with silent write-traps**. Of 22 sections + 6 archetype blocks: **~11 SOLID/OK-read-only-done-right**, **~9 NEEDS-WORK**, **4 BROKEN** (§15 Relations, §16 Lieux/étapes, §05-ITI stages, §21 Publication). Three structural causes dominate:

1. **Save-only-on-publish.** `persistDirtyModules` is called *only* from `handlePublish` (`ObjectEditPage.tsx:196`). There is no draft-save; the "Brouillon" button is a dead disabled stub (`EditorFooter.tsx:9`). A user without publish rights hits a *permanent* §21 validation blocker → **can never persist a single edit.** (This is B2's core.)
2. **Silent write-traps** — enabled, editable controls whose changes are dropped — in ≥10 places, violating the CLAUDE.md "no silent write-traps" invariant. Worst: **§21 selecting "Archivé/Hors ligne" then saving *publishes* the object** (the only button hardwires `rpc_publish_object(true)`).
3. **Three fully-implemented write RPCs are never called** (`save_object_relations`, `save_object_itinerary_nested`, `save_object_places`) — so relations, ITI stages/sections, and sub-places/zones have no live writer despite working SQL.

Plus a **reference-enrichment gate** (`ENABLE_OPTIONAL_WORKSPACE_REST_ENRICHMENT=false`) that prevents adding catalog values to empty/new objects (cripples §07/§10/§12), and several **model surfaces with no editor home** (`object_review`, ITI sub-model, `object_zone`, `object_private_description`).

---

## Section scorecard

Legend: **SOLID** = editable + persists correctly · **OK** = works for existing data, bounded gaps · **NEEDS-WORK** = real trap/gap · **BROKEN** = core function missing/wrong · **RO✓** = read-only by design, done right.

| § | Section | Grade | Read | Write path | Headline problem |
|---|---------|-------|------|-----------|------------------|
| 01 | Identité & taxonomie | **NEEDS-WORK** | ✓ | direct `object.update{name,commercial_visibility}` + `saveObjectWorkspaceTaxonomy` | **status `<select>` write-trap** — mutates draft, marks dirty, never persisted (`object-workspace.ts:3384`) |
| 02 | Localisation | **SOLID** | ✓ | direct `object_location` upsert (`:4588`) | none (Géocoder correctly disabled w/ reason) |
| 03 | Contacts | **SOLID** | ✓ | direct `contact_channel` diff (`:4781`) | `is_public`/`is_primary` not user-toggleable (minor) |
| 04 | Descriptions | **SOLID** | ✓ | canonical `object_description` + `rpc_write_org_description` (`:5000`) | none — exemplary permission-gated layering (§20) |
| 05 | Archetype block | *see sub-table* | — | — | ITI BROKEN; ASC NEEDS-WORK; HEB/RES/VIS/SRV OK |
| 06 | Médias | **SOLID** | ✓ | direct `media`+`media_tag` diff (`:4649`) | place-media branch is a no-op placeholder (minor) |
| 07 | Capacité & cadre | **NEEDS-WORK** | ✓ | `save_object_commercial` | capacity-row **`unit` Input dropped** (`safe_write_rpcs.sql:499`); enrichment-gated |
| 08 | Classifications | **OK** | ✓ | direct `object_classification` (`:3510`) | **cannot start a new scheme** (groups filtered to existing rows `:1266`) |
| 09 | Tags & étiquettes | **NEEDS-WORK** | ✓ | `save_object_workspace_tags` | per-tag **label Input write-trap** (deliberately not persisted `:3805`) |
| 10 | Accessibilité | **NEEDS-WORK** | ◑ | distinctions + `save_object_commercial` | **"Types de handicap" chips dropped** (`disabilityTypesCovered` unsaved); equipment panels empty under enrichment gate |
| 11 | Démarche durable | **SOLID** | ✓ | `save_object_workspace_sustainability` | "Score Bertel" is a documented client stub (cosmetic) |
| 12 | Paiements & langues | **NEEDS-WORK** | ✓ | `save_object_commercial` | enrichment-gated → all chips pre-selected, **cannot add**; language level unreachable |
| 13 | Tarifs & extras | **OK** | ✓ | `save_object_commercial` | policy fields repurpose `prices[0]`; amountMax/discounts/age not surfaced |
| 14 | Périodes d'ouverture | **SOLID** | ✓ | `save_object_openings` | `allYears` defaulted true, no toggle (minor) |
| 15 | Liens vers fiches | **BROKEN** | ✓ | **NO WRITER** (`relationships`∈READONLY) | editable relation/note/add/delete all **silently discarded**; `save_object_relations` exists but unwired |
| 16 | Lieux & étapes / Sous-lieux | **BROKEN** | ◑ | **effectively none** | new sub-places (`placeId:null`) + label/kind + ITI stages all dropped; `save_object_places`/`_itinerary_nested` unwired |
| 17 | Rattachements | **OK** | ✓ | direct `object_membership` (`:4442`) | memberships persist; publisher/actors/SIRET read-only display |
| 18 | Fournisseur | **NEEDS-WORK** | ✓ | NO WRITER (RO module) | **2 inert `<select>` write-traps** (forme juridique, chambre consulaire); "Compléments éditables" header under a "Lecture seule" banner |
| 19 | Suivi prestataire (CRM) | **NEEDS-WORK** | ✓ | NO WRITER (RO module) | mostly read-only, but per-row **tone `<select>` is an inert trap**; `object_private_description` is an orphaned write |
| 20 | Distribution | **SOLID (RO✓)** | ✓ | none (by design) | model read-only section — all controls disabled, banner shown |
| 21 | Publication | **BROKEN** | ✓ | only `commercial_visibility`; status via publish only | **selecting Archivé/Hors-ligne + saving PUBLISHES** (`ObjectEditPage.tsx:202`); no draft-save / unpublish / archive control |
| 22 | Identifiants externes | **SOLID (RO✓)** | ✓ | none (by design) | clean read-only; honest "restricted reads" empty-state |

### §05 archetype blocks

| Block | Grade | Wired modules | Write-trap |
|-------|-------|---------------|-----------|
| **HEB** Chambres & séminaire | **OK** | rooms, meetingRooms (direct), capacity (`save_object_commercial`) | none (but rooms save is destructive delete-then-reinsert → data-loss risk on mid-save failure) |
| **RES** Cuisine & service | **OK** | menus, openings, capacity | none |
| **ASC** Formules & saison | **NEEDS-WORK** | activity, pricing (relationships RO-display) | 4× `TriState` "Familles/Débutants/Groupes/PMR" + `SeasonPicker` are `onChange={()=>undefined}`; equipment toggle writes magic string `'Fourni sur place'` |
| **ITI** Tracé & étapes | **BROKEN** | itinerary (header + practices only) | **stages repeater dropped** (writer touches `object_iti`/`_practice` only); GPX dropzone + SeasonPicker dead |
| **VIS** Visite & médiation | **OK/NEEDS-WORK** | characteristics, pricing, openings | 4× `TriState` "Public & accessibilité" no-op (minor) |
| **SRV** Prestations & zone | **OK/NEEDS-WORK** | characteristics, openings | "Communes desservies" ChipSet + "+ Commune" are static/dead; `object_zone` unwired |

## Shell scorecard

| Part | File | Grade | Note |
|------|------|-------|------|
| Topbar | `shell/EditorTopbar.tsx` | **OK** | fully wired; conflates save+publish into one "Publier" button |
| Nav | `shell/EditorNav.tsx` | **OK** | section nav SOLID; **TOOL_ITEMS** (versions `v12`/import/duplicate/archive) are fabricated disabled stubs (`:18`) |
| Rail | `shell/EditorRail.tsx` | **SOLID** | thin pass-through composition |
| Footer | `shell/EditorFooter.tsx` | **NEEDS-WORK** | **"Brouillon" button hard-disabled, no handler** (`:9`) — the exact control B2 must wire |
| State | `useObjectEditorState.ts` / `editor-state.ts` | **OK** | **READONLY_MODULES hazard**: 5 modules force `dirty=false` → edits render but never save (`editor-state.ts:82-116`) |
| Save | `useEditorSave.ts` | **SOLID engine, misused** | pure `(modules,perms,draft)→result`; publish-independent — **ready for draft-save**; only caller is `handlePublish` |
| Validation | `editor-validation.ts` | **SOLID** | 7 coherent rules; §21 publish-permission rule = permanent blocker for non-publishers |
| Completion | `editor-completion.ts` | **OK** | **incoherent**: counts unsaveable RO sections (§15/§17/§19/§22); "prête à publier" decoupled from the publish gate |
| CompletionRing / IssuesRail | widgets | **SOLID** | real data |
| HistoryRail | `widgets/HistoryRail.tsx` | **OK** | *synthesized* from field timestamps, not a real audit log; "Tout voir ›" inert |
| PresenceRail | `widgets/PresenceRail.tsx` | **OK** | real Supabase Realtime presence, but **underused** — editor never calls `lockField`/`announceTyping`, so the typing badge never lights from this app |

---

## Cross-cutting findings

### A. Save-only-on-publish (B2 core)
`persistDirtyModules` (`ObjectEditPage.tsx:158-183`) is invoked solely from `handlePublish` (`:196`). Publication and persistence are welded: to write *anything* a user must clear all publication blockers and publish live. The save **engine** (`useEditorSave.save`) is already pure and publish-independent — the coupling is entirely in `ObjectEditPage`. The "Brouillon" button (`EditorFooter.tsx:9`) and the topbar/footer copy ("Publier pour enregistrer") make the publish-only model intentional/documented, but it blocks the contributor model the platform is built around.

### B. Silent write-traps (CLAUDE.md invariant violations)
Enabled, editable controls whose changes are dropped:
- **§21 status** — select "Archivé/Hors-ligne" + the only save button publishes the object (active wrong-action). *Most severe.*
- **§15 relations** (outgoing) — `relationships`∈READONLY_MODULES + no dispatcher case; UI fully editable.
- **§16 sub-places + ITI stages** — new places (`placeId:null`) and stage fields never persisted.
- **§01 status**, **§07 capacity unit**, **§09 tag label**, **§10 disability-types chips** — field dropped by the writer.
- **§18** forme-juridique / chambre-consulaire selects, **§19** tone select — inert `onChange={NOOP}` on a `Select` primitive that has *no disabled state* (`primitives/Select.tsx`).
- **§05** ASC/VIS `TriState` + `SeasonPicker`, SRV communes ChipSet — no-op handlers.
**Root causes:** (1) `Select` primitive can't be disabled → "read-only" sections leak editable dropdowns; (2) `onChange={()=>undefined}` placeholders shipped as if functional; (3) `READONLY_MODULES` forces non-dirty *and* the save dispatcher (`useExplorerQueries.ts:224-321`) has no case for those modules.

### C. Defined-but-unwired write RPCs
All three exist in `object_workspace_safe_write_rpcs.sql`, are `GRANT`ed to `authenticated`, and have **zero call sites** under `src/` (grep-verified):
- `save_object_relations` (`:968`) → `object_relation` + `object_org_link` (closes §15)
- `save_object_itinerary_nested` (`:784`) → `object_iti_info` + `object_iti_stage`(+media) + `_section` + `_profile` + `_associated` (closes §16 ITI + ITI sub-model)
- `save_object_places` (`:1071`) → `object_place`(+`object_location`/`_description`/media) + `object_zone` (closes §16 places + §02 zones)
> **Correction to §24 B2:** these live in `object_workspace_safe_write_rpcs.sql`, **not** `object_workspace_gap_rpcs.sql`; and there is **no** `save_object_workspace_general_info` RPC at all — general-info is a direct PostgREST `object.update` writing only `name`+`commercial_visibility` (`object-workspace.ts:3384`).

### D. Reference-enrichment gate
`ENABLE_OPTIONAL_WORKSPACE_REST_ENRICHMENT=false` (`object-workspace.ts:127`) skips the full-catalog fetches for `characteristics`/`capacityPolicies`, so §07 (metrics/env tags), §10 (accessibility equipment), §12 (payment methods/languages) fall back to *already-attached values only*, rendered all-pre-selected — users can un-toggle but **cannot add**. Empty/new objects show empty panels. This is §24 B2's "turn on reference enrichment."

### E. Backend wiring truth
One read RPC (`api.get_object_resource`, ~40 surfaces) + 7 write RPCs, of which the frontend calls **4** (`save_object_commercial`, `save_object_openings`, `save_object_workspace_sustainability`, `save_object_workspace_tags`); everything else writes via **direct PostgREST** table ops. ~10 modules re-read via direct PostgREST instead of the resource blob. All RPC writes go through `internal.workspace_assert_can_write_object`, which **does** honor `user_can_write_object_canonical` on live (SP-1 migration — see correction above).

### F. Model-coverage orphans (no editor surface)
- **`object_review`** — *fully orphaned*. Read only by `api.get_object_reviews`; the editor never surfaces reviews → no review moderation / owner-response / rating-correction UI anywhere.
- **ITI sub-model** — `object_iti_section` / `_info` / `_profile` / `_associated_object` only shown as scalar counts; not authorable. ITI is the worst-covered archetype.
- **`object_zone`** — read into `location.zoneCodes` but no writer (territory assignment is import-only).
- **`object_private_description`** (§19 CRM notes) — displayed but every control disabled and no save fn → "Suivi prestataire" notes are non-functional.

### G. Coherence / polish
- Completion ring counts sections the editor can't persist; "prête à publier" label overstates a number decoupled from the publish gate.
- Mock chrome ships: `EditorNav` TOOL_ITEMS (`v12` fabricated), `HistoryRail` synthesized + dead "Tout voir", PresenceRail real-but-underused.
- Rooms/meeting-rooms destructive delete-then-reinsert risks data loss on partial failure.

---

## Prioritized remediation backlog (feeds B2 / §24 P1.2 and beyond)

**P0 — Stop the data-loss / wrong-action traps (CLAUDE.md invariant).**
1. **§21**: remove the status `<select>`→publish coupling; replace with explicit Publier / Dépublier(→`hidden`) / Archiver actions mapped to real status paths. (Highest severity — currently publishes the opposite of intent.)
2. **§15 / §16**: wire `save_object_relations` + `save_object_itinerary_nested` + `save_object_places`; remove `relationships` from `READONLY_MODULES`; add dispatcher cases.
3. **Disable or wire** the remaining inert controls (§01 status, §07 unit, §09 label, §10 disability-types, §18 two selects, §19 tone, §05 ASC/VIS/SRV no-ops). **Root fix:** add a `disabled` state to the `Select` primitive; sweep `onChange={()=>undefined}`.

**P1 — Draft-save (B2 core).** Extract `handleSaveDraft` from `handlePublish` (save without publish, without the blocker gate); wire the Footer "Brouillon" button (+ a topbar button); keep `publishDisabled` gating Publier only; persist `object.status='draft'` via a real path; add unpublish/archive.

**P2 — Reference enrichment (B2).** Enable/replace `ENABLE_OPTIONAL_WORKSPACE_REST_ENRICHMENT` so §07/§10/§12 (and §08 start-new-scheme) can add catalog values to empty/new objects.

**P3 — Coverage gaps (new, beyond B2).** Review moderation (`object_review`); ITI sub-model authoring; `object_zone` writer; `object_private_description` writer (§19 notes).

**P4 — Coherence/polish.** Completion ring excludes unsaveable RO sections + reconcile "prête à publier"; remove/relabel mock chrome (or wire it); make rooms/meeting-rooms save non-destructive.

---

## Appendix — what is SOLID (do not rebuild)
Read path + parser (`get_object_resource` → `object-workspace-parser.ts`); §02/§03/§04/§06/§11/§14 writes; §20/§22 read-only sections (the model for honest read-only); the save *engine* (`useEditorSave`); validation; permission layering in §04 (canonical vs org overlay, §20). The SP-1/SP-1b/P0.3 backend authorization (canonical-write + read-gate) is correctly in force.
