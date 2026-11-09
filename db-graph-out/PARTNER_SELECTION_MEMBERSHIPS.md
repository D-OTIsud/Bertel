# Optional general-list selection memberships — production catalogue supplement

Membership supplement captured at 2026-11-09T10:09:29.58167+00:00: two service-only STABLE SECURITY INVOKER functions, migration 20261109100741 (ledger observed: 216). Baseline 212 and previous supplements remain unchanged; this is not a full refresh. See [PARTNER_SELECTION_MEMBERSHIPS.md](PARTNER_SELECTION_MEMBERSHIPS.md).

Metadata only, read via Bertel Supabase MCP; no function bodies or business rows captured. Four existing reader/core hashes are unchanged. All baseline nodes/edges are retained, in their original order. Only two functions and their inferred direct reads are appended. The table metadata in the JSON was observed but does not replace the baseline table node or per-table documentation.

| Function | Body MD5 | Effective EXECUTE |
|---|---|---|
| `api.list_partner_objects_with_selection_ids` | `8981d8b7c9a36e8092f195fbfb46084e` | service_role only |
| `internal.partner_selection_memberships` | `5c784398738396df1fdc16484b64285e` | service_role only |

See [body-free catalogue evidence](PARTNER_SELECTION_MEMBERSHIPS_CATALOG.json). SQL installation is attested; this capture does not attest application deployment or HTTP activation. Membership may change without object.updated_at changing. Other derived views, graph.html and table docs retain their previous provenance.
