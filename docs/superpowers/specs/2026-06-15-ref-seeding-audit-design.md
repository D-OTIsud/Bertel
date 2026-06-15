# Ref-data seeding audit — design / spec

**Date** : 2026-06-15
**Author** : audit pass (PO : d.philippe@otisud.com)
**Status** : spec — awaiting review before plan
**Deliverable type** : findings report only (no fixes applied in this pass)

---

## 1. Goal

Audit how *every* reference vocabulary (`ref_*` tables + `ref_code` partitions) is **seeded**, on a
**live ↔ source ↔ published-doc** basis, across four dimensions (dead/orphan, i18n/label,
structure/maintainability, correctness/drift). The PO believes the seeding "can be better" and
wants all of it covered.

The output is a **diagnostic** : a per-table matrix + severity-ranked findings + a prioritized
remediation backlog. **No fixes are applied in this pass** — remediation becomes its own
spec→plan→impl pass (matching the project rhythm), so the audit must produce actionable,
evidence-backed items, not edits.

Non-negotiable: every asserted drift/finding is **verified against live** before it lands in the
report (no asserting a gap we have not confirmed). Per CLAUDE.md "verification over assumption".

---

## 2. Scope

### In scope (the ref universe)

- **All `ref_code` partitions** (~45 domains): `accommodation_type`, `activity_type`, `allergen`,
  `amenity_family`, `amenity_type`, `assistance_type`, `booking_status`, `client_type`,
  `contact_kind`, `cuisine_type`, `demand_topic`, `demand_subtopic`, `destination_type`,
  `dietary_tag`, `document_type`, `domain_registry`, `environment_tag`, `event_type`,
  `feedback_type`, `incident_category`, `insurance_type`, `iti_practice`, `language_level`,
  `media_tag`, `media_type`, `meeting_equipment`, `membership_campaign`, `membership_tier`,
  `menu_category`, `mood`, `opening_schedule_type`, `other`, `package_type`, `partnership_type`,
  `payment_method`, `price_kind`, `price_unit`, `promotion_type`, `room_type`, `season_type`,
  `service_type`, `social_network`, `tourism_type`, `transport_type`, `view_type`, `weekday`.
- **All standalone `ref_*` tables**: `ref_amenity`, `ref_classification_scheme` /
  `ref_classification_value` / `ref_classification_equivalent_group` /
  `ref_classification_equivalent_action`, `ref_sustainability_action` / `_category` / `_group`,
  `ref_language`, `ref_permission`, `ref_org_role` / `ref_org_admin_role` / `ref_org_business_role`,
  `ref_actor_role`, `ref_contact_role`, `ref_object_relation_type`, `ref_legal_type`,
  `ref_document`, `ref_capacity_metric`, `ref_capacity_applicability`, `ref_tag`,
  `ref_review_source`, `ref_iti_assoc_role`, `ref_commune`.
- The **source seed SQL**: `seeds_data.sql` plus the seed-bearing migrations
  (`migration_sustainability_v5.sql`, `migration_taxonomy_seeds_coverage.sql`,
  `migration_capacity_applicability_seed.sql`, `migration_ref_commune.sql`,
  `migration_crm_module.sql`) and `claude_brief/seeds_*_v5.sql`.

### Treated specially

- **`ref_code_taxonomy_closure`** (356 live rows) is **derived** — computed by
  `api.refresh_ref_code_taxonomy_closure(p_domain)`, not seeded. Audited only for **staleness**
  (does it match a fresh recompute?), not for seed coverage.
- **`object_type` / `object_status` enums** are checked only as *consumers* — do their values
  resolve to seeded ref rows where expected (e.g. facet applicability, type→archetype)? They are
  not redesigned here.

### Out of scope (non-goals)

- Applying any fix (deletions, i18n backfill, reordering, folding live rows back to source).
- The `staging.*` schema (operator import area, no RLS by design).
- Redesigning enums or the closure mechanism.
- Re-litigating already-logged deferred items — the audit **cross-links** them
  (G-DESC-1 i18n duplication, the amenity i18n backlog, §61 CRM cleanup precedent) rather than
  re-deciding them.

---

## 3. The three planes

The audit reconciles three representations of the ref vocabulary and treats the deltas between
them as findings:

| Plane | Source | Role |
|---|---|---|
| **Live** | Supabase MCP — actual `ref_*` rows | Ground truth of what is deployed |
| **Source** | `seeds_data.sql` + seed-bearing migrations | What *should* deploy (fresh-apply expectation) |
| **Doc** | `docs/api-db-reference.html` §5/§6 (generated from `db-graph-out/graph.json` + seeds) | What is *published to API consumers* |

`api-db-reference.html` §5 already maps every `ref_code` value → libellé → description →
**source line** (e.g. `seeds_data.sql:642`). It is used as a **bootstrap** for the Source column
(saves hand-parsing) **but is verified against the actual seed files** — it is *generated*, and
`db-graph-out` is known stale (CLAUDE.md: "CRM tables/RPCs absent"), so the doc almost certainly
**omits the §61 CRM vocab** (`demand_topic`, `crm_sentiment`) and any post-generation seeds. The
doc's own freshness is therefore a **D4 finding**, and "regenerate db-graph + regenerate this doc"
is a remediation item.

---

## 4. Method (per ref table / domain)

1. **Live snapshot** — pull every ref row via Supabase MCP: `code`, `name`/label, i18n columns
   (`name_i18n`, `description_i18n`), `active`/`position`/`sort`, parent/`family_id`/`domain`,
   `external_code` where present. Persist as a refreshed live baseline under
   `docs/schema-workbench/live-*.csv` (extends the existing snapshot family).
2. **Source set** — bootstrap from `api-db-reference.html` §5, then verify against the seed files;
   capture the source line for each code.
3. **Usage cross-reference** (drives dead/orphan classification) — for each ref table:
   - **DB data usage**: live `COUNT(DISTINCT …)` on the `object_*` columns that FK to it (which
     codes are actually used by real rows).
   - **RPC literals**: grep the SQL function files (`api_views_functions.sql`,
     `object_workspace_*`, etc.) for the code string.
   - **Frontend literals**: grep `bertel-tourism-ui` for hardcoded code references.
4. **Diff + classify** into the four dimensions (§5), tag severity, attach evidence
   (live count, source line, usage hits).

---

## 5. Finding taxonomy (severity-tagged)

Severity scale: **blocker** (breaks deploy/contract) · **high** · **medium** · **low**.

### D1 — Dead & orphan codes
- **Dead** = seeded **and** zero usage in DB **and** RPC **and** frontend. Sub-classified:
  *truly dead* (safe-to-remove candidate) vs *forward-looking/intentional* (e.g. the 0-data
  object types, vocab seeded ahead of data). **Flagged with evidence — never auto-deleted.**
- **Orphan** = referenced somewhere (FK target value in live data / RPC literal / FE literal /
  enum) but **missing from live** or **missing from source** → broken or fragile lookup.

### D2 — i18n & label coverage
- Missing human label (`name` null/blank).
- Missing translations vs target locales **`fr` (canonical) + `en` / `es` / `zh` / `el`**.
- Partial coverage (label in some locales only).
- Heterogeneous mechanism: `*_i18n` jsonb columns vs central `i18n_translation` (cross-links
  G-DESC-1) — which ref tables use which, and is it consistent?

### D3 — Structure & maintainability
- **Execution-order constraints** (e.g. the documented TST classification recoding blocked by
  schemes seeded after the inserts that need them).
- **Idempotency** — `ON CONFLICT` presence/correctness so re-apply is safe.
- **Duplicate / conflicting rows** (same code seeded twice, conflicting labels).
- **Naming-convention consistency** across domains (`LBL_*`, `SA_*`/`MA_*`, ref_code code shapes).
- **Partition-routing correctness** for `ref_code` (right domain → right partition).
- **Derived-vs-seeded confusion** (anything seeded that should be computed, or vice-versa).

### D4 — Correctness & drift
- **Live-only rows** — present live, absent from source = **deploy-integrity incident** per
  CLAUDE.md §24 (no PROD-only DDL/data). **blocker/high.**
- **Source-only rows** — seeded but absent live (fresh-apply would add them; live missed a seed).
- **Value mismatches** — label/flags/parent differ between live and source.
- **Broken FK targets** — a ref row pointing at a missing parent (e.g. `ref_amenity.family_id`
  with no `ref_code_amenity_family` row).
- **Stale `ref_code_taxonomy_closure`** — does not match a fresh recompute.
- **Doc drift** — `api-db-reference.html` ↔ live/source mismatch (incl. the expected CRM-vocab
  omission from a stale `db-graph-out`).

---

## 6. Deliverable

**Primary**: `docs/schema-workbench/ref-seeding-audit-2026-06-15.md`
- **Exec summary** — headline counts (tables audited, codes, findings by severity), the 3–5
  things that most need fixing.
- **Per-table matrix** — one row per ref table/domain: `live count | source count | doc count |
  usage (DB/RPC/FE) | verdict`.
- **Findings by dimension** — D1–D4, each finding with severity + evidence (live value, source
  line, usage hits).
- **Prioritized remediation backlog** — each item: *fix · effort · risk · what it unblocks*.
  Ordered by severity then effort.
- **Cross-links** to existing deferred items so we do not duplicate (G-DESC-1, amenity i18n
  backlog, §61 precedent, TST recoding deferral).

**Secondary**: refreshed live ref snapshot CSVs under `docs/schema-workbench/`.

The audit does **not** edit `seeds_data.sql`, the migrations, or live. It only diagnoses.

---

## 7. Execution

- **Read-only fan-out**: one subagent per ref-domain cluster builds its slice of the matrix +
  usage findings in parallel (clusters: ref_code food/menu domains; ref_code accommodation/room;
  ref_code activity/iti; ref_code contact/social/media; ref_code CRM/demand; classification +
  sustainability; org/actor/permission roles; capacity/legal/document/misc). A **reconcile pass**
  merges, dedups, and severity-ranks into the single report. Uses the **Agent tool** (Explore /
  general-purpose), **not** the heavyweight Workflow tool (PO has not opted into ultracode).
- **Spot-verification**: before finalizing, re-check a sample of each dimension's findings
  directly against live (e.g. confirm a "live-only" row truly absent from all source files;
  confirm a "dead" code truly has zero DB/RPC/FE hits).
- **Decision-log update**: at close, record the audit + any discovered invariants in
  `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (canonical log), then refresh MCP
  memory — per the CLAUDE.md memory workflow.

---

## 8. Success criteria

- Every ref table/`ref_code` partition appears in the matrix with a verdict (nothing
  unaccounted for).
- Every finding carries severity + reproducible evidence.
- The remediation backlog is ordered and each item is independently actionable.
- No finding is asserted that was not spot-verified against live.
- Existing deferred items are cross-linked, not duplicated.

---

## 9. Open questions / assumptions

- **i18n target locales** assumed `fr` + `en/es/zh/el` (derivable from deferred items). Confirm.
- Assumes Supabase MCP read access to live is available this session (it is, per prior passes).
- Assumes `api-db-reference.html` is the current generated doc (its staleness is itself audited).
