# Design Audit — RGPD Erasure page

**Target:** `bertel-tourism-ui/src/views/RgpdErasurePage.tsx` (route `/rgpd`)
**Date:** 2026-06-23
**Register:** Product (internal admin tool, light-only theme)
**Method:** `impeccable audit` (technical) + `critique`-level UX review, grounded in the project's actual tokens (`src/styles.css`, `tailwind.config.js`, `src/lib/theme.ts`).

> Context note: no `PRODUCT.md` / `DESIGN.md` exists for the impeccable loader, so register and intent were inferred from the code and `CLAUDE.md`. Running `/impeccable teach` once would make future audits sharper.

---

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2/4 | `text-ink-3` ≈ 4.0:1 and `text-orange` warnings ≈ 2.0:1 fail WCAG AA |
| 2 | Performance | 4/4 | Trivial, no images/animation, cheap controlled form |
| 3 | Responsive | 3/4 | Fluid single column; submit button < 44px touch target |
| 4 | Theming | 2/4 | Two broken token references render no fill/border; one-off radii bypass the scale |
| 5 | Anti-Patterns | 3/4 | Not AI-slop, but `window.confirm` + same-teal destructive button are real error-prevention anti-patterns |
| **Total** | | **14/20** | **Good — address Accessibility + Theming** |

The mechanical score is "Good," but this is the single most dangerous screen in the product (permanent PII erasure, hard cascade delete). For an irreversible-action surface the qualitative bar is higher than 14/20 implies — the headline issues below are about **error prevention and legibility under stress**, not polish.

---

## Anti-Patterns Verdict

**Does it look AI-generated? No.** The page is honest and restrained: one accent (teal), no gradient text, no glassmorphism, no hero-metric block, no identical card grid, system-ish sans. That's the right instinct for a compliance tool. The real problems are not slop, they're **mismatch between the stakes of the action and the weight of the UI**:

- A permanent, irreversible erasure is gated only by a native `window.confirm()`.
- The destructive "Supprimer définitivement" path uses the **same calm teal button** as the safe "Anonymiser" path.
- The element meant to carry the "read this carefully" warning (the info callout) currently renders with **no background and no border** because of a broken token (see T1).

---

## Detailed Findings by Severity

### [P1] Info callout renders with no fill and no border (broken tokens)
- **Location:** `RgpdErasurePage.tsx:88` — `border border-info-border bg-info-bg`
- **Category:** Theming / Anti-Pattern
- **Evidence:** `info-bg` and `info-border` are **not** colors in `tailwind.config.js`, and there is **no** `--info-bg` / `--info-border` token in `styles.css`. These two classes are used **only** on this page (grep: 1 occurrence, nowhere else). Tailwind emits no utility for an unregistered color name, so both declarations are absent.
- **Impact:** The most important block on the screen — the explanation of what this tool does and does not touch — has no surface. It reads as unstyled body text floating on the page gradient, so the "stop and read" affordance is lost. Looks unfinished.
- **Fix:** Use real tokens. Either add a semantic `info` family (`--info-bg`, `--info-border`) to `styles.css` + `tailwind.config.js`, or reuse what exists: `bg-teal-soft border-line` / `bg-surface2 border-line`, with `text-ink-2`.
- **Suggested command:** `/impeccable colorize`

### [P1] Destructive "delete" path is visually indistinguishable from the safe path
- **Location:** `RgpdErasurePage.tsx:135-143` (radios) and `157-163` (submit button)
- **Category:** Anti-Pattern (Error Prevention)
- **Evidence:** Both radios share identical styling; "danger" is conveyed only by muted parenthetical text "(cascade dure)" in `text-ink-3`. The submit button stays `bg-teal` for both modes; only its label changes. The system already ships a `--destructive` (#c85c48) / `brand-red` token that is unused here.
- **Impact:** The highest-consequence choice in the app carries no visual escalation. An operator skimming can hard-delete when they meant to anonymize. "Anonymiser" is labelled recommended, but the UI doesn't reinforce it.
- **Fix:** When `mode === 'delete'`, render the submit button with the destructive token (red), and give the delete radio a danger affordance (red label/icon). Keep anonymize calm/teal.
- **Suggested command:** `/impeccable colorize` then `/impeccable harden`

### [P1] `window.confirm()` is too weak for an irreversible action
- **Location:** `RgpdErasurePage.tsx:46-50`
- **Category:** Anti-Pattern (Error Prevention) / UX
- **Evidence:** A native confirm dialog with one OK button gates permanent erasure. By contrast, the backend hard-delete RPC for objects requires an exact `p_confirm_name` match (per `CLAUDE.md`); this UI has no equivalent friction.
- **Impact:** No friction proportional to risk. Native confirms are unstyled, reflexively dismissed, and inconsistent with the app's own modal vocabulary (the project has `ConfirmDialog`). For `delete` mode there is no type-to-confirm gate.
- **Fix:** Replace with the project `ConfirmDialog`. For `delete`, require typing the subject id (or the word `SUPPRIMER`) to enable the confirm button. Echo subject kind + id + mode in the dialog body.
- **Suggested command:** `/impeccable harden`

### [P1] Contrast failures (WCAG AA 1.4.3)
- **Location:** `text-ink-3` at lines 31, 83, 121, 133, 142, 178; `text-orange` at lines 173, 176
- **Category:** Accessibility
- **Evidence (measured):**
  - `--ink-3` #6a7a82 on the page background (~#eef1f4 + glow) ≈ **4.0:1** — under the 4.5:1 normal-text threshold. Affects the header subtitle, id helper, the radio guidance text, and the access-denied message (all `text-sm`/`text-xs` normal weight).
  - `--accent-brand` orange #f28b54 on `surface2` #e8edf1 ≈ **2.0:1** — a severe fail, and it carries the storage/auth **warning** text, which is exactly the content that must stay legible.
- **Impact:** Low-vision operators can't reliably read the guidance or the warnings on a compliance-critical screen.
- **Fix:** Bump body guidance to `text-ink-2` (#3a525c, ~7:1). For warnings use the `--destructive` token (#c85c48) or dark ink + an orange icon/tint, not orange text (even `--accent-brand-strong` #c96d3b is only ~3.1:1 here).
- **Suggested command:** `/impeccable colorize` (+ `/impeccable clarify` for the warning copy)

### [P2] `bg-surface` resolves to an undefined token (systemic, not page-only)
- **Location:** `RgpdErasurePage.tsx:103, 119, 153` (select / input / textarea) — and 21 other occurrences across `ExplorerPage`, `MapPanel`, `FiltersPanel`, `TopBar`, `CreateObjectDialog`
- **Category:** Theming
- **Evidence:** `tailwind.config.js` maps `surface → var(--bg-surface)`, but `styles.css` defines `--surface` (and `--surface-2`), **never** `--bg-surface` (nor `--bg-base` / `--bg-elevated`, also mapped). `.bg-surface { background-color: var(--bg-surface) }` wins the cascade over the global `input/select/textarea { background: var(--surface) }`, then resolves to `transparent` (invalid-at-computed-value-time).
- **Impact:** On this page the inputs sit over the body gradient with no white panel, so they read as faintly tinted/transparent instead of solid white. Elsewhere it's masked because controls sit on already-white panels — which is why it shipped unnoticed. It's a latent app-wide token bug.
- **Fix:** Either point the Tailwind `surface/base/elevated` colors at the tokens that actually exist (`--surface`, `--bg`, `--panel-strong`), or add the `--bg-surface`/`--bg-base`/`--bg-elevated` aliases to `styles.css`. One source of truth.
- **Suggested command:** `/impeccable audit` follow-up → `/impeccable polish`

### [P2] Raw JSON dump as the "technical detail"
- **Location:** `RgpdErasurePage.tsx:177-182` — `<pre>{JSON.stringify(result.report, null, 2)}</pre>`
- **Category:** Anti-Pattern / Clarity
- **Evidence:** The post-erasure report is shown as pretty-printed JSON inside a `<details>`.
- **Impact:** For an RGPD officer producing an audit trail, a key/value summary (rows affected, tables touched, files removed) reads better than a developer console blob. Acceptable as a collapsed escape hatch, but it shouldn't be the only readable form of the outcome.
- **Fix:** Summarize the report as labelled rows; keep raw JSON in the `<details>` as a secondary view.
- **Suggested command:** `/impeccable clarify`

### [P2] Redundant hint, not programmatically associated
- **Location:** `RgpdErasurePage.tsx:118` (placeholder) + `121` (helper span) both render `ERASURE_ID_HINT[subjectKind]`
- **Category:** Accessibility / Copy
- **Evidence:** The same string appears as the input placeholder and again as a helper line; the helper isn't linked via `aria-describedby`.
- **Impact:** Visual duplication; the helper isn't announced as the field's description. Placeholders also vanish on input, so leaning on them for the only hint is fragile.
- **Fix:** Drop the duplicate. Keep the helper span, give it an `id`, and wire `aria-describedby` on the input. Use the placeholder for a format example only.
- **Suggested command:** `/impeccable clarify`

### [P3] No designed focus state; submit touch target < 44px; one-off radii bypass the scale
- **Location:** button (`py-2` ≈ 36px) lines 157-163; arbitrary `rounded-[12px]/[10px]/[8px]`, `text-[13px]` throughout
- **Category:** Accessibility / Responsive / Theming
- **Evidence:** Inputs/buttons rely on native focus outline (global rule sets `box-shadow:none`, no `:focus-visible`). Submit button is ~36px tall. The page hand-rolls radii/sizes instead of the design scale (`rounded-shellXl`=12px, `rounded-shellLg`=10px, `--radius-*`).
- **Impact:** Inconsistent focus affordance, slightly small primary target, visual drift from the rest of the app.
- **Fix:** Add a shared `:focus-visible` ring; bump the button to `py-2.5`/min-h 44px; use the radius scale tokens.
- **Suggested command:** `/impeccable polish`

---

## Patterns & Systemic Issues
- **Token references that point at nothing** (`info-bg`, `info-border`, `bg-surface`/`base`/`elevated`). The Tailwind color map and the CSS token sheet have drifted: the config names `--bg-surface`-style tokens the sheet never defines. This is a config↔stylesheet contract gap, not a one-off typo, and it silently degrades to transparent/absent rather than erroring.
- **Stakes-to-weight mismatch.** Across the page, the riskiest paths get the least visual and interaction design (native confirm, calm button, muted danger text).

## Positive Findings
- **Genuinely restrained, non-slop product design** — correct register instinct for a compliance tool.
- **Solid form semantics:** controls wrapped in `<label>`, a real `<fieldset>/<legend>` for the mode radios, single `<h1>`, monospace for the UUID field.
- **Good status + reset on submit:** button disables and shows "Traitement…", fields clear on success, errors surface via toast with a typed `catch`.
- **Honest scope copy:** the body text is careful and accurate about what the tool does and doesn't touch (it just isn't visually framed).
- **Performance and responsiveness are effectively free** here — nothing to optimize.

---

## Recommended Actions (priority order)
1. **[P1] `/impeccable colorize`** — fix the broken info callout, give the destructive path a red/destructive treatment, and lift `ink-3`/orange text to AA contrast.
2. **[P1] `/impeccable harden`** — replace `window.confirm` with `ConfirmDialog` + type-to-confirm for hard delete; disable the form during submit.
3. **[P2] `/impeccable clarify`** — summarize the result report; de-duplicate the id hint and wire `aria-describedby`.
4. **[P2] theming fix** — reconcile the `surface/base/elevated` Tailwind colors with the tokens that actually exist (app-wide).
5. **[P3] `/impeccable polish`** — focus-visible ring, 44px target, radius-scale tokens.
