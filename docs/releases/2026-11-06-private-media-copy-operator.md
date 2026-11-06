# Verified private-media copy operator — prepared, not executed

`tools/private-media/copy-verified.mjs` previews the reviewed manifest offline by
default. Execution can only copy from `old_legal_media` into `legal-documents`, at
`objects/<object_id>/<document_id>`. It never changes references, visibility,
bucket configuration or existing bytes, and has no delete/move/upload operation.
The 44 other source files and 18 raw imports remain outside the manifest.

The private manifest contains exactly 1710 unique documents/sources/destinations.
Its mappings and source IDs/ETags/sizes/MIMEs were cross-checked offline with the
existing private catalog evidence. This does not refresh the live inventory or
provide a content hash. No real file content was read for this preparation.

## Preview and future execution

Run from the repository root with Node22 or later. Paths, manifests and receipts
must stay in an access-controlled, Git-ignored directory. Use the exact manifest
bytes that were reviewed; reformatting its JSON changes its SHA-256.

```text
node tools/private-media/copy-verified.mjs --manifest <private-manifest.json> --project-ref <20-character-project-ref> --source-bucket old_legal_media --destination-bucket legal-documents
```

Preview makes no network request and reads no credential. It prints only counts,
aggregate sizes/types, fixed bucket names and the manifest SHA-256. It rejects
unknown flags, a different count, bucket, origin, namespace, duplicate, encoded
traversal, oversized object or unreviewed MIME. The source URLs are validated
against the selected Supabase project, then never used as request URLs.

After the separately reviewed delivery/copy decision, the future command adds:

```text
--expect-sha256 <reviewed-manifest-sha256> --receipt <ignored-copy-receipt.json> --execute
```

The privileged credential must already exist only in the process environment as
`DB07_STORAGE_SERVICE_KEY`. There is no key CLI argument, dotenv loader, key log
or key stored in the receipt. Opaque `sb_secret_*` keys use `apikey`; legacy
service-role JWTs must match the project and also use `Authorization`. All
credentialed requests target only the selected HTTPS Supabase origin. Redirects
are refused, including redirects on downloads. The loopback transport used by
tests accepts only the literal dummy key; the CLI has no loopback flag.

Before execution, refresh/review the exact source catalog/mappings, current
permissions and destination privacy; establish a window without competing
changes to these files. Confirm capacity/global file limit, the effective Storage
version and real copy/info/download semantics on an isolated representative
Storage instance. No such live HTTP Storage qualification is claimed here.
The existing destination size/MIME restrictions are incompatible with 22 large
archives and three additional MIME families; the copy tool stops before reading
bytes unless the destination is compatible. It never changes those restrictions.
See the separate [bucket compatibility proposal](2026-11-06-legal-bucket-compatibility-proposal.md).

## Copies, content verification and receipts

For every selected file the tool checks exact source ID/name/bucket/ETag/size,
MIME and cache metadata, and refuses an existing destination without a matching
copy acknowledgement in the private receipt. It streams and discards source
bytes while computing SHA-256; then it calls the server copy API with
`x-upsert:false`, exact JSON source/destination coordinates and no metadata
override. The acknowledgement must name the exact destination and its UUID.

An atomic local checkpoint records that acknowledgement before verification
continues. The destination bytes are then streamed and discarded: their real
SHA-256 and size must equal the source, and their MIME/cache/ETag headers must
match metadata. Both catalogs are checked again, including destination privacy.
Only then is a verified record checkpointed. No content file or signed URL is
written locally. Sequential streaming keeps memory independent of total corpus
size; no parallel copy or whole-file buffering is used.

Before each POST, a durable `attempts` entry identifies its exact namespace,
source identity and hash. An attempt without an acknowledgement blocks automatic
retry even if the destination currently appears absent: the earlier request may
still complete. This state is preserved privately for operator reconciliation.

The receipt extends the existing `prepare-cutover.mjs` contract. `copies` contains
acknowledged destinations, including an interrupted verification. `records`
contains only completed byte verifications, with source/destination IDs, ETags,
SHA-256, byte sizes, content types, cache controls and timestamps. The exact
manifest digest/project bind the receipt. Re-running rechecks metadata and
rehashes both contents, while never issuing a second copy for an acknowledged
destination. Only a complete 1710-record receipt can prepare reference SQL using
the existing offline cutover generator; this tool never executes that SQL.

Receipt checkpoints use an exclusive `.next` file, file fsync and atomic rename;
an exclusive receipt `.lock` and a canonical project-wide lock under the current
user's temporary directory prevent concurrent local CLI writers, including two
receipt paths or manifest digests for the same project. Locks contain PID, host,
start time and digest for diagnosis. Receipt parents are resolved before locking;
all receipt siblings must be ignored. Locks do not coordinate other hosts or tools.
A process crash can leave
a lock or temporary file. Preserve and inspect them before any manual recovery;
there is no automatic stale-lock deletion or receipt fabrication. Directory
fsync/power-loss guarantees vary by filesystem; keep independent private backups
of the reviewed manifest and receipts. File mode0600 is requested; Windows folder
ACLs remain the operator's responsibility.

Before any network operation the CLI validates and atomically checkpoints the
current receipt; a leftover temporary file or an unwritable destination stops
there. SIGINT/SIGTERM/SIGHUP (and Windows SIGBREAK) repeatedly request the same
abort while receipt writes finish; forced termination and power loss remain
uncertain outcomes.

If a server copy succeeds but its acknowledgement is lost, malformed, or cannot
be durably checkpointed, its outcome is uncertain. A later existing destination
is refused without the acknowledgement, even if its bytes might match. Inspect
the private evidence and prepare a separately reviewed recovery; never delete or
overwrite it to force a retry. A corrupt or changed acknowledged destination also
stops the lot and remains intact. No existing receipt is trusted instead of byte
verification. These receipts record operator observations, not a cryptographic
attestation of the Storage server or an atomic transaction across DB and Storage.

## Validation and delivery limits

`node --test tools/private-media/*.test.mjs` exercises a small real loopback HTTP
server with synthetic bytes only: successful copy and cutover receipt, same-size
corruption, collision, acknowledged resume, lost acknowledgement, interruption,
source change, wrong MIME/privacy/limits, exact path encoding and zero redirect
egress/credential leakage. The workflow runs these tests with no install/build
and no production credential. An offline preview of the actual private manifest
also passed; its raw locations/IDs remain ignored and are not release artifacts.

The existing DB07 delivery sequence still applies: application route/client,
then targeted SQL, then separately reviewed physical copies and reference CAS
batches. Source retirement is a later concrete decision. Copying alone does not
close old public URLs, purge caches or revoke previously downloaded files.
