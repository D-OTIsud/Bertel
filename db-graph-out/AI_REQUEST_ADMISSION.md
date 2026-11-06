# AI admission — targeted production postflight, 6 November 2026 UTC

This targeted supplement describes the fresh source
`Base de donnée DLL et API/ai_request_admission.sql`, originally reviewed as
`20261106145451_distributed_ai_request_admission.sql`. Production received the
guarded DO under real version `20261106200353` at 20:03:53 UTC; its exact request
bytes are now the upgrade file. The fresh source remains the original bytes.
See the [production record](../docs/releases/2026-11-06-ai-admission-production.md).
This supplement is a targeted postflight, not a full schema extraction.

- `internal.ai_request_rate_state`: primary key `(user_id, route)`;
  `user_id uuid` FK `auth.users(id) ON DELETE CASCADE`;
  `route text` allowlist `translate`, `menu_extract`;
  `hits timestamptz[] NOT NULL`, cardinality at most 12 and no NULL element.
- RLS enabled, no client policies/grants. `service_role` receives SELECT, INSERT,
  UPDATE and schema USAGE; ordinary `anon`/`authenticated`/PUBLIC have no table
  grants. Supabase's service role bypasses RLS; native tests use that actual role
  attribute and explicitly assert `current_user=service_role`.
- `api.admit_ai_request(p_user_id uuid,p_route text) RETURNS jsonb`:
  SECURITY INVOKER, search_path `pg_catalog,pg_temp`, EXECUTE only service_role.
  Reads/writes only the rate-state table; FK validates that the Auth user exists.
  Returns `allowed`, `remaining`, `retry_after`. Atomic strict sliding12/60s.
- Server callers: `/api/ai/translate` and `/api/menu/extract`, through
  `src/lib/ai-admission.server.ts`, after verified Auth/sandbox checks.
- No text/image/key/provider payload, email quota, ORG permission or notification
  state is stored or modified by this component. Expired entries are filtered
  when that key is next admitted; no retention/purge schedule is introduced.

At 20:05 UTC, the real ledger contained 192 versions and the 191 earlier entries
were unchanged. Body/signature, schema, RLS, role permissions and service access
to both api/internal matched the reviewed target. No admission RPC or quota row
was used for this postflight. The application rollout was still pending.

A complete live graph refresh is tracked separately. Do not replace the full
graph with the reduced native test substrate.
