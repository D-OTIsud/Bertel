import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Disposable loopback only: no project DSN, real identity, SMTP or external effect.
const dsn = process.env.LIST_EMAIL_TEST_DB_URL;
assert.equal(process.env.LIST_EMAIL_DISPOSABLE, 'true', 'explicit disposable authorization required');
assert.ok(dsn, 'LIST_EMAIL_TEST_DB_URL required');
const url = new URL(dsn);
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/postgres', 'disposable loopback database required');

class SqlSession {
  constructor() {
    this.pending = [];
    this.lines = [];
    this.buffer = '';
    this.sequence = 0;
    this.child = spawn(process.env.LIST_EMAIL_PSQL ?? 'psql', [dsn, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      let index;
      while ((index = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, index).replace(/\r$/, '');
        this.buffer = this.buffer.slice(index + 1);
        const active = this.pending[0];
        if (active && line === active.marker) {
          this.pending.shift();
          active.resolve(this.lines.join('\n'));
          this.lines = [];
        } else if (line) this.lines.push(line);
      }
    });
    let errorText = '';
    this.child.stderr.on('data', (chunk) => { errorText += chunk.toString(); });
    this.child.on('error', (error) => { for (const item of this.pending.splice(0)) item.reject(error); });
    this.child.on('exit', (code) => { for (const item of this.pending.splice(0)) item.reject(new Error(`psql exit ${code}: ${errorText}`)); });
  }
  query(sql) {
    const marker = `__list_email_result_${++this.sequence}__`;
    return new Promise((resolve, reject) => {
      this.pending.push({ marker, resolve, reject });
      this.child.stdin.write(`${sql};\n\\echo ${marker}\n`);
    });
  }
  close() {
    return new Promise((resolve) => {
      if (this.child.exitCode !== null) return resolve();
      this.child.once('exit', resolve);
      this.child.stdin.end('\\q\n');
    });
  }
}


async function fixture() {
  const admin = new SqlSession(), first = new SqlSession(), second = new SqlSession(), holder = new SqlSession();
  const user = randomUUID(), foreign = randomUUID(), list = randomUUID();
  const org = `ORGM${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  await admin.query(`INSERT INTO public.object(id,object_type,name,status) VALUES('${org}','ORG','Synthetic mail ORG','draft');
    INSERT INTO auth.users(id,email) VALUES('${user}','mail-concurrent@example.invalid'),('${foreign}','mail-foreign@example.invalid');
    INSERT INTO public.app_user_profile(id,role) VALUES('${user}','tourism_agent');
    INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES('${user}','${org}',true);
    INSERT INTO public.object_list(id,org_object_id,created_by,kind,name) VALUES('${list}','${org}','${user}','static','Synthetic mail list')`);
  for (const worker of [first, second, holder]) await worker.query('SET ROLE service_role');
  const claim = (worker, operation, previous) => worker.query(`SELECT api.claim_list_email('${user}','${list}','${operation}',repeat('a',64),repeat('b',64),${previous ? `'${previous}'` : 'NULL'})`).then(JSON.parse);
  const begin = (worker, operation, token) => worker.query(`SELECT api.begin_list_email('${user}','${list}','${operation}','${token}')`).then(JSON.parse);
  const complete = (worker, operation, token, state = 'accepted') => worker.query(`SELECT api.complete_list_email('${user}','${list}','${operation}','${token}','${state}',false)`);
  return { admin, first, second, holder, user, foreign, list, org, claim, begin, complete,
    async close() {
      await holder.query('ROLLBACK').catch(() => {});
      await admin.query(`DELETE FROM public.object_list WHERE id='${list}'; DELETE FROM public.object WHERE id='${org}'; DELETE FROM auth.users WHERE id IN ('${user}','${foreign}'); DELETE FROM internal.list_email_metric WHERE user_id='${user}'`).catch(() => {});
      await Promise.all([admin, first, second, holder].map((client) => client.close()));
    } };
}

test('independent consumers wait on the actual list lock and admit one effect for one intention', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const operation = randomUUID();
    const pids = await Promise.all([f.first, f.second].map((worker) => worker.query('SELECT pg_backend_pid()')));
    assert.ok(pids.every((pid) => /^\d+$/.test(pid)));
    await f.holder.query(`BEGIN; SELECT id FROM public.object_list WHERE id='${f.list}' FOR UPDATE`);
    const attempts = [f.claim(f.first, operation), f.claim(f.second, operation)];
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      if (await f.admin.query(`SELECT count(*) FROM pg_stat_activity WHERE pid IN (${pids.join(',')}) AND wait_event_type='Lock'`) === '2') { waiting = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(waiting, 'both consumers must be seen waiting on the same row lock');
    await f.holder.query('COMMIT');
    const receipts = await Promise.all(attempts);
    assert.equal(receipts[0].state, 'reserved'); assert.equal(receipts[1].state, 'reserved');
    assert.equal(receipts[0].attempt_token, receipts[1].attempt_token);
    const verdicts = await Promise.all([f.begin(f.first, operation, receipts[0].attempt_token), f.begin(f.second, operation, receipts[1].attempt_token)]);
    let syntheticEffects = 0;
    for (const verdict of verdicts) if (verdict.started) syntheticEffects++;
    assert.equal(syntheticEffects, 1); assert.equal(verdicts.filter((v) => !v.started && v.state === 'unknown').length, 1);
    assert.equal(await f.complete(f.first, operation, receipts[0].attempt_token), 't');
    assert.equal((await f.claim(f.second, operation)).state, 'accepted');
    assert.equal(await f.admin.query(`SELECT sum(admitted)=1 AND sum(started)=1 AND sum(accepted)=1 FROM internal.list_email_metric WHERE user_id='${f.user}'`), 't');
  } finally { await f.close(); }
});

test('crash/unknown survive a worker restart; only confirmed new intention admits another attempt', { timeout: 30000 }, async () => {
  const f = await fixture();
  const restarted = new SqlSession();
  try {
    await restarted.query('SET ROLE service_role');
    const a = randomUUID(), b = randomUUID();
    const first = await f.claim(f.first, a), second = await f.claim(f.second, b);
    assert.equal(first.state, 'reserved'); assert.equal(second.state, 'reserved');
    assert.equal((await f.begin(f.first, a, first.attempt_token)).started, true);
    assert.equal((await f.begin(f.second, b, second.attempt_token)).state, 'unknown', 'a different unconfirmed key cannot bypass the started receipt');
    assert.equal((await f.claim(restarted, a)).state, 'unknown');
    const c = randomUUID();
    assert.equal((await f.claim(restarted, c)).operation_id, a);
    assert.equal(await f.admin.query(`SELECT count(*) FROM internal.list_email_intent WHERE user_id='${f.user}' AND operation_id='${c}'`), '0');
    const confirmed = await f.claim(restarted, c, a);
    assert.equal(confirmed.state, 'reserved');
    assert.equal((await f.begin(restarted, c, confirmed.attempt_token)).started, true);
    assert.equal(await f.complete(restarted, c, randomUUID()), 'f', 'wrong token cannot ACK');
    assert.equal(await f.complete(restarted, c, confirmed.attempt_token), 't');
    assert.equal(await f.complete(restarted, c, confirmed.attempt_token, 'unknown'), 'f');
    assert.equal((await f.claim(restarted, c)).state, 'accepted');
  } finally { await restarted.close(); await f.close(); }
});

test('committed departure refuses dispatch and replay, while an actual earlier acceptance can still ACK', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const a = randomUUID(), b = randomUUID();
    const before = await f.claim(f.first, a), pending = await f.claim(f.first, b);
    assert.equal((await f.begin(f.first, a, before.attempt_token)).started, true);
    await f.admin.query(`UPDATE public.user_org_membership SET is_active=false WHERE user_id='${f.user}' AND org_object_id='${f.org}'`);
    assert.equal((await f.begin(f.second, b, pending.attempt_token)).state, 'forbidden');
    assert.equal((await f.claim(f.second, a)).state, 'forbidden');
    assert.equal(await f.complete(f.first, a, before.attempt_token), 't', 'the exact pre-authorized token records the real acceptance after revocation');
    assert.equal((await f.claim(f.second, a)).state, 'forbidden', 'terminal replay still needs current rights');
    assert.equal(await f.admin.query(`SELECT sum(started)=1 AND sum(accepted)=1 FROM internal.list_email_metric WHERE user_id='${f.user}'`), 't');
  } finally { await f.close(); }
});


test('confirmed recovery before SMTP supersedes the reserved worker and tolerates a request that never arrived', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const old = randomUUID(), next = randomUUID();
    const reserved = await f.claim(f.first, old);
    const confirmed = await f.claim(f.second, next, old);
    assert.equal(confirmed.state, 'reserved');
    assert.equal((await f.begin(f.first, old, reserved.attempt_token)).state, 'conflict');
    assert.equal((await f.begin(f.second, next, confirmed.attempt_token)).started, true);
    assert.equal(await f.complete(f.second, next, confirmed.attempt_token), 't');
    const neverArrived = randomUUID(), afterLostRequest = randomUUID();
    const recovered = await f.claim(f.first, afterLostRequest, neverArrived);
    assert.equal(recovered.state, 'reserved');
    assert.equal((await f.begin(f.first, afterLostRequest, recovered.attempt_token)).started, true);
    assert.equal(await f.complete(f.first, afterLostRequest, recovered.attempt_token), 't');
    assert.equal(await f.admin.query(`SELECT sum(admitted)=3 AND sum(started)=2 AND sum(accepted)=2 FROM internal.list_email_metric WHERE user_id='${f.user}'`), 't');
  } finally { await f.close(); }
});


test('authorization is reread after waiting on the list lock, not from a pre-lock snapshot', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const operation = randomUUID(), reserved = await f.claim(f.first, operation);
    await f.holder.query(`BEGIN; SELECT id FROM public.object_list WHERE id='${f.list}' FOR UPDATE`);
    const pid = await f.second.query('SELECT pg_backend_pid()'); assert.match(pid, /^\d+$/);
    const pending = f.begin(f.second, operation, reserved.attempt_token);
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      if (await f.admin.query(`SELECT count(*) FROM pg_stat_activity WHERE pid=${pid} AND wait_event_type='Lock'`) === '1') { waiting = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(waiting, 'begin must really be waiting');
    await f.admin.query(`UPDATE public.user_org_membership SET is_active=false WHERE user_id='${f.user}' AND org_object_id='${f.org}'`);
    await f.holder.query('COMMIT');
    assert.equal((await pending).state, 'forbidden');
    assert.equal(await f.admin.query(`SELECT sum(started)=0 FROM internal.list_email_metric WHERE user_id='${f.user}'`), 't');
  } finally { await f.close(); }
});


test('confirmed B tombstones absent A while its old claim is waiting; delayed A never gains an SMTP permit', { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const old = randomUUID(), next = randomUUID();
    await f.holder.query(`BEGIN; SELECT id FROM public.object_list WHERE id='${f.list}' FOR UPDATE`);
    const pid = await f.first.query('SELECT pg_backend_pid()'); assert.match(pid, /^\d+$/);
    const delayedA = f.claim(f.first, old);
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      if (await f.admin.query(`SELECT count(*) FROM pg_stat_activity WHERE pid=${pid} AND wait_event_type='Lock'`) === '1') { waiting = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(waiting, 'A must be in flight at the actual SQL gate');
    const replacement = await f.claim(f.holder, next, old);
    assert.equal(replacement.state, 'reserved');
    await f.holder.query('COMMIT');
    assert.equal((await delayedA).state, 'conflict');
    let fakeEffects = 0;
    const begunB = await f.begin(f.second, next, replacement.attempt_token);
    if (begunB.started === true) fakeEffects++;
    assert.equal(fakeEffects, 1); assert.equal(await f.complete(f.second, next, replacement.attempt_token), 't');
    const lateA = await f.claim(f.first, old);
    assert.equal(lateA.state, 'conflict'); assert.equal(lateA.attempt_token, undefined);
    const begunA = await f.begin(f.first, old, randomUUID());
    if (begunA.started === true) fakeEffects++;
    assert.equal(begunA.started, false); assert.equal(fakeEffects, 1);
    assert.equal(await f.admin.query(`SELECT state='superseded' AND started_at IS NULL AND fingerprint IS NULL AND recipient_fingerprint IS NULL FROM internal.list_email_intent WHERE user_id='${f.user}' AND operation_id='${old}'`), 't');
    assert.equal(await f.admin.query(`SELECT sum(admitted)=1 AND sum(started)=1 AND sum(accepted)=1 FROM internal.list_email_metric WHERE user_id='${f.user}'`), 't', 'tombstone is not an invented admission/effect');
  } finally { await f.close(); }
});
