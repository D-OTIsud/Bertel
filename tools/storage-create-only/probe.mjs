// Real HTTP capability probe, not an operator or a simulated Storage server.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { loadDisposable, validateEnvironment } from './disposable.mjs';
import { assertRace, collision } from './contract.mjs';

const local = loadDisposable();
const workdir = validateEnvironment(process.env);
const bucket = `create-only-${randomUUID()}`;
const keys = ['sequential.bin', 'race-0.bin', 'race-1.bin', 'race-2.bin'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const payloads = [Buffer.concat([Buffer.from('FICTIONAL-PAYLOAD-A\n'), Buffer.alloc(256 * 1024, 65)]),
  Buffer.concat([Buffer.from('FICTIONAL-PAYLOAD-B\n'), Buffer.alloc(384 * 1024, 66)])];
const hashes = payloads.map(sha);
assert.notEqual(hashes[0], hashes[1]);
const report = { version: local.version, image: local.image, imageId: local.imageId,
  sourceCommit: 'bb602aa99e44709609e46aa745298dd7b1dfa066', fixture: 'synthetic-only',
  payloadHashes: hashes, sequential: null, races: [], cleanup: false, capabilityPassed: false };

async function call(path, method = 'GET', body, extra = {}) {
  const response = await fetch(`${local.api}/storage/v1${path}`, { method, redirect: 'error',
    signal: AbortSignal.timeout(15_000), headers: { ...local.headers, ...extra }, body });
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length <= 1024 * 1024, 'bounded synthetic response required');
  let json;
  try { json = JSON.parse(bytes.toString()); } catch { /* Binary download. */ }
  return { status: response.status, body: json, bytes };
}
const object = key => `/object/${bucket}/${key}`;
const info = key => call(`/object/info/${bucket}/${key}`);
const read = key => call(`/object/authenticated/${bucket}/${key}`, 'GET', undefined,
  { 'cache-control': 'no-cache', 'accept-encoding': 'identity' });
const upload = (key, bytes) => call(object(key), 'POST', bytes,
  { 'content-type': 'application/octet-stream', 'cache-control': 'no-cache', 'x-upsert': 'false' });
const outcome = (result, index) => ({ status: result.status, body: result.body, payloadHash: hashes[index] });
const safeOutcome = item => ({ status: item.status, representedStatus: item.body?.statusCode ?? null,
  code: item.body?.code ?? item.body?.error ?? null, payloadHash: item.payloadHash });

function heldUpload(key, bytes) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  const result = new Promise((resolve, reject) => {
    const request = httpRequest(`${local.api}/storage/v1${object(key)}`, { method: 'POST', headers: {
      ...local.headers, 'content-type': 'application/octet-stream', 'content-length': bytes.length,
      'cache-control': 'no-cache', 'x-upsert': 'false',
    } }, response => {
      let count = 0;
      const chunks = [];
      response.on('data', chunk => {
        count += chunk.length;
        if (count > 64 * 1024) { request.destroy(); reject(new Error('Upload response exceeded bound')); }
        else chunks.push(chunk);
      });
      response.on('end', () => {
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* Refused by contract. */ }
        resolve({ status: response.statusCode, body });
      });
    });
    request.setTimeout(15_000, () => request.destroy(new Error('Upload deadline exceeded')));
    request.once('error', () => { ready(); reject(new Error('Disposable upload transport failed')); });
    request.flushHeaders();
    request.write(bytes.subarray(0, 4096), () => {
      ready();
      void gate.then(() => request.end(bytes.subarray(4096)));
    });
  });
  return { started, result, release };
}

let bucketCreated = false;
const failures = [];
try {
  const created = await call('/bucket', 'POST', JSON.stringify({ id: bucket, name: bucket, public: false,
    file_size_limit: 1024 * 1024, allowed_mime_types: ['application/octet-stream'] }), { 'content-type': 'application/json' });
  assert.equal(created.status, 200, 'private synthetic bucket creation must succeed');
  bucketCreated = true;
  const first = await upload(keys[0], payloads[0]);
  assert.equal(first.status, 200, 'positive sequential upload required');
  const rejected = await upload(keys[0], payloads[1]);
  const stable = await read(keys[0]);
  assert.equal(stable.status, 200);
  report.sequential = { first: safeOutcome(outcome(first, 0)), repeated: safeOutcome(outcome(rejected, 1)), finalHash: sha(stable.bytes) };
  assert.ok(collision(rejected), 'sequential existing-target upload must have an exact collision, never a 5xx');
  assert.equal(sha(stable.bytes), hashes[0], 'sequential refusal must preserve the first payload');

  for (const key of keys.slice(1)) {
    const missing = await info(key);
    assert.ok((missing.status === 404 || (missing.status === 400 && Number(missing.body?.statusCode) === 404))
      && ['NoSuchKey', 'NoSuchObject', 'not_found'].includes(missing.body?.code ?? missing.body?.error),
    'race must start at a precisely absent synthetic target');
    const pending = payloads.map(bytes => heldUpload(key, bytes));
    // Both request bodies remain incomplete while their headers/first chunks are
    // in flight. This widens the actual precheck/upload window; it is not claimed
    // to be a server-side preflight barrier or a universal concurrency proof.
    const results = Promise.all(pending.map(item => item.result));
    // A transport can fail during the held-body delay. Mark the rejection as
    // handled immediately, while preserving the rejection of the original
    // promise at the final await and the outer cleanup/report finally block.
    void results.catch(() => {});
    try { await Promise.all(pending.map(item => item.started)); await delay(750); }
    finally { pending.forEach(item => item.release()); }
    const responses = await results;
    const downloaded = await read(key);
    assert.equal(downloaded.status, 200, 'final synthetic bytes must be readable');
    const finalHash = sha(downloaded.bytes);
    const entries = responses.map(outcome);
    const detail = { outcomes: entries.map(safeOutcome), accepted: entries.filter(item => item.status === 200).length,
      finalHash, finalMatchesPayload: hashes.indexOf(finalHash), passed: false };
    try { assertRace(entries, finalHash); detail.passed = true; }
    catch (error) { failures.push(error.message); }
    report.races.push(detail);
    console.log(JSON.stringify({ uploadRace: detail }));
    // Even a failing race still has to refuse a later replacement and preserve
    // exactly the final bytes observed after the concurrent requests settled.
    const later = await upload(key, Buffer.from('FICTIONAL-LATER-PAYLOAD'));
    assert.ok(collision(later), 'later upload must be a precise collision');
    const after = await read(key);
    assert.equal(after.status, 200);
    assert.equal(sha(after.bytes), finalHash, 'later refusal must preserve the observed winner bytes');
  }
  report.capabilityPassed = failures.length === 0 && report.races.length === 3;
} finally {
  try {
    if (bucketCreated) {
      const removed = await call(`/object/${bucket}`, 'DELETE', JSON.stringify({ prefixes: keys }), { 'content-type': 'application/json' });
      assert.equal(removed.status, 200, 'synthetic objects cleanup required');
      const removedBucket = await call(`/bucket/${bucket}`, 'DELETE');
      assert.equal(removedBucket.status, 200, 'synthetic bucket cleanup required');
    }
    report.cleanup = true;
  } finally { writeFileSync(join(workdir, 'probe-report.json'), `${JSON.stringify(report, null, 2)}\n`); }
}
assert.ok(report.cleanup);
assert.ok(report.capabilityPassed, `Storage ${local.version} did not demonstrate atomic create-only upload (${failures.length} failed races)`);
console.log('Real synthetic Storage upload capability passed: exactly one successful payload per target.');
