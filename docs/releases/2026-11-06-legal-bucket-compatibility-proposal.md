# Legal-documents compatibility — separate proposal, not applied

`tools/private-media/legal-bucket-compatibility.proposal.json` describes a
configuration change through the Storage bucket API. It is not a migration and
the copy tool cannot execute it. No bucket, visibility, file or upload control
has been changed by this preparation.

The earlier metadata inventory found a private `legal-documents` bucket with a
10485760-byte limit and PDF/JPEG allowlist. The classified corpus contains
22 larger files, maximum42305170 bytes, and these exact five types:
PDF, JPEG, DOCX, PNG and HEIF. These are metadata observations, not content-type
sniffing or content hashes. No archive is converted or omitted to fit new uploads.

The reviewable target keeps the bucket private, raises its limit only to the
largest observed file (42305170 bytes), and adds the three exact observed MIME
types without wildcards. The project-wide limit must independently admit that
size. Broadening the bucket restriction affects every otherwise-authorized upload
to this bucket, including concurrent native uploads; existing application upload
validation and RLS are not changed here. The server-only Storage policy from DB07
must be present before the physical cutover.

Before any future application, refresh the bucket settings and selected corpus;
stop on unknown drift. Qualify synthetic large PDF/PNG/JPEG and small DOCX/HEIF
copies on an isolated representative Storage version. The copy operator requires
explicit compatible limits/MIMEs even where an upstream server-copy implementation
might bypass upload restrictions. That upstream behavior is not assumed as proof
of the deployed server.

The future operation is a targeted Storage `updateBucket('legal-documents',
{ public:false, fileSizeLimit:42305170, allowedMimeTypes:[the five exact values] })`
or its equivalent PUT JSON from the proposal. Preserve other settings and verify
privacy/limits/MIMEs immediately afterwards; never implement this as SQL changes
to Storage object metadata. Align the canonical fresh bucket definition and add
the bounded deployment record when this proposal is actually selected/applied.

If recovery needs the former upload limit/allowlist, first reconcile concurrent
uploads and keep copied archives intact. Restoring upload restrictions is not a
reason to remove large or additional-type files, alter source visibility, delete
copies or fabricate a receipt. No compatibility change is necessary to run the
offline preview or local synthetic tests.

References: [bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets),
[global and per-bucket limits](https://supabase.com/docs/guides/storage/uploads/file-limits),
[copy API](https://supabase.com/docs/reference/javascript/storage-from-copy),
[opaque server keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
