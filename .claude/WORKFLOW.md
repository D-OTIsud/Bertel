# .claude/WORKFLOW.md — Decision Memory Quick Reference

This file is a compact in-session checklist. Full protocol is in `CLAUDE.md § Memory workflow`.

---

## Where decisions live

| Layer | File | Role |
|-------|------|------|
| Canonical log | `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` | Source of truth for all mapping, schema, and pilot decisions |
| Architectural rules | `CLAUDE.md` | Invariants and working rules only — not implementation detail |
| Recall layer | MCP memory graph | Quick context only — refresh from canonical log when stale |

---

## End-of-session checklist

1. **`lot1_mapping_decisions.md` updated** — new locked decisions, deferred items, discovered invariants
2. **CLAUDE.md update proposed** — if a new architectural rule emerged this session
3. **MCP memory refreshed** — delete stale obs, add new obs to existing entities, no duplication
4. **Deferred items documented** — with reason and unblocking dependency

---

## Deferred items tracker (living list — update in place)

| Item | Reason deferred | Unblocked by |
|------|----------------|--------------|
| `ref_actor_role [operator]` seed missing from `seeds_data.sql` | HIGH PRIORITY — blocks ACT_subpilot inserts | Must add before any ACT pilot objects |
| TST `object_classification` recoding (`green_key` → `LBL_CLEF_VERTE`, `tourisme_handicap` → `LBL_TOURISME_HANDICAP`) | Execution-order constraint: V5 schemes seeded at lines 5615/6964, TST inserts at lines 1759–4852 | TST refactor pass (reorder seeds or split file) |
| `object_amenity` inserts for pilot objects | Not yet written | Accessibility catalog normalized: 43 `acc_*` codes only under family `accessibility` (33 original V5 + 10 new NO-EQUIV codes added 2026-03-22); 22 legacy non-`acc_*` rows removed |
| `object_payment_method` inserts | Not yet written | — |
| `object_meeting_room` insert (Dimitile Hôtel) | Not yet written | — |
| `object_environment_tag` inserts (5 pilot objects, 7 tags) | Not yet written | — |
| i18n for 11 amenity_family codes + 22 ref_amenity codes (12 original new codes + 10 new acc_* codes added 2026-03-22) | Not yet written | — |
| Staging table `staging_d_durable` for CSV import | Not yet written | `migration_sustainability_v5.sql` applied |
| CSV import of `Etablissements - D_Durable (2).csv` | Not yet written | staging table + staging_ingestor.sql update |
| Merge `migration_sustainability_v5.sql` DDL into `schema_unified.sql` | Future cleanup only | After successful staging validation |
| ~~Pre-V5 sustainability vocabulary cleanup~~ | **DONE 2026-03-22** | Pre-V5 categories (energy/water/waste/mobility/biodiversity) and actions (16 codes) removed from `seeds_data.sql`; V5 vocabulary (`CAT_*`, `SA_*`, `MA_*`) is now the sole canonical vocabulary. `MA_WILDLIFE_CORRIDORS` added under `SA_BIODIVERSITY_PROTECTION`. `MA_SOLAR_THERMAL` confirmed present in V5 (`SA_ONSITE_RENEWABLE_ENERGY`). DB cleanup DO block added. |

---

## V5 canonical label codes (locked 2026-03-21)

| Old (retired) | V5 canonical | Notes |
|---------------|-------------|-------|
| `green_key` | `LBL_CLEF_VERTE` | |
| `eu_ecolabel` | `LBL_ECO_LABEL_UE` | |
| `tourisme_handicap` | `LBL_TOURISME_HANDICAP` | |
| `destination_excellence` | `LBL_DESTINATION_EXCELLENCE` | |
| `qualite_tourisme` | `LBL_QUALITE_TOURISME` | |
| `qualite_tourisme_reunion` | *(kept as-is)* | No V5 equivalent |
