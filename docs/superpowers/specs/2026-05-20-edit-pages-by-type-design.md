# Edit Pages by Type — full-page object editor

- **Date:** 2026-05-20
- **Status:** Approved design (architecture confirmed; section/backend detail captured here)
- **Source design:** `Bertel.zip` → `Edit Pages by Type.html` + `edit-*.jsx` prototype
- **Target app:** `bertel-tourism-ui` (Next.js 16 / React 19 / TypeScript / Tailwind / Supabase)

## 1. Context & goal

The prototype `Edit Pages by Type` is a full-page object editor: one editor per
archetype (HEB · RES · ASC · ITI · VIS · SRV), driven by a topbar, an accent type
ribbon, a 22-section left nav, a single scrolling main column where every section
is visible, and a right rail (completion / issues / presence / history).

The real app already has a mature **drawer-based** editor — `ObjectDrawerShell` +
~23 `ObjectWorkspace*Panel.tsx` files — one section at a time, per-section save,
real Supabase RPC wiring, per-module permissions, dirty tracking. The matching
"Detail Pages by Type" prototype was already ported (commit `71d91a4`).

**Goal:** replace the drawer's *edit* mode with a faithful port of the prototype as
a real, wired full-page editor. The prototype is ported as-is; visual tweaks are
deferred until the user has felt the UX.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Scope | New full-page editor route, wired to real workspace data; replaces the drawer's edit mode. |
| Save model | One global save bar; commits all dirty sections at once, each respecting its per-module permission (direct write vs moderation proposal). |
| Section coverage | All 22 prototype sections built; the backend is extended for the 4 unbacked ones. |
| Delivery | One faithful body of work (not incremental waves). |
| Tweaks | Prototype ported faithfully; tweaks addressed after a UX review. |

## 3. Architecture

### 3.1 Routing & entry
- New App Router route: `src/app/(main)/objects/[objectId]/edit/page.tsx` — a thin
  client page rendering `ObjectEditPage`.
- The explorer drawer keeps **view mode only** (`ObjectDetailView`). Its "Modifier"
  button changes from `setMode('edit')` to `router.push('/objects/<id>/edit')`.
- Editor "Aperçu fiche" → detail view; "Annuler" / breadcrumb → explorer.
- Once every section is covered, the drawer's edit mode, `ObjectDrawerNav`, and the
  23 `ObjectWorkspace*Panel.tsx` files are **deleted** — no dead code retained.

### 3.2 Data flow — reuse the existing layer
- `useObjectWorkspaceQuery(objectId)` → `ObjectWorkspaceResource { modules,
  permissions, detail }`. No new fetch RPC for the 18 wired sections.
- A new hook `useObjectEditorState` holds `{ baseline, draft }` of
  `ObjectWorkspaceModules` — the `EditorSnapshot` pattern currently inside
  `ObjectDrawerShell`, lifted out. The per-module patch/replace updaters in
  `ObjectDrawerShell` move into this hook.
- Each section reads its slice `draft.<module>` and writes through a typed updater.
  Sections stay isolated — a section knows only its own module.
- Archetype identity (`TYPE_ARCHETYPES`, `ArchetypeMeta`, accent classes
  `acc-teal|orange|blue|green|plum|rust`) is **extracted from `ObjectDetailView.tsx`**
  into a shared `archetypes.ts` consumed by both detail and editor — one source of truth.

### 3.3 Save model — global save bar
- `getDirtySections(snapshot)` (exists) drives a total dirty count in the topbar +
  footer save bar.
- **"Enregistrer"** iterates dirty modules, calling the existing per-module
  `saveObjectWorkspaceModule` for each. Partial success supported: a failed module
  keeps its error and stays dirty; successful modules update their baseline.
- Per-module permission decides routing: `canDirectWrite` → direct save;
  only `canPrepareProposal` → moderation proposal; neither → blocked, surfaced in
  the validation banner.
- **"Publier les modifs"** = publish gate: validation blockers must be empty, then
  `publishObjectWorkspace`.
- Route-leave guard reuses `ObjectWorkspaceUnsavedDialog`.

### 3.4 File structure — new `src/features/object-editor/`
- `ObjectEditPage.tsx`, `useObjectEditorState.ts`, `archetypes.ts`
- `shell/` — `EditorTopbar`, `TypeRibbon`, `EditorNav`, `EditorRail`,
  `EditorFooter`, `SaveBar`
- `primitives/` — `Field`, `Input`, `Textarea`, `Select`, `Chip`/`ChipSet`,
  `Toggle`, `StatCard`, `Fs`, `Repeater`, `LangTabs`
- `sections/` — one component per section + `sections/blocks/Block{HEB,RES,ASC,ITI,VIS,SRV}`
- `widgets/` — `Provenance`, `ValidationBanner`, `CompletionRing`, `IssuesRail`,
  `PresenceRail`, `HistoryRail`, `RelationPicker`, `SiretCard`
- Styling: new `object-editor.css`, imported alongside `styles.css` / `detail-types.css`.

## 4. Shell & layout

| Component | Content |
|---|---|
| `EditorTopbar` | Breadcrumb (Explorer › archetype › name › Modifier); title + rename pencil + type code + ref id; `ModeToggle` (Rapide/Complet); save/dirty status; Aperçu fiche / Annuler / Publier les modifs. |
| `TypeRibbon` | Accent blob + `codeName · family` + `covers`. Accent from archetype. |
| `EditorNav` | 5 section groups (Identité / Caractéristiques / Tarifs & ouverture / Liens & territoire / Gestion) + Tools group. Each item: status dot, mono number, label, completion %/hint. Scroll-spy: click scrolls; active section tracked on scroll. |
| `EditorMain` | Vertical scroll of all section `Fs` cards (01–22). `Fs` collapsible. Rapide mode auto-folds non-essential sections (`MODE_ESSENTIAL` set). |
| `EditorRail` | `CompletionRing`, `IssuesRail`, `PresenceRail`, `HistoryRail`. |
| `EditorFooter` | Keyboard-shortcut hints (⌘S / ⌘⇧P / Esc) + Brouillon / Aperçu / Publier. Sticky `SaveBar` shows dirty count + Enregistrer. |

Editor-local state (mode, active section, collapsed sections) lives in a small
editor store or `ObjectEditPage` state.

## 5. The 22 sections

18 wired to existing workspace modules; 4 need backend extension (§7).

| # | Section | Backing module | Status |
|---|---|---|---|
| 01 | Identité & taxonomie | `generalInfo` + `taxonomy` | wired |
| 02 | Descriptions | `descriptions` | wired |
| 03 | Localisation | `location` | wired |
| 04 | Contacts | `contacts` | wired |
| 05 | Type block | `rooms`+`meetingRooms` / `menus` / `activity` / `itinerary` / `event` | wired (per archetype) |
| 06 | Médias | `media` | wired |
| 07 | Capacité & cadre | `capacityPolicies` | wired |
| 08 | Classifications | `distinctions.distinctionGroups` | wired |
| 09 | Tags & étiquettes | NEW tags module | backend |
| 10 | Accessibilité | `distinctions.accessibilityLabels` + `accessibilityAmenityCoverage` + `characteristics` accessibility family | wired |
| 11 | Démarche durable | NEW sustainability module (`object_sustainability_action`) | backend |
| 12 | Paiements & langues | `characteristics` | wired |
| 13 | Tarifs & extras | `pricing` | wired |
| 14 | Périodes d'ouverture | `openings` | wired |
| 15 | Liens vers fiches | `relationships.relatedObjects` | wired |
| 16 | Lieux & étapes / Sous-lieux | `descriptions.places` + `itinerary.stages` (ITI/VIS only) | wired |
| 17 | Rattachements | `relationships` org/actor links + `memberships` | wired |
| 18 | Fournisseur | actor/legal data; SIRET card presentational | backend (partial) |
| 19 | Suivi prestataire (CRM) | `providerFollowUp` | wired |
| 20 | Distribution & réseaux | NEW distribution module (`actor_channel`) | backend |
| 21 | Publication | `publication` | wired |
| 22 | Identifiants externes | `syncIdentifiers` | wired |

**Type block 05** (one per archetype): `BlockHEB` (rooms table + amenities +
policies + MICE), `BlockRES` (cuisine + menus PDF + week schedule), `BlockASC`
(formulas + operator/guide + season), `BlockITI` (GPX + KPIs + waypoints + season),
`BlockVIS` (visit modes + tariffs + seasonal schedule), `BlockSRV` (prestations +
intervention zone + counter hours).

## 6. Cross-cutting widgets

- `Provenance` — field-level source badge (Apidae / INSEE / Prestataire / OTI /
  Manuel…). Source derived from existing parser data (`originItems`, sync state)
  where available, else "Manuel".
- `ValidationBanner` — publication gate; blockers/warnings computed from per-type
  required-field rules + permission state.
- `CompletionRing` + per-section `%` — filled-vs-required ratio per module.
- `IssuesRail` — derived from validation results.
- `PresenceRail` — reuses `usePresenceRoom`.
- `HistoryRail` — uses available last-modified / audit data; if no audit source,
  renders module last-updated info (no fabricated history).
- `RelationPicker` — typeahead over objects, backed by an object-search RPC
  (the explorer list RPC is reused/extended).
- `SiretCard` — presentational only; renders stored provider data. "Re-vérifier"
  is disabled/mocked — no live INSEE/SIRENE call.

## 7. Backend extensions (the 4 gaps)

The **read** API (`api_views_functions.sql`) already surfaces sustainability,
channels, tags, and amenities. No new DB tables — the tables exist. The work per
domain: a workspace **parser surface** + a **safe-write RPC** following the existing
`internal.workspace_*` helpers and the `workspace_assert_can_write_object`
permission gate in `object_workspace_safe_write_rpcs.sql`.

| Domain | Parser module | Save RPC | Notes |
|---|---|---|---|
| Tags (09) | `tags` | `save_object_workspace_tags` | Verify existing tag write path (37 tag hits already in safe-write RPCs) before adding. |
| Sustainability (11) | `sustainability` | `save_object_workspace_sustainability` | V5 vocabulary `CAT_*` / `SA_*` / `MA_*`; distinct from labels. |
| Distribution (20) | `distribution` | `save_object_workspace_distribution` | Backed by `actor_channel`. |
| Fournisseur (18) | reuse actor/legal data | (reuse `legal` / actor RPCs) | SIRET card presentational; no new write path beyond existing. |

Each new module adds an entry to `ObjectWorkspaceModules`, `ObjectWorkspacePermissions`,
the parser, `MODULE_KEY_MAP`, and the editor save loop.

CLAUDE.md compliance: inspect existing tables/views/enums before any SQL; no direct
`site_object_id` FK; one source of truth per concept; reversible, idempotent
migrations.

## 8. Styling

Port `edit-types.css` tokens into a new `object-editor.css`. Reconcile the
prototype's accent variables with the `acc-*` archetype classes already in
`styles.css` from the detail-pages port. Fonts (Manrope / Sora / IBM Plex Mono)
are already loaded.

## 9. Testing & verification

- Parser unit tests for the 3 new workspace modules.
- `useObjectEditorState` tests: dirty tracking, batched save, partial failure.
- Per-section render tests (the 22 sections) against fixture workspace data.
- A Playwright smoke test of `/objects/[objectId]/edit`.
- `tsc` type-check, lint, `next build` all green before completion.

## 10. Out of scope / deferred

- Live INSEE/SIRENE verification (SiretCard is presentational).
- Real-time collaborative field locking beyond existing presence.
- Visual tweaks to the prototype — deferred until post-UX review.
- Any audit-trail backend if none exists — HistoryRail degrades gracefully.

## 11. Documentation obligations

On completion: record the locked decisions and the editor architecture in
`bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`; propose the full-page
editor route + global-save model as an architectural rule in `CLAUDE.md`; refresh
MCP memory from the canonical log.
