# Legal-documents compatibility profile

On 7 November 2026, a single Storage bucket API request updated the private
`legal-documents` bucket. The PUT was acknowledged at 05:50:23.702 UTC. A
separate read-only repeatable-read check at 05:50:43.906955 UTC verified the
42,305,170-byte limit and exact PDF, JPEG, PNG, DOCX and HEIF allowlist. The
destination remained private, STANDARD, without versioning or lifecycle
configuration. Its restrictive ALL policy remained intact, the source bucket
remained public and the operation touched no objects.
[Exact request and verification record](../../tools/private-media/legal-bucket-compatibility.proposal.json)

The historical private profile allowed PDF and JPEG up to 10,485,760 bytes.
The inventory identified 22 files above that limit among 1,710 classified
files, with a maximum of 42,305,170 bytes and the five MIME types now allowed.
The inventory used metadata. Byte and hash verification belongs to the
separate backup and copy operation.

The new per-bucket restrictions apply to all otherwise-authorized uploads.
The project-wide limit must independently admit the largest object. The
canonical SQL uses this profile for fresh installations and preserves the
existing policies. Production used the Storage API. The copy tool consumes
the configured profile and never updates it.
[Fresh installation definition](../../Base%20de%20donn%C3%A9e%20DLL%20et%20API/legal_documents_bucket.sql)

The private reservation registry was installed separately. The bucket update
did not create a reservation, copy an object or cut over a document reference.
[DB07 production reservation record](2026-11-07-db07-storage-reservations-production.md)

If the former upload restrictions are needed for recovery, reconcile concurrent
uploads first and keep copied archives intact. Changing restrictions does not
require removing existing objects.

See [bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets)
and [global and per-bucket limits](https://supabase.com/docs/guides/storage/uploads/file-limits).
