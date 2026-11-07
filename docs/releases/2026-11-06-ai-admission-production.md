# AI admission schema applied — 6 November 2026 UTC

One reviewed MCP operation installed the admission schema. The actual receipt is
`20261106200353_distributed_ai_request_admission.sql`; no timestamp was invented
and the old 145451 version was never recorded or replayed.

| Artifact | Verified identity |
| --- | --- |
| Fresh source, original 3,205 bytes | SHA256 `3d618baf364e2ad281393177bbebf118208ed1e196c207bd0e4626106373139b` |
| Applied guarded DO, 10,049 bytes | SHA256 `43e2a719e8b4ac7112a32df09beb84042d5f51d265a640ce3dc921d8da4f44f0` |
| Actual receipt, one statement | MD5 `e0f6882b08d44126fb9eb752df329df1`, equal to the raw applied DO |

The preflight at 20:02:52 UTC verified the 191-version ledger fingerprint, absence
of the target, execution role, prerequisites/default privileges and service usage
of api/internal. The guarded operation repeated its target-state checks and
schema/security postconditions inside one DO. There was one intentional call,
followed by a successful response and read-only reconciliation at 20:05 UTC.

The ledger then held 192 entries with the 191 previous entries unchanged and
145451 still absent. Function body/security/search_path, table columns and four
constraints, RLS with no policies, service-only permissions and ordinary-role
denials matched. Service usage of api/internal was rechecked. A common creating
transaction ID for table/function/receipt was observed in this run; it is not
claimed as a general Management API atomicity contract.

No quota RPC, quota-row read, Auth fixture, email or paid AI call was used. The
application was not deployed by this schema operation, so distributed protection
must not be asserted until every server runs the updated admission caller.

The exact DO request is versioned under the real receipt, including its historical
preparation header. The separate fresh source preserves every original byte;
only its outer BEGIN/COMMIT are omitted inside the upgrade envelope. The fresh
manifest uses the source, never the guard bound to the 191-version production
snapshot. The obsolete 145451 file and prepared-template path are removed from
active upgrades without modifying remote history. File attributes preserve the
reviewed bytes across checkouts. No global `db push` or replay is part of this
record, and the additive schema remains in place during an application rollback.
