import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAnonymousHeadRefusal, assertStorageRefusal, storageErrorIdentity } from './storage-refusals.mjs';

const error = (status, payload) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

test('exact modern and versioned legacy collision/MIME refusals are positive controls', async () => {
  await assertStorageRefusal(error(409, { code: 'ResourceAlreadyExists' }), 'collision', 'modern collision');
  await assertStorageRefusal(error(400, { statusCode: '409', error: 'Duplicate' }), 'collision', 'local collision');
  await assertStorageRefusal(error(415, { code: 'InvalidMimeType' }), 'mime', 'modern MIME');
  await assertStorageRefusal(error(400, { statusCode: '415', error: 'invalid_mime_type' }), 'mime', 'local MIME');
});

test('server failures and unrelated refusals never stand in for collision or MIME enforcement', async () => {
  for (const [kind, status, payload] of [
    ['collision', 500, { statusCode: '409', error: 'Duplicate' }],
    ['collision', 503, { code: 'ResourceAlreadyExists' }],
    ['collision', 400, { statusCode: '500', error: 'Duplicate' }],
    ['collision', 403, { code: 'AccessDenied' }],
    ['collision', 409, { code: 'InternalError', error: 'Duplicate' }],
    ['collision', 409, { code: 'Unrecognized', error: 'Duplicate' }],
    ['collision', 200, { code: 'ResourceAlreadyExists' }],
    ['mime', 500, { statusCode: '415', code: 'InvalidMimeType' }],
    ['mime', 400, { statusCode: '415', code: 'InvalidRequest' }],
    ['mime', 400, { statusCode: '500', error: 'invalid_mime_type' }],
    ['mime', 415, { error: 'unknown', message: 'mime type rejected' }],
  ]) await assert.rejects(assertStorageRefusal(error(status, payload), kind, 'synthetic negative'));
  await assert.rejects(assertStorageRefusal(new Response('not JSON', { status: 409 }), 'collision', 'invalid JSON'));
});

test('anonymous HEAD accepts known authorization/not-found statuses and rejects success, redirects and server failures', () => {
  for (const status of [400, 401, 403, 404]) assertAnonymousHeadRefusal(new Response(null, { status }));
  for (const status of [200, 204, 301, 304, 429, 500, 502, 503]) {
    assert.throws(() => assertAnonymousHeadRefusal(new Response(null, { status })));
  }
  assert.equal(storageErrorIdentity({ code: 'Unrecognized', error: 'Duplicate' }), 'unknown');
});
