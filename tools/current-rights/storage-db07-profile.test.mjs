import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { loadDisposable } from './disposable.mjs';
import { assertAnonymousHeadRefusal, assertStorageRefusal, storageErrorIdentity } from './storage-refusals.mjs';

const local = loadDisposable();
const limit = 10 * 1024 * 1024;
const sourceLimit = 50_000_000;
const pdf = 'application/pdf';
const png = 'image/png';
const destinationMimes = [pdf, 'image/jpeg'];
const samples = [
  [pdf, limit + 1, 'pdf'],
  ['image/jpeg', limit + 1, 'jpg'],
  [png, 42_305_170, 'png'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 4096, 'docx'],
  ['image/heif', 4096, 'heif'],
];
const uploadHeaders = { 'cache-control': 'max-age=60', 'x-upsert': 'false' };
const info = (bucket, key) => local.request(`/storage/v1/object/info/${bucket}/${key}`, local.service, undefined, 'GET');

async function json(response, stage) {
  const data = await response.json().catch(() => null);
  assert.ok(response.ok && data, `${stage} failed (${response.status}, ${storageErrorIdentity(data)})`);
  return data;
}

async function assertMissing(bucket, key) {
  const response = await info(bucket, key);
  const body = await response.json().catch(() => null);
  assert.ok((response.status === 404 || (response.status === 400 && Number(body?.statusCode) === 404))
    && ['NoSuchKey', 'NoSuchObject', 'not_found'].includes(storageErrorIdentity(body)), 'refused upload must leave no registered object');
}

const upload = (bucket, key, bytes, mime) => local.request(`/storage/v1/object/${bucket}/${key}`, local.service, bytes, 'POST',
  { ...uploadHeaders, 'content-type': mime });

async function hashObject(bucket, key, size, mime) {
  const response = await local.request(`/storage/v1/object/authenticated/${bucket}/${key}`, local.service, undefined, 'GET',
    { 'accept-encoding': 'identity' });
  assert.ok(response.ok && response.body, 'authenticated GET failed');
  assert.equal(Number(response.headers.get('content-length')), size);
  assert.equal(response.headers.get('content-type')?.split(';')[0], mime);
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    assert.ok(bytes <= size, 'authenticated body exceeded expected length');
    hash.update(chunk);
  }
  assert.equal(bytes, size);
  return hash.digest('hex');
}

test('DB07 v1.41.8 sequential copy preserves five MIME types through the 10 MiB private destination', { timeout: 120_000 }, async (t) => {
  const run = randomUUID();
  const source = `db07-src-${run}`, destination = `db07-dst-${run}`;
  const buckets = new Map();
  const createBucket = async (id, isPublic, size, types) => {
    await json(await local.request('/storage/v1/bucket', local.service,
      { id, name: id, public: isPublic, file_size_limit: size, allowed_mime_types: types }), 'create synthetic bucket');
    buckets.set(id, []);
  };
  const checkBucket = async (id, isPublic, size, types) => {
    const bucket = await json(await local.request(`/storage/v1/bucket/${id}`, local.service, undefined, 'GET'), 'read synthetic bucket profile');
    assert.equal(bucket.id, id);
    assert.equal(bucket.public, isPublic);
    assert.equal(Number(bucket.file_size_limit), size);
    assert.deepEqual([...bucket.allowed_mime_types].sort(), [...types].sort());
  };
  const checkRefusals = async (phase) => {
    const large = `controls/${phase}-large.pdf`, wrongMime = `controls/${phase}-mime.png`;
    buckets.get(destination).push(large, wrongMime);
    const oversized = await upload(destination, large, Buffer.alloc(limit + 1, 1), pdf);
    const problem = await oversized.json().catch(() => null);
    const code = problem?.code === undefined ? problem?.error : problem.code;
    assert.ok((oversized.status === 413 && (problem?.statusCode === undefined || Number(problem.statusCode) === 413)
        || oversized.status === 400 && Number(problem?.statusCode) === 413)
      && ['EntityTooLarge', 'Payload too large'].includes(code), 'direct oversized PDF must receive an explicit size refusal');
    await assertStorageRefusal(await upload(destination, wrongMime, Buffer.alloc(4096, 2), png), 'mime', 'direct PNG');
    await assertMissing(destination, large);
    await assertMissing(destination, wrongMime);
  };

  try {
    const sourceMimes = samples.map(([mime]) => mime);
    await createBucket(source, true, sourceLimit, sourceMimes);
    await createBucket(destination, false, limit, destinationMimes);
    await checkBucket(source, true, sourceLimit, sourceMimes);
    await checkBucket(destination, false, limit, destinationMimes);
    await checkRefusals('before');

    for (const [index, [mime, size, extension]] of samples.entries()) {
      const sourceKey = `synthetic/${index}.${extension}`, destinationKey = `objects/HOTRUN9970070001/${randomUUID()}`;
      buckets.get(source).push(sourceKey);
      buckets.get(destination).push(destinationKey);
      const bytes = Buffer.alloc(size, index + 1);
      const expectedHash = createHash('sha256').update(bytes).digest('hex');
      await json(await upload(source, sourceKey, bytes, mime), 'upload synthetic source');
      const original = await json(await info(source, sourceKey), 'read source metadata');
      assert.equal(original.size, size);
      assert.equal(original.content_type, mime);
      assert.equal(original.cache_control, uploadHeaders['cache-control']);
      const ack = await json(await local.request('/storage/v1/object/copy', local.service,
        { bucketId: source, sourceKey, destinationBucket: destination, destinationKey }, 'POST', { 'x-upsert': 'false' }), 'copy synthetic source');
      const target = await json(await info(destination, destinationKey), 'read destination metadata');
      assert.match(ack.Id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      assert.equal(ack.Id, target.id);
      assert.equal(ack.Key, `${destination}/${destinationKey}`);
      assert.equal(target.name, destinationKey);
      assert.equal(target.bucket_id, destination);
      assert.equal(target.size, size);
      assert.equal(target.content_type, mime);
      assert.equal(target.cache_control, original.cache_control);
      assert.equal(await hashObject(source, sourceKey, size, mime), expectedHash);
      assert.equal(await hashObject(destination, destinationKey, size, mime), expectedHash);
      for (const access of ['authenticated', 'public']) {
        assertAnonymousHeadRefusal(await local.request(`/storage/v1/object/${access}/${destination}/${destinationKey}`,
          local.anonymous, undefined, 'HEAD'));
      }
      t.diagnostic(`${mime} ${size} bytes: stored metadata and both hashes match`);
    }

    await checkBucket(destination, false, limit, destinationMimes);
    await checkRefusals('after');
  } finally {
    let cleanupOk = true;
    for (const [bucket, paths] of [...buckets].reverse()) {
      try {
        const removal = await local.request(`/storage/v1/object/${bucket}`, local.service, { prefixes: paths }, 'DELETE');
        if (!removal.ok || !(await local.request(`/storage/v1/bucket/${bucket}`, local.service, undefined, 'DELETE')).ok) cleanupOk = false;
      } catch { cleanupOk = false; }
    }
    assert.ok(cleanupOk, 'synthetic cleanup failed; disposable stack stop is mandatory');
  }
});
