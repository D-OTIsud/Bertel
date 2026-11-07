import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectManifest, copyVerified, storageTransport, saveReceipt, withOperatorLocks } from './copy-verified.mjs';
import { prepareCutover, sha256 } from './prepare-cutover.mjs';

const project = 'aaaaaaaaaaaaaaaaaaaa';
const sourceId = '00000000-0000-4000-a000-000000009101';
const destinationId = '00000000-0000-4000-a000-000000009102';
function fixture() {
  const bytes = Buffer.from('synthetic PDF bytes');
  const documentId = '00000000-0000-4000-a000-000000009103';
  const objectId = 'HOTRUN9970070001';
  const sourcePath = "synthetic/quote 'é.pdf";
  const destinationPath = `objects/${objectId}/${documentId}`;
  const manifest = { schema_version: 1, classification: 'legal_private', expected_count: 1, records: [{
    document_id: documentId, object_id: objectId,
    source_bucket: 'old_legal_media', source_path: sourcePath,
    source_url: `https://${project}.supabase.co/storage/v1/object/public/old_legal_media/${sourcePath.split('/').map(encodeURIComponent).join('/')}`,
    destination_bucket: 'legal-documents', destination_path: destinationPath,
    destination_url: `storage://legal-documents/${destinationPath}`,
    source_metadata: { id: sourceId, name: sourcePath, etag: 'source-tag', size: bytes.length,
      content_type: 'application/pdf', cache_control: 'max-age=3600' },
  }] };
  const serialized = Buffer.from(JSON.stringify(manifest));
  return { manifest, serialized, bytes, inventory: inspectManifest(serialized, project, 1) };
}

async function storage(t, options = {}) {
  const f = fixture(); const record = f.manifest.records[0];
  const source = { ...record.source_metadata, bucket_id: record.source_bucket };
  const data = { destination: options.collision ? { ...source, id: destinationId, name: record.destination_path,
    bucket_id: record.destination_bucket, etag: 'dest-tag' } : null,
    targetBytes: Buffer.from(f.bytes), posts: 0, reads: 0, methods: [], urls: [], auth: [] };
  const server = createServer(async (req, res) => {
    data.methods.push(req.method); data.urls.push(req.url); data.auth.push(req.headers.apikey);
    const url = decodeURIComponent(req.url);
    const json = (value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url === '/storage/v1/bucket/legal-documents') return json({ id: 'legal-documents', public: options.public ?? false,
      file_size_limit: options.limit ?? 42_305_170, allowed_mime_types: options.mimes ?? ['application/pdf'] });
    if (url === `/storage/v1/object/info/old_legal_media/${record.source_path}`) return json(source);
    if (url === `/storage/v1/object/info/legal-documents/${record.destination_path}`) return data.destination ? json(data.destination)
      : json(options.missingError ?? { statusCode: '404', error: 'not_found' }, options.missingStatus ?? 404);
    if (url === '/storage/v1/object/copy' && req.method === 'POST') {
      data.posts++;
      assert.equal(req.headers['x-upsert'], 'false');
      let body = ''; for await (const chunk of req) body += chunk;
      assert.deepEqual(JSON.parse(body), { bucketId: 'old_legal_media', sourceKey: record.source_path,
        destinationBucket: 'legal-documents', destinationKey: record.destination_path });
      if (data.destination) return json({}, 409);
      data.destination = { ...source, id: destinationId, name: record.destination_path, bucket_id: 'legal-documents', etag: 'dest-tag' };
      if (options.corrupt) data.targetBytes[0] ^= 1;
      if (options.sourceChange) source.etag = 'changed-after-copy';
      if (options.sourceCacheChangeAfterCopy) source.cache_control = 'max-age=1';
      if (options.targetCacheChangeAfterCopy) data.destination.cache_control = 'max-age=1';
      if (options.abortOnCopy) options.abortOnCopy.abort();
      if (options.lostAck) { req.socket.destroy(); return; }
      if (options.badAck) return json({ Id: destinationId, Key: 'legal-documents/outside' });
      return json({ Id: destinationId, Key: `legal-documents/${record.destination_path}` });
    }
    const isSource = url === `/storage/v1/object/authenticated/old_legal_media/${record.source_path}`;
    const isTarget = url === `/storage/v1/object/authenticated/legal-documents/${record.destination_path}`;
    if (isSource || isTarget) {
      data.reads++;
      if (options.redirect && isSource) { res.writeHead(302, { location: options.redirect }); res.end(); return; }
      if (options.interruptTarget && isTarget) { req.socket.destroy(); return; }
      const info = isSource ? source : data.destination;
      if (!info) return json({}, 404);
      const body = isSource ? f.bytes : data.targetBytes;
      const deliveryCache = (isSource ? options.sourceDeliveryCache : options.targetDeliveryCache) ?? info.cache_control;
      const headers = { 'content-type': options.badMime && isSource ? 'image/jpeg' : info.content_type,
        'cache-control': deliveryCache, etag: `"${info.etag}"`, 'content-length': body.length };
      if (isSource && options.missingHeader) delete headers[options.missingHeader];
      if (isSource && options.compressed) headers['content-encoding'] = 'gzip';
      res.writeHead(200, headers);
      if (isSource && options.truncated) {
        res.flushHeaders(); res.write(body.subarray(0, body.length - 1)); setTimeout(() => res.destroy(), 20); return;
      }
      res.end(body);
      if (isSource && options.sourceCacheChangeAfterRead) source.cache_control = 'max-age=1';
      if (isTarget && options.targetCacheChangeAfterRead) data.destination.cache_control = 'max-age=1';
      return;
    }
    json({}, 404);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((done) => { server.closeAllConnections(); server.close(done); }));
  const transport = storageTransport({ projectRef: project, serviceKey: 'test-only-no-real-key',
    testOrigin: `http://127.0.0.1:${server.address().port}`, timeoutMs: 3000 });
  let receipt;
  const checkpoint = async (value) => { receipt = structuredClone(value); };
  return { ...f, data, source, options, transport, checkpoint, get receipt() { return receipt; } };
}

test('real local HTTP copy + two byte streams produce a cutover-compatible receipt without replacing or persisting bytes', async (t) => {
  const s = await storage(t);
  const receipt = await copyVerified(s.inventory, s);
  assert.equal(s.data.posts, 1); assert.equal(s.data.reads, 2);
  assert.deepEqual(new Set(s.data.methods), new Set(['GET', 'POST']));
  assert.ok(s.data.auth.every((key) => key === 'test-only-no-real-key'));
  assert.equal(receipt.records.length, 1);
  assert.equal(receipt.records[0].source_sha256, sha256(s.bytes));
  assert.equal(receipt.records[0].destination_sha256, sha256(s.bytes));
  assert.equal(receipt.records[0].source_content_type, 'application/pdf');
  assert.equal(receipt.records[0].destination_content_type, 'application/pdf');
  assert.ok(s.data.urls.includes("/storage/v1/object/authenticated/old_legal_media/synthetic/quote%20'%C3%A9.pdf"));
  assert.match(prepareCutover(s.manifest, receipt, s.inventory.digest, 1), /UPDATE public\.ref_document/);
  assert.equal(JSON.stringify(receipt).includes('test-only-no-real-key'), false);
});

// Delivery headers can be rewritten by the Storage renderer/CDN. The stored
// cache_control remains an exact GETinfo invariant throughout copy and resume.
test('different HTTP cache policies preserve exact stored cache metadata and verified resume', async (t) => {
  const s = await storage(t, { sourceDeliveryCache: 'private, no-cache',
    targetDeliveryCache: 'max-age=3600, s-maxage=60, stale-while-revalidate=30' });
  const receipt = await copyVerified(s.inventory, s);
  assert.equal(s.data.posts, 1); assert.equal(s.data.reads, 2);
  assert.equal(receipt.records.length, 1);
  assert.equal(receipt.records[0].source_cache_control, 'max-age=3600');
  assert.equal(receipt.records[0].destination_cache_control, 'max-age=3600');
  assert.equal(receipt.records[0].source_sha256, sha256(s.bytes));
  assert.equal(receipt.records[0].destination_sha256, sha256(s.bytes));
  const resumed = await copyVerified(s.inventory, { ...s, receipt });
  assert.equal(resumed.records.length, 1);
  assert.equal(s.data.posts, 1); assert.equal(s.data.reads, 4);
});

test('a missing HTTP cache header does not replace exact stored cache validation', async (t) => {
  const s = await storage(t, { missingHeader: 'cache-control', targetDeliveryCache: 'private, no-cache' });
  const receipt = await copyVerified(s.inventory, s);
  assert.equal(receipt.records.length, 1); assert.equal(s.data.posts, 1); assert.equal(s.data.reads, 2);
  assert.equal(receipt.records[0].destination_cache_control, s.manifest.records[0].source_metadata.cache_control);
});

test('source cache metadata already changed refuses before content or copy', async (t) => {
  const s = await storage(t, { sourceDeliveryCache: 'private, no-cache' });
  s.source.cache_control = 'max-age=1';
  await assert.rejects(copyVerified(s.inventory, s), /source_changed/);
  assert.equal(s.data.posts, 0); assert.equal(s.data.reads, 0); assert.equal(s.receipt, undefined);
});

for (const [label, options, code, posts, reads] of [
  ['source after its stream', { sourceCacheChangeAfterRead: true }, 'source_changed', 0, 1],
  ['source after copy', { sourceCacheChangeAfterCopy: true }, 'source_changed', 1, 2],
  ['destination after copy', { targetCacheChangeAfterCopy: true }, 'destination_changed', 1, 1],
  ['destination after its stream', { targetCacheChangeAfterRead: true }, 'destination_changed', 1, 2],
]) test(`stored cache metadata drift on ${label} never becomes a verified record`, async (t) => {
  const s = await storage(t, { ...options, sourceDeliveryCache: 'private, no-cache',
    targetDeliveryCache: 'private, no-cache' });
  await assert.rejects(copyVerified(s.inventory, s), new RegExp(code));
  assert.equal(s.data.posts, posts); assert.equal(s.data.reads, reads);
  assert.equal(s.receipt?.records.length ?? 0, 0);
});

test('verified resume rehashes both contents and performs no second copy', async (t) => {
  const s = await storage(t); await copyVerified(s.inventory, s);
  const receipt = await copyVerified(s.inventory, { ...s, receipt: s.receipt });
  assert.equal(s.data.posts, 1); assert.equal(s.data.reads, 4); assert.equal(receipt.records.length, 1);
});

test('acknowledged copy survives interruption before content verification and resumes without overwriting', async (t) => {
  const s = await storage(t);
  await assert.rejects(copyVerified(s.inventory, { ...s, checkpoint: async (value) => {
    await s.checkpoint(value); if (value.copies.length) throw new Error('interrupted');
  } }), /interrupted/);
  assert.equal(s.receipt.copies.length, 1); assert.equal(s.receipt.records.length, 0); assert.equal(s.data.posts, 1);
  const receipt = await copyVerified(s.inventory, { ...s, receipt: s.receipt });
  assert.equal(receipt.records.length, 1); assert.equal(s.data.posts, 1);
});

test('destination stream failure keeps the copy acknowledgement for a verified retry', async (t) => {
  const options = { interruptTarget: true }; const s = await storage(t, options);
  await assert.rejects(copyVerified(s.inventory, s), /storage_network|content_network/);
  assert.equal(s.receipt.copies.length, 1); assert.equal(s.receipt.records.length, 0);
  options.interruptTarget = false;
  await copyVerified(s.inventory, { ...s, receipt: s.receipt }); assert.equal(s.data.posts, 1);
});

test('lost server acknowledgement refuses automatic adoption of the existing destination', async (t) => {
  const s = await storage(t, { lostAck: true });
  await assert.rejects(copyVerified(s.inventory, s), /copy_outcome_uncertain/);
  assert.equal(s.receipt.attempts.length, 1); assert.equal(s.receipt.copies.length, 0);
  assert.equal(s.data.posts, 1); assert.ok(s.data.destination);
  const priorRequests = s.data.methods.length;
  await assert.rejects(copyVerified(s.inventory, { ...s, receipt: s.receipt }), /copy_attempt_requires_review/); assert.equal(s.data.posts, 1);
  assert.equal(s.data.methods.length, priorRequests);
});

test('abort during POST preserves one attempt and refuses every new request on resume', async (t) => {
  const controller = new AbortController(); const s = await storage(t, { abortOnCopy: controller });
  await assert.rejects(copyVerified(s.inventory, { ...s, signal: controller.signal }), /copy_outcome_uncertain/);
  assert.equal(s.receipt.attempts.length, 1); assert.equal(s.receipt.copies.length, 0); assert.equal(s.data.posts, 1);
  const priorRequests = s.data.methods.length;
  await assert.rejects(copyVerified(s.inventory, { ...s, receipt: s.receipt }), /copy_attempt_requires_review/);
  assert.equal(s.data.methods.length, priorRequests);
});

test('wrong successful copy acknowledgement never creates a trusted receipt', async (t) => {
  const s = await storage(t, { badAck: true });
  await assert.rejects(copyVerified(s.inventory, s), /copy_acknowledgement/);
  assert.equal(s.receipt.attempts.length, 1); assert.equal(s.receipt.copies.length, 0); assert.equal(s.data.posts, 1);
  await assert.rejects(copyVerified(s.inventory, { ...s, receipt: s.receipt }), /copy_attempt_requires_review/); assert.equal(s.data.posts, 1);
});

test('a pre-existing identical destination without receipt is a collision and no bytes are downloaded', async (t) => {
  const s = await storage(t, { collision: true });
  await assert.rejects(copyVerified(s.inventory, s), /unreceipted_collision/);
  assert.equal(s.data.posts, 0); assert.equal(s.data.reads, 0);
});

test('a generic gateway404 is never interpreted as an absent object', async (t) => {
  const s = await storage(t, { missingError: {} });
  await assert.rejects(copyVerified(s.inventory, s), /storage_missing_unproven/);
  assert.equal(s.data.posts, 0); assert.equal(s.data.reads, 0);
});

test('legacy400 object-not-found must carry the exact404 object code', async (t) => {
  const s = await storage(t, { missingStatus: 400 });
  await copyVerified(s.inventory, s); assert.equal(s.data.posts, 1); assert.equal(s.receipt.records.length, 1);
});

test('corrupt destination with unchanged size and metadata never receives a verified record', async (t) => {
  const s = await storage(t, { corrupt: true });
  await assert.rejects(copyVerified(s.inventory, s), /copy_content_mismatch/);
  assert.equal(s.receipt.copies.length, 1); assert.equal(s.receipt.records.length, 0);
  await assert.rejects(copyVerified(s.inventory, { ...s, receipt: s.receipt }), /copy_content_mismatch/); assert.equal(s.data.posts, 1);
});

test('source mutation after server copy refuses final verification', async (t) => {
  const s = await storage(t, { sourceChange: true });
  await assert.rejects(copyVerified(s.inventory, s), /source_changed/);
  assert.equal(s.receipt.records.length, 0); assert.equal(s.data.posts, 1);
});

for (const [label, options, code] of [
  ['public destination', { public: true }, 'destination_not_private'],
  ['insufficient byte limit', { limit: 1 }, 'destination_incompatible'],
  ['unsupported destination MIME', { mimes: ['image/jpeg'] }, 'destination_incompatible'],
  ['different actual source MIME', { badMime: true }, 'content_type'],
  ['missing ETag header', { missingHeader: 'etag' }, 'content_etag'],
  ['missing length header', { missingHeader: 'content-length' }, 'content_length'],
  ['compressed representation', { compressed: true }, 'content_encoding'],
  ['interrupted partial body', { truncated: true }, 'content_network'],
]) test(`refuses ${label} before any copy`, async (t) => {
  const s = await storage(t, options);
  await assert.rejects(copyVerified(s.inventory, s), new RegExp(code)); assert.equal(s.data.posts, 0);
});

test('redirect cannot send credentials or content to another origin', async (t) => {
  let leaked = 0;
  const foreign = createServer((req, res) => { leaked++; res.end('must not reach'); });
  foreign.listen(0, '127.0.0.1'); await once(foreign, 'listening');
  t.after(() => new Promise((done) => foreign.close(done)));
  const s = await storage(t, { redirect: `http://127.0.0.1:${foreign.address().port}/outside` });
  await assert.rejects(copyVerified(s.inventory, s), /storage_network/);
  assert.equal(leaked, 0); assert.equal(s.data.posts, 0);
});

for (const [label, change] of [
  ['foreign origin', (r) => { r.source_url = r.source_url.replace(`${project}.supabase.co`, 'outside.invalid'); }],
  ['credentialed URL', (r) => { r.source_url = r.source_url.replace('https://', 'https://user:password@'); }],
  ['changed mapping', (r) => { r.object_id = 'HOTRUN9970070002'; }],
  ['other bucket', (r) => { r.source_bucket = 'raw_imports'; }],
  ['traversal', (r) => { r.source_path = '../outside'; }],
  ['encoded traversal', (r) => { r.source_path = 'synthetic/%2e%2e/outside'; }],
  ['encoded slash', (r) => { r.source_path = 'synthetic/%2foutside'; }],
  ['oversize', (r) => { r.source_metadata.size = 42_305_171; }],
  ['unreviewed MIME', (r) => { r.source_metadata.content_type = 'text/html'; }],
]) test(`manifest refuses ${label} offline`, () => {
  const f = fixture(); change(f.manifest.records[0]);
  assert.throws(() => inspectManifest(Buffer.from(JSON.stringify(f.manifest)), project, 1));
});

test('receipts are bound to the exact serialized manifest and exact destination identity', async (t) => {
  const s = await storage(t); await copyVerified(s.inventory, s);
  const changed = structuredClone(s.receipt); changed.manifest_sha256 = sha256('different');
  await assert.rejects(copyVerified(s.inventory, { ...s, receipt: changed }), /receipt_scope/);
  s.data.destination.id = sourceId;
  await assert.rejects(copyVerified(s.inventory, { ...s, receipt: s.receipt }), /destination_changed/);
  assert.equal(s.data.posts, 1);
});

test('an existing receipt cannot omit the verified MIME/cache provenance', async (t) => {
  const s = await storage(t); await copyVerified(s.inventory, s);
  const changed = structuredClone(s.receipt); delete changed.records[0].destination_content_type;
  await assert.rejects(copyVerified(s.inventory, { ...s, receipt: changed }), /receipt_content/);
  assert.equal(s.data.posts, 1);
});

test('an already aborted execution emits no copy or byte request', async (t) => {
  const s = await storage(t); const controller = new AbortController(); controller.abort();
  await assert.rejects(copyVerified(s.inventory, { ...s, signal: controller.signal }), /interrupted/);
  assert.equal(s.data.posts, 0); assert.equal(s.data.reads, 0);
});

test('an existing null receipt is refused before any request instead of becoming a fresh receipt', async (t) => {
  const s = await storage(t);
  await assert.rejects(copyVerified(s.inventory, { ...s, receipt: null }), /receipt_scope/);
  assert.equal(s.data.methods.length, 0);
});

test('atomic receipt checkpoint round trips and refuses an unreviewed leftover temporary file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'db07-copy-'));
  try {
    const file = join(dir, 'receipt.json'); await saveReceipt(file, { records: [] });
    assert.deepEqual(JSON.parse(await readFile(file)), { records: [] });
    await writeFile(`${file}.next`, 'interrupted');
    await assert.rejects(saveReceipt(file, { records: ['new'] }), /receipt_write_failed/);
    assert.deepEqual(JSON.parse(await readFile(file)), { records: [] });
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir())); assert.match(basename(dir), /^db07-copy-/);
    await rm(dir, { recursive: true, force: true });
  }
});

test('project operation lock prevents a parallel run with a different receipt path or manifest digest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'db07-copy-'));
  let release; const barrier = new Promise((done) => { release = done; });
  let entered; const acquired = new Promise((done) => { entered = done; });
  const f = fixture(); const locks = join(dir, 'locks');
  try {
    const first = withOperatorLocks(join(dir, 'receipt.json'), f.inventory, async () => { entered(); await barrier; }, locks);
    await acquired;
    const alternate = { ...f.inventory, digest: sha256('other') };
    await assert.rejects(withOperatorLocks(join(dir, 'different-receipt.json'), alternate, async () => assert.fail('must not run'), locks), /operator_locked/);
    release(); await first;
    await assert.rejects(withOperatorLocks(join(dir, 'receipt.json'), f.inventory, async () => { throw new Error('copy_outcome_uncertain'); }, locks), /copy_outcome_uncertain/);
    await withOperatorLocks(join(dir, 'receipt.json'), f.inventory, async () => {}, locks);
    const projectLock = join(locks, `${project}.lock`);
    await assert.rejects(withOperatorLocks(join(dir, 'receipt.json'), f.inventory, async () => {
      await unlink(projectLock);
    }, locks), /lock_cleanup_failed/);
    await assert.rejects(withOperatorLocks(join(dir, 'receipt.json'), f.inventory, async () => {
      await unlink(projectLock); throw new Error('copy_outcome_uncertain');
    }, locks), /copy_outcome_uncertain/);
  } finally {
    release();
    assert.equal(dirname(resolve(dir)), resolve(tmpdir())); assert.match(basename(dir), /^db07-copy-/);
    await rm(dir, { recursive: true, force: true });
  }
});

test('default CLI preview succeeds on a complete synthetic1710 manifest without credentials, writes or execution', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'db07-copy-'));
  try {
    const f = fixture(); const original = f.manifest.records[0];
    f.manifest.expected_count = 1710;
    f.manifest.records = Array.from({ length: 1710 }, (_, i) => {
      const id = `00000000-0000-4000-a000-${String(i + 1).padStart(12, '0')}`;
      const sourcePath = `synthetic/fixture-${i}.pdf`; const target = `objects/${original.object_id}/${id}`;
      return { ...structuredClone(original), document_id: id, source_path: sourcePath,
        source_url: `https://${project}.supabase.co/storage/v1/object/public/old_legal_media/${sourcePath}`,
        destination_path: target, destination_url: `storage://legal-documents/${target}`,
        source_metadata: { ...original.source_metadata, id, name: sourcePath } };
    });
    const file = join(dir, 'manifest.json'); const serialized = JSON.stringify(f.manifest); await writeFile(file, serialized);
    const args = ['tools/private-media/copy-verified.mjs', '--manifest', file, '--project-ref', project,
      '--source-bucket', 'old_legal_media', '--destination-bucket', 'legal-documents'];
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 3000,
      env: { ...process.env, DB07_STORAGE_SERVICE_KEY: 'invalid-private-key-must-not-be-read' } });
    assert.equal(result.status, 0); assert.equal(result.stderr, '');
    assert.equal(result.stdout.includes('invalid-private-key'), false);
    const preview = JSON.parse(result.stdout); assert.equal(preview.mode, 'preview'); assert.equal(preview.network, false);
    assert.equal(preview.records, 1710); assert.equal(preview.manifest_sha256, sha256(serialized));
    const refused = spawnSync(process.execPath, [...args, '--execute'], { encoding: 'utf8', timeout: 3000 });
    assert.equal(refused.status, 1); assert.match(refused.stderr, /execution_arguments/);
    const wrong = spawnSync(process.execPath, [...args, '--expect-sha256', sha256('other')], { encoding: 'utf8', timeout: 3000 });
    assert.equal(wrong.status, 1); assert.match(wrong.stderr, /manifest_digest/);
    const python = spawnSync(process.platform === 'win32' ? 'python' : 'python3',
      ['-I', '-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', timeout: 3000 });
    assert.equal(python.status, 0);
    const pythonPath = python.stdout.trim();
    assert.ok(isAbsolute(pythonPath));
    const reservationConfig = join(dir, 'reservation.json');
    await writeFile(reservationConfig, JSON.stringify({
      mode: 'hosted', project_ref: project, manifest_sha256: sha256(serialized),
      storage_origin_sha256: sha256(`https://${project}.supabase.co`),
      namespace_id: '00000000-0000-4000-a000-000000009104',
      epoch: '00000000-0000-4000-a000-000000009105',
    }));
    const receiptFile = join(dir, 'receipt.json');
    const execute = [...args, '--expect-sha256', sha256(serialized), '--reservation-config', reservationConfig,
      '--python', pythonPath, '--execute'];
    const executeOptions = { encoding: 'utf8', timeout: 10000,
      env: { ...process.env, DB07_STORAGE_SERVICE_KEY: 'invalid-key-must-not-be-read' } };
    const stdinEnv = { ...process.env };
    for (const name of Object.keys(stdinEnv)) {
      if (name.toUpperCase() === 'DB07_STORAGE_SERVICE_KEY') delete stdinEnv[name];
    }
    const stdinArgs = [...execute, '--receipt', receiptFile, '--storage-key-stdin'];
    const runWithInput = (input, overrides = {}) => spawnSync(process.execPath, stdinArgs,
      { ...executeOptions, env: stdinEnv, input, ...overrides });
    const previewInput = spawnSync(process.execPath, [...args, '--storage-key-stdin'],
      { ...executeOptions, input: 'fixture-key' });
    assert.equal(previewInput.stderr.trim(), 'DB07 copy refused: arguments');
    await writeFile(`${receiptFile}.next`, 'unreviewed checkpoint');
    await writeFile(`${receiptFile}.lock`, 'synthetic existing lock');
    const locked = spawnSync(process.execPath, [...execute, '--receipt', receiptFile], executeOptions);
    assert.equal(locked.status, 1); assert.equal(locked.stderr.trim(), 'DB07 copy refused: operator_locked');
    assert.equal(runWithInput('invalid stdin!').stderr.trim(), 'DB07 copy refused: operator_locked');
    await unlink(`${receiptFile}.lock`);
    const beforeKey = spawnSync(process.execPath, [...execute, '--receipt', receiptFile], executeOptions);
    assert.equal(beforeKey.status, 1); assert.equal(beforeKey.stderr.trim(), 'DB07 copy refused: receipt_write_failed');
    assert.equal(await readFile(`${receiptFile}.next`, 'utf8'), 'unreviewed checkpoint');
    await assert.rejects(readFile(receiptFile), { code: 'ENOENT' });
    await unlink(`${receiptFile}.next`); await writeFile(receiptFile, 'null');
    const nullReceipt = spawnSync(process.execPath, [...execute, '--receipt', receiptFile], executeOptions);
    assert.equal(nullReceipt.status, 1); assert.equal(nullReceipt.stderr.trim(), 'DB07 copy refused: receipt_scope');
    assert.equal(await readFile(receiptFile, 'utf8'), 'null');
    const unignored = spawnSync(process.execPath, [...execute, '--receipt',
      resolve('tools/private-media/synthetic-unignored-receipt.json')], executeOptions);
    assert.equal(unignored.status, 1); assert.match(unignored.stderr, /receipt_must_be_private/);
    assert.equal(runWithInput('invalid stdin!').stderr.trim(), 'DB07 copy refused: receipt_scope');
    await unlink(receiptFile);
    for (const input of ['', 'a'.repeat(4097), 'sb_secret_one\nsb_secret_two\n', 'sb_secret_one\n\n']) {
      const rejected = runWithInput(input);
      assert.equal(rejected.status, 1);
      assert.equal(rejected.stderr.trim(), 'DB07 copy refused: service_key_stdin');
    }
    assert.equal(runWithInput('sb_secret_fixture', { env: executeOptions.env }).stderr.trim(),
      'DB07 copy refused: service_key_source');
    await assert.rejects(readFile(receiptFile), { code: 'ENOENT' });

    const preload = `
      import assert from 'node:assert/strict';
      import childProcess from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      const { spawnSync } = childProcess;
      childProcess.spawnSync = (command, args, options) => {
        assert.equal(command, 'git');
        assert.ok(options.env);
        assert.equal(Object.keys(options.env).some((key) => key.toUpperCase() === 'DB07_STORAGE_SERVICE_KEY'), false);
        return spawnSync(command, args, options);
      };
      syncBuiltinESMExports();
      globalThis.fetch = (target, options) => {
        assert.equal(target.href, 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co/storage/v1/bucket/legal-documents');
        assert.equal(options.headers.apikey, 'sb_secret_fixture');
        assert.equal(process.env.DB07_STORAGE_SERVICE_KEY, process.argv.includes('--storage-key-stdin')
          ? undefined : 'sb_secret_fixture');
        return new Response('', { status: 418 });
      };
    `;
    const preloaded = [`--import=data:text/javascript,${encodeURIComponent(preload)}`];
    const stdinKey = spawnSync(process.execPath, [...preloaded, ...stdinArgs],
      { ...executeOptions, env: stdinEnv, input: 'sb_secret_fixture\r\n' });
    const envKey = spawnSync(process.execPath, [...preloaded, ...execute, '--receipt', receiptFile],
      { ...executeOptions, env: { ...stdinEnv, DB07_STORAGE_SERVICE_KEY: 'sb_secret_fixture' } });
    for (const run of [stdinKey, envKey]) {
      assert.equal(run.status, 1);
      assert.equal(run.stdout, '');
      assert.equal(run.stderr.trim(), 'DB07 copy refused: storage_http');
    }
    assert.doesNotMatch(await readFile(receiptFile, 'utf8'), /sb_secret_fixture/);
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir())); assert.match(basename(dir), /^db07-copy-/);
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI rejects extra arguments without printing keys or paths; production count cannot be bypassed', () => {
  const result = spawnSync(process.execPath, ['tools/private-media/copy-verified.mjs', '--unknown', 'private-value'], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /arguments/); assert.doesNotMatch(result.stderr, /private-value/);
  const f = fixture(); assert.throws(() => inspectManifest(f.serialized, project), /manifest_count/);
  assert.throws(() => storageTransport({ projectRef: project, serviceKey: 'sb_secret_real-looking', testOrigin: 'http://127.0.0.1:54321' }), /test_origin/);
  assert.throws(() => storageTransport({ projectRef: project, serviceKey: 'test-only-no-real-key', testOrigin: 'https://outside.invalid' }), /test_origin/);
});
