import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Only disposable local test stacks, never a project DSN loaded from .env.
const dsn = process.env.AI_QUOTA_TEST_DB_URL;
assert.equal(process.env.AI_QUOTA_DISPOSABLE, 'true', 'explicit disposable-database authorization required');
assert.ok(dsn, 'AI_QUOTA_TEST_DB_URL must name the local disposable stack');
const url = new URL(dsn);
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && ['/postgres'].includes(url.pathname), 'disposable loopback database required');

class SqlSession {
  constructor() {
    this.pending = [];
    this.lines = [];
    this.buffer = '';
    this.sequence = 0;
    this.child = spawn(process.env.AI_QUOTA_PSQL ?? 'psql', [dsn, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
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
    const marker = `__ai_quota_result_${++this.sequence}__`;
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

test('two database consumers preserve the shared sliding budget, with clock and verdict after the lock', { timeout: 30000 }, async () => {
  const admin = new SqlSession();
  const holder = new SqlSession();
  const first = new SqlSession();
  const second = new SqlSession();
  const user = randomUUID();
  const other = randomUUID();
  const admit = (client, route = 'translate', uid = user) => client.query(`SELECT api.admit_ai_request('${uid}', '${route}')`).then(JSON.parse);
  try {
    await admin.query(`INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES ('${user}','quota-concurrency@example.invalid','{}','{}'),('${other}','quota-other@example.invalid','{}','{}')`);
    for (const client of [holder, first, second]) await client.query('SET ROLE service_role');
    const pids = await Promise.all([first, second].map((client) => client.query('SELECT pg_backend_pid()')));
    assert.ok(pids.every((pid) => /^\d+$/.test(pid)));
    assert.equal((await admit(first)).allowed, true);
    await admin.query(`UPDATE internal.ai_request_rate_state SET hits=array_fill(clock_timestamp(),ARRAY[11]) WHERE user_id='${user}' AND route='translate'`);
    await holder.query(`BEGIN; SELECT cardinality(hits) FROM internal.ai_request_rate_state WHERE user_id='${user}' AND route='translate' FOR UPDATE`);
    const attempts = [admit(first), admit(second)];
    let waiting = false;
    for (let probe = 0; probe < 100; probe++) {
      const count = await admin.query(`SELECT count(*) FROM pg_stat_activity WHERE pid IN (${pids.join(',')}) AND wait_event_type='Lock'`);
      if (count === '2') { waiting = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(waiting, 'both independent consumers must be observed waiting on the real row lock');
    const afterWait = await admin.query('SELECT clock_timestamp()::text');
    await holder.query('COMMIT');
    const outcomes = await Promise.all(attempts);
    assert.equal(outcomes.filter((item) => item.allowed).length, 1, 'only the twelfth slot is available');
    assert.equal(outcomes.filter((item) => !item.allowed).length, 1);
    assert.ok(outcomes.filter((item) => !item.allowed).every((item) => item.retry_after >= 1 && item.retry_after <= 60));
    assert.equal(await admin.query(`SELECT cardinality(hits)=12 AND hits[12] >= '${afterWait}'::timestamptz FROM internal.ai_request_rate_state WHERE user_id='${user}' AND route='translate'`), 't');
    const before = await admin.query(`SELECT hits::text FROM internal.ai_request_rate_state WHERE user_id='${user}' AND route='translate'`);
    assert.equal((await admit(second)).allowed, false);
    assert.equal(await admin.query(`SELECT hits::text FROM internal.ai_request_rate_state WHERE user_id='${user}' AND route='translate'`), before);
    assert.equal((await admit(first, 'menu_extract')).allowed, true);
    assert.equal((await admit(second, 'translate', other)).allowed, true);
    // New connection emulates a worker restart: the shared state is unchanged.
    const restarted = new SqlSession();
    try { await restarted.query('SET ROLE service_role'); assert.equal((await admit(restarted)).allowed, false); }
    finally { await restarted.close(); }
  } finally {
    await holder.query('ROLLBACK').catch(() => {});
    await admin.query(`DELETE FROM auth.users WHERE id IN ('${user}','${other}')`).catch(() => {});
    await Promise.all([admin, holder, first, second].map((client) => client.close()));
  }
});
