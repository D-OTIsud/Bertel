# Design Audit — Paramètres page (+ Team fold-in + référentiels admin)

**Target:** `bertel-tourism-ui/src/views/SettingsPage.tsx` (route `/settings`, labelled "Paramètres")
**Also in scope:** `src/features/settings/AiProviderSettings.tsx`, `src/views/TeamAdminPage.tsx` (route `/team`, proposed to fold in), and the `ref_code` / `ref_*` reference-data model (proposed new admin surface).
**Date:** 2026-06-23
**Register:** Product (authenticated admin/config tool, light-only theme). Bar = "earned familiarity" (Linear / Stripe / Notion settings), not marketing flair.
**Method:** `impeccable critique` (two independent assessments: an LLM design-director review + the deterministic detector) + a structural IA proposal, grounded in the real tokens/components (`src/styles.css`, `docs/design/ui-ux-overhaul/assets/bertel-ui.css`) and the live DB model (`Base de donnée DLL et API/*.sql`, `rls_policies.sql`).

> Context note: no `PRODUCT.md` / `DESIGN.md` exists for the impeccable loader, so register and intent were inferred from the code and `CLAUDE.md`. Running `/impeccable teach` once would sharpen future audits. The deterministic detector returned **0 findings** on `SettingsPage.tsx` (no banned-pattern markup present); the issues below are structural/IA, not regex-detectable slop.
>
> This page is **not** covered by the 6-phase overhaul plan ([ui-ux-overhaul/00-plan-global.md](ui-ux-overhaul/00-plan-global.md)); it is touched only obliquely by S3 (design-system split), S6/S7 (tokens/contrast). This audit fills that gap and proposes a **Phase 7 — Paramètres / Console d'administration**. A high-fidelity mockup accompanies it: [ui-ux-overhaul/mockups/p7-01-parametres-hub.html](ui-ux-overhaul/mockups/p7-01-parametres-hub.html).

---

## Design Health Score

### Nielsen's 10 heuristics (UX)

| # | Heuristic | Score | Key issue |
|---|-----------|:-----:|-----------|
| 1 | Visibility of system status | 3/4 | Good busy/saving labels + toasts + "clé configurée ✓"; but no `:focus-visible`, and disabled-vs-enabled is the only state signal on most controls. |
| 2 | Match system / real world | 2/4 | Implementation jargon leaks to the user: "RPC Supabase", "variables CSS", "Source logo: storage / URL publique", the whole Runtime panel. |
| 3 | User control & freedom | 3/4 | Reset buttons exist; but "Supprimer" / "Activer" on an AI provider fire immediately, no confirm, no undo. |
| 4 | Consistency & standards | 1/4 | The headline failure: three styling systems, `.btn`/`.pill-mini` that don't resolve here (P0), "Settings"(EN) vs "Paramètres"(FR), accent-stripped copy. |
| 5 | Error prevention | 2/4 | SVG sanitization is solid; destructive AI-provider delete + active-provider switch have no guard. |
| 6 | Recognition vs recall | 3/4 | Mostly recognition (swatches, marker previews, icon grid); the raw-SVG `<textarea>` is recall-heavy. |
| 7 | Flexibility & efficiency | 3/4 | Color-picker + hex dual entry is a nice power touch; no in-page search, no keyboard shortcuts on a long page. |
| 8 | Aesthetic & minimalist design | 2/4 | Markers section shows all 7 type cards fully expanded (~50+ controls); Runtime dumps debug strings into the primary UI. |
| 9 | Error recovery | 3/4 | Inline SVG errors are clear; most other errors are toast-only (ephemeral). |
| 10 | Help & documentation | 2/4 | Some inline explanatory copy, but no docs link and the explanations are implementation-flavored. |
| **Total** | | **24/40** | **Acceptable — below the bar for a settings surface (target ≥32).** |

### Technical audit (impeccable /20)

| Dimension | Score | Key finding |
|-----------|:-----:|-------------|
| Accessibility | 2/4 | No `:focus-visible` (S1, app-wide); disabled controls are the only affordance; inherits the app-wide muted-text contrast debt (S7). |
| Performance | 3/4 | Fine in isolation (7 data-URI marker previews, color inputs); inherits the global render-blocking font + fixed-gradient repaint (S5). |
| Responsive | 2/4 | `theme-settings-grid` / `marker-settings-grid` reflow, but no mobile intent; 40px targets. |
| Theming | 2/4 | Mostly token-driven via global classes, but hard-codes `border-radius: 32px` (ignores the `--radius-*` scale) and one section is inline-styled (S3/S6). |
| Anti-Patterns | 2/4 | Not banned-pattern slop, but the **uniform-card stack** (identical-card tell) + the unstyled AI section + debug-as-feature. |
| **Total** | | **11/20 — Moyen (consistency + hierarchy are the floor).** |

The mechanical scores are "Acceptable/Moyen", but the real story is **information architecture**: the page is a flat scroll of seven equal-weight cards serving three different audiences (per-user / org-admin / platform-super-admin) with no structure to route between them. That is also why the two features the PO wants to add (Team, référentiels) have nowhere coherent to live. The restructure below is the substance of this audit.

---

## Anti-Patterns Verdict

**Does it look AI-generated? Mostly no — with two real tells.** The page avoids the banned patterns: no side-stripe borders, no gradient text, no glassmorphism (the team deliberately removed `backdrop-filter`, `styles.css:262`), no hero-metric block, no modal-as-first-thought. The underlying token system and the dual color-input + live-preview interaction are genuinely good.

The two tells that *do* fire:

1. **Uniform-card stack.** Every section is `<article class="panel-card panel-card--wide">` → `border-radius: 32px; padding: 1.15rem`, same border, same shadow. "Rôle actif" (a 3-button toggle) carries the exact same visual weight and pillowy 32px frame as the White-label theme editor (~15 controls). Seven identical cards in a vertical scroll give the eye no hierarchy — that undifferentiated rhythm is the most "templated" thing here. 32px is a marketing-card radius on a tool surface; the token scale already has `--radius-lg: 20px` / `--radius: 8px` and they are ignored.

2. **A second hand.** `AiProviderSettings` is built from ad-hoc inline `style={{}}` objects and references `.btn` / `.btn primary` / `.pill-mini` — classes that **do not exist** at this scope (see P0). It renders as bare native buttons inside an otherwise-polished card. That seam is exactly what "two generators stitched together" looks like.

---

## Detailed Findings by Severity

### [P0] `AiProviderSettings` renders unstyled (broken visual contract)
- **Location:** `AiProviderSettings.tsx:159` (`pill-mini active`), `165–168` + `215–217` (`btn`, `btn primary`).
- **Evidence:** Grep of `styles.css` finds **no global `.btn`, `.primary`, or `.pill-mini`** — only `.crm-app .pill-mini` (`:9118`) and `.crm-app … button` rules (`:8736`, `:10206`), plus a bare `button { cursor: pointer }` reset (`:120`). On `/settings` (not inside `.crm-app`) these classes resolve to nothing, so Activer / Modifier / Supprimer / Enregistrer / Tester render as **unstyled browser-default buttons**, and the "actif" pill is an unstyled span.
- **Impact:** A super-admin's first look at the AI config is a row of grey native buttons inside a 32px design card. Looks broken and bolted-on. Heuristic 4 (Consistency) failure.
- **Fix:** Port the section onto the shared vocabulary — reuse `@/components/ui/button` `<Button>` (already imported by the page) or the house `.btn`/`.badge` classes, and `.panel-card`/`.field-block` for layout. Delete the inline `style={{}}` objects.

### [P1] No information architecture: seven identical 32px cards, flat scroll, three audiences
- **Location:** the whole of `SettingsPage.tsx` (`:235–561`).
- **Evidence:** Hero + Rôle actif + White-label theme + Markers + Langues + Runtime + AI provider, each a `panel-card`/`panel-card--wide`, no tabs/rail/disclosure. The page mixes per-user prefs (langue), org-admin concerns (none today, but Team is wanted here), and platform-super-admin concerns (branding, markers, AI), with no grouping or routing.
- **Impact:** No primary action, no rare/dangerous distinction, ~80 visible controls for a super-admin in one scroll. A read-only agent scrolls past ~60 disabled marker controls to reach the one thing they can change (language). High cognitive load (heuristic 8); and there is nowhere coherent to add Team or référentiels.
- **Fix:** Restructure into a **settings hub** with a left rail of role-gated section groups (Mon compte / Mon organisation / Plateforme), one section in the content pane at a time. See "Information architecture" below.

### [P1] Destructive AI-provider actions have no confirmation
- **Location:** `AiProviderSettings.tsx:165` (`activate`), `:168` (`remove`).
- **Evidence:** `onClick={() => remove(p.id)}` deletes immediately; `activate(p.id)` switches the live provider immediately. No dialog, no undo.
- **Impact:** Deleting or switching the active provider silently changes §06 menu-extraction platform-wide. Highest-consequence controls on the page, least friction (heuristics 3 & 5). The project already ships a themed `ConfirmDialog`.
- **Fix:** Gate "Supprimer" (and ideally "Activer") behind `ConfirmDialog` — same pattern §18/§21 use.

### [P1] Three styling systems + label split + accent-stripped French (S3/S6/S7)
- **Location:** global CSS classes (`.panel-card`, `.chip`, `.field-block`) **+** Tailwind utilities (`p-4`, `space-y-4`, `text-muted-foreground`) **+** inline `style={{}}` (all of `AiProviderSettings`); nav label `'Settings'` (`Sidebar.tsx:40`) vs `'Parametres'` (`TopBar.tsx:23`, `ProfileDrawer.tsx:88`, `Sidebar.tsx:118`); accent-stripped copy throughout (`SettingsPage.tsx`: "Parametres", "Role actif", "Preferences de langue enregistrees", "Theme applique", "etre simules", "l interface").
- **Evidence:** AiProviderSettings is *correctly* accented ("chiffrée", "Libellé", "Modèle"), so the inconsistency is visible within one page.
- **Impact:** Three names for one destination; an English label in a 100%-French app; machine-generated feel. This is the page-local instance of the audit's S3 (two design systems) and a contributor to S2/S7.
- **Fix:** One vocabulary (house `.panel`/`.btn`/`.chip`/`.badge`). "Paramètres" everywhere, with the accent. A proper accented-French copy pass on the page and the nav `allItems` labels.

### [P2] Markers section is a 50+ control wall, no progressive disclosure
- **Location:** `SettingsPage.tsx:398–523` — `objectTypeOptions.map(...)` renders all 7 type cards expanded, each with color + segmented control + 3–6 preset icons + a 7-row raw-SVG `<textarea>` + 3 actions.
- **Impact:** Density (heuristic 8) and the >4-options rule; the raw-SVG textarea is recall-heavy power-user territory shown unconditionally to everyone with access.
- **Fix:** Type list + single editing pane (expand one type at a time). Tuck "SVG personnalisé" behind an "Avancé" disclosure.

### [P2] Implementation jargon and debug strings presented as features
- **Location:** "White-label theme" subtitle ("via variables CSS et RPC Supabase", `:271`); the entire **Runtime** panel ("Mode demo explicite", "Supabase URL", "Source logo: storage / URL publique", `:544–553`).
- **Impact:** Heuristic 2. A super-admin is an operations user, not a DBA; this reads as internal debug text shipped to production. (Mirrors the audit's "login debug text" finding S-login.)
- **Fix:** Rewrite in domain language; demote Runtime into an "Avancé / Diagnostic" disclosure or remove it from the production page.

### [P3] App-wide debt that lands here: no focus ring, contrast, touch targets
- **Evidence:** No `:focus-visible` on `.btn`/`.ghost-button`/`.chip` (S1); muted text on the muted-token contrast issues (S7); 40px targets (S11).
- **Fix:** Inherited by the Phase 1 foundation pass; the hub mockup already bakes in the corrected `assets/bertel-ui.css` (focus ring, raised contrast, flat surfaces).

---

## Information Architecture — proposed restructuring

This is the heart of the PO's two asks. The current flat page can't host Team or référentiels coherently because it has no structure and no role grouping. The fix is to turn `/settings` into a **console with a left rail of grouped, role-gated sections** (the standard Stripe/Linear/Notion settings pattern), content pane shows one section at a time (progressive disclosure, fixes P1/P2/heuristic 8).

### Proposed structure

```
Paramètres  (route /settings — single admin & preferences home)
│
├─ MON COMPTE                         (every user)
│   ├─ Préférences      langue d'interface  (+ later: profil, mot de passe)
│   └─ Session & rôle   read-only state card (clean, not the Runtime debug dump)
│
├─ MON ORGANISATION                   (org admins + super-admins)   ← Team folds in here
│   └─ Équipe           members · invite · rôles métier/admin · permissions
│                       (= today's /team, ported to the house vocabulary)
│
└─ PLATEFORME                         (super-admins only)
    ├─ Apparence        white-label palette + logo            (today's "White-label theme")
    ├─ Marqueurs carte  7 type markers (type list + single edit pane)
    ├─ Listes & référentiels   NEW — ref_code / ref_* editor   ← "set lists of refcodes"
    ├─ Fournisseurs IA  AiProviderSettings, ported              (today's AI section)
    └─ Diagnostic       runtime/env, demoted into "Avancé"
```

The sidebar's separate `/team` entry is removed; Team is reached at Paramètres → Mon organisation → Équipe. The left-rail group only renders sections the user may use, so a read-only agent sees just "Mon compte" (no wall of disabled controls).

### Ask 1 — "Team should live in that section" ✔ recommended

Folding `/team` in is **low-risk and mechanically clean**:

- `TeamAdminPage` is self-contained: one container + 5 files under `src/features/team/` + the `rbac.ts` service + the `/api/admin/invite` route. **No CSS file to relocate** (it is pure inline Tailwind today). Folding it in = render `<TeamAdminPage>` (or its table/dialog/drawer) inside the "Équipe" section instead of at the `/team` route, and port its Tailwind/shadcn markup onto the house `.panel`/`.table`/`.btn`/`.badge` vocabulary — which is **already planned as Phase 5.3** (S3 unification). Doing it here means 5.3's Team work lands directly in its final home.
- **Gating to reconcile (do not paper over):** access today uses `canAdministerTeam` = `owner || super_admin || adminRank ≥ 10` (`session-selectors.ts:4`); the org-defaults drawer needs `≥ 30`; the invite **server route** requires `is_platform_superuser` OR `rank ≥ 30` (`/api/admin/invite`). So the "Mon organisation" rail group should appear at `adminRank ≥ 10` (can manage roles/permissions), while "Inviter" and org-defaults stay gated `≥ 30` inside it. Keep the server-side checks as the real boundary; the rail is render-gating only.
- **Naming:** the section is "Équipe" (the page's own `<h1>` is already "Équipe"). The CRM/§19 "prestataire" actor-linking is a *different* concept and stays out of this section.

### Ask 2 — "Admin should set lists of refcodes and other" ✔ recommended, but it's a real feature (own spec→plan→impl)

This is the substantive new build. The design is straightforward; the **backend is the crux** and must be understood before any UI work.

**What it manages.** Two surfaces:
1. The partitioned **`ref_code`** (~50 domains, indexed by `ref_code_domain_registry`) — the editable "lists": `contact_kind`, `payment_method`, `dietary_tag`, `allergen`, `cuisine_type`, `season_type`, `demand_topic`, `crm_sentiment`, `price_type`, `bed_type`, `room_type`, `view_type`, … (`schema_unified.sql:303–349`).
2. A set of heterogeneous standalone **`ref_*`** tables (`ref_amenity` with `family_id`/`scope`, `ref_tag`, `ref_object_relation_type`, `ref_org_role`/`ref_actor_role`, …). v1 should scope to `ref_code` domains; the standalone tables get added case by case.

**The crux — writes cannot go direct.** Every `ref_*` write policy is `auth.role() IN ('service_role','admin')` (`rls_policies.sql:1649–1688`, re-applied to every partition). The browser client (`anon`/`authenticated`) never holds that role, so `client.from('ref_code').insert()` will be **denied**. The sanctioned path (already used by `AiProviderSettings` and GDPR erasure) is **`SECURITY DEFINER` RPCs gated on `api.is_platform_superuser()`** (`rls_policies.sql:1870`). Reads stay direct (public-read RLS) off `ref_code_domain_registry` + `ref_code`. Needed RPCs (new):
- `api.rpc_upsert_ref_code(domain, code, name, name_i18n, description, position, is_active, parent_id, icon_url)`
- `api.rpc_set_ref_code_active(domain, id, is_active)`
- `api.rpc_reorder_ref_code(domain, ordered_ids[])`
- `api.rpc_delete_ref_code(domain, id)` — **only when 0 FK references**, else error → UI offers deactivate instead.
Precedent: `api.create_tag` / `api.set_tag_color` / `api.create_membership_campaign` already write `ref_tag`/`ref_code` from the app via DEFINER (`api_views_functions.sql:1720+`) — but gated *per object*, not per platform-admin; these new RPCs gate on `is_platform_superuser()`.

**Guardrails the UI must respect (why a naive "free-form list editor" is unsafe).**
- **Code is not free text.** `code` is CHECK-normalized and `name_normalized` is generated (`schema_unified.sql:296`). The "Ajouter une valeur" form takes a **libellé**, slugifies it to a proposed `code`, and makes `code` read-only after creation (changing a code orphans FKs).
- **i18n.** `name_i18n` / `description_i18n` are first-class; the editor needs a per-locale field (FR primary + EN/DE).
- **Order.** `position` drives display order → drag-to-reorder.
- **Deactivate, don't delete, by default.** A `ref_code` row is FK-referenced by object data; deleting a used code breaks rows. Default action = `is_active = false` (hides it from new pickers, keeps history valid). Hard-delete only when the RPC confirms 0 references; surface "utilisé par N fiches" per row.
- **Structural domains are read-only / expert-only.** `ref_facet_registry` / `ref_facet_applicability`, the `object_type` enum coupling, and the type→facet triggers are **load-bearing invariants** (`CLAUDE.md` "Type→facet applicability (single registry)": *never hardcode type→facet logic*). The registry's `is_taxonomy` / `is_hierarchical` flags (`ref_code_domain_registry`) mark domains backed by `ref_code_taxonomy_closure` that need a **tree** editor, not a flat list. **v1 scope: flat, non-structural domains only**; mark structural/taxonomic ones with a "structurel — lecture seule" lock badge and exclude them from editing.

**The editor design (two-pane master/detail — a legitimate table use, not a card grid).**
- **Left:** searchable list of **domains** from `ref_code_domain_registry`, grouped (Éditeur / Restauration / CRM / Itinéraire / …), each with its code count, active/inactive, and a lock badge for structural domains.
- **Right:** the selected domain's **codes table** — `code` (mono, read-only post-create) · Libellé (FR + i18n popover) · position (drag handle) · Actif (toggle) · "Utilisé par N fiches" · row actions (Modifier / Désactiver / Supprimer-si-inutilisé). Header: "+ Ajouter une valeur".

**Sequencing.** This is its own pass (like the CLAUDE.md deferred items): backend RPCs + RLS + tests first (the gating dependency), then the UI. It is **not** a quick add to this page; the hub restructure (below) is the prerequisite that gives it a home.

### What's working (keep)
- The dual color-input + live theme-preview interaction (recognition over recall, immediate feedback).
- Disciplined flat surfaces with real depth tokens (`--shadow-s/m/l`, recessed `--surface-2`); `backdrop-filter` deliberately removed and documented.
- Honest, secure handling of secrets (write-only API key) and untrusted SVG (allow-list sanitization with clear errors).
- The `super_admin`-gated section pattern (`role === 'super_admin' && …`) is the right instinct — it just needs to be applied via the rail grouping rather than per-card.

---

## Recommended Actions (priority order)

1. **[P0] Port `AiProviderSettings` onto the house vocabulary** — kill the inline styles + unresolved `.btn`/`.pill-mini`; use `<Button>` / `.panel-card` / `.field-block`. (`/impeccable polish`)
2. **[P1] Restructure `/settings` into a role-gated hub** — left rail (Mon compte / Mon organisation / Plateforme), one section per pane, drop panel radius to the `--radius-*` scale. (`/impeccable shape` → `/impeccable layout`) — see [mockup p7-01](ui-ux-overhaul/mockups/p7-01-parametres-hub.html).
3. **[P1] Fold Team into "Mon organisation → Équipe"** — remove the `/team` sidebar entry, port `TeamAdminPage` to the house vocabulary (this *is* Phase 5.3's S3 work, landed in its final home), reconcile the `adminRank` gating. (`/impeccable shape`)
4. **[P1] Confirmation on destructive AI-provider actions** + one styling system + accented "Paramètres" everywhere. (`/impeccable harden` + `/impeccable clarify`)
5. **[P2] Markers progressive disclosure** (type list + single pane; SVG behind "Avancé"); demote Runtime into "Diagnostic". (`/impeccable distill`)
6. **[NEW FEATURE] "Listes & référentiels" (ref_code admin)** — its own spec→plan→impl: DEFINER RPCs gated on `is_platform_superuser()` + tests first, then the two-pane editor; v1 = flat non-structural domains, deactivate-not-delete. Depends on (2).
7. **[P3] Foundation debt** — `:focus-visible`, contrast, 44px targets land via the Phase 1 pass / corrected `assets/bertel-ui.css`. (`/impeccable polish`)

> **Trend for `settings-page`:** First run for this target, no trend yet.
> Companion artifacts: high-fidelity mockup [ui-ux-overhaul/mockups/p7-01-parametres-hub.html](ui-ux-overhaul/mockups/p7-01-parametres-hub.html); phase brief [ui-ux-overhaul/phase-7-parametres.md](ui-ux-overhaul/phase-7-parametres.md).
