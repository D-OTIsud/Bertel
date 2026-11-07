import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { test } from 'node:test';
import { copyBinding, copyReserved, prepareReservedCutover, psqlClaim } from './copy-reserved.mjs';
import { inspectManifest } from './copy-verified.mjs';

const id = (number) => `00000000-0000-4000-a000-${String(number).padStart(12, '0')}`;
const hash = (value) => createHash('sha256').update(value).digest('hex');

function resumedFixture(kind) {
  const project = 'aaaaaaaaaaaaaaaaaaaa';
  const origin = `https://${project}.supabase.co`;
  const object = 'HOTRUN0000000001';
  const sourceHash = hash('synthetic bytes');
  const records = [1, 2].map((n) => ({
    document_id: id(n), object_id: object,
    source_bucket: 'old_legal_media', source_path: `old/${n}.pdf`,
    source_url: `${origin}/storage/v1/object/public/old_legal_media/old/${n}.pdf`,
    destination_bucket: 'legal-documents', destination_path: `objects/${object}/${id(n)}`,
    destination_url: `storage://legal-documents/objects/${object}/${id(n)}`,
    source_metadata: { id: id(10 + n), name: `old/${n}.pdf`, size: 15, etag: `source-${n}`,
      content_type: 'application/pdf', cache_control: 'max-age=3600' },
  }));
  const manifest = Buffer.from(JSON.stringify({ schema_version: 1, classification: 'legal_private', expected_count: 2, records }));
  const inventory = inspectManifest(manifest, project, 2);
  const config = { mode: 'hosted', project_ref: project, storage_origin_sha256: hash(origin),
    namespace_id: id(100), epoch: id(101), manifest_sha256: inventory.digest };
  const first = records[0];
  const attempt = { document_id: first.document_id, destination_path: first.destination_path,
    source_id: first.source_metadata.id, source_sha256: sourceHash, source_bytes: 15 };
  if (kind !== 'legacy') {
    const binding = copyBinding(inventory, first, { sha256: sourceHash, bytes: 15 }, config);
    attempt.reservation = { receipt_id: id(110), attempt_id: id(111), binding: { ...binding } };
    if (kind === 'foreign') attempt.reservation.binding.payload_sha256 = hash('foreign source');
  }
  const ack = { document_id: first.document_id, destination_path: first.destination_path,
    destination_id: id(21), source_etag: 'source-1', source_sha256: sourceHash, source_bytes: 15,
    source_content_type: 'application/pdf', source_cache_control: 'max-age=3600' };
  const verified = { ...ack, source_id: first.source_metadata.id, destination_etag: 'destination-1',
    destination_sha256: sourceHash, destination_bytes: 15, destination_content_type: 'application/pdf',
    destination_cache_control: 'max-age=3600' };
  const receipt = { schema_version: 1, project_ref: project, manifest_sha256: inventory.digest,
    destination_bucket_private: true, attempts: [attempt], copies: [ack], records: [verified] };
  const effects = [];
  const destinations = new Set([first.destination_path]);
  const options = { receipt, reservationConfig: config,
    checkpoint: async () => { effects.push('checkpoint'); },
    claim: async (binding) => {
      effects.push(`claim:${binding.document_id}`);
      return { schema_version: 1, state: 'dispatch_granted', receipt_id: id(120), attempt_id: id(121), binding };
    },
    transport: {
      bucket: async () => {
        effects.push('GET bucket');
        return { id: 'legal-documents', public: false, file_size_limit: 100, allowed_mime_types: ['application/pdf'] };
      },
      info: async (bucket, key) => {
        effects.push('GET info');
        const index = records.findIndex((r) => bucket === 'old_legal_media' ? r.source_path === key : r.destination_path === key);
        const record = records[index];
        if (bucket === 'old_legal_media') return { ...record.source_metadata, bucket_id: bucket };
        if (!destinations.has(key)) return null;
        return { ...record.source_metadata, id: id(21 + index), name: key, bucket_id: bucket, etag: `destination-${index + 1}` };
      },
      hashObject: async () => { effects.push('GET hash'); return { sha256: sourceHash, bytes: 15 }; },
      copy: async (record) => {
        effects.push(`POST:${record.document_id}`);
        destinations.add(record.destination_path);
        return { Id: id(22), Key: `legal-documents/${record.destination_path}` };
      },
    },
  };
  return { inventory, config, options, effects };
}

for (const kind of ['legacy', 'foreign']) {
  test(`${kind} ACK refuses before any effect with a second key ready`, async () => {
    const fixture = resumedFixture(kind);
    await assert.rejects(copyReserved(fixture.inventory, fixture.options), /reservation_receipt_(missing|binding)/);
    assert.deepEqual(fixture.effects.filter((effect) => effect.startsWith('POST')), []);
    assert.deepEqual(fixture.effects, []);
  });
}

test('reserved intermediate ACK resumes before the final marker and posts only the fresh key', async () => {
  const fixture = resumedFixture('reserved');
  assert.equal(fixture.options.receipt.reservation_protocol, undefined);
  assert.equal(fixture.options.receipt.records[0].reservation, undefined);
  const receipt = await copyReserved(fixture.inventory, fixture.options);
  assert.equal(receipt.reservation_protocol, 'db07_copy_v1');
  assert.equal(receipt.records.length, 2);
  assert.deepEqual(fixture.effects.filter((effect) => /^(POST|claim):/.test(effect)), [`claim:${id(2)}`, `POST:${id(2)}`]);
  assert.match(prepareReservedCutover(fixture.inventory, receipt, fixture.config), /DB07 source reference changed/);
  const replaced = structuredClone(receipt);
  replaced.records[0].destination_id = id(901);
  assert.throws(() => prepareReservedCutover(fixture.inventory, replaced, fixture.config), /receipt_content/);
});

test('the Python child receives no Storage or database credentials from the parent environment',
  { skip: !process.env.DB07_TEST_PYTHON }, async (t) => {
    const credentialNames = ['DB07_STORAGE_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'PGPASSWORD'];
    for (const name of credentialNames) {
      const original = process.env[name];
      process.env[name] = 'synthetic-credential';
      t.after(() => { if (original === undefined) delete process.env[name]; else process.env[name] = original; });
    }
    const originalSpawn = childProcess.spawn;
    const spy = t.mock.method(childProcess, 'spawn', (python, _args, options) => originalSpawn(python, ['-c',
      'import json,os,sys; sys.stdin.read(); print(json.dumps({k:k in os.environ for k in ' + JSON.stringify(credentialNames) + '}))'], options));
    syncBuiltinESMExports();
    t.after(() => { spy.mock.restore(); syncBuiltinESMExports(); });
    const observed = await psqlClaim({}, {}, { python: process.env.DB07_TEST_PYTHON });
    assert.deepEqual(observed, Object.fromEntries(credentialNames.map((name) => [name, false])));
  });
