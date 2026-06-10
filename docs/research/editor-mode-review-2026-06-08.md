# Object editor — mode édité review (2026-06-08)

Living decision log for a section-by-section audit of the full-page object editor
(`/objects/[id]/edit`, `bertel-tourism-ui/src/features/object-editor`). Each control
is judged on five axes and a decision recorded. **Cadence (revised 2026-06-08): per
section — review → implement (TDD) → commit on a branch → push → verify it flows →
next section.** Editor-wide cross-cutting fixes (X1/X2/X3) land as their own
dedicated commit, not smeared across each section loop.

## Method — archetype-collapse

Sections are gated by **archetype** (6), not by the 16 type codes
(`section-config.ts`). 20 of 22 sections render from the same component for every
type; only **§05** (6 distinct blocks) and **§16** (ITI/VIS only) differ by family.
A component may still branch internally on `archetype`/`typeCode`.

- **Main walk:** all 22 sections once on an **HLO** object (HEB archetype).
- **Delta walk:** re-review only §05 per archetype (RES/ASC/ITI/VIS/SRV — HEB done
  in the main walk), §16 for ITI + VIS, and any section the main walk flags as
  branching on type.

## Rubric (per element)

① **Useful?** keep / cut · ② **Placement** right section? · ③ **Display**
rendering & clarity · ④ **Weird?** confusing / redundant / mislabeled ·
⑤ **Functional?** persists on save / inert / write-trap.

⑤ legend: ✅ persists · 🔒 read-only by design · ⚠️ inert (looks editable, does
nothing) · ⛔ write-trap (edit accepted then silently dropped) · 🧭 navigational.

**Depth:** the user wants **design-level** scrutiny (cognitive load, hierarchy,
action prominence, plain language) — not just keep/cut. Propose redesigns for
controls that are functional but poorly designed (precedent: §01 sous-catégorie
modal, redesigned from a user mockup).

## Coverage tracker

Main walk (HEB / HLO):
- [x] §01 Identité & taxonomie
- [ ] §02 Localisation
- [ ] §03 Contacts
- [ ] §04 Descriptions
- [ ] §05 Chambres & séminaire (BlockHEB)
- [ ] §06 Médias
- [ ] §07 Capacité & cadre
- [ ] §08 Classifications
- [ ] §09 Tags & étiquettes
- [ ] §10 Accessibilité
- [ ] §11 Démarche durable
- [ ] §12 Paiements & langues
- [ ] §13 Tarifs & extras
- [ ] §14 Périodes d'ouverture
- [ ] §15 Liens vers fiches
- [ ] §17 Rattachements
- [ ] §18 Fournisseur
- [ ] §19 Suivi prestataire
- [ ] §20 Distribution
- [ ] §21 Publication
- [ ] §22 Identifiants externes

Delta walk:
- [ ] §05 BlockRES · BlockASC · BlockITI · BlockVIS · BlockSRV
- [ ] §16 Lieux & étapes (ITI) · Sous-lieux (VIS)
- [ ] any section flagged "branches on type" during the main walk

## Cross-cutting findings (decide once, apply to all sections)

| # | Pattern | Where | Decision |
|---|---------|-------|----------|
| X1 | Section header **pill** is decorative — §01 hardcodes `{tone:'ok',label:'OK'}`; nav + right rail already track real completion. | `Fs.tsx:34`, every `SectionXX` | **DECIDED → reflect real state.** Drive every card pill from the same validation/completion source the right rail uses (OK / incomplet / requis). Kill hardcoded pills. |
| X2 | **Hints** render as a hover-only `?` tooltip (`title=`), invisible on touch / until hover. | `Field.tsx:18` | **DECIDED → keep `?`, real popover.** Replace native `title=` with an accessible hover/focus popover (keyboard + touch). Single change in `Field`, applies everywhere. |
| X3 | **Read-only reference** data uses a real `<input readOnly>` — visually reads as an editable field. | `Input.tsx`, §01 + others | **DECIDED → distinct read-only style.** Render display-only values as plain text / non-editable chip. **Primitive `Readout` built** (`primitives/Readout.tsx`, borderless tinted) + applied to §01 (ID OTI, Type d'objet) after user feedback. Sweep to other sections' read-only fields pending in the cross-cutting commit. |
| X4 | Warm-**cream** background palette (`--bg-tint #faf6ef`, `--surface-2 #f7f2e9`, `--bg #f4eee5`, `--surface #fffdf8`…) reads as cream *everywhere* (user-flagged). | `styles.css` | **DECIDED → global de-cream to cool off-white (DONE).** Re-toned the whole background token family (`--bg`/`--surface`/`--surface-2`/`--bg-tint`/`--bg-strong`/`--panel*`/`--theme-bg`/`--theme-surface` + body gradient) to cool neutrals (`#eef1f4` / `#fff` / `#f3f6f8` / `#e8edf1`); ink + lines were already cool slate so it harmonizes. Visual-only; FE 388 green, tsc clean. **Needs whole-app visual eyeball.** |

---

## §01 — Identité & taxonomie

Component: `sections/SectionIdentity.tsx`. Sub: "Nom commercial, type principal,
sous-catégorie métier, statut". Header pill hardcoded `OK`.

| Element | Editable | ⑤ | Notes / flags |
|---------|----------|----|---------------|
| **Nom commercial** (`generalInfo.name`) | yes | ✅ | Required. Core field. OK. |
| **Statut publication** (dot + pill) | no | 🔒 | Read-only echo; hint points to §21. Honest. |
| **Raison sociale** (`provider.companyName`) | no | 🔒 | Read-only **echo of §18 Fournisseur**. Duplicate surface. |
| **ID OTI** (`objectId`) | no | 🔒 | Canonical id, mono. Reference. |
| **Type d'objet (famille)** (e.g. `HLO — Hebergement loisir`) | no | 🔒 | **③ bug: double `●` bullet** — outer `<span class=prefix>●</span>` *and* `Input prefix="●"`, which renders its own prefix → two bullets + nested `.input-wrap` (`SectionIdentity.tsx:375-378`). Also `TYPE_LABEL` has no accents ("Hebergement"). |
| **Sous-catégorie métier** (taxonomy modal) | yes | ✅ | Cascading drill-down modal; "Valider" enables only on a changed assignable node. Appears functional (persists via `taxonomy` module). |

**Decisions:**
- **Statut publication → MOVE to the right rail**, above the `CompletionRing` (new persistent status indicator at top of `EditorRail.tsx:27`). Remove the read-only status field from §01. §21 still owns the lifecycle/publish action; the rail only displays current status. (User: "publication status not useful in that section… better place, in the right panel, above completed.")
- **Raison sociale → REMOVE from §01** (read/edit it in §18 Fournisseur; stop duplicating).
- **"Taxonomie" wording → DROP** — users don't understand the term. Section title "Identité & taxonomie" → **"Identité & catégorie"**; field "Sous-catégorie métier" → **"Sous-catégorie"** (modal "Choisir une sous-catégorie").
- **Sous-catégorie picker (field + modal) → REDESIGN** per user mockup (2026-06-08). Spec below.
- **Type d'objet double `●` → FIX** — drop the outer `<span class=prefix>●</span>`, keep the `Input prefix="●"`; also accent `TYPE_LABEL` ("Hébergement").
- Keep: Nom commercial, ID OTI, Type d'objet (read-only).
- Apply X1 (real-state pill), X2 (`?` popover), X3 (distinct read-only style) here.

**Sous-catégorie picker redesign (from user mockup 2026-06-08) — `TaxonomyModal` rewrite:**
Current pain: too much top chrome, unclear hierarchy, confusing multi-column drill, weak bottom actions.
Target ("Choisir une sous-catégorie"):
- **Compact editable breadcrumb** of the current path at top (`A › B › C`) + a **"Modifier"** affordance to re-open/re-walk it. Removes the bulky "actuelle / sélection en cours" blocks.
- **Search box** ("Rechercher une sous-catégorie…") to jump in long lists.
- **Single-column list**: parent nodes are expandable rows (chevron `›`, accordion); selectable leaves are **radios**; the saved choice shows a check + **"Actuelle"** badge. (Replaces `identity-taxo__cascade` columns.)
- **Prominent primary CTA** "Valider la sélection" + "Annuler" in footer.
- Rationale (mockup): lower cognitive load, linear/predictable nav, findability, clear current state, accessible actions.
- Preserve existing logic: "Valider" enables only on a changed assignable node; persists via the `taxonomy` module (`replaceModule`). Implementation = follow-up TDD pass (impeccable/emil for the visual layer).

**New shell element:** rail **status indicator** (top of `EditorRail`) — shows `published / draft / hidden / archived` using the same `STATUS_PILL` tones moved out of §01.

**Implementation status:**
- **Commit 1 (cleanup + rail status) — DONE & verified** (FE 381 green, `tsc` clean). Touched `SectionIdentity.tsx` (title "Identité & catégorie", removed Statut + Raison sociale fields, fixed double-`●`, renamed field → "Sous-catégorie"), new `widgets/StatusChip.tsx`, `shell/EditorRail.tsx` + `ObjectEditPage.tsx` (rail status wiring), `object-editor.css` (`.edit-side__status`); tests `StatusChip.test.tsx` (new) + updated `SectionIdentity.test.tsx`.
- **Commit 2 (sous-catégorie modal redesign) — DONE & verified** (FE 387 green, `tsc` clean). `TaxonomyModal` rewritten: compact live-selection breadcrumb + search (`computeSearchVisibleIds`, diacritic-insensitive, match + ancestors + descendants) + single-column tree (expandable groups, radio leaves, "Actuelle" badge); title "Choisir une sous-catégorie", CTA "Valider la sélection". Removed the dead cascade/summary/cell CSS. **"Modifier" added** (mockup): a teal "✎ Modifier" next to the live breadcrumb that re-expands the current choice's branch and clears the search (reveal-current); the breadcrumb itself is also live. Modal inherits the X4 de-cream.
- **X3 (read-only style) — DONE for §01** (commit 2a, user-requested): new `Readout` primitive; ID OTI + Type d'objet now render as borderless tinted readouts, not inputs. X1 (real-state pills) + X2 (hint popover) still deferred to the cross-cutting commit; X3 sweep to the *other* sections' read-only fields pending there too.
- **Accent of `TYPE_LABEL`** ("Hôtel"…) — deferred to the cross-cutting/polish pass (touches `archetypes.ts`, shared with the detail view).

### §01 Sous-catégorie — multi-level / arbitrary-depth assignment (review 2026-06-08)

**User goal:** assign an object to a category, subcategory, *and deeper* (arbitrary depth, never hardcoded to 2 levels), DB-driven; always show + save the full path; future-proof.

**Finding — the architecture ALREADY supports this** (verified end-to-end by code/SQL map):
- **Storage:** `object_taxonomy` = ONE `ref_code_id` per `(object_id, domain)` (unique `uq_object_taxonomy_object_domain`, `schema_unified.sql:1660`). Single node; path NOT stored.
- **Tree:** `ref_code.parent_id` self-referential (arbitrary depth) + `ref_code_taxonomy_closure` (transitive closure, no depth cap, auto-rebuilt by trigger on any `ref_code` change).
- **Read:** `get_object_resource` derives the path from the closure (`api_views_functions.sql:2969-3040`); the editor loads the *full* tree (`object-workspace.ts:1070-1177`) and renders it **recursively** (`SectionIdentity.tsx` `renderNode`, no level cap).
- **Write:** client-side PostgREST upsert of the single chosen `ref_code_id` (`object-workspace.ts:3472-3582`), guards `is_assignable`; server trigger re-validates. No depth assumption.
- ⇒ Assigning a level-5 node **already works** if that node is `is_assignable`. The "2-level feel" is the **data**, not the code.

**`is_assignable` does two things:** (1) write gate; (2) **path-display filter** — non-assignable ancestors are dropped from the breadcrumb (that's how the technical `root` is hidden). So a non-assignable *intermediate* node would vanish from the displayed path → conflicts with "show full path."

**Data landscape (9 domains, all currently max depth 2):** 4 already follow "only root non-assignable" (act/camp/com/hot). The other 5 hold **15 non-root non-assignable "group" nodes**:
- **hlo (2):** Auberge (0 children → DEAD), Gîte d'étape et de randonnée (2).
- **loi (5):** Art (0 → DEAD), Divertissement (5), Patrimoine agricole (5), Patrimoine culturel (2), Patrimoine naturel (3).
- **org (2):** Autocar (compagnie) (1), Services (4).
- **psv (4):** Autocar (compagnie) (1), Location de matériel de loisirs (1), Services (2), Transport et mobilité (3).
- **res (2):** Autre type de restauration (13), Table d'hôtes (2).

**Anomalies:** 2 dead nodes (Auberge, Art — non-assignable + 0 children → inert headers); lowercase names `bulle`/`chambre`/`cottage` (hlo), `atelier` (loi); single-child groups (Autocar, Location de matériel); "Table d'hôte" under accommodation (hlo) vs plural "Table d'hôtes" restaurant group (res); "Chambre d'hôte" duplicating parent "Chambre d'hôtes".

**Plan (data-led; no schema/RPC/UI-architecture change):**
1. **Rule: only the technical `root` stays non-assignable; flip all 15 group nodes → `is_assignable=true`.** ⇒ select at any level; consistent radios (kills the visual inconsistency); dead nodes become selectable; **full path still shows** (root hidden via its own flag) — *no SQL path-filter change needed.*
2. Capitalize the 4 lowercase names (+ `name_i18n.fr`).
3. Flag the semantic oddities for user decision (no auto-change).
4. **Deploy integrity:** idempotent migration → apply to live + refresh `cached_taxonomy_codes` for affected domains; fold into `seeds_data.sql`; add to manifest/runbook.
5. **UI:** recursion already present; minor polish only — assignable-parent-with-children = radio + expand caret (already), breadcrumb reads as "chemin enregistré". The earlier alignment complaint auto-resolves (all rows become radios once nothing is a bold group header).

**Single-node-per-domain (deepest, path derived) is retained** — satisfies "assigned to category AND subcategory" via `object.cached_taxonomy_codes` (node + assignable ancestors). Multi-*category* per domain would need dropping the unique constraint — out of scope unless requested.

**Decisions (locked 2026-06-08):** (a) **all non-root nodes selectable** — only each domain's `root` stays non-assignable; (b) **capitalize** the 4 lowercase names; (c) semantic oddities **listed for user, no auto-change**.

**DONE & verified (live):** `migration_taxonomy_assignable_cleanup.sql` applied to live (idempotent DML) — flipped all 15 group nodes + capitalized 4 names + refreshed cache for 5 domains. Verified: 0 non-root non-assignable remaining, 9 roots still non-assignable, full path renders (`Gîte d'étape et de randonnée › Gîte de randonnée`). Added to runbook + `ci_fresh_apply.sql` as step **13b**. **No UI/SQL code change** (architecture already arbitrary-depth; the editor now renders every node as a consistent radio ⇒ the earlier visual inconsistency + alignment bug auto-resolve).

**Flagged (pre-existing, separate):** the hlo/loi/org/psv/res taxonomy nodes live only in `old_data_enrichment_20260512/01_enrich_imported_old_data.sql` (not in the fresh manifest) ⇒ a fresh DB lacks them. Deploy-integrity gap to fold into the seed in its own pass.

**Semantic oddities for user (no change made):**
- `taxonomy_hlo` "Table d'hôte" (a *dining* concept) sits under accommodation, under "Chambre d'hôtes"; "Chambre d'hôte" (singular) duplicates its parent "Chambre d'hôtes".
- Single-child groups (redundant nesting): "Autocar (compagnie)" (org, psv), "Location de matériel de loisirs" (psv) — each has exactly 1 child.
- "Autre type de restauration" (res) is a catch-all with 13 children.
- Cross-domain name repeats (Services / Autocar / VTC / Excursion touristique …) are **expected** (separate per-type trees), not bugs.

**Round 2 — cleanup DONE & verified (live):** merged `chambre_d_hote` (68 obj) → `chambre_d_hotes`; reassigned the misplaced hlo `table_d_hote` (1 obj) → `chambre_d_hotes` + deleted it; flattened the empty PSV wrapper `leisure_equipment_rental` (promoted its child `cycle_scooter_rental` to root). **Bug caught & fixed:** the flatten step targeted slugified *names* (`location_de_materiel_de_loisirs`/`location_de_velos_et_trottinettes`) instead of the real `ref_code.code`s (`leisure_equipment_rental`/`cycle_scooter_rental`) → would have silently no-op'd; corrected + applied. Verified live: singular Chambre / Table d'hôte gone, "Chambre d'hôtes" = **70 obj**, wrapper flattened, **0 orphans**. **Picker path-highlight:** selecting a node lights its full ancestor path (`is-selected-path` on ancestors+self, `is-selected` on the chosen node) so "the parent is selected too" is visible — FE **389 green**, tsc clean. The unused `Autocar (compagnie)` → `Excursion touristique` branch was left intact (legitimate future category; no removal decision).

**Round 3 — picker fixes (user-flagged):** (a) **removed the redundant "Modifier" button** + its `revealCurrent` — opening the picker *is* editing, so it added nothing; (b) the radio now reflects the **selected path** (`checked={isSelectedPath}`, dropped the shared `name`, `onClick`-driven selection) so picking a child **checks its parent's radio too** — "the parent is selected" is now literal (not just a row highlight), as agreed. Clicking an ancestor still narrows the selection to it (and `Valider la sélection` saves the deepest node, path derived as before). FE **391 green**, tsc clean.

**Deferred — taxonomy facets (post-MVP, user-decided 2026-06-09):** the HLO taxonomy conflates two **independent axes** in one tree — **business model** (Chambre d'hôtes = hosted, Location saisonnière = self-catering, Auberge, Gîte d'étape) and **dwelling format** (appartement, studio, bungalow, **bulle**, lodge…). The single-tree + single-assignment model files each format under one business model arbitrarily, so it cannot express e.g. *"self-catering bulle"* (user: "une bulle peut aussi être une location saisonnière"). **Proper fix = faceted classification** — an object carries a business-model AND a format (drop `uq_object_taxonomy_object_domain` + multi-select picker); its own spec→build. **MVP decision:** leave as-is, business type stays the primary classification.

---

## §02 — Localisation

Component: `sections/SectionLocation.tsx`. Solid base: formatted address inputs, lieu-dit
corpus combobox + pending-change approval flow, draggable GPS pin-map with confirm,
**real-state pill** (`Géocodé / GPS manquant` — the X1 reference).

| Element | ⑤ | Decision |
|---------|----|----------|
| Adresse (`address1`, formatted) + Complément (`address2`) | ✅ | Keep. |
| Code postal (`postcode`) | ✅ | Keep, required. |
| **Commune** (`city`) | ✅ | **DONE — required + ref_commune select.** Strict `ReferenceSelect` over `location.zoneOptions` (the §41 `ref_commune` catalog); selecting writes `city` + `codeInsee` (saver persists `code_insee` — verified, line 5134); legacy free-text city snaps to its option by folded label; free-text fallback when the catalog is empty. Publication blocker (city OR codeInsee) — rule user-implemented (`101426f`), tests pinned. |
| **Bureau postal** (`address3`) | ✅→cut | **DONE — removed from the editor** (unclear vs Commune; niche). Column stays; data round-trips untouched. |
| **Zone touristique** (`zoneTouristique`) | ✅→cut | **DONE — removed from the editor** (free text duplicating the structured `object_zone`/INSEE territory model of §16). Column stays. |
| Lieu-dit (corpus + moderation flow) | ✅ | Keep — best-in-class pattern. |
| Latitude / Longitude | ✅ | Keep, required-marked. |
| **Géocoder l'adresse** (button) | ⚠️ disabled | **DECIDED — BUILD IT** (commit 2): wire to the BAN API (`api-adresse.data.gouv.fr`, covers Réunion, no key); loading + not-found handling; pin-map stays the manual fallback. |
| Pin map (drag + confirm) | ✅ | Keep. |

**Found while reviewing:** `editor-validation.ts` had NO §02 rules at all — the Adresse/CP/GPS
asterisks were visual-only. Commune is now enforced; **Adresse/CP/GPS required-vs-validation
alignment** logged for the cross-cutting honest-controls pass (X1 family).
