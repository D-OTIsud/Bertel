import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { loadListEmailDisposable } from './disposable.mjs';
const local = await loadListEmailDisposable();
const { service, anonymous, request } = local;
const rpc = (headers, name, args) => request(`/rest/v1/rpc/${name}`, { ...headers, 'content-profile': 'api', 'accept-profile': 'api' }, args);
const sql = (statement) => local.sql(statement, 'synthetic list mail');

test('real GoTrue/PostgREST enforce prepare/dispatch/result ACK, reload, generations and current authorization', { timeout: 45000 }, async () => {
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
    const caller = Object.freeze({ apikey: anonymous.apikey, authorization: `Bearer ${session.access_token}` });
    const verified = await request('/auth/v1/user', caller, undefined, 'GET');
    assert.equal(verified.status, 200); assert.equal((await verified.json()).id, user);
    sql(`BEGIN; SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
      INSERT INTO public.object(id,object_type,name,status) VALUES('${org}','ORG','Synthetic mail ORG','draft');
      INSERT INTO public.app_user_profile(id,role) VALUES('${user}','tourism_agent') ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
      INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES('${user}','${org}',true);
      INSERT INTO public.object_list(id,org_object_id,created_by,kind,name) VALUES('${list}','${org}','${user}','static','Synthetic list'); COMMIT;`);
    // ACC-09: ordinary list RPCs must observe current membership with the same Auth token.
    const listTarget = { p_list_id: list };
    const readOwnList = await rpc(caller, 'get_list', listTarget);
    assert.equal(readOwnList.status, 200);
    const detail = await readOwnList.json();
    assert.deepEqual([detail.id, detail.name, detail.can_edit], [list, 'Synthetic list', true]);
    const retainedName = 'Synthetic list saved before revocation';
    const updateOwnList = await rpc(caller, 'update_list', { ...listTarget, p_patch: { name: retainedName } });
    assert.equal(updateOwnList.status, 200);
    assert.equal((await updateOwnList.json()).name, retainedName);
    const listState = () => JSON.parse(sql(`SELECT jsonb_build_array(name,last_activity_at,updated_at)
      FROM public.object_list WHERE id='${list}'`));
    assert.equal(listState()[0], retainedName);

    const scope = { p_user_id: user, p_list_id: list };
    const args = { ...scope, p_operation_id: operation, p_fingerprint: 'a'.repeat(64), p_recipient_fingerprint: 'b'.repeat(64), p_expected_generation: '0' };
    for (const identity of [anonymous, caller]) for (const [name, body] of [
      ['get_list_email_context', scope], ['prepare_list_email', args],
      ['ack_list_email_client', { ...scope, p_operation_id: operation, p_result_token: 'a'.repeat(64) }],
    ]) {
      const denied = await rpc(identity, name, body);
      assert.ok([401, 403].includes(denied.status), 'ordinary role cannot choose a receipt identity or ACK');
    }
    const read = await rpc(service, 'get_list_email_context', scope); assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), { state: 'ready', generations: {} });
    const preparations = await Promise.all([rpc(service, 'prepare_list_email', args), rpc(service, 'prepare_list_email', args)]);
    assert.ok(preparations.every((r) => r.status === 200), 'actual service-role executes INVOKER and RLS contract');
    const receipts = await Promise.all(preparations.map((r) => r.json()));
    assert.ok(receipts.every((r) => r.state === 'reserved')); assert.equal(receipts[0].attempt_token, receipts[1].attempt_token);
    const exact = { ...scope, p_operation_id: operation, p_attempt_token: receipts[0].attempt_token, p_fingerprint: args.p_fingerprint, p_recipient_fingerprint: args.p_recipient_fingerprint };
    const wrongNonce = await rpc(service, 'begin_list_email', { ...exact, p_attempt_token: randomUUID() });
    assert.equal(wrongNonce.status, 200); assert.equal((await wrongNonce.json()).started, false);
    const begun = await Promise.all([rpc(service, 'begin_list_email', exact), rpc(service, 'begin_list_email', exact)]);
    assert.ok(begun.every((r) => r.status === 200));
    const verdicts = await Promise.all(begun.map((r) => r.json()));
    assert.equal(verdicts.filter((r) => r.started === true).length, 1);
    assert.equal(verdicts.filter((r) => r.started === false && r.state === 'unknown').length, 1);
    const ack = (op, proof) => rpc(service, 'ack_list_email_client', { ...scope, p_operation_id: op, p_result_token: proof });
    const premature = await ack(operation, 'a'.repeat(64)); assert.equal(premature.status, 200); assert.equal(await premature.json(), false);
    const complete = await rpc(service, 'complete_list_email', { ...scope, p_operation_id: operation, p_attempt_token: exact.p_attempt_token, p_outcome: 'accepted', p_result_token: 'a'.repeat(64) });
    assert.equal(complete.status, 200); assert.equal(await complete.json(), true);
    const replacementId = randomUUID();
    const discover = await rpc(service, 'prepare_list_email', { ...args, p_operation_id: replacementId, p_expected_generation: '1' });
    assert.equal(discover.status, 200); const unknown = await discover.json();
    assert.equal(unknown.state, 'unknown'); assert.deepEqual(unknown.operation_ids, [operation]);
    const confirmed = await rpc(service, 'prepare_list_email', { ...args, p_operation_id: replacementId, p_expected_generation: '1', p_confirm_resend: true });
    assert.equal(confirmed.status, 200); const replacement = await confirmed.json(); assert.equal(replacement.state, 'reserved');
    const replacementArgs = { ...exact, p_operation_id: replacementId, p_attempt_token: replacement.attempt_token };
    const positive = await rpc(service, 'begin_list_email', replacementArgs); assert.equal(positive.status, 200); assert.equal((await positive.json()).started, true);
    const accepted = await rpc(service, 'complete_list_email', { ...scope, p_operation_id: replacementId, p_attempt_token: replacement.attempt_token, p_outcome: 'accepted', p_result_token: 'b'.repeat(64) });
    assert.equal(accepted.status, 200); assert.equal(await accepted.json(), true);
    const wrongResult = await ack(replacementId, 'a'.repeat(64)); assert.equal(wrongResult.status, 200); assert.equal(await wrongResult.json(), false);
    const received = await ack(replacementId, 'b'.repeat(64)); assert.equal(received.status, 200); assert.equal(await received.json(), true);
    const old = await rpc(service, 'prepare_list_email', { ...args, p_operation_id: randomUUID() });
    assert.equal(old.status, 200); assert.equal((await old.json()).state, 'stale', 'old gesture is not refreshed even after current result ACK');
    const pendingId = randomUUID();
    const next = await rpc(service, 'prepare_list_email', { ...args, p_operation_id: pendingId, p_expected_generation: '2' });
    assert.equal(next.status, 200); const pending = await next.json(); assert.equal(pending.state, 'reserved');
    sql(`BEGIN; UPDATE public.user_org_membership SET is_active=false WHERE user_id='${user}' AND org_object_id='${org}'; COMMIT;`);
    // Same verified JWT remains cryptographically valid; fresh backend rights revoke its scope.
    const sameJwt = await request('/auth/v1/user', caller, undefined, 'GET');
    assert.equal(sameJwt.status, 200); assert.equal((await sameJwt.json()).id, user);
    const saved = listState();
    assert.equal(saved[0], retainedName);
    for (const [name, body] of [['get_list', listTarget],
      ['update_list', { ...listTarget, p_patch: { name: 'Forbidden edit after revocation' } }]]) {
      const rejected = await rpc(caller, name, body);
      assert.equal(rejected.status, 403, `${name} must reject the still-valid JWT after departure`);
      assert.equal((await rejected.json()).code, '42501');
    }
    assert.deepEqual(listState(), saved, 'the refused RPCs changed neither content nor list clocks');
    const deniedContext = await rpc(service, 'get_list_email_context', scope); assert.equal(deniedContext.status, 200); assert.equal((await deniedContext.json()).state, 'forbidden');
    const deniedBegin = await rpc(service, 'begin_list_email', { ...exact, p_operation_id: pendingId, p_attempt_token: pending.attempt_token });
    assert.equal(deniedBegin.status, 200); assert.equal((await deniedBegin.json()).state, 'forbidden');
    const deniedPrepare = await rpc(service, 'prepare_list_email', { ...args, p_operation_id: randomUUID(), p_expected_generation: '3' });
    assert.equal(deniedPrepare.status, 200); assert.equal((await deniedPrepare.json()).state, 'forbidden');
  } finally {
    sql(`BEGIN; SET LOCAL "request.jwt.claims"='{"role":"service_role"}';
      DELETE FROM public.object_list WHERE id='${list}';
      ${user ? `DELETE FROM public.user_org_membership WHERE user_id='${user}'; DELETE FROM internal.list_email_metric WHERE user_id='${user}';` : ''} COMMIT;`);
    if (user) { const removed = await request(`/auth/v1/admin/users/${user}`, service, undefined, 'DELETE'); assert.equal(removed.status, 200); }
    sql(`DELETE FROM public.object WHERE id='${org}';`);
    assert.equal(sql(`SELECT
      (SELECT count(*) FROM public.object_list WHERE id='${list}')+
      (SELECT count(*) FROM public.object WHERE id='${org}')+
      (SELECT count(*) FROM internal.list_email_intent WHERE list_id='${list}')+
      (SELECT count(*) FROM internal.list_email_scope WHERE list_id='${list}')
      ${user ? `+(SELECT count(*) FROM auth.users WHERE id='${user}')+(SELECT count(*) FROM public.app_user_profile WHERE id='${user}')+
        (SELECT count(*) FROM public.user_org_membership WHERE user_id='${user}')+(SELECT count(*) FROM internal.list_email_metric WHERE user_id='${user}')` : ''}`), '0',
    'owned HTTP mail fixtures must be cleaned; append-only traces die with the disposable stack');
  }
});
