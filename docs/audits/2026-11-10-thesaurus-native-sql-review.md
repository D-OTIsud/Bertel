# Native dictionary SQL review — 10 November 2026

Status: all eleven findings are resolved. The exact native SQL body is qualified
by actual fresh migration/schema and complete native publication behavior execution.
The overall CI run remains failed at the separate live-catalog discovery guard;
this is not approval to bypass that integration failure. No native production
installation has occurred. No production
writes, publication, commits or overlapping SQL edits were performed by reviewer.

Reviewed candidate: `supabase/migrations/20261110201213_thesaurus_native_dictionary_adapters.sql`
and standalone mirror, against the adapter extension design, current publication/
preparation constructors, source schema/policies, and root's read-only production
function/view fingerprint capture. Expanded scope is nine adapters: six public
dictionaries (134 currently observed native rows), three private relationship-role
dictionaries (14 rows), 87 vocabulary domains and 17 source kinds after install.
Production counts are not assumed to equal fresh-seed counts.

## Concrete findings sent to implementation owner

1. Two literal patch strings closed `$old$` with `$new$`, in group-context
   validation and historical group dependency insertion. These prevent reliable
   SQL parsing/execution and must be corrected before qualification.
2. Hosted `postgres` is not superuser and retains ADMIN-only publisher membership.
   Replacing publisher-owned `activate` requires bounded inheritance and exact
   per-grantor restoration. Capture the function's complete catalog metadata and
   assert unchanged OID, owner, ACL, signature and execution settings afterward.
3. Rehashing the already modified `apply_source` into the preparation registry
   without checking its old contract first would bless unrelated writer drift.
   Validate the old preparation contract before edits; preserve every old entry
   except the explicitly reviewed writer hash, plus the nine new key contracts
   and two new membership-helper hashes.
4. The new-concept patch searched a predecessor removed by the complete-admin
   migration. Its replacement also excluded twelve already governed private
   vocabularies. Retain existing `public OR governed` authoring and add only the
   three explicitly authorized private ungoverned role domains.
5. Catalog-label preservation compared `updated_at` as invariant although the
   existing BEFORE UPDATE timestamp trigger necessarily changes it. Compare
   metadata excluding `label` and `updated_at`, with a literal nine-key write scope.
6. Shared S2/K1 locks cannot drain writers on nine sources that previously had no
   source gate. Lock these native sources before K1 and before preflight counts/
   metadata capture; retain bounded lock timeouts and consistent ordering.
7. Whole view/function replacements and literal body patches need reviewed
   predecessor hashes, not only fragment presence. Root captured eleven live
   function hashes/catalog metadata and the source view hash. Enforce those
   before changes and preserve function/view nonbody metadata afterward.
8. An independent actual PostgreSQL 17 experiment found another execution blocker:
   `pg_get_constraintdef(CHECK(num_nonnulls(a,b)=1))` returns
   `CHECK ((num_nonnulls(a, b) = 1))`. The candidate's
   `LIKE 'CHECK (num_nonnulls(%'` is false, so its STRICT predecessor query finds
   no constraint. Match the exact canonical old eight-column expression instead.
9. Full fresh CI then reached the admin context constructor and found an exact
   fragment mismatch: its CASE expression occurs inside `VALUES`, followed by
   `,v.source_kind`, not a semicolon. The reviewer corrected only the old/new
   literal anchors in both SQL copies, retaining exact full-body fingerprint and
   single-occurrence checks.
10. Metadata was installed under actual ledger version `20261110195115`; the
    prepared native filename `20261110190229` consequently sorts before its required
    metadata predecessor. The explicit standalone fresh manifest masks this order.
    The Supabase CLI allocated `20261110201213` after the applied metadata entry;
    the reviewed SQL body was moved into that native migration. The applied
    metadata ledger remains unchanged. Align this filename with the real native
    ledger version after installation.
11. A real behavioral-test failure exposed planner-reordered casts of mixed-kind
    `source_id` values, including commune `97406`. The migration audit found one
    similarly unnecessary cast in its identity preflight. It now compares the
    exact JSON object using `jsonb_build_object('id',s.source_id)`; UUID-native
    source arms already derive canonical text from their typed UUID IDs. A bounded
    production constant SELECT confirmed UUID/text JSON serialization equality.
    All remaining source-ID UUID casts are inside source-kind CASE branches.

The reviewer reproduced item 8 in a newly created, independently identified
temporary PostgreSQL 17 cluster bound to loopback, verified before any mutation.
The table creation rolled back and the cluster stopped/was removed afterward.
No existing database, archived harness or production connection was used.

## Corrected candidate reread

Migration and standalone mirror after the item-11 preflight correction are
byte-identical, SHA-256
`0d44a607d218191089779cc5eff15cf989fcec84981492075f000ccecb771f67`.
The reviewer re-read the actual corrected SQL. It now pins eleven normalized
function predecessors plus the view, preserves all twelve existing function
metadata snapshots and the view metadata, validates the old preparation contract
before changes, and attests the new contract before commit. All temporary
publisher grants restore the complete per-grantor membership catalog exactly.
The old eight-column one-of constraint is identified by its original name and
compared with the complete PostgreSQL canonical definition before replacement.
Catalog timestamp triggers remain enabled normally; only label/timestamp are
excluded from the nonlabel-metadata comparison. No concrete native code blocker
remains; actual native runtime qualification is recorded below. Overall integration
qualification still requires a globally green fresh-apply run.
The integration candidate also replaces a reserved catalog alias found by root.
To avoid repeated CI-only discovery, the reviewer generated a bounded read-only
production query from all seventeen old-fragment guards. It returned only block,
signature and occurrence count: every fragment occurs exactly once in the actual
post-metadata production body, including both admin, both renderer, usage,
historical-reference, group-validation and activation fragments. No private
function body was returned and no production mutation occurred.

### Actual native runtime qualification

The reviewer independently fetched GitHub job `130111017751` from
[SQL CI run 42896537903](https://github.com/D-OTIsud/Bertel/actions/runs/42896537903),
PR head `1fb0960d`, tested as GitHub merge commit
`b09390faa509485b43019ee175de30cdfc3bb7a2` onto `1a573650`. Its logs confirm
the exact mirrored native body above executes
and commits, the native schema regression completes, and the complete protected
native publication behavior file completes its final DO and ROLLBACK. This covers
typed identity for all nine adapters, initial group bootstrap and all native
membership edges, cross-category hierarchy preservation, protected-field refusals,
review-source overlay save/validate/preview/publish, private actor-role publication
and public refusal, and immutable old document/manifest/response checks.

The final review-source block completes at `2026-11-10T20:41:29.7550130Z`; the
private-role/frozen-history block completes at `20:41:34.1931877Z`, followed by
ROLLBACK at `20:41:34.2570033Z`. Only then does the next catalog-coverage test begin
and fail at its baseline discovery assertion, line 122, at
`20:41:34.2675902Z`. Thus native functionality passed; the overall job did not.
The independent review does not describe this run as globally green.

The root also identified production-only row/edge count assertions that reject
legitimate fresh seeds. Keep exact production evidence in deployment preflight;
the migration and fresh tests must verify native identity/shape integrity against
the actual fresh sources.

## Source-based conclusions

The proposed exposure split preserves the existing 78 vocabulary rows and legacy
allowlist. New private business roles are distinct from authorization roles and
permissions. `ref_legal_type.is_public` is a document visibility setting and remains
outside the descriptive writer allowlist. New publisher table policies/grants are
limited to the nine literal native sources; existing API-role authority is not
expanded. New helper functions revoke application/PUBLIC execution.

`review_source` lacks native definition/localization columns; the existing overlay
path can retain its French and translated definitions without adding native
columns. Capacity `unit` must remain protected: its native trigger propagates to
owned capacity rows before the late publication fence. Explicit changed-field
refusal is necessary; silently ignoring attempted changes is insufficient.

Native membership preserves action→category hierarchy/context and group→its own
category. All 239 observed group memberships, including two cross-category
memberships allowed by native FKs, remain meaningful. `member_of`/`members` are
explicit Bertel predicates, not SKOS hierarchy or invented `related` edges.
Frozen-document target scope checks and dirty closure are mandatory because
incremental publication otherwise copies old action documents unchanged.

The candidate's dependency approach can discover group-owned action usage while
preserving the existing hierarchy ancestor check. The guarded assignment function
itself should remain unchanged; regenerate complete native FK specs on affected
consumer tables, retaining their old FK arms.

## Integration/deployment qualification still required

- Re-read the final corrected migration and identical mirror; verify all findings
  are resolved and the predecessor/catalog guards run before mutations.
- Resolve the separate discovered-catalog baseline failure and pass the overall
  fresh-apply CI. Native publication behavior has passed as recorded above; the
  remaining integration guard must retain detection of genuinely unclassified
  reference catalogs.
- Preserve actual old table/source values, old vocabulary flags, private exposure,
  legacy allowlist, publisher role memberships/attributes, function identity/ACLs,
  preparation hashes, owner mutation journals and expected-release/idempotency
  semantics through the upgrade and normal publication.
- Perform normal production read-only preflight against the exact final candidate,
  then use genuine authenticated platform-superuser publication. No synthetic
  production claims, publisher bypass or historical unsafe test harness applies.

The separately completed reduced metadata PostgreSQL 17 proof establishes the
post-metadata activation prerequisite `5f62e21e531d4de49c8931f0456f5051` reported
by root. It does not itself qualify this larger native-adapter migration.

## Ordinary production content/publication sequence

After installation and its read-only postflight, use the genuine authenticated
platform-superuser session for `api.thesaurus_admin`. An ordinary `workspace`
request with `read_only:false`, `include_internal:true`, `include_revisions:false`
and `page_size:1` synchronizes source identities/typed links without changing any
native content, localization overlay, governance or release. This seed request
matters: the proposal CLI deliberately uses read-only workspace requests and the
adapter migration deliberately creates no canonical concepts.

Load each new domain through read-only workspace, match reviewed native UUIDs to
the exact typed source tuple and canonical concept UUID, and bind fresh source
fingerprints. Save all 148 private drafts and validate them using ordinary batches
of at most 100, preserving version/conflict preconditions and existing drafts.
Preview the complete set, then publish all 148 together with the exact validated
revision versions, preview fingerprint, current expected release and a unique
idempotency key. No direct native UPDATE or synthetic user claim is needed.

The existing `publish` action calls `activate(ids,NULL,...)`. Activation validates
each revision, automatically governs every represented domain, applies native
descriptive text and required localization overlays, then validates the complete
new snapshot before commit. Therefore one ordinary publication can introduce all
134 public dictionary concepts and freeze the 14 private role concepts privately.
An explicit bootstrap is unnecessary. Bootstrap calls `activate('{}',domains,...)`
and does not combine supplied revision IDs; using it before content publication
would fail the required-definition checks or publish unenriched source content.

The first publication's `changed_count` includes additional frozen relationship
changes on existing member-action/category documents. It is not simply 148.
Compare the old 1,477 labels/definitions separately from additive membership and
category `narrower` metadata. Verify every native membership, both cross-category
edges, private-role exclusion, unchanged unrelated documents, immutable earlier
releases, exact source-field preservation and normal outbox completion afterward.
