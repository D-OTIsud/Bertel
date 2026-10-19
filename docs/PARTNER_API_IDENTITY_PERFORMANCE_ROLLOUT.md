# Partner API identity performance rollout

Deployed to production on 2026-10-19. Migration history records version `20261019142132` (`partner_api_identity_initplan`), with the forward and rollback SQL. No application redeployment was needed for the SQL fix; the new structured RPC logging remains a local application change until the next application deployment.

Apply `supabase/migrations/20261019142132_partner_api_identity_initplan.sql` after the actor portal and `20260907073235_actor_test_realm_isolation.sql`. The fresh-install manifest applies it at 19j, after every earlier definition of these helpers. The render comparison follows at 19k; these labels preserve the intervening steps already on `master`.

`user_actor_ids()` evaluates the request email through an uncorrelated SELECT (InitPlan) and preserves `internal.actor_in_current_realm`; it remains SECURITY INVOKER. `current_user_extended_object_ids()` exits only when both uid and trimmed email are absent. Actor persona dispatch, email-only and uid-only paths, realm filtering, SECURITY DEFINER, search paths and ACLs are preserved. CREATE OR REPLACE retains ownership and grants; there are no new signatures or PostgREST schema changes.

Before rollout, run the dedicated SQL regression test in a disposable database, including production/sandbox and email-only/uid-only identities. Compare EXPLAIN (ANALYZE, BUFFERS) for the realm-aware actor lookup and representative partner full50/full5/card50 requests under the same claims, filters and timeout as baseline. Check returned object IDs and payload visibility, not only timing. Do not claim the full endpoint speedup from the actor lookup timing alone.

## Validation on 2026-10-19

The migration was rehearsed on the live catalog/data in one transaction, then rolled back. The harness stripped the migration's BEGIN/COMMIT wrappers, used the partner service-role claims, checked function security metadata/ACLs before and after, and confirmed both original function definitions were restored after ROLLBACK. The entire full50 response was identical before and after the fix.

| HLO query | Before | After (8-second statement timeout) |
| --- | ---: | ---: |
| full, 5 | 4.7 s in initial diagnosis | 0.343 s |
| full, 25 | — | 1.166 s |
| full, 50 | 33.312 s in the same rehearsal | 2.324 s |
| full, 100, first page | — | 4.691 s |
| full, 100, next page | — | 4.363 s |
| card, 50 | 1.1 s in initial diagnosis | 0.334 s |

Times include SQL client round-trip and response decoding. These are individual measurements, not a load-test percentile or HTTP endpoint measurement. ITI and FMA queries returned zero published production objects, so their populated full payload performance is not validated by these measurements.

SQL regression suites passed inside rollback savepoints: `test_partner_identity_gate.sql`, `test_read_gate_setbased.sql`, `test_actor_email_realm.sql`, `test_actor_test_realm.sql`, and `test_actor_contacts_org_gate.sql`. The API route, detail route, partner-auth, and public-api suites passed (59 tests). The complete fresh-install manifest has not been run locally; no local PostgreSQL/Docker runtime was available.

Deployment checked the live function bodies against the expected rollback definitions before replacing either function, and verified ownership, INVOKER/DEFINER flags, search paths and ACLs remained identical. Both page sizes passed with the normal 8-second timeout before committing (50: 2.941 s; 100: 3.807 s). After commit, a new database connection again passed (50: 4.761 s; 100: 6.070 s). Timing varies; these observations establish success under the normal timeout, not a latency SLA. TypeScript typecheck passed.

The initial SQL rollout was verified through the same database RPC, service-role claims and parameters that the route sends. The subsequent HTTP verification below used a temporary partner key supplied by the user. No partner key was created, changed or revoked by the test run.

## HTTP verification on 2026-10-19

Three GPT-6.1 Sol sub-agents checked performance, complete HLO pagination/detail equivalence, and access/parameter behavior. Heavy requests were sequenced across agents; only the three lightweight negative access checks overlapped the pagination pass. The 18 requests produced 15 expected HTTP 200 responses, two expected 401 responses, and one expected 400 response. No 502, timeout, retry or 429 occurred. Results were kept as aggregated metadata; no object payload, Authorization header or key was written to the reports. The temporary local credential file was deleted once all requests completed.

| HTTP check | Result |
| --- | --- |
| HLO full5, initial performance pass | 200, 5 objects, 2.228 s |
| HLO full50, two measurements | 200, 50 objects, 2.806 s and 5.829 s |
| HLO full100, two measurements | 200, 100 objects, 4.109 s and 6.216 s |
| HLO card50 | 200, 50 objects, 0.915 s |
| Complete HLO full100 traversal | Five pages: 100 + 100 + 100 + 100 + 72; 472 unique IDs, no duplicates, stable total, final cursor null |
| Page traversal HTTP durations | 6.853 / 3.906 / 3.717 / 3.872 / 3.141 s |
| One object detail compared with its list item | 200, deep-equal JSON, 1.376 s |
| Missing key / malformed key | 401 / 401 |
| Invalid type code | 400 |
| Lowercase `types=hlo`, full5 | 200, 5 objects; targeted check confirms all top-level `type=HLO` and `status=published` (7.099 s) |
| `view=full&page_size=101`, without a type filter | 200, clamped to 100 objects, 16.722 s |

All 472 HLO items were published and omitted `canonical_description` and `org_description`. The access checks also verified omission of `private_description`. Contract and response header version were `1.0.0` throughout. The first lowercase check used an unsuitable recursive field aggregation; only the subsequent targeted top-level check establishes its type/publication assertions.

The original HLO full50 failure is resolved in these HTTP checks. The unfiltered full101 request succeeded but remains slow (16.722 s); this is a separate latency observation, not a repeat of the HLO timeout failure. HTTP durations include authentication, rate checking, logging, transfer and network latency and should not be compared directly with the database's per-statement 8-second timeout. These are bounded functional checks, not a load test or latency SLA.

The canonical portal source includes the empty-identity guard. The historic realm migration is intentionally unchanged; replaying it later overwrites the optimized `user_actor_ids()` body. Replaying `rls_policies.sql` or `migration_explorer_rls_setbased.sql` also overwrites older helper definitions. After any such manual replay, rerun the final performance migration (and the portal/realm migrations in their normal order if needed). The fresh-install ordering prevents these overwrites automatically.

Rollback: execute `Base de donnée DLL et API/rollback/rollback_partner_api_identity_initplan.sql` in a transaction. It restores both prior definitions without data changes or ACL changes. If later migrations have changed either function, reconcile those changes before rollback. Re-run authorization regression tests and baseline timings after rollback. Keep migration history consistent with the deployment process; the rollback script does not rewrite Supabase migration history.

The database graph is derived from a live catalog; regenerate it via `tools/db-graph/README.md` only after an authorized database rollout. Local source graph maintenance does not prove database deployment or runtime correctness.

## Further optimization review on 2026-10-19

Two GPT-6.1 Sol reviewers inspected the resource builder and HTTP gateway without changing runtime code. The gateway currently awaits authentication, rate checking, resource loading and call logging in sequence: four Supabase RPC round trips, or five when an interop format is requested. Authentication also updates `last_used_at` on every call. These are candidates for reducing round trips and write contention; their individual HTTP costs have not yet been measured.

A bounded, read-only database comparison used the same 50 published, non-test HLO IDs ordered by ID, the same service-role claims and an 8-second statement timeout. `EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF)` measured server execution independently of payload transfer. Each row is one observation, in execution order:

| Render | Server execution | Client round trip |
| --- | ---: | ---: |
| enabled | 1,419.802 ms | 2,256 ms |
| disabled | 891.877 ms | 1,861 ms |
| disabled | 840.459 ms | 1,633 ms |
| enabled | 982.882 ms | 1,984 ms |

Warm-up and concurrent production activity can affect these observations. Disabling render changes the response contract and is only a diagnostic comparison, not an applied optimization. The builder repeats some contacts/media reads for render; reusing already-loaded data is a candidate that must preserve the existing JSON and visibility guards.

Recommended sequence: instrument successful requests by stage; reduce admission/logging round trips while preserving immediate key revocation, atomic rate counting and logging behavior; then optimize measured repeated builder work. Do not hold key/rate-bucket write locks across the expensive resource read. Request-local context reuse needs no cross-request invalidation but must retain object-dependent authorization checks.

The existing materialized projection supports filtering, not full-resource JSON caching. A later public-resource cache would need a dedicated public projection, option/language/version keys, publication/realm checks and explicit invalidation for children and reference data. `object.updated_at` alone is insufficient: its business timestamp trigger excludes some fields returned by the resource, and shared reference-label changes need not update every dependent object. No additional production changes were made during this review.

## Gateway optimization implemented on 2026-10-19

The follow-up implements stage instrumentation and fewer blocking RPCs for the public object list and detail routes. Three GPT-6.1 Sol agents implemented SQL/authentication, route instrumentation and independent HTTP validation. The user explicitly deferred application redeployment. **Only the new database RPC is deployed; the existing domain still uses its previous route implementation until an application deployment.** No UI components were changed.

Migration `20261019145445_partner_admission` adds `api.partner_admit(text, integer, integer)`. It calls the existing authentication and atomic quota helpers in one short transaction, with SECURITY INVOKER, an empty search path and EXECUTE restricted to service_role. Authentication errors remain fatal. Only the quota block catches errors, including query cancellation, and preserves the existing quota fail-open policy. A transport failure affecting the combined RPC rejects admission because authentication cannot be established. Existing helper bodies, ownership and ACLs were verified unchanged; key revocation remains checked on every request, and `last_used_at` retains its existing precision. Expensive resource reads occur in a subsequent RPC, after admission locks have been released.

The list route now needs two completed Supabase RPCs before its ordinary success response instead of four. Detail retains its independent published-status query. Call auditing uses Next.js `after` and remains best effort. The HTTP response includes `Server-Timing` for admission, resource loading, optional enrichment, serialization and total measured route processing. Server logs additionally report UTF-8 response bytes and safe list view/page-size values. Audit duration is reported separately after the response; it is not part of response timing. No raw key, key hash, partner identifier, search, cursor, object ID or payload enters this performance telemetry. Audit telemetry records completion of the attempt, not proof of database insertion.

### Measurements and regression checks

Real PostgreSQL measurements used one warmed connection from the development workstation, alternating old and new admission paths, five measured repetitions per path. Both paths used the same temporary fixture and atomic quota helper. These durations include the client/database network round trip; they are **admission-only**, not production HTTP endpoint timings.

| Admission path | Median | Observed range |
| --- | ---: | ---: |
| Authentication RPC then quota RPC | 2,036.0 ms | 1,513.5–2,158.9 ms |
| Combined admission RPC | 975.6 ms | 746.3–995.1 ms |

The measured median reduction is 1,060.4 ms (52.1%) for admission from this workstation. Network distance differs from the application host, so this percentage must not be projected onto full endpoint latency.

Concurrency validation used four connections issuing twelve requests against a fresh fixture with a quota of five: exactly five allowed, seven denied and a persisted counter of twelve. The allowed remaining values were exactly 4, 3, 2, 1, 0. Revocation was checked immediately on the next admission and consumed no further quota. Fixtures had short expiry and random hash values with no corresponding usable raw API key; all fixture rows were deleted and cleanup verified. Script: `tools/partner-admission-validation.cjs --run`; aggregate evidence: ignored `.tmp_partner_admission_live_report.json`.

An independent HTTP harness ran actual Next.js 16.2.11 and the Supabase SDK against a loopback backend with controlled latency (25 ms authentication/quota/admission, 35 ms resource calls, 40 ms audit). Eleven scenarios, each warmed and measured five times, retained identical JSON, statuses, contract version, quota headers and Retry-After: list, full list, pivot list, detail, detail with i18n/JSON-LD, invalid type, invalid ID, unpublished detail, quota exceeded, unknown key and upstream failure.

| Controlled HTTP scenario | Before median | After median |
| --- | ---: | ---: |
| List | 190.2 ms | 99.5 ms |
| Full list | 172.4 ms | 97.5 ms |
| Pivot list | 219.0 ms | 142.6 ms |
| Detail | 219.0 ms | 142.8 ms |
| Detail with additive blocks | 325.9 ms | 235.2 ms |
| Quota exceeded | 125.6 ms | 50.3 ms |

These controlled numbers isolate gateway behavior and are not production latency claims. The harness also deliberately held the audit backend blocked: the complete HTTP response arrived before the audit was released, after which audit completion telemetry appeared. Server-Timing was present. Local servers were stopped after validation. Graceful shutdown with a pending audit was not validated on Windows; forced termination can lose a best-effort audit. The implementation uses the supported lifecycle hook, not a detached promise ([Next.js after documentation](https://nextjs.org/docs/app/api-reference/functions/after)). Harness: `tools/partner-gateway-benchmark.mjs --run`, requiring the pre-change sources saved in ignored `.tmp_partner_gateway_baseline/bertel-tourism-ui`; aggregate evidence is `benchmark-report.json` in that ignored directory.

Six Jest suites passed, 94 tests total: partner-auth, request metrics, public-api, object list, object detail and deletions. TypeScript typecheck passed. PostgreSQL regression tests passed inside a short transaction that was rolled back, covering grants, actual service_role invocation, invalid/revoked/expired/inactive keys, exact quota counts, injected quota failures/timeouts and propagated authentication failures/timeouts. Deployment then recorded the migration and notified PostgREST to reload its schema. The SQL fresh-install manifest includes the migration and regression suite immediately after the existing quota foundation; a complete fresh database bootstrap was not run locally.

Deployment order: database first (done), application routes later (deferred by the user), then repeat authenticated HTTP measurements on the deployed domain. Rollback order: restore the prior application routes before running `Base de donnée DLL et API/rollback/rollback_partner_admission.sql`, since new routes require the new RPC. The rollback removes only the new wrapper; existing authentication, quota, logs and partner keys remain intact. Keep migration history consistent when rolling back.

## Render reuse implemented and deployed on 2026-10-19

Migration `20261019151241_partner_resource_render_reuse` now reuses contacts, media, capacity and amenity rows within each `api.get_object_resource` call. Three GPT-6.1 Sol agents handled implementation, independent equivalence review and regression tests. The SQL change is deployed and immediately benefits the existing partner RPC. Application deployment remains deferred; no UI or application-route changes were deployed in this step. The resource function is shared with other consumers, so its authenticated behavior was also tested.

Materialized CTEs read the rows once for the structured JSON and render aggregates. Render labels are computed only when render is requested. There is no cache between requests, objects or users, so this introduces no cache expiry or invalidation delay. This is a targeted optimization of four blocks; other render blocks retain their existing implementation.

The two outputs deliberately keep their separate rules: structured translations use strict fallback, render translations use permissive fallback; capacity and amenity ordering can therefore differ. Contacts keep their distinct UUID/physical-row ordering. Media keep `DISTINCT ON (id)`, the existing structured ordering, organization preference only on the structured output, and physical-row ordering for render. Publication, visibility and extended-access predicates are unchanged. Function owner, volatility, SECURITY DEFINER, search path and ACL were checked before and after. The migration changes nine exact, guarded fragments in the existing function, preserving unrelated live changes, including actor realm filters. Both migration and rollback passed repeated-application checks, and rollback restored the exact original definition.

### Data and access verification

All **1,280 differential JSON comparisons passed**: 1,064 comparisons on all 840 published production objects across 13 types plus language/options variants, and 216 fixture comparisons covering public access and a real authenticated organization member. Comparisons use JSONB equality, including array order and null/absent distinctions; they do not compare whitespace or object-key serialization order. No resource payloads were retained in the aggregate reports.

Fixtures cover translated sorting, strict/permissive fallback, empty strings and nulls, zero capacities, roles, private contacts/media, unpublished media, organization overlays, duplicate URLs with distinct IDs, tags, dimensions, credits, and tied sort keys. Independent assertions prove that private rows are excluded publicly and actually present in both structured and render output for the authorized member. Five existing security suites also passed: partner identity, set-based read gate, actor email realm, actor test realm and actor contact organization gate. All fixture writes were rolled back. ITI/FMA still have no published production objects, so their populated real-data performance is not established.

Tools: `node tools/partner-render-validation.cjs --run` performs the differential comparison and timings; `--run --timings-only` repeats only timing scenarios. After deployment the tool reconstructs the predecessor inside its rollback-only transaction before capturing the reference. `node tools/partner-render-security-validation.cjs --run` runs the five security suites in rollback savepoints. Aggregate evidence is saved in ignored `.tmp_partner_render_report.json`, `.tmp_partner_render_timings_report.json` and `.tmp_partner_render_security_report.json`.

### Measured server execution

Final measurements use the same repeatable-read snapshot, service-role claims, an 8-second statement timeout, one warm-up pair and seven measured pairs alternating before/after order. `EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF)` consumes the complete JSON and measures database execution, excluding network transfer. The mixed sample is selected round-robin across all 13 types, not the first 50 sorted IDs.

| Scenario | Before median | After median | Change in median |
| --- | ---: | ---: | ---: |
| 50 full HLO | 992.225 ms | 992.624 ms | +0.04% |
| 50 full ACT | 910.577 ms | 878.553 ms | −3.5% |
| 50 full objects, 13 types | 983.405 ms | 915.857 ms | −6.9% |
| 50 HLO, render disabled | 848.204 ms | 865.702 ms | +2.1% |
| 50 HLO, four optimized blocks | 258.889 ms | 246.292 ms | −4.9% |

Every measured pair improved for the mixed sample and the four-block projection. The corresponding median paired changes were −7.4% and −4.4%. HLO full results remain effectively stable: four pairs improved and three slowed, with a median paired change of −1.5%. Render-disabled calls showed a small materialization overhead: six pairs slowed, median paired change +2.2%. This is a modest optimization, not a substantial full-HLO speedup, and it does not establish production HTTP latency gains. Production activity and plan/cache variation remain sources of timing noise.

Deployment compared another 100 full HLO resources against the original in the same transaction, with no JSON difference, then checked the actual list RPC for 50 and 100 objects before commit. After commit, a new connection returned 50 objects in 2.467 s and 100 in 4.015 s, total 472, with no timeout and no duplicate IDs. These two smoke timings include the client round trip and JSON decoding; they are not the server-only benchmark above. Migration history records the forward and inverse SQL. No HTTP performance rerun is claimed for this step.

The fresh-install manifest includes rollback-to-predecessor, baseline capture, migration and differential fixtures in one session, only during fresh bootstrap. Static ordering and SQL parsing passed; a complete fresh database bootstrap was not run locally. Rollback is `Base de donnée DLL et API/rollback/rollback_partner_resource_render_reuse.sql`, inside a transaction; it changes only the function and refuses unexpected fragment drift. Keep migration history consistent when rolling back. This SQL rollback is independent of the deferred gateway application changes.

## Remaining HLO costs: read-only analysis on 2026-10-19

The user requested analysis and a proposal only. Three GPT-6.1 Sol agents profiled the current deployed implementation, inspected SQL/query planning and reviewed the batch/gateway and JSON helpers. This phase changed no production function, data, API or persistent setting. All database sessions used bounded READ ONLY transactions and ended with ROLLBACK; tracking and plan-cache settings were session-local. No resource payload or credential was saved in the reports.

### Cost profile

The same 50 published, non-test HLO IDs were used with service-role claims and French localization, one warm-up and three measured executions per scenario. Median server execution was **1,003.705 ms full** and **894.858 ms without render**. Transaction-local function-statistic deltas were captured around individual calls, following PostgreSQL's distinction between inclusive total time and self time ([statistics documentation](https://www.postgresql.org/docs/current/monitoring-stats.html)).

| Work observed in full50 | Time | Interpretation |
| --- | ---: | --- |
| `strip_markdown` | 117.79 ms | Self time, 230 calls |
| `compose_object_resource_blocks` | 94.19 ms | Inclusive time, 50 calls; includes its child helpers |
| `jsonb_pick_keys` | 48.57 ms | Self time, 450 calls; already included in the composite above |
| `current_user_test_realm` | 28.00 ms | Self time, 50 calls |
| `i18n_pick` / `i18n_pick_strict` | 28.33 / 21.17 ms | Self time, 3,240 / 4,285 calls |

Projection comparisons against `fields:[], render:false` (91.167 ms) gave approximate incremental costs: descriptions +146.492 ms; sustainability actions plus legacy labels +119.489 ms; the four previously optimized blocks +112.954 ms; external/web/language/organization/membership links +68.582 ms; taxonomy +67.636 ms; rooms +50.583 ms; location/place data +43.911 ms; classification/labels +22.345 ms; actors +15.542 ms; prices/discounts/group policies +15.085 ms. These figures are not additive or an exact partition of full latency: payload size, composition and plans change with projections. Opening times and some relations execute even with an empty field projection; their near-zero projection delta does not establish a near-zero cost.

The real page RPC was compared with its batch builder using exactly the same 50 page IDs and options; output data were deep-equal in memory. Three alternating pairs gave median page 991.012 ms and batch 978.511 ms; the median paired overhead was 13.799 ms, with a range from −93.689 to +257.448 ms. Noise dominates this small difference. Pagination is therefore not the next demonstrated bottleneck on the current HLO population.

### Assessed and deferred: bypass redundant JSON recomposition

Decision after the architecture/history review: **retain the current composition call**. This optimization is not indispensable after the timeout correction, and bypassing an explicitly documented extension point adds maintenance risk for a modest, still provisional gain. The user requested an all-type audit before any further optimization. The evidence below records the candidate analysis, not an implementation decision.

Immediately before returning a resource, `get_object_resource` calls `api.compose_object_resource_blocks(js)`. It divides an already-built object into nine selections, then concatenates those selections and the remaining keys. It performs no authorization or value transformation.

Static inspection and live definition checks established that the selections cover all 57 keys removed by the remainder helper. They select 58 distinct keys; `commercial_visibility` is selected and also retained in the remainder, with the same value. Thus every key and value of an object is preserved, including unknown keys, JSON nulls, nested arrays and nested objects. SQL NULL is preserved too. At this call site, `js` can only be an object or SQL NULL, as established by its construction and final `jsonb_object_agg`/pruning steps.

Read-only checks confirmed the identity for **524 synthetic objects**, SQL NULL, and recomposition of all **472 published HLO outputs**. The real-output checks alone demonstrate idempotence; the key-coverage proof and synthetic tests establish why the transformation is an identity for arbitrary object payloads. No modified resource function has been installed or benchmarked in this phase.

An isolated five-pair benchmark on the same 50 real payloads, retained only in memory, measured JSON aggregation with recomposition at **93.778 ms**, versus direct aggregation at **11.038 ms**. The measured difference is **82.740 ms**. Together with the inclusive function profile, this supports a provisional saving of roughly **80–95 ms per 50 HLO, around 8–9% of the measured SQL time**. This is a candidate estimate, not a verified full-route improvement.

Previously considered scope (deferred): remove only the internal `js := api.compose_object_resource_blocks(js)` call from `get_object_resource`. Public helper functions and signatures would remain unchanged: the composite is not generally an identity on scalar/array inputs, so replacing its global behavior would be a different contract change. No cache, expiry mechanism, field removal, permission shortcut or new API parameter was proposed. However, future transformations added to a helper would no longer run in this resource path; preserving the helper's existence alone does not preserve that architectural relationship.

If this candidate is ever revisited, first resolve that architecture decision explicitly, then capture the original function, apply the one-call bypass in an isolated test, and compare complete JSON for all published types, languages, projections, empty/null cases and authorized private-data fixtures. Run the existing security suites, verify metadata/ACL preservation, then measure at least seven alternating full50/full100 pairs plus render-disabled and mixed-type scenarios. Measure the actual page RPC with identical IDs/options. The earlier render regression results and the read-only audit below do not substitute for candidate-specific testing.

### Second candidate: reduce repeated SQL planning

The sustainability projection contains only four actions on one of the 50 sampled objects, yet costs about 119 ms extra. Extracted SELECT plans on an empty HLO showed custom planning around 0.85–0.93 ms for actions and 1.37–1.46 ms for legacy labels, versus roughly 0.02 ms each when reusing generic plans after warm-up. Existing indexes were used; no missing index was demonstrated. PostgreSQL documents the trade-off: generic plans avoid replanning while custom plans can better exploit specific parameter values ([PREPARE documentation](https://www.postgresql.org/docs/current/sql-prepare.html)).

A separate READ ONLY experiment varied only `SET LOCAL plan_cache_mode`, with five rotating rounds on the same connection and snapshot:

| 50 HLO | Automatic selection | Forced generic | Forced custom |
| --- | ---: | ---: | ---: |
| Full | 1,010.056 ms | 865.761 ms | 3,290.966 ms |
| Render disabled | 855.589 ms | 733.262 ms | 2,274.117 ms |

Generic plans improved every full pair; the median paired improvement was 14.70% (ratio of medians: 14.29%). The 50-resource JSON aggregation hashes matched between modes for full and render-disabled calls. This supports further targeted investigation, but does not establish behavior or performance across other types, rich fixtures, searches, languages and authenticated scopes. Do not adopt a database-wide setting from this sample. A narrowly scoped internal query/function treatment remains an investigation candidate; no change is authorized or scheduled by this report. The two measured opportunities must not be added arithmetically as a combined gain.

Description reuse is a subsequent candidate: the primary description and descriptions array often translate and strip the same row twice. Reuse per selected row/language must retain organization fallback, visibility and array order. A Markdown fast path would need to preserve the current exact whitespace, escape and control-character behavior; it is more complex than bypassing the identity composite. Taxonomy likewise repeats closure paths but is a smaller measured cost now; its descendant index already exists. A full set-based serializer rewrite remains a larger change than the evidence currently requires.

Aggregate evidence: ignored `.tmp_hlo_cost_profile_report.json`, `.tmp_hlo_plan_cache_report.json`, `.tmp_hlo_compose_analysis_report.json`, and `.tmp_hlo_page_overhead_report.json`. The gateway optimizations from the earlier step still await the application deployment deferred by the user; this analysis does not treat those local changes as active production HTTP behavior.

## All object types: assembly audit on 2026-10-19

Three GPT-6.1 Sol agents reviewed the complete type inventory, type-specific builders, common blocks and callers. The parent verified the deployed definitions and exercised the existing production and test corpora in bounded `REPEATABLE READ READ ONLY` transactions, each ended with `ROLLBACK`. No function, application code, data, fixture or persistent setting was changed. Diagnostic files contain aggregate counts only; payloads and identities stayed in memory.

### Coverage of the 19 types

The live enum, partner validator and database type map agree on 19 codes. Every published non-test object was evaluated under partner-style `service_role` claims without a user identity. The existing test corpus was evaluated under `authenticated` with a real active membership in a test organization, using the existing realm guards. The test realm was verified true and zero production objects were visible under that role. No test identity or object was created.

| Type | Published production checked | Existing test objects checked | Type-specific content/path in addition to the common blocks |
| --- | ---: | ---: | --- |
| RES | 133 | 15 | Menus/items, cuisine, dietary tags, allergens, menu documents |
| PCU | 2 | 15 | Common modules |
| PNA | 0 | 15 | Common modules |
| ORG | 2 | 1 | Common resource; organization has additional linkage roles in other wrappers |
| ITI | 0 | 15 | Detailed itinerary, profiles, practices, sections, stages/media, associated objects, GeoJSON, summary/status and optional GPX/KML |
| VIL | 0 | 15 | Common modules |
| HPA | 2 | 15 | Room types and meeting rooms |
| ASC | 0 | 15 | Activity facet |
| COM | 6 | 15 | Common modules |
| HOT | 8 | 15 | Room types and meeting rooms |
| HLO | 472 | 15 | Room types and meeting rooms |
| LOI | 88 | 15 | Meeting rooms |
| FMA | 0 | 15 | Event, occurrences, RES/FMA menu path and cuisines of associated restaurants |
| CAMP | 1 | 15 | Room types and meeting rooms |
| PSV | 20 | 15 | Common modules |
| RVA | 0 | 15 | Room types and meeting rooms |
| ACT | 64 | 15 | Activity facet |
| SPU | 1 | 15 | Common modules |
| PRD | 41 | 15 | Common modules |
| **Total** | **840 / 13 types** | **271 / 19 types** | **1,111 distinct existing objects** |

The table identifies builders and allowed facets, not a promise that every field is populated. The existing test corpus actually exercised room types on all 75 accommodation objects, meeting rooms on 35 accommodation objects plus 15 LOI objects, menus on 15 RES objects, activity on 15 ACT and 15 ASC objects, and event/occurrence blocks on 15 FMA objects. Its 15 ITI objects contained 15 GeoJSON tracks, 60 stages, 60 stage-media rows and 90 profiles, but **zero sections**. No populated FMA menu or restaurant-menu-document case was observed in these corpora.

### What the assembly does for every type

1. `get_object_resource` first evaluates object access and realm, then constructs common data: identity, descriptions/localization, contacts, media, capacities, amenities, prices, classifications, taxonomy, actors, legal information, places, sustainability and organization links. Field visibility is handled within those builders, including the separate actor-contact permission.
2. Specialized branches build ACT/ASC activity, ITI details and summary/track, RES/FMA menus, RES menu documents and FMA restaurant-cuisine enrichment. Room, meeting-room and event queries are selected by `fields`, without their own object-type condition; applicability is primarily enforced at write time. Thus an empty result can be an intentional part of a full resource.
3. The optional `render` object formats display values. Finalization removes top-level JSON nulls, adds opening times, applies optional `omit_empty`, and calls `compose_object_resource_blocks`. These distinct steps must not be conflated.
4. The final composer selects existing keys into nine named blocks plus `misc`, then concatenates them. All 57 keys removed by `misc` are covered by the named blocks (58 selected keys). The same composer runs for every type, without an ITI/FMA/RES or other type branch. `activity` belongs to the named itinerary block; unclassified keys such as `room_types` remain in `misc`.

Code references: `api_views_functions.sql:3012` (resource), `:3751` (ACT/ASC), `:4234` (meeting rooms), `:4271` (room types), `:4337` (FMA), `:4644` and `:4790` (ITI), `:4845` (RES/FMA), `:5043` (RES), `:5067` (FMA enrichment), `:5134` (render), `:5486` (finalization), `:2982` (composer). The live helpers match these canonical definitions. The live resource differs from the canonical file only by two actor-realm guards introduced by `20260907073235_actor_test_realm_isolation.sql`, applied later by `ci_fresh_apply.sql`; comparison after accounting for those guards matched.

### Executed checks and their limits

- All **1,111 full resources** returned an object of the expected type. Reapplying the current composer changed none of their JSON values. This checks idempotence of existing outputs; it is not a before/after test of a modified serializer.
- On the largest full payload per type in each corpus (**13 production + 19 test representatives**), six additional scenarios exercised `render:false`, empty `fields` with render disabled, `omit_empty`, English, an unavailable language and render explicitly re-enabled through `include`. Across these **192 calls**, every resource was non-null and recomposition preserved its JSON. The two render comparisons additionally established exact equality of non-render data and equality to the original full result when render was re-enabled.
- On the same **32 representatives**, the `object` inside `get_object_with_deep_data` equaled the direct resource. This checks that shared inner resource, not every additional relationship in the deep-data envelope.
- The richest test ITI was checked with **GPX and KML, with and without stages**. Each returned a nonempty track and identical other data after excluding the two intentionally varying fields `itinerary.track` and `itinerary.track_format`. An initial diagnostic excluded only `track`, producing an expected false difference on `track_format`; the corrected targeted rerun confirmed all four cases. It did not validate the entire GPX/KML schema or every geometry edge case.
- `fields` is **not a uniform final projection**: empty `fields` still emits relations/opening times, ITI blocks, populated ACT/ASC activity and type-specific restaurant/menu branches. This behavior was confirmed in both corpora and must be preserved unless the API contract is intentionally revised.

No new latency benchmark or end-to-end HTTP test was performed in this audit. It verifies deployed SQL behavior across the two contexts above, not every authorization persona, private-data option, translation, projection combination or possible nested dataset. At this stage, absent itinerary sections and other unpopulated combinations were coverage gaps; the separate local test below now covers populated sections. Existing fixture/security suites were inspected, not executed, to keep this phase strictly read-only.

**Decision retained:** preserve the composition architecture and perform no further optimization in this phase. HLO-only measurements are insufficient to approve a shared serializer change.

Aggregate evidence: ignored `.tmp_all_types_assembly_audit_report.json`, `.tmp_all_types_assembly_test_audit_report.json`, `.tmp_itinerary_formats_audit_report.json`; read-only diagnostic `.tmp_all_types_assembly_audit.cjs`.

## Populated itinerary sections: isolated local verification on 2026-10-19

The user requested coverage of populated sections **without modifying production**. A separate PostgreSQL instance was created inside the ignored workspace directory `.tmp-iti-sections-local`, listening only on `127.0.0.1:55439`, with database `bertel_iti_sections_audit`. Its PostgreSQL binaries were copied from the installed version; PostGIS came from the [official Windows binary distribution](https://postgis.net/documentation/getting_started/install_windows/released_versions/), with the archive checksum checked. The existing machine installation was not modified.

Production was used only for a **schema-only export** and catalog reads. The export process set `default_transaction_read_only=on`; subsequent catalog comparisons used explicit `BEGIN READ ONLY`. No production data, users, memberships, sections or itineraries were copied or changed. The local instance restored the deployed schemas, actual functions, constraints and triggers, rather than mocking the resource or geometry functions. Local grants and the two required ITI facet-applicability entries were bootstrapped separately.

### Executed test and evidence

Persistent test: `Base de donnée DLL et API/tests/test_iti_sections_assembly.sql`.

- **487 function definitions** in `api`, `internal`, `auth` and `public` matched the production catalog: body hash, `SECURITY DEFINER` flag, volatility and function settings. Extension-owned functions were excluded. This comparison does not assert equality of role memberships or all function ACLs.
- The fixture creates **three synthetic ITI objects**: one with six sections, one with a single witness section, and one without sections. The six sections are inserted out of expected order. Explicit expected UUID ordering independently checks position, name, creation date and ID tie-breakers.
- Stored section values are preserved exactly, including raw names, NULL versus empty names, `name_i18n`, nested `extra` and a LINESTRING geography. Only `parent_object_id` is omitted. A section from another parent cannot enter the tested itinerary.
- **21 language/option combinations** cover French, English and unavailable-language fallback; full/default output; render disabled/re-enabled; empty or name-only `fields`; and `omit_empty`. The checks cover exact section JSON, recomposition, empty nested arrays, single and batch deep-data wrappers, parent/order isolation and render enablement.
- Four additional GPX/KML cases, with `include_stages` false/true, produce nonempty tracks while preserving all section data. These fixtures do not contain stages, so this does not establish the effect of stage inclusion, styling or full XML validity.
- **131 assertions passed**. Fixture writes were rolled back locally; subsequent counts were **zero objects, zero sections and zero itinerary rows**.
- The test refuses execution unless the database name, TCP loopback address and explicit `bertel.local_sections_audit=on` session flag all match. A negative run without that flag was verified to refuse execution before inserting fixtures.

The diagnostic was independently reviewed by a GPT-6.1 Sol agent. The expected section values derive from stored rows, so this verifies conservation, ordering and assembly rather than independently defining a new business serialization format.

### Scope and reproducibility

The local engine was **PostgreSQL 17.10 / PostGIS 3.5.3**; production was **PostgreSQL 17.6 / PostGIS 3.3.7**. The application function definitions matched, but this is not a proof of identical geometry serialization across engine versions. The test exercises `service_role` with synthetic published objects, not every authenticated/private-data permission path. No optimization or production deployment occurred. The isolated server was stopped after verification.

After restoring the schema and preparing local grants/applicability, the test runs with `psql -X` against the explicitly named loopback database, setting `bertel.local_sections_audit=on` in that same session. The SQL file retains its own `BEGIN`/`ROLLBACK` and rejects a general-purpose database target. No test is intended to run against the production connection or its test corpus.

Aggregate evidence: ignored `.tmp_iti_sections_verification.json`; local execution/negative-guard logs under `.tmp-iti-sections-local/`. The populated-sections coverage gap identified in the preceding audit is now covered within these stated limits. Remaining content/permission gaps elsewhere in that audit are unchanged.
