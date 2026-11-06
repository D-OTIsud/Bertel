# AI admission — production catalogue, ledger 192

This supplement uses the fresh PostgreSQL 17.6 production catalogue captured
between **2026-11-06 20:23:04 and 20:31:56 UTC**. Before/after checks find 192
migration receipts, including **`20261106200353`**.

The targeted production postflight at **20:05 UTC** observed the guarded DO under
that real version; the version number is not an independently measured apply
time. Its exact bytes are tracked in the
[applied upgrade](../supabase/migrations/20261106200353_distributed_ai_request_admission.sql).
The [fresh canonical source](<../Base de donnée DLL et API/ai_request_admission.sql>)
remains the original reviewed bytes and is distinct from that DO envelope.
See the [production record](../docs/releases/2026-11-06-ai-admission-production.md).
The original `20261106145451` receipt is absent; neither source was replayed for
this documentation refresh.

The complete schema graph is derived from the later production capture, rather
than the earlier reduced local catalogue. The paginated capture is **not a
single transaction snapshot**. A separate physical-RLS metadata extension was
captured at **20:38:35 UTC**, guarded by the same schema fingerprint and ledger;
it does not redate the earlier function/ACL capture.

## Physical metadata observed

- `internal.ai_request_rate_state`, owned by `postgres`: primary key
  `(user_id, route)`; non-null `user_id uuid`, `route text` and
  `hits timestamptz[]`, with an empty-array default for `hits`.
- FK `user_id → auth.users(id) ON DELETE CASCADE`; route constraint allows
  `translate` and `menu_extract`; the array constraint permits at most 12
  non-null elements.
- RLS is **enabled**, FORCE RLS is off, and the table has **zero policies**.
  As for all 433 relations, the graph uses the directly observed RLS flags
  for this table, rather than inferring RLS from the presence of policies.
- Table ACL: `service_role` has SELECT, INSERT and UPDATE; the recorded effective
  privileges for `anon` and `authenticated` deny SELECT, INSERT, UPDATE, DELETE
  and TRUNCATE. The owner is `postgres`; no PUBLIC table grant is present.
- `api.admit_ai_request(p_user_id uuid, p_route text) RETURNS jsonb` is owned by
  `postgres`, SECURITY INVOKER, VOLATILE, with fixed
  `search_path=pg_catalog, pg_temp`. Its EXECUTE ACL grants `postgres` and
  `service_role`; PUBLIC, `anon` and `authenticated` have no EXECUTE privilege.
  Its body fingerprint and these relation/function/ACL attributes agree before
  and after the catalogue capture.

The source describes sliding-window admission for the two server routes
`/api/ai/translate` and `/api/menu/extract`, via
[`src/lib/ai-admission.server.ts`](../bertel-tourism-ui/src/lib/ai-admission.server.ts).
Those source semantics and the observed catalogue are separate from runtime
qualification: this refresh executed **no admission RPC**, read **no quota-state
rows**, created no quota fixture and made no database mutation. It does not
certify a new quota, concurrency, application or partner-API acceptance run.

See [DB_AGENT_INDEX.md](DB_AGENT_INDEX.md) for the complete capture scope,
reference-value privacy boundary and stability checks.
