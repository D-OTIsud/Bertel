import assert from 'node:assert/strict';
import test from 'node:test';
import { collision, assertRace } from './contract.mjs';
import { assertLoopbackApi, validateEnvironment } from './disposable.mjs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const ok = { status: 200, payloadHash: 'a' };
const duplicate = { status: 400, body: { statusCode: '409', error: 'Duplicate' } };

test('only a unique successful payload plus precise collision establishes the contract', () => {
  assert.doesNotThrow(() => assertRace([ok, duplicate], 'a'));
  assert.doesNotThrow(() => assertRace([duplicate, ok], 'a'));
  assert.throws(() => assertRace([ok, { ...ok, payloadHash: 'b' }], 'b'), /exactly one/);
  assert.throws(() => assertRace([ok, duplicate], 'b'), /unique successful/);
  assert.throws(() => assertRace([duplicate, duplicate], 'a'), /exactly one/);
});

test('server failures, forged collision labels and unrelated refusals never count as a collision', () => {
  for (const status of [401, 403, 404, 429, 500, 502, 503]) {
    const bad = { status, body: { statusCode: '409', code: 'KeyAlreadyExists' } };
    assert.equal(collision(bad), false);
    assert.throws(() => assertRace([ok, bad], 'a'), /exact represented409/);
  }
  for (const body of [{ statusCode: '500', code: 'KeyAlreadyExists' }, { error: 'Duplicate' },
    { statusCode: '409', code: 'Unknown', error: 'Duplicate' }, { statusCode: '409', code: 'AccessDenied' }]) {
    assert.equal(collision({ status: 400, body }), false);
  }
  assert.equal(collision({ status: 409, body: { code: 'KeyAlreadyExists' } }), true);
});

test('the probe refuses hosted or ambiguous endpoints and unowned work directories before any request', () => {
  assert.equal(assertLoopbackApi('http://127.0.0.1:54321'), 'http://127.0.0.1:54321');
  for (const url of ['https://example.supabase.co', 'http://localhost:54321', 'http://127.0.0.1:54322',
    'http://user@127.0.0.1:54321', 'http://127.0.0.1:54321/path']) assert.throws(() => assertLoopbackApi(url));
  const runner = resolve(tmpdir(), 'create-only-test-runner');
  const env = { GITHUB_ACTIONS: 'true', CI: 'true', STORAGE_CREATE_ONLY_DISPOSABLE: 'true', RUNNER_TEMP: runner,
    STORAGE_CREATE_ONLY_WORKDIR: join(runner, 'bertel-storage-create-only') };
  assert.equal(validateEnvironment(env), env.STORAGE_CREATE_ONLY_WORKDIR);
  for (const patch of [{ CI: 'false' }, { GITHUB_ACTIONS: 'false' }, { STORAGE_CREATE_ONLY_DISPOSABLE: 'false' },
    { STORAGE_CREATE_ONLY_WORKDIR: runner }, { STORAGE_CREATE_ONLY_WORKDIR: resolve(runner, '../foreign') }]) {
    assert.throws(() => validateEnvironment({ ...env, ...patch }));
  }
});
