import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { loadDisposable } from './disposable.mjs';

const local = loadDisposable();
const component = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const objectPath = (bucket, key) => `${component(bucket)}/${key.split('/').map(component).join('/')}`;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const etag = (value) => typeof value === 'string' ? value.replace(/^"|"$/g, '') : null;
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const protocolErrors = new Set(['InvalidKey', 'InvalidRequest', 'InvalidMimeType', 'invalid_mime_type', 'NoSuchKey', 'NoSuchObject',
  'not_found', 'AccessDenied', 'KeyAlreadyExists', 'ResourceAlreadyExists', 'Duplicate', 'InternalError']);
// v1.41.8's response schema strips `code` on some routes; its legacy `error`
// field still carries an explicit identity. Never print a free-form message.
const errorCode = (error) => [error?.code, error?.error].find((value) => protocolErrors.has(value)) ?? 'unknown';
async function result(response, label) {
  if (!response.ok) {
    // Expose only the protocol's enum code; messages can contain locators.
    const error = await response.json().catch(() => null);
    assert.fail(`${label} failed (${response.status}, ${errorCode(error)})`);
  }
  return response.json();
}
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64');

test('real local Storage preserves private cross-bucket copy bytes and stored metadata; transport cache is observed separately', { timeout: 45000 }, async (t) => {
  const source = `rights-src-${randomUUID()}`, destination = `rights-dst-${randomUUID()}`;
  const buckets = [];
  const uploaded = ['synthetic/resume l\'apostrophe.pdf', 'synthetic/point.png'];
  const copied = ['copied/resume l\'apostrophe.pdf', 'copied/point.png', 'copied/race.pdf', 'rejected/direct.png'];
  const storedCache = 'max-age=60';
  const info = (bucket, key) => local.request(`/storage/v1/object/info/${objectPath(bucket, key)}`, local.service, undefined, 'GET');
  const head = (bucket, key, who = local.service, route = 'authenticated') => local.request(
    `/storage/v1/object/${route}/${objectPath(bucket, key)}`, who, undefined, 'HEAD', { 'accept-encoding': 'identity' });
  const copy = (sourceKey, destinationKey) => local.request('/storage/v1/object/copy', local.service,
    { bucketId: source, sourceKey, destinationBucket: destination, destinationKey }, 'POST', { 'x-upsert': 'false' });
  try {
    for (const [id, types] of [[source, ['application/pdf', 'image/png']], [destination, ['application/pdf', 'image/jpeg']]]) {
      await result(await local.request('/storage/v1/bucket', local.service,
        { id, name: id, public: false, file_size_limit: 1024, allowed_mime_types: types }), 'private synthetic bucket creation');
      buckets.push(id);
      const bucket = await result(await local.request(`/storage/v1/bucket/${id}`, local.service, undefined, 'GET'), 'private bucket confirmation');
      assert.ok(bucket.id === id && bucket.public === false);
    }
    for (const [index, bytes, mime] of [[0, pdf, 'application/pdf'], [1, png, 'image/png']]) {
      await result(await local.request(`/storage/v1/object/${objectPath(source, uploaded[index])}`, local.service, bytes, 'POST',
        { 'content-type': mime, 'cache-control': storedCache, 'x-upsert': 'false' }), 'synthetic byte upload');
    }
    // First prove positive uploads, then distinguish Unicode validation from a
    // general upload failure. v1.41.8's isValidKey explicitly rejects Unicode.
    const accented = await local.request(`/storage/v1/object/${objectPath(source, 'synthetic/résumé.pdf')}`, local.service, pdf, 'POST',
      { 'content-type': 'application/pdf', 'cache-control': storedCache, 'x-upsert': 'false' });
    const accentedError = await accented.json();
    assert.ok(accented.status === 400 && errorCode(accentedError) === 'InvalidKey',
      `accented key validation differs from this version's contract (${accented.status}, ${errorCode(accentedError)})`);
    const missing = await info(source, 'synthetic/absent.pdf');
    assert.ok(!missing.ok, 'missing info must not be mistaken for an existing object');
    const absent = await missing.json();
    assert.ok((missing.status === 404 || (missing.status === 400 && Number(absent.statusCode) === 404))
      && ['NoSuchKey', 'NoSuchObject', 'not_found'].includes(errorCode(absent)), 'missing info must carry an explicit not-found identity');

    const transportCache = [];
    for (const [index, bytes, mime] of [[0, pdf, 'application/pdf'], [1, png, 'image/png']]) {
      const original = await result(await info(source, uploaded[index]), 'flat source info');
      assert.ok(uuid(original.id) && original.name === uploaded[index] && original.bucket_id === source
        && original.size === bytes.length && original.content_type === mime && typeof original.cache_control === 'string'
        && typeof original.etag === 'string', 'info must expose the actual flat operator contract');
      assert.ok(original.cache_control === storedCache, 'positive upload must store the exact requested cache metadata');
      const originalHead = await head(source, uploaded[index]);
      assert.ok(originalHead.ok && /^"[^"\r\n]+"$/.test(originalHead.headers.get('etag') ?? '')
        && !originalHead.headers.get('etag').startsWith('W/'), 'authenticated HEAD must carry a strong ETag');
      assert.ok(Number(originalHead.headers.get('content-length')) === bytes.length && originalHead.headers.get('content-type')?.split(';')[0] === mime);
      assert.ok(etag(originalHead.headers.get('etag')) === etag(original.etag), 'info and HEAD identify the same stored bytes');
      const ack = await result(await copy(uploaded[index], copied[index]), 'cross-bucket copy acknowledgement');
      const target = await result(await info(destination, copied[index]), 'destination info');
      assert.ok(uuid(ack.Id) && ack.Key === `${destination}/${copied[index]}` && ack.Id === target.id, 'copy ACK must identify the exact destination object');
      assert.ok(target.name === copied[index] && target.bucket_id === destination && target.size === original.size
        && target.content_type === original.content_type && target.cache_control === original.cache_control, 'copy must preserve stored size, MIME and cache metadata');
      const targetHead = await head(destination, copied[index]);
      assert.ok(targetHead.ok && Number(targetHead.headers.get('content-length')) === bytes.length
        && targetHead.headers.get('content-type')?.split(';')[0] === mime && etag(targetHead.headers.get('etag')) === etag(target.etag));
      assert.ok(targetHead.headers.get('cache-control') === originalHead.headers.get('cache-control'), 'same private endpoint transport policy stays coherent');
      // Stored cache_control and authenticated transport Cache-Control are separate
      // contracts. Their equality is intentionally NOT asserted or simulated.
      transportCache.push({ stored: original.cache_control, authenticated: originalHead.headers.get('cache-control') });
      const reads = await Promise.all([[source, uploaded[index]], [destination, copied[index]]].map(async ([bucket, key]) => {
        const response = await local.request(`/storage/v1/object/authenticated/${objectPath(bucket, key)}`, local.service, undefined, 'GET', { 'accept-encoding': 'identity' });
        assert.ok(response.ok, 'authorized synthetic content verification must succeed');
        return Buffer.from(await response.arrayBuffer());
      }));
      assert.ok(reads.every((read) => read.length === bytes.length && digest(read) === digest(bytes)), 'real source and destination SHA256 must equal the synthetic input');
      assert.ok(!(await head(destination, copied[index], local.anonymous)).ok
        && !(await head(destination, copied[index], local.anonymous, 'public')).ok, 'private copied bytes must remain unavailable anonymously');
    }
    // The destination intentionally rejects PNG uploads; server copy is tested
    // separately, without changing its restrictions to force compatibility.
    const uploadRejected = await local.request(`/storage/v1/object/${objectPath(destination, copied[3])}`, local.service, png, 'POST',
      { 'content-type': 'image/png', 'x-upsert': 'false' });
    assert.ok(!uploadRejected.ok, 'the negative MIME-upload control must be active');
    const before = await result(await info(destination, copied[0]), 'before collision');
    assert.ok(!(await copy(uploaded[0], copied[0])).ok, 'an existing target must refuse copy without upsert');
    const after = await result(await info(destination, copied[0]), 'after collision');
    assert.ok(after.id === before.id && after.etag === before.etag && after.size === before.size, 'collision must preserve existing destination metadata');
    const race = await Promise.all([copy(uploaded[0], copied[2]), copy(uploaded[0], copied[2])]);
    assert.ok(race.filter((response) => response.ok).length === 1, 'two real concurrent copies must create one destination only');
    const raceInfo = await result(await info(destination, copied[2]), 'race destination');
    const raceAck = await race.find((response) => response.ok).json();
    assert.ok(raceAck.Id === raceInfo.id && raceAck.Key === `${destination}/${copied[2]}`);
    t.diagnostic(`Synthetic Storage PDF/PNG contract passed; apostrophe/space keys exact, accented upload rejected InvalidKey; stored-cache/transport-cache differ=${transportCache.some((cache) => cache.stored !== cache.authenticated)}. Local image/version is not a production attestation.`);
  } finally {
    let cleanupOk = true;
    for (const bucket of buckets.reverse()) {
      try {
        const removal = await local.request(`/storage/v1/object/${bucket}`, local.service,
          { prefixes: bucket === source ? uploaded : copied }, 'DELETE');
        if (!removal.ok || !(await local.request(`/storage/v1/bucket/${bucket}`, local.service, undefined, 'DELETE')).ok) cleanupOk = false;
      } catch { cleanupOk = false; }
    }
    assert.ok(cleanupOk, 'synthetic Storage cleanup failed; disposable stack destruction is mandatory');
  }
});
