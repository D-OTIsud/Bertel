import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { prepareCutover, sha256, validateManifest } from './prepare-cutover.mjs';

export function fixture() {
  const documentId = '00000000-0000-4000-a000-000000007801';
  const objectId = 'HOTRUN9970070001';
  const destination = `objects/${objectId}/${documentId}`;
  const manifest = { schema_version: 1, classification: 'legal_private', expected_count: 1, records: [{
    document_id: documentId, object_id: objectId, source_bucket: 'old_legal_media', source_path: "synthetic/'file.pdf",
    source_url: "https://example.invalid/synthetic/'file.pdf", destination_bucket: 'legal-documents', destination_path: destination,
    destination_url: `storage://legal-documents/${destination}`,
    source_metadata: { id: '00000000-0000-4000-a000-000000007802', name: "synthetic/'file.pdf", etag: 'source-tag', size: 7 },
  }] };
  const receipt = { manifest_sha256: sha256(JSON.stringify(manifest)), destination_bucket_private: true, records: [{
    document_id: documentId, source_etag: 'source-tag', destination_path: destination, source_bytes: 7, destination_bytes: 7,
    source_sha256: sha256('fixture'), destination_sha256: sha256('fixture'), destination_etag: 'destination-tag',
  }] };
  return { manifest, receipt };
}

test('prepares only the reviewed object/document namespace and a quoted, reference-only batch', () => {
  const { manifest, receipt } = fixture();
  const sql = prepareCutover(manifest, receipt, receipt.manifest_sha256, 1);
  assert.match(sql, /UPDATE public\.ref_document SET storage_bucket/);
  assert.match(sql, /synthetic\/''file\.pdf/);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|INSERT INTO) storage\./);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /CONTINUE; -- Safe resume/);
});

for (const [label, mutate] of [
  ['scope', (m) => { m.classification = 'public'; }],
  ['count', (m) => { m.expected_count = 1710; }],
  ['foreign destination', (m) => { m.records[0].destination_path = 'objects/HOTRUN9970070002/foreign'; }],
  ['traversal source', (m) => { m.records[0].source_path = '../outside'; }],
  ['unreviewed bucket', (m) => { m.records[0].source_bucket = 'raw_imports'; }],
]) test(`refuses a manifest with ${label}`, () => {
  const { manifest } = fixture(); mutate(manifest);
  assert.throws(() => validateManifest(manifest, 1));
});

for (const [label, mutate] of [
  ['changed inventory', (r) => { r.manifest_sha256 = sha256('other'); }],
  ['public destination', (r) => { r.destination_bucket_private = false; }],
  ['metadata-only receipt', (r) => { delete r.records[0].source_sha256; }],
  ['different content', (r) => { r.records[0].destination_sha256 = sha256('other'); }],
  ['short copy', (r) => { r.records[0].destination_bytes = 6; }],
  ['changed source', (r) => { r.records[0].source_etag = 'new'; }],
  ['duplicate receipt', (r) => { r.records.push(r.records[0]); }],
]) test(`refuses a ${label}`, () => {
  const { manifest, receipt } = fixture(); const expected = receipt.manifest_sha256; mutate(receipt);
  assert.throws(() => prepareCutover(manifest, receipt, expected, 1));
});

test('rejects unknown CLI arguments without exposing their values', () => {
  const result = spawnSync(process.execPath, ['tools/private-media/prepare-cutover.mjs', '--wrong', 'synthetic-private-value'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /arguments/);
  assert.doesNotMatch(result.stderr, /synthetic-private-value/);
});

test('normalizes catalog byte counts encoded as decimal text without changing the inventory digest', () => {
  const { manifest, receipt } = fixture();
  manifest.records[0].source_metadata.size = '7';
  const digest = sha256(JSON.stringify(manifest));
  receipt.manifest_sha256 = digest;
  assert.equal(validateManifest(manifest, 1)[0].source_metadata.size, 7);
  assert.match(prepareCutover(manifest, receipt, digest, 1), /UPDATE public\.ref_document/);
});
