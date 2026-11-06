import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

assert.equal(process.env.LIST_EMAIL_DISPOSABLE, 'true', 'explicit disposable authorization required');
assert.ok(process.env.LIST_EMAIL_SUPABASE_WORKDIR && process.env.LIST_EMAIL_TEST_DB_URL, 'disposable Supabase workdir and database required');
const dsn = new URL(process.env.LIST_EMAIL_TEST_DB_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(dsn.hostname) && dsn.pathname === '/postgres', 'loopback database required');
let status;
try { status = JSON.parse(execFileSync('supabase', ['status', '--workdir', process.env.LIST_EMAIL_SUPABASE_WORKDIR, '--output', 'json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
catch { throw new Error('Cannot read disposable Supabase status'); }
const origin = new URL(status.API_URL);
assert.ok(['http:', 'https:'].includes(origin.protocol) && ['127.0.0.1', 'localhost'].includes(origin.hostname)
  && !origin.username && !origin.password, 'loopback Supabase API required');
assert.ok(status.SERVICE_ROLE_KEY && status.ANON_KEY, 'local generated keys required');
const service = { apikey: status.SERVICE_ROLE_KEY, authorization: `Bearer ${status.SERVICE_ROLE_KEY}` };
const anonymous = { apikey: status.ANON_KEY, authorization: `Bearer ${status.ANON_KEY}` };
const request = (path, headers, body, method = 'POST') => fetch(new URL(path, origin), {
  method, redirect: 'error', headers: { ...headers, 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
});
const rpc = async (headers, name, args) => request(`/rest/v1/rpc/${name}`, { ...headers, 'content-profile': 'api', 'accept-profile': 'api' }, args);
function sql(statement) {
  // Input contains exact synthetic fixture IDs only. No keys, JWTs or business mail.
  try { return execFileSync(process.env.LIST_EMAIL_PSQL ?? 'psql', [dsn.href, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
    { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { throw new Error('Disposable list-mail SQL fixture failed'); }
}

test('real Auth/PostgREST keep service-only receipt identity, concurrent one-attempt and revocation semantics', { timeout: 45000 }, async () => {
  let user;
  const list = randomUUID(), operation = randomUUID();
  const org = `ORGM${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const email = `list-mail-${randomUUID()}@example.invalid`, password = `Synthetic!7-${randomUUID()}`;
  try {
    // Confirmed administrative fixture, never invite/recovery or SMTP.
    const created = await request('/auth/v1/admin/users', service, { email, password, email_confirm: true });
    assert.ok([200, 201].includes(created.status), 'local synthetic Auth creation');
    user = (await created.json()).id; assert.match(user, /^[0-9a-f-]{36}$/);
    const login = await request('/auth/v1/token?grant_type=password', anonymous, { email, password });
    assert.equal(login.status, 200); const session = await login.json(); assert.ok(session.access_token);
    const caller = { apikey: status.ANON_KEY, authorization: `Bearer ${session.access_token}` };
    const verified = await request('/auth/v1/user', caller, undefined, 'GET');
    assert.equal(verified.status, 200); assert.equal((await verified.json()).id, user);
    sql(`BEGIN; SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
      INSERT INTO public.object(id,object_type,name,status) VALUES('${org}','ORG','Synthetic mail ORG','draft');
      INSERT INTO public.app_user_profile(id,role) VALUES('${user}','tourism_agent') ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
      INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES('${user}','${org}',true);
      INSERT INTO public.object_list(id,org_object_id,created_by,kind,name) VALUES('${list}','${org}','${user}','static','Synthetic list'); COMMIT;`);
    const args = { p_user_id: user, p_list_id: list, p_operation_id: operation, p_fingerprint: 'a'.repeat(64), p_recipient_fingerprint: 'b'.repeat(64) };
    for (const identity of [anonymous, caller]) {
      const denied = await rpc(identity, 'claim_list_email', args);
      assert.ok([401, 403].includes(denied.status), 'ordinary role cannot choose a receipt identity');
    }
    const claims = await Promise.all([rpc({ ...service }, 'claim_list_email', args), rpc({ ...service }, 'claim_list_email', args)]);
    assert.ok(claims.every((r) => r.status === 200), 'real service-role must execute invoker RPC and row locks');
    const receipts = await Promise.all(claims.map((r) => r.json()));
    assert.ok(receipts.every((r) => r.state === 'reserved')); assert.equal(receipts[0].attempt_token, receipts[1].attempt_token);
    const exact = { p_user_id: user, p_list_id: list, p_operation_id: operation, p_attempt_token: receipts[0].attempt_token };
    const begun = await Promise.all([rpc(service, 'begin_list_email', exact), rpc(service, 'begin_list_email', exact)]);
    assert.ok(begun.every((r) => r.status === 200)); const verdicts = await Promise.all(begun.map((r) => r.json()));
    let fakeEffects = 0; for (const verdict of verdicts) if (verdict.started === true) fakeEffects++;
    assert.equal(fakeEffects, 1); assert.equal(verdicts.filter((r) => r.started === false && r.state === 'unknown').length, 1);
    const unknown = await rpc(service, 'claim_list_email', args); assert.equal(unknown.status, 200); assert.equal((await unknown.json()).state, 'unknown');
    // An old HTTP request can still be preparing outside SQL. Close its absent
    // key before confirmed B; even after B accepts, late A must never gain a permit.
    const absentA = randomUUID(), replacementB = randomUUID();
    const replacementArgs = { ...args, p_operation_id: replacementB, p_recipient_fingerprint: 'c'.repeat(64), p_confirmed_previous_operation_id: absentA };
    const reservedB = await rpc(service, 'claim_list_email', replacementArgs); assert.equal(reservedB.status, 200);
    const receiptB = await reservedB.json(); assert.equal(receiptB.state, 'reserved');
    const exactB = { ...exact, p_operation_id: replacementB, p_attempt_token: receiptB.attempt_token };
    const beginB = await rpc(service, 'begin_list_email', exactB); assert.equal(beginB.status, 200);
    const verdictB = await beginB.json(); if (verdictB.started === true) fakeEffects++;
    assert.equal(verdictB.started, true);
    const ackB = await rpc(service, 'complete_list_email', { ...exactB, p_outcome: 'accepted' }); assert.equal(ackB.status, 200); assert.equal(await ackB.json(), true);
    const lateA = await rpc(service, 'claim_list_email', { ...args, p_operation_id: absentA, p_recipient_fingerprint: 'c'.repeat(64) });
    assert.equal(lateA.status, 200); const verdictA = await lateA.json(); assert.equal(verdictA.state, 'conflict');
    assert.equal(verdictA.attempt_token, undefined); assert.equal(fakeEffects, 2, 'only the original operation and B admitted an effect, never A');
    sql(`UPDATE public.user_org_membership SET is_active=false WHERE user_id='${user}' AND org_object_id='${org}';`);
    const revoked = await rpc(service, 'claim_list_email', args); assert.equal(revoked.status, 200); assert.equal((await revoked.json()).state, 'forbidden');
    const ack = await rpc(service, 'complete_list_email', { ...exact, p_outcome: 'accepted', p_tracking_updated: false });
    assert.equal(ack.status, 200); assert.equal(await ack.json(), true);
    assert.equal(sql(`SELECT sum(admitted)=2 AND sum(started)=2 AND sum(accepted)=2 FROM internal.list_email_metric WHERE user_id='${user}';`), 't');
  } finally {
    if (user) {
      sql(`DELETE FROM public.object_list WHERE id='${list}'; DELETE FROM public.object WHERE id='${org}'; DELETE FROM internal.list_email_metric WHERE user_id='${user}';`);
      const removed = await request(`/auth/v1/admin/users/${user}`, service, { should_soft_delete: false }, 'DELETE');
      assert.equal(removed.status, 200, 'synthetic fixture cleanup');
    }
  }
});
