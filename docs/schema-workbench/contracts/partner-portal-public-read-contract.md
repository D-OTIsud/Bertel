# Partner portal: activity and public restaurant reads

Prepared on 2026-11-03. No production migration or data test was run for this change.

R1 adds the existing office detail `object_act.equipment_provided_details` and removes
that key from `api.get_object_resource` in the same transaction. The key stays **absent**,
including when its SQL value is NULL. All other JSON keys, labels, types, values and array
orders remain unchanged. Office table reads/writes retain the new nullable text.

R3a filters only public content: active menus, available dishes, and public cards whose
link and document dates are valid (inclusive date bounds). Existing extended object scope
retains the complete menu/card data. `service_role` alone does not create extended scope.
There is no RLS change here. R3b remains dependent on the safe office menu writer.

Card URL, title fallback, validity keys and ordering are preserved. Removing a card from
the public response does not revoke an already-public file URL. Public empty arrays remain
`[]`. RES and the shared FMA reader keep the same envelope; no new FMA authoring is enabled.

X1 excludes reception/service in the prepared regional export's primary opening join.
It does not create or activate the optional serializer when absent. The corrected canonical
source is used for fresh installation; the new migration upgrades only its known predecessor.

## Strict migration order

After the historical reader patches (whose final normalized prosrc MD5 is
`523b18abc402528c494e25f3895f2912`), apply:

1. `supabase/migrations/20261103065333_partner_portal_activity_api_contract.sql`
   — resulting reader MD5 `fc810940fc3fff5db7d3068563e924a2`.
2. `supabase/migrations/20261103065350_partner_portal_restaurant_public_read_contract.sql`
   — resulting reader MD5 `c344c79a5cbda390def03d9c2da5b31e`.
3. `supabase/migrations/20261103065411_partner_portal_regional_primary_openings.sql`
   — optional regional reader, source `f124fc6099dc2373bcf3a32aaead4fc5`,
   target `e4d112b4f34528f2412065d3802cbe0d`.

Each patch stops on an unknown definition and preserves signature, owner, ACL, SECURITY,
volatility, strictness, parallelism and search_path. R1/R3a notify PostgREST after a successful
transaction. R1 may be re-run on its own target, but must not be replayed after R3a: that newer
reader intentionally fails the older guard. Do not replay the fresh-install manifest in production.

## Disposable SQL and real-route fixtures

All fixture scripts require `PGOPTIONS='-c bertel.ephemeral_ci=on'`. They must only run against
the isolated CI Supabase. They intentionally refuse ordinary connections. Never use production,
even with ROLLBACK. The setup commits the fixtures so real PostgREST/Next routes can share them.

Upgrade sequence (one disposable database, not a clone of all production data):

1. Build the historical schema. Restore/check the exact reviewed reader above and, **only in
   the disposable upgrade database**, remove the detail column to reproduce the live R1 absence.
2. Run `tests/setup_partner_portal_api_contract.sql` before R1/R3a. It captures actual SQL
   responses for six database principals, seven fixtures and FR/EN/no-render variants.
3. Apply R1; run `tests/test_partner_portal_activity_api_contract.sql`.
4. Apply R3a; run `tests/test_partner_portal_public_read_contract.sql`.
5. Apply X1; run `tests/test_partner_portal_regional_primary_openings.sql`.
6. Run real-route integration while fixtures persist; then run
   `tests/cleanup_partner_portal_api_contract.sql`.

Fresh sequence: apply the complete final manifest and the three migrations, then setup,
both API SQL tests, X1 SQL test and real-route integration. Cleanup allows reseeding the same
setup for a later HTTP step. Historical tests must finish before these persistent fixtures.

`internal.portal_api_contract_reader_before` records definition/hash and reader metadata.
`internal.portal_api_contract_baseline` records principal, role/claims, inputs, actual pre-change
JSON and the exact expected post-change JSON. Its oracle removes only named fixture IDs and
the one R1 key; all other subtrees are compared recursively with JSONB equality. Fresh historical
SQL already had the undeployed detail column, so setup explicitly normalizes only that key.
A real upgrade baseline with the column absent needs no such adjustment. This is not a blanket
exception for the activity or menu subtree.

Shared persistent IDs:

- ACT with/without row: `ACTRUN999999B101`, `ACTRUN999999B102`.
- ASC with/without row: `ASCRUN999999B103`, `ASCRUN999999B104`.
- RES complete/empty: `RESRUN999999B201`, `RESRUN999999B202`.
- FMA empty shared reader: `FMARUN999999B203` (the current facet contract permits menus only
  on RES; the test does not weaken that contract to manufacture FMA rows).
- Office/other office/actor/superuser accounts: UUIDs
  `00000000-0000-4000-a000-00000000b911` through `...b914`.

Exact public exclusions on complete RES:

- Inactive menu `00000000-0000-4000-a000-00000000b212` and its dish `...b223`.
- Unavailable dish `00000000-0000-4000-a000-00000000b222`.
- Private/partners menus `...b213`/`...b214` were already filtered by the existing reader.
- Card IDs `00000000-0000-4000-a000-00000000b232` through `...b236` (link dates, document
  dates, or private scope). `...b231` and inclusive-current-day `...b237` remain byte-for-byte
  equivalent as JSON values. The valid document has a second link to prove it is not deleted.

## Isolated full-page performance budget

The CI upgrade scenario measures the same 100 published restaurant resources before
and after R1/R3a. Each has a menu, two dishes and two document links, including content
that the public correction must remove. One warm-up and five timed service-role SQL
calls use `view=full`, `page_size=100` and a fixture-specific search. The row count is
asserted, so a fast empty result cannot pass. A local materialized-view refresh makes
the synthetic objects visible to the list path.

The median after the patch must stay below the larger of 1.5 times the original median
and the original median plus 100 ms. This allows shared-runner timing noise while
stopping a material regression. Both sample sets and the budget appear in CI output.
This is a controlled SQL comparison, not a promise about production network latency;
the real route integration separately verifies the complete 100-row request path.

## Rollback

Disable a failing new domain without restoring the old disclosure. Keep the office column and
data. Reader snapshots are evidence, not an instruction to reintroduce private/inactive content.
Restore only a reviewed safe reader with matching ACL, or temporarily suppress the affected
public content while retaining its existing keys/empty-array conventions. Never remove a shared
document, published file or operation as an automatic response to a lost HTTP acknowledgement.
