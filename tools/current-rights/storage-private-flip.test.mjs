import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { loadDisposable } from './disposable.mjs';
import { storageErrorIdentity } from './storage-refusals.mjs';

const local = loadDisposable();
const bytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const mime = 'application/pdf';
const storage = '/storage/v1';

async function json(response, stage) {
  assert.ok(response.ok, stage + ' failed (' + response.status + ')');
  return response.json();
}

async function verifyBytes(response, stage) {
  assert.ok(response.status === 200, stage + ' failed (' + response.status + ')');
  assert.equal(response.headers.get('content-type')?.split(';')[0], mime);
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(bytes), stage + ' bytes differ');
}

async function verifyRefusal(response, stage, allowed) {
  const body = await response.json().catch(() => null);
  const wireCode = body?.code === undefined ? body?.error : body.code;
  // The v1.41.8 public GET schema strips code, while the handler wraps NoSuchBucket as HTTP 400.
  const legacyBucketRefusal = response.status === 400 && body?.code === undefined && body?.statusCode === '404'
    && body.error === 'Bucket not found' && body.message === 'Bucket not found';
  const code = legacyBucketRefusal ? 'NoSuchBucket' : wireCode;
  const logicalStatus = body?.statusCode === undefined ? response.status : Number(body.statusCode);
  const expectedStatus = allowed.get(code);
  const diagnostic = ['NoSuchBucket', 'Bucket not found'].includes(wireCode) ? wireCode : storageErrorIdentity({ code: wireCode });
  const represented = Number.isInteger(logicalStatus) && logicalStatus >= 100 && logicalStatus <= 599 ? logicalStatus : 'unknown';
  assert.ok(expectedStatus && logicalStatus === expectedStatus
    && (response.status === expectedStatus || response.status === 400),
  stage + ' did not return an explicit refusal (HTTP ' + response.status + ', reported ' + represented + ', ' + diagnostic + ')');
}

test('real disposable Storage refuses old public GETs after making an existing bucket private', { timeout: 60_000 }, async (t) => {
  const run = randomUUID();
  const bucket = 'db07-flip-' + run;
  const key = 'synthetic/witness.pdf';
  const bucketPath = storage + '/bucket/' + bucket;
  const objectPath = bucket + '/' + key;
  const publicPath = storage + '/object/public/' + objectPath;
  const directPath = storage + '/object/authenticated/' + objectPath;
  const publicRefusal = new Map([['NoSuchBucket', 404]]);
  const directRefusal = new Map([['NoSuchKey', 404], ['not_found', 404], ['AccessDenied', 403]]);
  let bucketCreated = false;
  let userCreated = false;
  let uploaded = false;

  try {
    const creation = await local.request(storage + '/bucket', local.service,
      { id: bucket, name: bucket, public: true, file_size_limit: 1024, allowed_mime_types: [mime] });
    bucketCreated = creation.ok;
    await json(creation, 'create disposable bucket');
    const before = await json(await local.request(bucketPath, local.service, undefined, 'GET'), 'read public bucket');
    assert.ok(before.id === bucket && before.public === true && Number(before.file_size_limit) === 1024);
    assert.deepEqual(before.allowed_mime_types, [mime]);
    const upload = await local.request(storage + '/object/' + objectPath, local.service, bytes, 'POST',
      { 'content-type': mime, 'cache-control': 'max-age=60', 'x-upsert': 'false' });
    uploaded = upload.ok;
    await json(upload, 'create synthetic object');
    await verifyBytes(await local.request(publicPath, {}, undefined, 'GET'), 'initial public GET');
    await verifyBytes(await local.request(publicPath, {}, undefined, 'GET'), 'repeat exact public GET before flip');

    const credentials = { email: 'db07-flip-' + run + '@example.invalid', password: 'Fixture!7-' + randomUUID() };
    const creationResponse = await local.request('/auth/v1/admin/users', local.service,
      { id: run, ...credentials, email_confirm: true });
    userCreated = creationResponse.ok;
    const user = await json(creationResponse, 'create synthetic unprivileged user');
    assert.ok(user.id === run && user.email_confirmed_at, 'fixture identity must be confirmed');
    const session = await json(await local.request('/auth/v1/token?grant_type=password', local.anonymous, credentials), 'authenticate synthetic user');
    assert.ok(typeof session.access_token === 'string' && session.access_token.length > 0, 'fixture must receive a real JWT');
    const userHeaders = { apikey: local.anonymous.apikey, authorization: 'Bearer ' + session.access_token };
    const identity = await json(await local.request('/auth/v1/user', userHeaders, undefined, 'GET'), 'verify synthetic user');
    assert.ok(identity.id === run && identity.role === 'authenticated', 'fixture must use an unprivileged JWT');
    await verifyBytes(await local.request(directPath, userHeaders, undefined, 'GET'), 'authenticated GET while bucket is public');

    const updated = await json(await local.request(bucketPath, local.service, { public: false }, 'PUT'), 'flip only bucket visibility');
    assert.equal(updated.message, 'Successfully updated');
    const after = await json(await local.request(bucketPath, local.service, undefined, 'GET'), 'read private bucket');
    assert.ok(after.id === bucket && after.public === false);
    assert.equal(after.file_size_limit, before.file_size_limit);
    assert.deepEqual(after.allowed_mime_types, before.allowed_mime_types);

    await verifyRefusal(await local.request(publicPath, {}, undefined, 'GET'), 'exact previously public URL', publicRefusal);
    await verifyRefusal(await local.request(publicPath + '?cacheNonce=' + randomUUID(), {}, undefined, 'GET'), 'cold public URL variant', publicRefusal);
    await verifyRefusal(await local.request(directPath, userHeaders, undefined, 'GET'), 'direct authenticated GET without a policy', directRefusal);

    const signed = await json(await local.request(storage + '/object/sign/' + bucket, local.service,
      { paths: [key], expiresIn: 60 }), 'sign the same private key');
    const prefix = '/object/sign/' + objectPath + '?token=';
    assert.ok(Array.isArray(signed) && signed.length === 1 && signed[0]?.path === key && !signed[0].error
      && typeof signed[0].signedURL === 'string' && signed[0].signedURL.startsWith(prefix)
      && /^[A-Za-z0-9._-]+$/.test(signed[0].signedURL.slice(prefix.length)), 'signer must return exactly the synthetic key');
    await verifyBytes(await local.request(storage + signed[0].signedURL, {}, undefined, 'GET'), 'download the signed private object');
    t.diagnostic('Storage origin only. The repeated public GET does not establish a hosted CDN cache hit or eviction.');
  } finally {
    let cleanupOk = true;
    if (bucketCreated) {
      try {
        const removed = await json(await local.request(storage + '/object/' + bucket, local.service,
          { prefixes: [key] }, 'DELETE'), 'delete only the synthetic key');
        assert.ok(Array.isArray(removed) && removed.length <= 1
          && (removed.length === 0 || removed[0]?.name === key)
          && (!uploaded || removed.length === 1), 'cleanup returned an unexpected object');
        const deleted = await local.request(bucketPath, local.service, undefined, 'DELETE');
        if (!deleted.ok) cleanupOk = false;
        await deleted.body?.cancel();
      } catch { cleanupOk = false; }
    }
    if (userCreated) {
      try {
        const deleted = await local.request('/auth/v1/admin/users/' + run, local.service, { should_soft_delete: false }, 'DELETE');
        if (!deleted.ok) cleanupOk = false;
        await deleted.body?.cancel();
      } catch { cleanupOk = false; }
    }
    assert.ok(cleanupOk, 'synthetic cleanup failed; disposable stack destruction is required');
  }
});
