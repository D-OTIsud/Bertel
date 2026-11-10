# Native dictionary SQL review — 10 November 2026

Status: review in progress. This file is not deployment approval. No production
writes, publication, commits or overlapping SQL edits were performed by reviewer.

Reviewed candidate: `supabase/migrations/20261110190229_thesaurus_native_dictionary_adapters.sql`
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

The reviewer reproduced item 8 in a newly created, independently identified
temporary PostgreSQL 17 cluster bound to loopback, verified before any mutation.
The table creation rolled back and the cluster stopped/was removed afterward.
No existing database, archived harness or production connection was used.

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

## Qualification still required

- Re-read the final corrected migration and identical mirror; verify all findings
  are resolved and the predecessor/catalog guards run before mutations.
- Pass complete fresh-apply CI and the new protected publication behavior test,
  including overlay-only definitions, private role publication, native cross-category
  membership, renderer parity, targeted incremental snapshots and historical release
  immutability. A schema-only smoke test cannot qualify publication behavior.
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
