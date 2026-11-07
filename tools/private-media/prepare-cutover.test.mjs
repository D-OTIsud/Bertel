import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { prepareCutover, sha256, validateManifest } from './prepare-cutover.mjs';

export function fixture(count = 1) {
  const records = [];
  const copies = [];
  const id = (suffix) => '00000000-0000-4000-a000-' + String(suffix).padStart(12, '0');
  const objectId = 'HOTRUN9970070001';
  for (let index = 0; index < count; index += 1) {
    const documentId = id(7801 + index);
    const sourcePath = "synthetic/'file" + (index || '') + '.pdf';
    const destination = `objects/${objectId}/${documentId}`;
    records.push({
      document_id: documentId, object_id: objectId, source_bucket: 'old_legal_media', source_path: sourcePath,
      source_url: 'https://example.invalid/' + sourcePath, destination_bucket: 'legal-documents', destination_path: destination,
      destination_url: `storage://legal-documents/${destination}`,
      source_metadata: { id: id(8801 + index), name: sourcePath, etag: 'source-tag', size: 7 },
    });
    copies.push({
      document_id: documentId, source_id: id(8801 + index), source_etag: 'source-tag',
      destination_id: id(9801 + index), destination_path: destination,
      source_bytes: 7, destination_bytes: 7, source_sha256: sha256('fixture'), destination_sha256: sha256('fixture'),
      destination_etag: 'destination-tag',
    });
  }
  const manifest = { schema_version: 1, classification: 'legal_private', expected_count: count, records };
  const receipt = { manifest_sha256: sha256(JSON.stringify(manifest)), destination_bucket_private: true, records: copies };
  return { manifest, receipt };
}

test('prepares only the reviewed object/document namespace and a quoted, reference-only batch', () => {
  const { manifest, receipt } = fixture();
  const sql = prepareCutover(manifest, receipt, receipt.manifest_sha256, 1);
  assert.match(sql, /UPDATE public\.ref_document SET storage_bucket = 'legal-documents', storage_path = r->>'destination_path', url = r->>'destination_url'\s+WHERE id = d\.id;/);
  assert.match(sql, /synthetic\/''file\.pdf/);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|INSERT INTO) storage\./);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /PERFORM 1 FROM public\.object WHERE id = r->>'object_id' FOR KEY SHARE;\s+IF NOT FOUND THEN\s+RAISE EXCEPTION 'DB07 mapped object is missing';/);
  assert.equal([...sql.matchAll(/FOR SHARE;/g)].length, 3);
  assert.ok(sql.includes(receipt.records[0].destination_id));
  const destinationGuard = "storage_id IS DISTINCT FROM (r->>'destination_id')::uuid";
  assert.ok(sql.includes(destinationGuard) && sql.indexOf(destinationGuard) < sql.indexOf('CONTINUE; -- Safe resume'));
  const sourceGuard = "storage_id IS DISTINCT FROM (r#>>'{source_metadata,id}')::uuid";
  assert.ok(sql.includes(sourceGuard) && sql.indexOf(sourceGuard) < sql.indexOf('CONTINUE; -- Safe resume'));
  assert.match(sql, /b.id IN \('old_legal_media', 'legal-documents'\) AND b.public = false/);
  assert.equal([...sql.matchAll(/o.name COLLATE pg_catalog\."C"/g)].length, 2);
  assert.equal([...sql.matchAll(/o.archived_at IS NULL AND NOT o.is_delete_marker/g)].length, 2);
  assert.ok(sql.indexOf('SET LOCAL search_path = pg_catalog, pg_temp;') < sql.indexOf('\nDO '));
});

test('100-record statements share one transaction and one final commit', () => {
  const { manifest, receipt } = fixture(101);
  const sql = prepareCutover(manifest, receipt, receipt.manifest_sha256, 101);
  assert.equal([...sql.matchAll(/^BEGIN;$/gm)].length, 1);
  assert.equal([...sql.matchAll(/^COMMIT;$/gm)].length, 1);
  const groups = [...sql.matchAll(/jsonb_array_elements\('(.*)'::jsonb\)/g)];
  assert.deepEqual(groups.map(([, payload]) => JSON.parse(payload.replaceAll("''", "'")).length), [100, 1]);
  assert.match(sql, /ON_ERROR_STOP=1/);
  assert.match(sql, /COMMIT;\s*$/);
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
  ['missing destination identity', (r) => { delete r.records[0].destination_id; }],
  ['invalid destination identity', (r) => { r.records[0].destination_id = 'invalid'; }],
  ['different content', (r) => { r.records[0].destination_sha256 = sha256('other'); }],
  ['short copy', (r) => { r.records[0].destination_bytes = 6; }],
  ['changed source', (r) => { r.records[0].source_etag = 'new'; }],
  ['missing source identity', (r) => { delete r.records[0].source_id; }],
  ['different source identity', (r) => { r.records[0].source_id = r.records[0].destination_id; }],
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
