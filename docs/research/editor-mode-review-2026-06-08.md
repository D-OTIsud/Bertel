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
| X3 | **Read-only reference** data uses a real `<input readOnly>` — visually reads as an editable field. | `Input.tsx`, §01 + others | **DECIDED → distinct read-only style.** Render display-only values as plain text / non-editable chip, visually distinct from editable inputs. |

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
- **Commit 2 (sous-catégorie modal redesign) — PENDING.**
- **X1/X2/X3 — deferred** to the dedicated cross-cutting commit (not applied in §01 yet; ID OTI / Type d'objet remain input-styled until then).
- **Accent of `TYPE_LABEL`** ("Hôtel"…) — deferred to the cross-cutting/polish pass (touches `archetypes.ts`, shared with the detail view).
