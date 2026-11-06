import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

assert.equal(process.env.AI_QUOTA_DISPOSABLE, 'true', 'explicit disposable-database authorization required');
assert.ok(process.env.AI_QUOTA_SUPABASE_WORKDIR, 'local fresh Supabase workdir required');
let status;
try {
  // Capture locally generated keys in memory only. No stdout, file or .env dump.
  status = JSON.parse(execFileSync('supabase', ['status', '--workdir', process.env.AI_QUOTA_SUPABASE_WORKDIR, '--output', 'json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }));
} catch { throw new Error('Cannot read the disposable Supabase status JSON'); }
const origin = new URL(status.API_URL);
assert.ok(['http:', 'https:'].includes(origin.protocol) && ['127.0.0.1', 'localhost'].includes(origin.hostname)
  && !origin.username && !origin.password, 'loopback Supabase API required');
assert.ok(status.SERVICE_ROLE_KEY && status.ANON_KEY, 'local service and anonymous keys required');
const service = { apikey: status.SERVICE_ROLE_KEY, authorization: `Bearer ${status.SERVICE_ROLE_KEY}` };
const anonymous = { apikey: status.ANON_KEY, authorization: `Bearer ${status.ANON_KEY}` };
const jsonRequest = (path, headers, body, method = 'POST') => fetch(new URL(path, origin), {
  method, redirect: 'error', headers: { ...headers, 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000),
});
const rpc = (headers, userId, route = 'translate') => jsonRequest('/rest/v1/rpc/admit_ai_request', {
  ...headers, 'content-profile': 'api', 'accept-profile': 'api',
}, { p_user_id: userId, p_route: route });

test('real GoTrue identity and PostgREST roles preserve the shared per-route budget without a provider', { timeout: 30000 }, async () => {
  let userId;
  const email = `quota-${randomUUID()}@example.invalid`;
  const password = `Quota!A7-${randomUUID()}`;
  try {
    // Admin creation with confirmed email: no invite, recovery or SMTP endpoint.
    const createdResponse = await jsonRequest('/auth/v1/admin/users', service, { email, password, email_confirm: true });
    assert.ok(createdResponse.ok, `local fixture creation failed (${createdResponse.status})`);
    const created = await createdResponse.json();
    assert.equal(created.email, email);
    assert.ok(typeof created.id === 'string');
    userId = created.id;
    const login = await jsonRequest('/auth/v1/token?grant_type=password', anonymous, { email, password });
    assert.ok(login.ok, `local fixture login failed (${login.status})`);
    const session = await login.json();
    assert.ok(typeof session.access_token === 'string');
    const authenticated = { apikey: status.ANON_KEY, authorization: `Bearer ${session.access_token}` };
    const verified = await jsonRequest('/auth/v1/user', authenticated, undefined, 'GET');
    assert.ok(verified.ok, 'local Auth identity must be independently verified');
    assert.equal((await verified.json()).id, userId);

    for (const headers of [anonymous, authenticated]) {
      const denied = await rpc(headers, userId);
      assert.ok([401, 403].includes(denied.status), `ordinary role must not execute admission (${denied.status})`);
    }

    // Independent HTTP callers use the same service-only SQL identity/budget.
    // Only a local in-memory effect counter is incremented on acceptance.
    const first = () => rpc({ ...service }, userId);
    const second = () => rpc({ ...service }, userId);
    const responses = await Promise.all(Array.from({ length: 24 }, (_, index) => (index % 2 ? first : second)()));
    assert.ok(responses.every((response) => response.ok), 'service-role PostgREST calls must reach the real RPC');
    const outcomes = await Promise.all(responses.map((response) => response.json()));
    let fakeEffects = 0;
    for (const outcome of outcomes) if (outcome.allowed === true) fakeEffects += 1;
    assert.equal(fakeEffects, 12);
    assert.equal(outcomes.filter((outcome) => outcome.allowed === false).length, 12);
    assert.ok(outcomes.filter((outcome) => !outcome.allowed).every((outcome) => outcome.retry_after >= 1 && outcome.retry_after <= 60));
    const restarted = await rpc({ ...service }, userId);
    assert.equal((await restarted.json()).allowed, false);
    const otherRoute = await rpc(service, userId, 'menu_extract');
    assert.ok(otherRoute.ok);
    assert.equal((await otherRoute.json()).allowed, true);
  } finally {
    if (userId) {
      const removed = await jsonRequest(`/auth/v1/admin/users/${userId}`, service, { should_soft_delete: false }, 'DELETE');
      assert.ok(removed.ok, `local fixture cleanup failed (${removed.status})`);
    }
  }
});
