import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { loadListEmailDisposable } from './disposable.mjs';
import { SqlSession } from './sql-session.mjs';

// The loader validates all targets before any fixture or session is created.
const local = await loadListEmailDisposable();

async function fixture() {
  const owned = [];
  try {
    const open = () => { const session = new SqlSession(local.spawnPsql); owned.push(session); return session; };
    const admin = open(), first = open(), second = open(), holder = open();
    const user = randomUUID(), foreign = randomUUID(), list = randomUUID();
    const org = `ORGM${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
    await admin.query(`BEGIN; SET LOCAL "request.jwt.claims"='{"role":"service_role"}';
      INSERT INTO public.object(id,object_type,name,status) VALUES('${org}','ORG','Synthetic mail ORG','draft');
      INSERT INTO auth.users(id,email) VALUES('${user}','mail-${user}@example.invalid'),('${foreign}','mail-${foreign}@example.invalid');
      INSERT INTO public.app_user_profile(id,role) VALUES('${user}','tourism_agent') ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role;
      INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES('${user}','${org}',true);
      INSERT INTO public.object_list(id,org_object_id,created_by,kind,name) VALUES('${list}','${org}','${user}','static','Synthetic mail list'); COMMIT;`);
    for (const worker of [first, second, holder]) await worker.query('SET ROLE service_role');
    const context = (worker) => worker.query(`SELECT api.get_list_email_context('${user}','${list}')`).then(JSON.parse);
    const prepare = (worker, operation, generation = 0, confirm = false, parents = [], recipient = 'b') => worker.query(
      `SELECT api.prepare_list_email('${user}','${list}','${operation}',repeat('a',64),repeat('${recipient}',64),${generation},${confirm},ARRAY[${parents.map((id) => `'${id}'`).join(',')}]::uuid[])`).then(JSON.parse);
    const begin = (worker, operation, token, recipient = 'b') => worker.query(
      `SELECT api.begin_list_email('${user}','${list}','${operation}','${token}',repeat('a',64),repeat('${recipient}',64))`).then(JSON.parse);
    const complete = (worker, operation, token, proof = 'a') => worker.query(
      `SELECT api.complete_list_email('${user}','${list}','${operation}','${token}','accepted',false,NULL,repeat('${proof}',64))`);
    const ack = (worker, operation, proof = 'a') => worker.query(`SELECT api.ack_list_email_client('${user}','${list}','${operation}',repeat('${proof}',64))`);
    return { admin, first, second, holder, user, foreign, list, org, context, prepare, begin, complete, ack,
      async close() {
        let cleanupError;
        try {
          await holder.query('ROLLBACK').catch(() => {});
          // The real membership FK is NO ACTION: remove its owned children
          // before the ORG, and never swallow a cleanup failure again.
          await admin.query(`BEGIN; SET LOCAL "request.jwt.claims"='{"role":"service_role"}';
            DELETE FROM public.object_list WHERE id='${list}';
            DELETE FROM public.user_org_membership WHERE user_id IN ('${user}','${foreign}');
            DELETE FROM auth.users WHERE id IN ('${user}','${foreign}');
            DELETE FROM public.object WHERE id='${org}';
            DELETE FROM internal.list_email_metric WHERE user_id='${user}'; COMMIT;`);
          assert.equal(await admin.query(`SELECT
            (SELECT count(*) FROM auth.users WHERE id IN ('${user}','${foreign}'))+
            (SELECT count(*) FROM public.app_user_profile WHERE id IN ('${user}','${foreign}'))+
            (SELECT count(*) FROM public.user_org_membership WHERE user_id IN ('${user}','${foreign}'))+
            (SELECT count(*) FROM public.object_list WHERE id='${list}')+
            (SELECT count(*) FROM public.object WHERE id='${org}')+
            (SELECT count(*) FROM internal.list_email_intent WHERE list_id='${list}')+
            (SELECT count(*) FROM internal.list_email_scope WHERE list_id='${list}')+
            (SELECT count(*) FROM internal.list_email_metric WHERE user_id='${user}')`), '0',
          'owned synthetic mail fixtures must be cleaned; append-only traces die with the disposable stack');
        } catch (error) { cleanupError = error; }
        const closed = await Promise.allSettled([admin, first, second, holder].map((client) => client.close()));
        if (cleanupError) throw cleanupError;
        if (closed.some((result) => result.status === 'rejected')) throw new Error('Owned disposable SQL cleanup failed');
      } };
  } catch (error) {
    // A setup failure must not leave three idle psql children holding this process.
    await Promise.allSettled(owned.map((session) => session.close()));
    throw error;
  }
}
async function waitForLock(f, pids) {
  assert.ok(pids.every((pid) => /^\d+$/.test(pid)));
  for (let i = 0; i < 100; i++) {
    if (await f.admin.query(`SELECT count(*) FROM pg_stat_activity WHERE pid IN (${pids.join(',')}) AND wait_event_type='Lock'`) === String(pids.length)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('all consumers must actually wait on the owned list lock');
}

test('two actual sessions reserve one permit and CAS one synthetic effect for the same gesture', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const operation = randomUUID();
    const pids = await Promise.all([f.first, f.second].map((worker) => worker.query('SELECT pg_backend_pid()')));
    await f.holder.query(`BEGIN; SELECT id FROM public.object_list WHERE id='${f.list}' FOR UPDATE`);
    const pending = [f.prepare(f.first, operation), f.prepare(f.second, operation)];
    await waitForLock(f, pids); await f.holder.query('COMMIT');
    const receipts = await Promise.all(pending);
    assert.ok(receipts.every((r) => r.state === 'reserved'));
    assert.equal(receipts[0].attempt_token, receipts[1].attempt_token);
    const verdicts = await Promise.all([f.begin(f.first, operation, receipts[0].attempt_token), f.begin(f.second, operation, receipts[1].attempt_token)]);
    assert.equal(verdicts.filter((v) => v.started === true).length, 1);
    assert.equal(verdicts.filter((v) => v.started === false && v.state === 'unknown').length, 1);
    assert.equal(await f.complete(f.first, operation, receipts[0].attempt_token), 't');
    assert.equal((await f.prepare(f.second, operation)).state, 'accepted');
    assert.equal(await f.ack(f.second, operation), 't');
    assert.equal(await f.admin.query(`SELECT sum(admitted)=1 AND sum(started)=1 AND sum(accepted)=1 FROM internal.list_email_metric WHERE user_id='${f.user}'`), 't');
  } finally { await f.close(); }
});

test('two different gestures using the same captured generation cannot both reserve', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const results = await Promise.all([f.prepare(f.first, randomUUID()), f.prepare(f.second, randomUUID())]);
    assert.deepEqual(results.map((r) => r.state).sort(), ['reserved', 'stale']);
    assert.equal(await f.admin.query(`SELECT count(*) FROM internal.list_email_intent WHERE user_id='${f.user}'`), '1');
    assert.equal(await f.admin.query(`SELECT sum(started)=0 FROM internal.list_email_metric WHERE user_id='${f.user}'`), 't');
  } finally { await f.close(); }
});

test('lost prepare acknowledgement and restart never dispatch automatically; reload requires explicit consent', { timeout: 30000 }, async () => {
  const f = await fixture(), restarted = new SqlSession(local.spawnPsql);
  try {
    await restarted.query('SET ROLE service_role');
    const a = randomUUID(), b = randomUUID();
    const first = await f.prepare(f.first, a); assert.equal(first.state, 'reserved');
    assert.equal((await f.context(restarted)).generations['b'.repeat(64)], '1');
    const discovery = await f.prepare(restarted, b, 1);
    assert.equal(discovery.state, 'unknown'); assert.deepEqual(discovery.operation_ids, [a]);
    assert.equal(await f.admin.query(`SELECT count(*)=1 AND bool_and(started_at IS NULL) FROM internal.list_email_intent WHERE user_id='${f.user}'`), 't');
    const confirmed = await f.prepare(restarted, b, 1, true); assert.equal(confirmed.state, 'reserved');
    assert.equal((await f.begin(f.first, a, first.attempt_token)).started, false);
    assert.equal((await f.begin(restarted, b, confirmed.attempt_token)).started, true);
    assert.equal(await f.complete(restarted, b, confirmed.attempt_token), 't');
  } finally { await restarted.close(); await f.close(); }
});

test('known SMTP acceptance without client ACK is rediscovered after reload; exact result proof settles only its receipt', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const a = randomUUID(), b = randomUUID(), c = randomUUID();
    const first = await f.prepare(f.first, a);
    assert.equal((await f.begin(f.first, a, first.attempt_token)).started, true);
    assert.equal(await f.complete(f.first, a, first.attempt_token, 'a'), 't');
    assert.equal((await f.prepare(f.second, b, 1)).state, 'unknown');
    const replacement = await f.prepare(f.second, b, 1, true);
    assert.equal((await f.begin(f.second, b, replacement.attempt_token)).started, true);
    assert.equal(await f.complete(f.second, b, replacement.attempt_token, 'b'), 't');
    assert.equal(await f.ack(f.first, b, 'a'), 'f');
    assert.equal(await f.ack(f.second, b, 'b'), 't'); assert.equal(await f.ack(f.second, b, 'b'), 't');
    assert.equal(await f.admin.query(`SELECT client_received_at IS NULL AND state='accepted' FROM internal.list_email_intent WHERE user_id='${f.user}' AND operation_id='${a}'`), 't');
    assert.equal((await f.prepare(f.first, c, 2)).state, 'reserved', 'positive new action after acknowledged replacement');
    assert.equal(await f.ack(f.first, a, 'a'), 't');
    assert.equal(await f.admin.query(`SELECT client_received_at IS NULL FROM internal.list_email_intent WHERE user_id='${f.user}' AND operation_id='${c}'`), 't');
  } finally { await f.close(); }
});

test('old live A waiting before reservation cannot refresh after C completes and ACKs without knowing A IDs', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const a = randomUUID(), c = randomUUID();
    assert.deepEqual((await f.context(f.first)).generations, {}); // A captures generation0 before waiting.
    await f.holder.query(`BEGIN; SELECT id FROM public.object_list WHERE id='${f.list}' FOR UPDATE`);
    const pid = await f.first.query('SELECT pg_backend_pid()');
    const delayedA = f.prepare(f.first, a, 0); await waitForLock(f, [pid]);
    const replacement = await f.prepare(f.holder, c, 0);
    assert.equal((await f.begin(f.holder, c, replacement.attempt_token)).started, true);
    assert.equal(await f.complete(f.holder, c, replacement.attempt_token), 't'); assert.equal(await f.ack(f.holder, c), 't');
    await f.holder.query('COMMIT');
    assert.equal((await delayedA).state, 'stale');
    assert.equal(await f.admin.query(`SELECT count(*) FROM internal.list_email_intent WHERE user_id='${f.user}' AND operation_id='${a}'`), '0');
    assert.equal((await f.begin(f.first, a, randomUUID())).started, false);
    assert.equal(await f.admin.query(`SELECT sum(admitted)=1 AND sum(started)=1 AND sum(accepted)=1 FROM internal.list_email_metric WHERE user_id='${f.user}'`), 't');
  } finally { await f.close(); }
});

test('C atomically closes absent A/B predecessors while their preparations wait, not merely a client memory chain', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const a = randomUUID(), b = randomUUID(), c = randomUUID();
    const pids = await Promise.all([f.first, f.second].map((worker) => worker.query('SELECT pg_backend_pid()')));
    await f.holder.query(`BEGIN; SELECT id FROM public.object_list WHERE id='${f.list}' FOR UPDATE`);
    const pending = [f.prepare(f.first, a), f.prepare(f.second, b, 0, true, [a])]; await waitForLock(f, pids);
    const replacement = await f.prepare(f.holder, c, 0, true, [a, b]); assert.equal(replacement.state, 'reserved');
    await f.holder.query('COMMIT');
    assert.ok((await Promise.all(pending)).every((r) => r.state === 'conflict' && r.attempt_token === undefined));
    assert.equal((await f.begin(f.first, c, replacement.attempt_token)).started, true);
    assert.equal(await f.complete(f.first, c, replacement.attempt_token), 't');
    assert.equal(await f.admin.query(`SELECT count(*)=2 AND bool_and(state='superseded' AND started_at IS NULL) FROM internal.list_email_intent WHERE user_id='${f.user}' AND operation_id IN ('${a}','${b}')`), 't');
  } finally { await f.close(); }
});

test('authorization is reread after the real list-lock wait, and post-effect result recording survives committed departure', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const a = randomUUID(), b = randomUUID();
    const first = await f.prepare(f.first, a), pending = await f.prepare(f.first, b, 0, false, [], 'c');
    assert.equal((await f.begin(f.first, a, first.attempt_token)).started, true);
    await f.holder.query(`BEGIN; SELECT id FROM public.object_list WHERE id='${f.list}' FOR UPDATE`);
    const pid = await f.second.query('SELECT pg_backend_pid()');
    const dispatch = f.begin(f.second, b, pending.attempt_token, 'c'); await waitForLock(f, [pid]);
    await f.admin.query(`UPDATE public.user_org_membership SET is_active=false WHERE user_id='${f.user}' AND org_object_id='${f.org}'`);
    await f.holder.query('COMMIT');
    assert.equal((await dispatch).state, 'forbidden');
    assert.equal((await f.context(f.second)).state, 'forbidden');
    assert.equal((await f.prepare(f.second, randomUUID(), 1)).state, 'forbidden');
    assert.equal(await f.complete(f.first, a, first.attempt_token), 't'); assert.equal(await f.ack(f.first, a), 't');
    assert.equal(await f.admin.query(`SELECT sum(started)=1 AND sum(accepted)=1 FROM internal.list_email_metric WHERE user_id='${f.user}'`), 't');
  } finally { await f.close(); }
});
