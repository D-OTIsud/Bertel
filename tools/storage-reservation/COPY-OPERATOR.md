# Reserved copy integration — source for review, not a production installation

The copy profile is separate from the immutable research key profile. It binds
exactly `legal-documents/objects/<object>/<document>`, a 20-character project ref,
manifest digest, namespace/epoch, source metadata fingerprint, observed content
hash/bytes and one of the five existing MIME types, maximum42,305,170bytes.
It adds no application permission or grant. `prototype.sql` is unchanged.

`copy_profile.fixture_profile_sql()` derives a new owned-lab schema with those
strict bounds from the prototype. The three RPCs, permanent primary keys,
owner capability and immutable/one-way state remain the same. Explicit
pg_catalog,pg_temp order protects the derived function context. The emitted SQL
still has its **fixture-only installation guard** and must refuse a hosted DB.
It is not a production installer or a migration receipt.

`copy_claim.py` uses the same process status, COMMIT acknowledgement and nonce
checks for both modes. The hosted connection keeps the existing `postgres`
operator role. The local prototype mode selects `service_role`. The same
Journal performs exclusive owner/claim/dispatch-intent file creation and fsync.
Only after typed claim validation and dispatch-intent completion does the bridge
return its ephemeral grant. It persists no true permission for replay. A journal
directory is deterministically keyed by destination bucket/key, independent of
new attempts, manifests or epochs. Existing directories always refuse; a new
owner cannot adopt an existing DB reservation.

The bridge accepts private stdin JSON, captures all psql diagnostics and emits
only its bound response to the parent pipe. Credentials, owner secrets and
document data are absent from argv. Hosted connection configuration requires a
direct matching project hostname, postgres database/user, port5432 and
verify-full TLS with an explicit root certificate/password file. That hosted
channel has **not been exercised or qualified**. The local branch checks the
new owned fixture marker/port/database. Each connection arms synchronous_commit
before its first statement. A DB target DO checks it and requires fsync and
full_page_writes before every unchanged transaction adapter call.

`copy-reserved.mjs` wraps the existing `copyVerified` and `storageTransport`.
It snapshots the inventory/config, creates a binding from the actual source hash
stream, checks the exact grant, fsyncs its receipt through the existing checkpoint,
then invokes the original copy POST once. An unknown claim/POST or persistence
failure stops the invocation. The existing attempt marker blocks automatic
replay; permanent SQL state also refuses another claim. No adoption, reset,
expiry, redirect, key change, namespace rotation or fallback is added.

The existing byte streams, stored metadata checks, private-bucket checks, operator
locks and safe receipt writes remain in use. Successful receipts additionally
carry the reservation binding. `prepareReservedCutover` revalidates that complete
binding before invoking the existing reference-only CAS generator. It never
changes reference rows itself. The legacy unreserved offline generator remains
for old packets; use the reserved preparation command for this delivery.

The `copy-verified.mjs --execute` command now requires `--reservation-config`
(private JSON path) and `--python` (absolute executable), in addition to its old
manifest/hash/project/bucket/receipt arguments. Preview remains offline. This is
not authorization to run it. `prepare-reserved-cutover.mjs` is an offline command
requiring manifest/project/hash/receipt/receipt hash/reservation-config/out; it exclusively
creates the private SQL output and prints only aggregate counts/hash.

## Local qualification

The repository includes the offline and loopback operator tests:

```text
node --test tools/private-media/copy-verified.test.mjs tools/private-media/copy-reserved-resume.test.mjs tools/private-media/prepare-cutover.test.mjs
```

The separate seven-case integration qualification used a new owned PG17.10
cluster and actual psql/fetch against a loopback Storage copy fixture. They cover positive commit+durable intent before
POST and verified CAS receipt, foreign owner refusal, unknown Storage ACK with
no repost, a post-claim checkpoint refusal, corrupt copied bytes with no cutover,
eight SQL grammar checks including all five MIME types and the size boundary,
and explicit synchronous_commit despite an off role default.
The POST sink counts every POST and deliberately allows duplicates. It separately
observes the committed row/binding and dispatch-intent before admitting each POST.
Only four POSTs occur: two positives, unknown ACK and corrupt bytes. No real source,
account, project, document or Storage service is contacted. Data/journals remain
and only the owned cluster is stopped.

The previous20 protocol cases and7 wire-cut cases are not blindly rerun. Their
ACK transaction and Journal are reused unchanged; the reply validators only gain
an optional strict profile validator, defaulting to the old research validator.
The integration proves the new frontier, not a third transport campaign.

## Finite production work remaining

1. Independently review this exact source, derived SQL profile and local proofs.
2. Verify the installed registry and its `postgres`-owned private RPCs against
   the [applied migration and receipt](../../docs/releases/2026-11-07-db07-storage-reservations-production.md).
3. Bind and qualify the actual direct psql/TLS/credential channel and private
   journal/receipt locations. Verify target, durable settings and sanitized logs.
4. Freeze all other writers/deleters for the destination namespace, including
   manual privileged tools, legacy operators and restore/reclassification paths.
   The current1710 cohort has zero actor overlap; its separate namespace patch
   is preventive, not an existing incident.
5. Refresh/revalidate the exact1710 manifest/source metadata and hashes; seed the
   immutable admissions for that exact batch. Run the reserved operator only
   after the review/activation gate. A quarantined key is never reposted or
   adopted; stop and retain evidence if any result is unknown.
6. Require all1710 bound byte-verified receipts, generate/review the reference
   CAS, apply it with final checks and verify effective legal-reader access.
7. Retain all source objects. Production old_legal_media is already private.
   Keep it private during backup, copy and reference cutover. The 44 unmatched
   files and 18 raw imports stay outside this cohort. Any future retirement
   requires a separately verified inventory and decision.

There is no DB/HTTP atomic transaction. Copying by source key does not freeze
Storage bytes; the before/after hashes detect a mismatch before cutover but do
not grant another POST. Gateway replay/direct privileged calls bypass this
operator. Backup/restore can erase an issued fact; externally quiesce/freeze
emitters before any restore/epoch break. Local fsync tests do not qualify power
loss on NTFS/Linux or hosted Storage gateway behavior. The Storage primitive's
concurrent200/200 probes remain RED. This integration alone is not production
readiness or permission to apply/copy/change a bucket.

## Isolated operator image

The [DB07 copy operator image workflow](../../.github/workflows/db07-copy-operator-image.yml)
builds [the operator Dockerfile](Dockerfile.copy-operator) for Linux amd64 on a
disposable runner. Run it manually or on a pull request that changes the
Dockerfile or workflow. The build context is the Dockerfile and eight operator
source files from the exact workflow commit. It leaves the image in the
runner's local Docker store. The base manifest and four direct APK versions
are pinned. Alpine resolves their transitive dependencies during the build.

The network-disabled smoke verifies UID/GID 1000, Node 22, native Python and
`psql` 17, Git with an empty repository, and the existing synthetic CLI
preview, stdin and Python child checks. It uses two read-only test mounts.

Qualification of a deployable image remains a separate step. It must seal
the exact image, exercise its native `psql` over TLS with a disposable
PostgreSQL 17 server and validate the hosted direct channel and the private
CA, passfile, journal and receipt mounts before any hosted copy.
