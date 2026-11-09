# Partner selections — targeted live-production supplement, 9 November 2026

This adds one function to the complete production catalogue captured on
8 November 2026 at `2026-11-08T17:51:10.274935+00:00` (ledger 212).
It preserves every pre-existing graph node and edge. It is **not** a complete
catalogue refresh or a replacement with the older 6 November snapshot.

The new function's production metadata was read through the Bertel Supabase
connector at `2026-11-09 06:00:31.011316+00`; body-free evidence is in
[PARTNER_SELECTION_RPC_CATALOG.json](PARTNER_SELECTION_RPC_CATALOG.json).

- Migration: `supabase/migrations/20261109055511_partner_selection_objects.sql`.
- RPC: `api.list_partner_selection_objects_with_vocabulary`, returning `jsonb`;
  its complete argument signature and defaults are recorded in the capture.
- `STABLE`, `SECURITY INVOKER`; fixed search path
  `pg_catalog, public, api, internal, extensions, pg_temp`.
- Body MD5: `b39369e86bff568b267e832da825dfe9`.
- Direct EXECUTE grants: `postgres`, `service_role`. Effective EXECUTE checked
  for `service_role` (true), `anon` (false), `authenticated` (false).
- Direct table reads detected by the existing graph regex:
  `public.object`, `public.object_iti_practice`, `public.object_location`.
  Indirect filter, serializer and vocabulary reads are not expanded into edges.

`graph.json`, `FUNCTIONS.md`, `FUNCTION_ACCESS.md` and `DB_AGENT_INDEX.md`
include this addition: **671 functions, 6,409 edges**. All earlier nodes, edges,
partitions and other metadata were checked against the deployment worktree's
`HEAD` before adding the one node and three read edges.

No function body is included in the committed graph or evidence file. Per-table
tbls docs, other derived views and `docs/api-db-reference.html` retain their
existing catalogue-212 provenance. No table, policy or existing function was
changed by this documentation update.

A future full refresh must use a complete live catalogue and distinguish its
capture timestamp from this targeted observation. Do not replace the catalogue
with a reduced test database or relabel an older capture as current production.
