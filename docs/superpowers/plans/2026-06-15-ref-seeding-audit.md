# Ref-data Seeding Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an evidence-backed diagnostic of how every reference vocabulary (`ref_*` tables + `ref_code` partitions) is seeded, reconciling three planes (live DB ↔ source seed SQL ↔ generated API doc) across four dimensions (dead/orphan, i18n/label, structure/maintainability, correctness/drift), delivered as `docs/schema-workbench/ref-seeding-audit-2026-06-15.md`.

**Architecture:** Read-only analysis. Phase 0 builds three shared inputs (refreshed live snapshot, consumer map, source inventory). Phase 1 fans out one read-only subagent per ref-domain cluster, each emitting a structured findings slice. Phase 2 reconciles into one matrix + ranked findings. Phase 3 spot-verifies a sample against live. Phase 4 writes the report. Phase 5 updates the decision log + memory. **No fixes are applied** — remediation is a separate later pass.

**Tech Stack:** Supabase MCP (`execute_sql`, read-only) for the live plane; Grep/Read over `Base de donnée DLL et API/*.sql` (source plane) and `docs/api-db-reference.html` (doc plane); the existing `docs/schema-workbench/live-*.csv` extracts; Agent tool for the fan-out.

**Spec:** `docs/superpowers/specs/2026-06-15-ref-seeding-audit-design.md`

---

## Conventions used throughout

- **Live plane** = `public.ref_code` (partitioned by `domain`) + standalone `public.ref_*` tables, read via Supabase MCP `execute_sql`. Always read-only `SELECT`.
- **`ref_code` columns** (verified live): `id uuid`, `domain text`, `code text`, `name text`, `description text`, `position int`, `icon_url text`, `is_active bool` (default true), `valid_from date`, `valid_to date`, `parent_id uuid`, `metadata jsonb`, `name_i18n jsonb`, `description_i18n jsonb`, `name_normalized text`, `dow_number smallint`, `is_assignable bool` (default true).
- **Key** = `domain:code` for `ref_code`; `code` (or `slug`/`external_code`) for standalone tables.
- **i18n target locales** = `fr` (canonical, lives in `name`) + `en`/`es`/`zh`/`el` (live in `name_i18n` jsonb keys). A locale is "covered" when its key exists and is non-empty in `name_i18n`.
- **Source files** = `Base de donnée DLL et API/seeds_data.sql` + `migration_sustainability_v5.sql` + `migration_taxonomy_seeds_coverage.sql` + `migration_capacity_applicability_seed.sql` + `migration_ref_commune.sql` + `migration_crm_module.sql` + `bertel-tourism-ui/claude_brief/seeds_*_v5.sql`.
- **Doc plane** = `docs/api-db-reference.html` §5 (ref_code values with source lines) + §6 (ref table columns).
- **Severity** = blocker / high / medium / low (see spec §5).
- **Artifacts directory** = `docs/schema-workbench/`.
- All snapshot files written this pass are prefixed `audit-2026-06-15-` to avoid clobbering the dated `live-*.csv` baseline.

---

## File structure (created this pass)

- `docs/schema-workbench/audit-2026-06-15-live-refcode.csv` — full `ref_code` dump (Phase 0).
- `docs/schema-workbench/audit-2026-06-15-live-refstandalone.csv` — standalone `ref_*` dumps (Phase 0).
- `docs/schema-workbench/audit-2026-06-15-consumer-map.csv` — ref table/domain → consumer (table,column) (Phase 0).
- `docs/schema-workbench/audit-2026-06-15-source-inventory.csv` — seeded codes per domain/table + source line (Phase 0).
- `docs/schema-workbench/audit-2026-06-15-cluster-<N>.json` — one structured findings slice per cluster (Phase 1).
- `docs/schema-workbench/ref-seeding-audit-2026-06-15.md` — **the deliverable** (Phase 4).

---

## Phase 0 — Foundation (sequential; must complete before Phase 1)

### Task 0.1: Refresh the live ref snapshot

**Files:**
- Create: `docs/schema-workbench/audit-2026-06-15-live-refcode.csv`
- Create: `docs/schema-workbench/audit-2026-06-15-live-refstandalone.csv`

- [ ] **Step 1: Pull the per-domain `ref_code` summary**

Run via Supabase MCP `execute_sql`:

```sql
SELECT domain,
       count(*)                                                   AS total,
       count(*) FILTER (WHERE is_active)                          AS active,
       count(*) FILTER (WHERE NOT is_active)                      AS inactive,
       count(*) FILTER (WHERE is_assignable)                      AS assignable,
       count(*) FILTER (WHERE name IS NULL OR btrim(name) = '')   AS missing_label,
       count(*) FILTER (WHERE coalesce(name_i18n->>'en','') <> '') AS has_en,
       count(*) FILTER (WHERE coalesce(name_i18n->>'es','') <> '') AS has_es,
       count(*) FILTER (WHERE coalesce(name_i18n->>'zh','') <> '') AS has_zh,
       count(*) FILTER (WHERE coalesce(name_i18n->>'el','') <> '') AS has_el,
       count(*) FILTER (WHERE parent_id IS NOT NULL)              AS with_parent
FROM public.ref_code
GROUP BY domain
ORDER BY domain;
```

Expected: ~46 domain rows (everything in `live-tables.csv` `ref_code_*` minus `taxonomy_closure`).

- [ ] **Step 2: Pull the full `ref_code` dump and save as CSV**

```sql
SELECT domain, code, name,
       (description IS NOT NULL)            AS has_desc,
       is_active, is_assignable,
       (parent_id IS NOT NULL)              AS has_parent,
       coalesce(name_i18n->>'en','')        AS i18n_en,
       coalesce(name_i18n->>'es','')        AS i18n_es,
       coalesce(name_i18n->>'zh','')        AS i18n_zh,
       coalesce(name_i18n->>'el','')        AS i18n_el,
       valid_from, valid_to
FROM public.ref_code
ORDER BY domain, code;
```

Write the result to `audit-2026-06-15-live-refcode.csv`.

- [ ] **Step 3: Pull standalone `ref_*` tables**

For each of: `ref_amenity`, `ref_classification_scheme`, `ref_classification_value`, `ref_classification_equivalent_group`, `ref_classification_equivalent_action`, `ref_sustainability_action`, `ref_sustainability_action_category`, `ref_sustainability_action_group`, `ref_language`, `ref_permission`, `ref_org_role`, `ref_org_admin_role`, `ref_org_business_role`, `ref_actor_role`, `ref_contact_role`, `ref_object_relation_type`, `ref_legal_type`, `ref_document`, `ref_capacity_metric`, `ref_capacity_applicability`, `ref_tag`, `ref_review_source`, `ref_iti_assoc_role`, `ref_commune` — pull `code`/`name` (+ `name_i18n`/`description_i18n` where the column exists per `live-columns.csv`) and row count. Example for the i18n-bearing tables:

```sql
SELECT 'ref_amenity' AS tbl, code, name,
       coalesce(name_i18n->>'en','') AS i18n_en,
       coalesce(name_i18n->>'es','') AS i18n_es,
       coalesce(name_i18n->>'zh','') AS i18n_zh,
       coalesce(name_i18n->>'el','') AS i18n_el
FROM public.ref_amenity ORDER BY code;
```

For tables without `name_i18n` (check `live-columns.csv` first), drop the i18n columns. Write all results to `audit-2026-06-15-live-refstandalone.csv` (one section per table).

- [ ] **Step 4: Verify the snapshot is current**

Cross-check: the `domain` list from Step 1 MUST include `demand_topic` and `demand_subtopic` (added §61, 2026-06-11, after the dated `live-*.csv` baseline). If absent → the live DB itself lacks the CRM vocab (a D4 finding); if present → confirms the refresh captured post-baseline seeds. Note the result in the snapshot file header.

### Task 0.2: Build the consumer map (usage backbone)

**Files:**
- Create: `docs/schema-workbench/audit-2026-06-15-consumer-map.csv`
- Read: `docs/schema-workbench/live-foreign-keys.csv`

- [ ] **Step 1: Extract FK consumers of ref tables**

From `live-foreign-keys.csv` (columns: `fk_schema,fk_table,fk_name,fk_columns,ref_schema,ref_table,ref_columns,...`), select every row where `ref_table` is `ref_code` (any partition) or a standalone `ref_*` table. Produce rows `(ref_table_or_domain, consumer_table, consumer_column)`.

Run: `Grep` for `ref_` in `live-foreign-keys.csv` (231 hits expected) and parse.

- [ ] **Step 2: Resolve `ref_code` partition → domain**

FKs to `ref_code` reference `ref_code.id` (uuid), not a domain. Record the consumer column; domain attribution happens at usage-query time (Phase 1) by joining the consumer's id back to `ref_code.domain`. Write the `(ref_table, consumer_table, consumer_column)` triples to `audit-2026-06-15-consumer-map.csv`.

- [ ] **Step 3: Note RPC + FE usage search targets**

Record in the CSV header the two grep roots for code-literal usage (Phase 1 D1): SQL = `Base de donnée DLL et API/` (`api_views_functions.sql`, `object_workspace_*.sql`, `rls_policies.sql`, `seeds_data.sql`); FE = `bertel-tourism-ui/src/`.

### Task 0.3: Build the source-seed inventory

**Files:**
- Create: `docs/schema-workbench/audit-2026-06-15-source-inventory.csv`
- Read: `docs/api-db-reference.html` §5 (lines ~5515–7614), then verify against the source `.sql` files.

- [ ] **Step 1: Parse the generated doc as a bootstrap**

From `api-db-reference.html` §5, extract every `(domain:code, libellé, description, source_line)` tuple. Each `<details>` block is one domain with a "(N valeurs)" count. Write `(domain, code, label, source_file:line)` rows.

- [ ] **Step 2: Verify a sample against the actual seed file**

For 3 domains spanning files (e.g. `accommodation_type` → `seeds_data.sql:642`, `allergen` → `seeds_data.sql:444`, and one CRM domain), open the cited line and confirm the codes match. Record any doc↔source mismatch as a candidate D4 "doc drift" finding.

- [ ] **Step 3: Add seeds the doc may omit**

Because the doc is generated from a stale `db-graph-out`, grep the seed-bearing migrations directly for `INSERT INTO ... ref_code`/`ref_*` to capture domains/codes the doc lacks — especially `migration_crm_module.sql` (`demand_topic`, `crm_sentiment`), `migration_sustainability_v5.sql`, `migration_ref_commune.sql`, `migration_taxonomy_seeds_coverage.sql`, `migration_capacity_applicability_seed.sql`. Append any doc-missing codes to the inventory, flagged `doc_missing=true`.

- [ ] **Step 4: Verify completeness**

The set of domains in `audit-2026-06-15-source-inventory.csv` MUST cover every domain in the live snapshot from Task 0.1 Step 1. Any live domain with no source rows = candidate D4 "live-only domain" (deploy-integrity). Any source domain absent live = candidate D4 "source-only". List both sets in the CSV header.

---

## Phase 1 — Per-cluster audit (parallel fan-out)

Dispatch the 9 cluster subagents (Agent tool, `general-purpose` or `Explore`) **concurrently** — one message, 9 tool calls. Each receives the three Phase-0 artifacts + its domain/table list and the prompt template below, and writes one `audit-2026-06-15-cluster-<N>.json`.

**Cluster assignments (every ref unit covered exactly once) — CORRECTED after live grounding (58 non-empty `ref_code` domains incl. 19 `taxonomy_*` + `crm_sentiment` + `distribution_channel`; 8 empty partitions flagged):**
- **C1 Food & menu:** `ref_code` domains `allergen`, `cuisine_type`, `dietary_tag`, `menu_category`.
- **C2 Accommodation & capacity:** `ref_code` `accommodation_type`, `room_type`, `view_type`, `meeting_equipment`, `season_type`; tables `ref_capacity_metric`, `ref_capacity_applicability`.
- **C3 Activity, ITI & tourism:** `ref_code` `activity_type`, `iti_practice`, `transport_type`, `package_type`, `service_type`, `event_type`, `mood`, `tourism_type`, `destination_type`; table `ref_iti_assoc_role`.
- **C4 Contact, media, language & tags:** `ref_code` `contact_kind`, `social_network`, `media_type`, `media_tag`, `language_level`; tables `ref_language`, `ref_contact_role`, `ref_tag`.
- **C5 Amenity & environment:** `ref_code` `amenity_family`, `amenity_type` (EMPTY partition — flag), `environment_tag`; table `ref_amenity` (136 rows — the biggest catalog).
- **C6 CRM, demand, channels & ops codes:** `ref_code` `demand_topic`, `demand_subtopic` (EMPTY), `crm_sentiment`, `distribution_channel`, `feedback_type`, `incident_category` (EMPTY), `booking_status`, `client_type`, `partnership_type`, `insurance_type`, `document_type` (EMPTY), `domain_registry` (EMPTY), `opening_schedule_type`, `weekday`.
- **C7 Pricing, promotion, membership & misc codes:** `ref_code` `payment_method`, `price_kind`, `price_unit`, `promotion_type`, `membership_campaign` (EMPTY), `membership_tier` (EMPTY), `assistance_type`; plus probe the literal `other` domain (default partition) for any rows whose domain belongs elsewhere.
- **C8 Classification & sustainability:** tables `ref_classification_scheme`, `ref_classification_value`, `ref_classification_equivalent_group`, `ref_classification_equivalent_action`, `ref_sustainability_action`, `ref_sustainability_action_category`, `ref_sustainability_action_group`.
- **C9 Governance, legal & geo:** tables `ref_org_role`, `ref_org_admin_role`, `ref_org_business_role`, `ref_actor_role`, `ref_object_relation_type`, `ref_permission`, `ref_legal_type`, `ref_document`, `ref_review_source`, `ref_commune`.
- **C10 Taxonomy branches:** the 19 `ref_code` `taxonomy_*` domains — `taxonomy_act`, `taxonomy_asc`, `taxonomy_camp`, `taxonomy_com`, `taxonomy_fma`, `taxonomy_hlo`, `taxonomy_hot`, `taxonomy_hpa`, `taxonomy_iti`, `taxonomy_loi`, `taxonomy_org`, `taxonomy_pcu`, `taxonomy_pna`, `taxonomy_prd`, `taxonomy_psv`, `taxonomy_res`, `taxonomy_rva`, `taxonomy_spu`, `taxonomy_vil`. Uniform analysis: each is a tree (1 non-assignable root + assignable leaves, `parent_id`-linked); usage = `object_taxonomy.ref_code_id`; consistency = does each enum object_type have a branch and vice-versa; i18n = essentially FR-only (flag as a set, not per-code).

**Execution note (supersedes the separate Phase 0 artifact files):** because live access is confirmed from the controller, each cluster subagent is **self-contained** — it extracts its own slice directly (live `SELECT` for its domains/tables, reads its consumer FKs from `live-foreign-keys.csv`, greps `seeds_data.sql`+seed migrations+`api-db-reference.html` for its source codes). The controller's per-domain summary (counts + en/es/zh/el coverage) is passed into each brief as the reconciliation baseline. No intermediate `audit-2026-06-15-live-refcode.csv`/`-consumer-map.csv`/`-source-inventory.csv` files are pre-built.

### Task 1.1–1.9: Run one subagent per cluster

**Files:**
- Create (each): `docs/schema-workbench/audit-2026-06-15-cluster-<N>.json`

- [ ] **Step 1: Dispatch all 9 subagents concurrently with this prompt template**

```
You are auditing the seeding of these reference vocabularies: <CLUSTER LIST>.
Read-only. Use Supabase MCP execute_sql for the live plane. Do NOT modify any file or DB.

Inputs (read these first):
- docs/schema-workbench/audit-2026-06-15-live-refcode.csv (live ref_code dump)
- docs/schema-workbench/audit-2026-06-15-live-refstandalone.csv (live standalone dumps)
- docs/schema-workbench/audit-2026-06-15-consumer-map.csv (FK consumers)
- docs/schema-workbench/audit-2026-06-15-source-inventory.csv (seeded codes + source lines)

For EACH vocabulary in your cluster, produce:
1. matrix row: { unit, live_count, source_count, doc_count, db_usage_distinct, verdict }
2. findings across four dimensions, each: { dimension: "D1|D2|D3|D4", severity: "blocker|high|medium|low", code, title, evidence, recommendation }

Dimension rules:
- D1 dead/orphan: a code is a DEAD candidate only if (a) zero live DB usage AND (b) no SQL RPC literal AND (c) no frontend literal. Compute DB usage with the per-domain anti-join below. For RPC/FE, grep:
    SQL: rg "'<code>'" "Base de donnée DLL et API"
    FE:  rg "<code>" bertel-tourism-ui/src
  Classify each dead candidate as TRULY-DEAD vs FORWARD-LOOKING (is_assignable=false, or valid_to in past, or vocab clearly seeded ahead of data such as 0-row object types). ORPHAN = a code referenced (FK data / RPC / FE / enum) but absent from live or from source.
- D2 i18n/label: from the live dump, flag rows with missing name, or missing any of en/es/zh/el in name_i18n. Note whether the table uses name_i18n jsonb vs central i18n_translation.
- D3 structure: duplicate/conflicting codes, naming-convention outliers vs the domain's pattern, codes that look mis-routed (wrong domain/partition), ON CONFLICT/idempotency concerns visible at the cited source line, ordering hazards.
- D4 drift: live-only codes (in live dump, not in source inventory), source-only codes (in inventory, not live), label/flag value mismatches live↔source, broken parent_id (parent absent), doc-count mismatch.

Per-domain DB-usage anti-join (fill consumers from the consumer map for this ref unit):
  SELECT r.domain, r.code, r.name
  FROM public.ref_code r
  WHERE r.domain = '<DOMAIN>'
    AND NOT EXISTS (SELECT 1 FROM <consumer_table_1> c WHERE c.<col_1> = r.id)
    AND NOT EXISTS (SELECT 1 FROM <consumer_table_2> c WHERE c.<col_2> = r.id)
  ORDER BY r.code;
  -- standalone tables: same shape, join on that table's id column.

Output: write strictly valid JSON to docs/schema-workbench/audit-2026-06-15-cluster-<N>.json with shape:
  { "cluster": <N>, "matrix": [ <matrix rows> ], "findings": [ <finding objects> ] }
Return a one-paragraph summary of the most severe findings as your final message.
```

- [ ] **Step 2: Verify each slice exists and parses**

After all 9 return, confirm each `audit-2026-06-15-cluster-<N>.json` exists and is valid JSON with non-empty `matrix`. Re-dispatch any cluster that failed or returned null.

---

## Phase 2 — Reconcile & classify

### Task 2.1: Merge slices into one matrix + ranked findings

**Files:**
- Read: all `docs/schema-workbench/audit-2026-06-15-cluster-*.json`

- [ ] **Step 1: Assemble the master matrix**

Concatenate all `matrix` arrays. Verify the unit count equals (live domains + standalone tables) from Phase 0 — every ref unit present exactly once. List any missing/duplicated unit and fix by re-reading the relevant slice.

- [ ] **Step 2: Dedup & rank findings**

Concatenate all `findings`. Dedup by `(dimension, code, title)`. Sort by severity (blocker → low) then dimension. Tag any finding that matches an already-logged deferred item (G-DESC-1 i18n duplication; amenity i18n backlog; §61 CRM cleanup; TST recoding) with a cross-link instead of presenting it as new.

- [ ] **Step 3: Closure staleness check**

Run the derived-table correctness check:

```sql
SELECT count(*) AS live_closure_rows FROM public.ref_code_taxonomy_closure;
```

Then, per `api.refresh_ref_code_taxonomy_closure`, note in the report whether a recompute is advised (do NOT execute the refresh — it mutates). Flag as D4 if the closure row count looks inconsistent with the taxonomy parent_id graph (compare to count of parent_id-linked ref_code rows).

---

## Phase 3 — Spot-verify (no asserting unverified findings)

### Task 3.1: Re-check a sample per dimension against live

**Files:** none created; verification only.

- [ ] **Step 1: Verify D4 live-only claims**

For each finding tagged "live-only" (a deploy-integrity incident), grep ALL source files for the code to confirm it is genuinely absent from source (not just from the doc):

Run: `rg -n "<code>" "Base de donnée DLL et API"`
Expected: zero seed-insert hits for a true live-only finding. Downgrade/remove any finding that's actually seeded.

- [ ] **Step 2: Verify a sample of D1 dead candidates**

Pick 3 "truly dead" candidates across clusters. Re-run their DB anti-join AND re-grep SQL+FE. Expected: all three confirm zero usage. If any has a hit, reclassify.

- [ ] **Step 3: Verify the highest-severity D2/D3 findings**

Open the cited source line for the top i18n/structure findings and confirm the claim matches the actual seed text.

---

## Phase 4 — Write the report

### Task 4.1: Assemble the deliverable

**Files:**
- Create: `docs/schema-workbench/ref-seeding-audit-2026-06-15.md`

- [ ] **Step 1: Write the report sections** (per spec §6)

Sections, in order:
1. **Exec summary** — tables/domains audited, total codes, findings count by severity, the 3–5 highest-impact fixes.
2. **Per-table matrix** — one row per ref unit: `unit | live | source | doc | db_usage | verdict`.
3. **Findings by dimension** — D1/D2/D3/D4, each finding: severity badge, code, evidence (live value, source line, usage), recommendation.
4. **Prioritized remediation backlog** — table `# | fix | dimension | severity | effort | risk | unblocks`, ordered by severity then effort. **No fixes applied — these are proposals.**
5. **Cross-links** — existing deferred items this audit touches (so remediation does not duplicate them).
6. **Method & coverage note** — three planes, what was spot-verified, any live access caveat.

- [ ] **Step 2: Self-check coverage**

Confirm every matrix unit has a verdict and every finding carries severity + evidence. Confirm no finding asserts a live-only/dead claim that Phase 3 did not verify.

- [ ] **Step 3: Present the report to the PO**

Surface the exec summary + top remediation items in chat. Do not commit (PO commits docs via Cursor) unless asked; if asked, branch off `master` first.

---

## Phase 5 — Close-out (per CLAUDE.md memory workflow)

### Task 5.1: Update the canonical decision log

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`

- [ ] **Step 1: Append an audit entry**

Add a new numbered section recording: the audit was run, headline findings, the remediation backlog reference (`docs/schema-workbench/ref-seeding-audit-2026-06-15.md`), and any newly discovered invariant (e.g. a seeding rule worth promoting to CLAUDE.md). Move/annotate the relevant WORKFLOW.md deferred items (amenity i18n backlog) with the audit's concrete findings.

### Task 5.2: Refresh MCP memory

- [ ] **Step 1: Reconcile memory with the log**

Per CLAUDE.md: check existing memory, delete stale observations, add a pointer to the audit report. Do this only AFTER Task 5.1.

---

## Self-review (run after writing this plan)

- **Spec coverage:** §2 scope → Phase 0/1 cluster assignments cover all domains+tables (incl. closure-as-derived in Phase 2.1 Step 3). §3 three planes → Phase 0.1 (live), 0.3 (source+doc). §4 method → Phase 0/1. §5 dimensions → Phase 1 prompt D1–D4. §6 deliverable → Phase 4. §7 execution (fan-out + spot-verify + log/memory) → Phases 1/3/5. ✓
- **Placeholders:** queries and grep commands are concrete; the only `<placeholders>` are per-cluster substitutions the subagent fills from the provided artifacts (intentional, documented). ✓
- **Consistency:** artifact filenames (`audit-2026-06-15-*`) and the `ref-seeding-audit-2026-06-15.md` deliverable name are used identically across phases. ✓
