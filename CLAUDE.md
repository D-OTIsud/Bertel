# CLAUDE.md

## Project purpose
This project is a tourism CRM / SIT platform with a unified data model, API SQL views/functions, and frontend explorer/filtering logic.

Primary goals:
- keep the data model coherent and normalized
- preserve business invariants
- avoid schema drift between SQL, API, and frontend
- prefer maintainable solutions over quick patches
- make changes that are explicit, verifiable, and easy to clean up later

---

## Working style
For any non-trivial task:
1. understand the existing implementation first
2. make a short plan before editing
3. implement in small, coherent changes
4. verify with concrete evidence before declaring success

Do not jump straight into code when the task affects: database schema, SQL functions, filtering logic, object model semantics, or imports.
If something important is unclear, inspect the codebase and infer from the existing implementation before proposing new abstractions. Prefer adapting the current architecture cleanly rather than introducing parallel systems.

---

## Core principles

### 1. Preserve model integrity
Do not invent shortcuts that break the conceptual model.
Always respect the distinction between:
- `object`, the root entity for establishments / places / tourism entities
- `ORG`, institutional structure, SIT publisher, publication owner
- `ACTOR`, operational or commercial operator, guide, manager, contact, service provider

### 2. Keep backend and frontend aligned
Whenever backend filtering, schema, enums, or relation semantics change, check whether the frontend must be updated too (explorer filters, labels, badges). Call out missing frontend impacts explicitly.

### 3. Minimize accidental complexity
Prefer: one clear source of truth, explicit naming, documented rules, reversible migrations, targeted patches.
Avoid: duplicate concepts, ambiguous enum meanings, hidden business logic, magic fallback behavior, dead code left behind "just in case".

### 4. Verification over assumption
Never mark work as complete without verifying the actual behavior through: SQL inspection, code path review, test execution, build/lint checks. If verification is not possible, say so explicitly.

---

## Database and schema rules

### General
Treat the database model as a product asset, not just storage.
Before changing schema: inspect existing tables, views, functions, enums. Avoid adding columns/relations when an existing concept covers the need. Prefer normalized structures. IL N'Y A PAS de clé étrangère directe type `site_object_id` dans les tables (notamment `object_act`). Une seule source de vérité par concept.

### Migrations & SQL style
Make migrations explicit and reversible. Preserve idempotency. Keep business rules close to the schema/function they affect. Do not add clever SQL that becomes hard to maintain.

---

## Business invariants

### ORG vs ACTOR invariant
- `ORG` = institutional structure, SIT publication carrier, publisher
- `ACTOR` = operator, manager, guide, monitor, commercial or operational contact
Do not create an `ORG` for each commercial service provider. Do not use `object_org_link` to represent real-world commercial operation.

### Standard ACT attachment pattern
For an `ACT` object (prestation commerciale encadrée), the expected attachment model is:
- `object_org_link [publisher]` → ORG, example: OTI du Sud
- `actor_object_role [operator]` → ACTOR, example: commercial operator
- `object_relation [based_at_site]` → PNA, optional (ATTENTION: site_object_id n'existe plus)
- `object_relation [uses_itinerary]` → ITI, optional
- `object_location` → Coordonnées géographiques du point de RDV

---

## Documentation rules (HIGH PRIORITY)
Pay a strong effort to documentation.
- **Code & SQL:** Add clear, concise inline comments for any non-obvious business logic, SQL views, or complex frontend filtering.
- **Architecture:** Document important decisions locally when they affect data semantics, schema invariants, relation meaning, migration expectations, or import assumptions.
- **Continuous Update:** If a new architectural rule, invariant, or complex behavior emerges that is NOT already covered in this `CLAUDE.md`, you MUST explicitly propose adding it to `CLAUDE.md` or the relevant project documentation files. Good documentation is specific, useful for later cleanup, and explicit about what can be removed in the future. Do not write decorative documentation.

---

## Memory workflow

### Sources of truth (in priority order)
1. **`bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md`** — canonical decision log. Primary source for all mapping choices, locked decisions, deferred items, and invariants discovered during pilot work.
2. **`CLAUDE.md`** — architectural invariants and working rules only. Do NOT put implementation-level decisions here.
3. **MCP memory graph** — recall layer only. Useful for quick in-session context. Never authoritative. Must be refreshed from the canonical log when stale.

### When to update `lot1_mapping_decisions.md`
Update at the end of any session that produces:
- a locked mapping decision (object type, label code, relation role, execution-order constraint)
- a deferred item with a documented reason
- a discovered invariant or constraint not already in CLAUDE.md
- a schema/seed correction (wrong code, missing seed, broken no-op)

Do NOT defer this update to a later session. Update before closing the task.

### When to refresh MCP memory
Refresh MCP memory **after** `lot1_mapping_decisions.md` is updated, not before.
Steps:
1. Check existing MCP entities with `mcp__memory__read_graph` or `mcp__memory__search_nodes`.
2. Delete stale observations with `mcp__memory__delete_observations` rather than duplicating.
3. Add new observations to existing entities before creating new entities.
4. Never store implementation detail that belongs in `lot1_mapping_decisions.md` — MCP is for recall, not log.

### End-of-task checklist
Before declaring a task complete:
- [ ] `lot1_mapping_decisions.md` reflects all decisions from this session
- [ ] Any new invariant or architectural rule is proposed for CLAUDE.md
- [ ] MCP memory is consistent with `lot1_mapping_decisions.md`
- [ ] Deferred items are documented with reason and dependency

---

## Completion criteria
Do not say the task is done unless you can state: what changed, where it changed, why it changed, what was verified, and what remains uncertain.

@.claude/WORKFLOW.md
