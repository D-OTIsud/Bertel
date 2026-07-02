# Database structure audit — 2026-07-02

**Question:** should the structure be improved?
**Verdict: the structure is fundamentally sound — no re-architecture warranted.** What's left is a short, concrete maintenance list: one real ops bug (object_version partition drift), one policy-cruft cleanup, and three cheap mechanical batches. The 2026-06-10 watchlist verdict (*watch, not fix*) still holds for every item on it.

Audit method: live prod (Supabase MCP) — advisors (security ×158, performance ×1384), pg_catalog structural sweeps — cross-checked against `db-graph-out/` (snapshot 2026-06-25) and the decision log. **Read-only: nothing was changed.**

---

## 1. What is healthy (verified live)

| Check | Result |
|---|---|
| Tables without PK (public) | **0** / 183 |
| Tables with RLS off (public) | **0** / 183 |
| `rls_enabled_no_policy` | 4, **all intentional fail-closed** (`internal.partner_api_*` ×3, `app_ai_provider_config` — service-role-only by design, §114) |
| SECURITY DEFINER views | **0** — all 4 public views are `security_invoker=true` (the 2026-06-14 coverage-view leak is confirmed fixed live) |
| `staging` schema exposure | **none** — no USAGE for anon/authenticated, 0 table grants |
| §101/§103 surface coverage | **60/60** authorable object-attached tables emitted by a consumer RPC, 0 candidate gaps (as of the 2026-06-25 graph) |
| Cron hygiene | 4 jobs active: mv refresh (5 min), open-status (15 min), `audit.maintain_partitions` (daily, **includes `drop_old_partitions(12)` — 12-month audit retention IS implemented**), metric snapshots (daily) |
| Bare-flag read-policy class | still empty (8s/8t/8v/8w held) |

Size context: public = 63 MB / 183 tables (largest: `object` 11.6 MB / 843 rows — fat rows from `search_document` tsvector + cached aggregates, fine at this scale). audit = 94 MB. staging = 56 MB.

## 2. Findings — should be improved

### P1a — `object_version` partition maintenance is dead (real bug, ops)
Monthly partitions exist only for 2026_03 (0 rows), 2026_04 (0 rows), 2026_05 (844 rows). **Nothing creates new months** — `audit.maintain_partitions()` only handles `audit.audit_log`. Since 2026-06-01 every version row lands in `object_version_default` (951 rows and growing), which silently defeats the partition scheme (no pruning, no future retention lever, and a future overlapping-partition ATTACH would fail against default rows).
**Fix options:** (a) extend the daily cron to also create+ANALYZE `public.object_version` months and re-home default rows; or (b) admit partitioning was premature at ~500 rows/month and de-partition. Either is fine; the status quo is not.

### P1b — duplicate permissive policy families on 6 `ref_code` partitions (cruft)
Verified on `ref_code_environment_tag`: it carries BOTH the house pair (`admin_ref_code_write` ALL + `pub_ref_code_read` SELECT) AND a legacy dedicated pair (`Écriture admin des tags d'environnement` ALL + `Lecture publique des tags d'environnement` SELECT). Same 24-combo signature on `ref_code_incident_category`, `ref_code_membership_campaign`, `ref_code_membership_tier`, `ref_code_payment_method`, `ref_code_view_type`.
**Fix:** drop the legacy named pair on the 6 partitions (pure redundancy — the house pair subsumes it). Clears ~144 of the 702 `multiple_permissive_policies` warnings.

### P2a — FK covering indexes: ~8 indexes clear ~220 of 310 lint entries
The three worst "offenders" are lint amplification, not design flaws: an FK to the *partitioned* `ref_code` parent is cloned once per referenced partition in `pg_constraint`, so `ref_code_taxonomy_closure` shows **107 FK constraints but only 3 distinct referencing column sets** (`object_taxonomy`: 55/3, `object_web_channel`: 54/2). One index per column set (~8 total) clears the bulk. Worth doing now that the §119 ref_code delete-at-0 flow actually exercises reverse lookups. Include the long-deferred `object_relation.target_object_id` (object-delete cascade path) and `crm_interaction`'s 6 in the same migration.

### P2b — `auth_rls_initplan` remainder (129) + invariant drift in new modules
The backlog matches the documented deferred remainder (ref_* lookups, ref_code_* partitions, user_org_*/permissions, object_version partitions, i18n, promotion/publication — all small/off-hot-path). **But:** newer policies regressed on the §39 rule ("new policies MUST use `(select auth.x())`"): `actor` ×1, `actor_channel` ×2, `actor_consent` ×2 (CRM §61/§63), `pending_change` ×1 (moderation §120), `incident_report` ×1, `app_user_profile` ×3. One mechanical sweep migration closes all 129; consider a CI grep-gate on new policy DDL for raw `auth.uid()/auth.role()` to stop the slow leak.

### P2c — small config/cleanup wins
- **Leaked-password protection is OFF** (Supabase Auth) — dashboard toggle, zero code. [Remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- 3 duplicate indexes in `staging` (`idx_old_data_*` twins on `object_temp`, `media_galerie_lot1_temp`) — drop, or fold into P3a.

### P3a — `staging` schema disposition (PO decision, not urgent)
98 `_temp` tables + mapping-contract tooling, 56 MB, fully unexposed. It is the Berta import lineage (reconciled 840/840, §85) — harmless but frozen. When the OTI signs off the reconciliation as final: `pg_dump --schema=staging` → cold storage → drop schema. Keeps lineage, frees a third of the DB, kills the duplicate-index lint. Until then: leave as is.

### P3b — knowledge-graph refresh (repo maintenance)
`db-graph-out/` (2026-06-25) predates: Listes L1 (`object_list`, `object_list_item` + RPC family), `ref_interop_crosswalk` + interop RPCs (I4/I4b), `internal.partner_api_*` (partner gateway), open-status tri-state (§133). Run the full refresh pipeline (tbls → `extract_catalog.cjs` → `db_graph.py`) so structure questions answer current.

## 3. Explicitly NOT recommended

- **No changes to the 2026-06-10 watchlist items** — re-checked at today's sizes, all still *watch*: `tag_link` polymorphism (4 539 rows / 3 MB — fine), `object_location`/`media` XOR columns (working, policies handle both legs), cached aggregates on `object` (843 rows — fine), `object.extra`/`secondary_types` escape hatches, 5-table `opening_*` tree, `object_type` enum-vs-ref-table.
- **`public.object`'s 24 permissive-policy combos are by design** (admin/service ALL arm + owner arms + §35/§38 split read gates), hot path already EXPLAIN-verified; do not "fix" this to please the linter.
- **The 153 `*_security_definer_function_executable` warnings are the documented §36 authorize-once pattern** — expected. The invariant to keep enforcing in review: every DEFINER RPC self-authorizes its ids; never trust caller lists.
- **`unused_index` (239)** — stats are young and the DB is 63 MB; do not drop indexes on this signal alone. Revisit in 6 months.

## 4. Suggested order of execution

1. P2c leaked-password toggle (1 min, dashboard)
2. One migration: P1b policy-pair drops + P2a FK indexes + P2b initplan sweep (all mechanical, manifest + runbook + fresh-apply gate as usual)
3. P1a object_version partition decision (extend cron vs de-partition) — small design call first
4. P3b graph refresh
5. P3a staging archival — after PO sign-off

## 5. Verified / uncertain

**Verified live:** all §1 table rows; partition bounds + row distribution of `object_version`; `maintain_partitions()` source; policy lists on `object` + `ref_code_environment_tag`; FK constraint/col-set counts on the 3 fan-out tables; schema sizes/grants; cron.job contents; view security modes; advisor counts (2026-07-02).
**Uncertain / not checked:** the 5 sibling ref_code partitions' duplicate pairs were inferred from identical 24-combo advisor signatures (verify each before dropping); whether any consumer intentionally relies on `object_version_default` (none known); exact per-index DDL for P2a (derive from `conkey` column sets at migration time); Listes/interop RPC internals (post-snapshot, not re-audited here — covered by their own §134–§138 passes).

---

## 6. EXECUTED — 2026-07-02 (same day; decision log §146)

All P1/P2 items were applied to live + folded into sources + CI the same day (manifest **16e–16h**):

| Item | Status |
|---|---|
| P1a object_version partitions | **DONE (16e)** — both creators born-gated (RLS + wrapped policy at creation; the audit creator had the same hole — live `audit_log_2026_08/_09` were born bare), `ensure_object_version_partitions` wired into the daily cron, 951 default rows re-homed into `object_version_2026_06`, horizon 07/08/09 created. All 16 partitions of both parents verified RLS + policy. |
| P1b duplicate ref_code policy pairs | **DONE (16f)** — 12 legacy policies dropped (all 6 partitions verified before dropping, not just inferred); exactly the house pair remains on each; CREATEs removed from `rls_policies.sql`. Superuser direct-write arm on the 3 French-named partitions removed by design (sanctioned path = §119 DEFINER RPCs). |
| P2a FK covering indexes | **DONE (16g)** — ~21 indexes; `idx_crm_interaction_parent` converged partial→full; `ref_code_taxonomy_closure` confirmed already covered (stale advisor noise — no index added); 3 staging duplicate twins dropped. 0 uncovered FK sets on the 7 tables. |
| P2b initplan sweep | **DONE (16h)** — catalog-driven ALTER POLICY sweep: 129 rewritten, **0 unwrapped policies left in any schema**; permanent CI guard `test_rls_initplan_broad_sweep.sql` (the recommended grep-gate, implemented as a SQL gate). |
| P2c staging duplicate indexes | **DONE (16g)** — the 3 advisor-named twins. |
| New invariant | CLAUDE.md « Partitions are born gated (RLS does not inherit) » + §39 CI-enforcement note. |

**Still open (PO actions):** leaked-password protection toggle (Dashboard → Authentication → Passwords — not reachable via MCP); staging schema archival after Berta reconciliation sign-off (P3a); db-graph refresh ran post-migrations (P3b). Watchlist unchanged (§3).
