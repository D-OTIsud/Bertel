# Storage copy: stored cache metadata and HTTP delivery policy

The operator previously compared the authenticated download Cache-Control header
with the object's stored cache_control. Storage/CDN delivery can add directives,
so this comparison could stop a copy whose stored metadata and bytes are intact.
The operator now validates stored cache control only through its existing exact
GETinfo checks on source and destination, before and after content verification.
It keeps content type, strong ETag, content length, byte count and SHA-256 checks,
private-bucket rechecks, receipts and locks unchanged. It sets no new cache policy
and does not modify stored metadata.

Supabase's [HEAD troubleshooting note](https://supabase.com/kb/troubleshooting/storage-file-not-caching)
explains why HEAD can return private, no-cache. Its
[pinned renderer source](https://github.com/supabase/storage/blob/6bb2e4c360767bef715955e2ba25dfc45c0f0af7/src/storage/renderer/renderer.ts#L205-L231)
also merges configured delivery directives with object metadata. These are
separate observations: an authenticated HEAD response does not certify the
headers of a real GET, and a current upstream source is not an attestation of a
specific hosted Storage build.

Two new loopback HTTP cases failed with cache_control on the predecessor and
pass after the change: different delivery policies on source/destination, with
verified resume, and an absent delivery cache header. Five additional cases keep
stored-cache refusal strict before reading, before copying, and in postflight
source/destination checks. All 60 operator/cutover tests pass with synthetic bytes.
No real file body was read, no Storage copy was executed, and no bucket or
reference was changed during this qualification. Full hosted GET/copy semantics
still require the isolated representative Storage qualification described in the
[operator runbook](2026-11-06-private-media-copy-operator.md).
