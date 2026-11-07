// Offline only: validates a private inventory and verified copy receipt, then
// prepares reference-only SQL. It never connects to a database or Storage.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = /^[0-9a-f]{64}$/;
const text = (value) => typeof value === 'string' && value.length > 0 && !value.includes('\0');
const path = (value) => text(value) && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some((p) => p === '.' || p === '..');
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const byteLength = (value) => (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))
  && Number.isSafeInteger(Number(value)) && Number(value) >= 0;

export function validateManifest(manifest, expectedCount = 1710) {
  assert(manifest?.schema_version === 1 && manifest.classification === 'legal_private', 'manifest_scope');
  assert(manifest.expected_count === expectedCount && manifest.records?.length === expectedCount, 'manifest_count');
  const ids = new Set(); const sources = new Set(); const targets = new Set();
  for (const r of manifest.records) {
    assert(uuid.test(r.document_id) && /^[A-Z0-9]{16}$/.test(r.object_id), 'manifest_identity');
    assert(r.source_bucket === 'old_legal_media' && path(r.source_path) && text(r.source_url), 'manifest_source');
    assert(r.destination_bucket === 'legal-documents' && r.destination_path === `objects/${r.object_id}/${r.document_id}`
      && r.destination_url === `storage://legal-documents/${r.destination_path}`, 'manifest_destination');
    assert(uuid.test(r.source_metadata?.id) && r.source_metadata.name === r.source_path && text(r.source_metadata.etag)
      && byteLength(r.source_metadata.size), 'manifest_metadata');
    assert(!ids.has(r.document_id) && !sources.has(r.source_path) && !targets.has(r.destination_path), 'manifest_duplicate');
    ids.add(r.document_id); sources.add(r.source_path); targets.add(r.destination_path);
  }
  return manifest.records.map((r) => ({ ...r, source_metadata: { ...r.source_metadata, size: Number(r.source_metadata.size) } }));
}

export function prepareCutover(manifest, receipt, manifestHash, expectedCount = 1710) {
  const records = validateManifest(manifest, expectedCount);
  assert(hash.test(manifestHash) && receipt?.manifest_sha256 === manifestHash, 'receipt_manifest');
  assert(receipt.destination_bucket_private === true && receipt.records?.length === records.length, 'receipt_scope');
  const verified = new Map();
  for (const r of receipt.records) {
    assert(!verified.has(r.document_id), 'receipt_duplicate');
    verified.set(r.document_id, r);
  }
  const ready = records.map((r) => {
    const copy = verified.get(r.document_id);
    assert(copy && copy.source_id === r.source_metadata.id && copy.source_etag === r.source_metadata.etag
      && uuid.test(copy.destination_id) && copy.destination_path === r.destination_path, 'receipt_identity');
    assert(hash.test(copy.source_sha256) && copy.source_sha256 === copy.destination_sha256
      && copy.source_bytes === r.source_metadata.size && copy.destination_bytes === copy.source_bytes
      && text(copy.destination_etag), 'receipt_content');
    return { ...r, destination_id: copy.destination_id, destination_etag: copy.destination_etag };
  });
  const batches = [];
  for (let offset = 0; offset < ready.length; offset += 100) {
    const payload = JSON.stringify(ready.slice(offset, offset + 100));
    // Do not let a hostile source filename close the DO body or an SQL literal.
    let delimiter = `$db07_${sha256(payload).slice(0, 12)}$`;
    while (payload.includes(delimiter)) delimiter = delimiter.replace(/\$$/, '_x$');
    batches.push(`DO ${delimiter}
DECLARE
  r jsonb;
  d public.ref_document%ROWTYPE;
  storage_id uuid;
  storage_etag text;
  storage_size bigint;
  private_buckets bigint;
BEGIN
  PERFORM 1 FROM storage.buckets b
    WHERE b.id IN ('old_legal_media', 'legal-documents') AND b.public = false
    ORDER BY b.id COLLATE pg_catalog."C" FOR SHARE;
  GET DIAGNOSTICS private_buckets = ROW_COUNT;
  IF private_buckets <> 2 THEN
    RAISE EXCEPTION 'DB07 source and destination must remain private';
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(${literal(payload)}::jsonb) LOOP
    PERFORM 1 FROM public.object WHERE id = r->>'object_id' FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DB07 mapped object is missing';
    END IF;
    SELECT * INTO STRICT d FROM public.ref_document WHERE id = (r->>'document_id')::uuid FOR UPDATE;
    IF d.access_scope IS DISTINCT FROM 'legal_private'
       OR (d.extra #>> '{bertel_pj_import,mapped_object_id}') IS DISTINCT FROM r->>'object_id' THEN
      RAISE EXCEPTION 'DB07 classification or mapping changed';
    END IF;
    SELECT o.id, o.metadata->>'eTag', (o.metadata->>'size')::bigint
      INTO STRICT storage_id, storage_etag, storage_size
      FROM storage.objects o
      WHERE o.bucket_id = 'legal-documents' AND o.name COLLATE pg_catalog."C" = (r->>'destination_path')
        AND o.archived_at IS NULL AND NOT o.is_delete_marker
      FOR SHARE;
    IF storage_id IS DISTINCT FROM (r->>'destination_id')::uuid
       OR storage_etag IS DISTINCT FROM (r->>'destination_etag')
       OR storage_size IS DISTINCT FROM (r#>>'{source_metadata,size}')::bigint THEN
      RAISE EXCEPTION 'DB07 verified destination changed';
    END IF;
    SELECT o.id, o.metadata->>'eTag', (o.metadata->>'size')::bigint
      INTO STRICT storage_id, storage_etag, storage_size
      FROM storage.objects o
      WHERE o.bucket_id = 'old_legal_media' AND o.name COLLATE pg_catalog."C" = (r->>'source_path')
        AND o.archived_at IS NULL AND NOT o.is_delete_marker
      FOR SHARE;
    IF storage_id IS DISTINCT FROM (r#>>'{source_metadata,id}')::uuid
       OR storage_etag IS DISTINCT FROM (r#>>'{source_metadata,etag}')
       OR storage_size IS DISTINCT FROM (r#>>'{source_metadata,size}')::bigint THEN
      RAISE EXCEPTION 'DB07 verified source changed';
    END IF;
    IF d.storage_bucket = 'legal-documents' AND d.storage_path = r->>'destination_path' AND d.url = r->>'destination_url' THEN
      CONTINUE; -- Safe resume after both live Storage identities have been reverified.
    END IF;
    IF d.storage_bucket IS DISTINCT FROM 'old_legal_media' OR d.storage_path IS DISTINCT FROM r->>'source_path'
       OR d.url IS DISTINCT FROM r->>'source_url' THEN
      RAISE EXCEPTION 'DB07 source reference changed';
    END IF;
    UPDATE public.ref_document SET storage_bucket = 'legal-documents', storage_path = r->>'destination_path', url = r->>'destination_url'
      WHERE id = d.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DB07 reference update did not apply';
    END IF;
  END LOOP;
END;
${delimiter};`);
  }
  return `-- PRIVATE: reference changes only; contains locations. Never commit this output.
-- Run the complete script in one session (psql -X -v ON_ERROR_STOP=1).
BEGIN;
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '30s';
SET LOCAL standard_conforming_strings = on;
SET LOCAL search_path = pg_catalog, pg_temp;
${batches.join('\n\n')}
COMMIT;
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      const key = process.argv[i];
      assert(['--manifest', '--receipt', '--out'].includes(key) && !options[key] && process.argv[i + 1], 'arguments');
      options[key] = process.argv[i + 1];
    }
    assert(options['--manifest'] && Boolean(options['--receipt']) === Boolean(options['--out']), 'arguments');
    const bytes = readFileSync(options['--manifest']);
    const manifest = JSON.parse(bytes); const records = validateManifest(manifest); const digest = sha256(bytes);
    if (options['--out']) {
      assert(spawnSync('git', ['check-ignore', '--quiet', '--', resolve(options['--out'])]).status === 0, 'output_must_be_git_ignored');
      const sql = prepareCutover(manifest, JSON.parse(readFileSync(options['--receipt'])), digest);
      writeFileSync(options['--out'], sql, { flag: 'wx' });
      console.log(JSON.stringify({ records: records.length, manifest_sha256: digest, sql_sha256: sha256(sql), prepared: true }));
    } else {
      console.log(JSON.stringify({ records: records.length, bytes: records.reduce((sum, r) => sum + r.source_metadata.size, 0), manifest_sha256: digest, prepared: false }));
    }
  } catch (error) {
    // Stable codes only: parser/OS errors may contain private paths or values.
    console.error(`DB07 preparation refused: ${/^[a-z_]+$/.test(error.message) ? error.message : 'invalid_input_or_io'}`);
    process.exitCode = 1;
  }
}
