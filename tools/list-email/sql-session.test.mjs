import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { SqlSession } from './sql-session.mjs';

function fake({ closesOnKill = true, closesOnEnd = true } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
  child.exitCode = null; child.signalCode = null; child.kills = 0; child.unref = () => {};
  const finish = (code = 0) => { child.exitCode = code; child.emit('exit', code); child.emit('close', code); };
  child.kill = () => { child.kills++; if (closesOnKill) queueMicrotask(() => finish(1)); return true; };
  child.stdin.on('finish', () => { if (closesOnEnd) queueMicrotask(() => finish()); });
  return { child, finish, session: new SqlSession(() => child, { queryTimeoutMs: 30, closeTimeoutMs: 30 }) };
}

test('already exited child refuses a new query immediately, including a finally cleanup query', async () => {
  const f = fake(); f.finish(3);
  await assert.rejects(f.session.query('ROLLBACK'), /session is closed/); await f.session.close();
});
test('exit before close refuses new queries; pending request rejects after sanitized SQLSTATE is drained', async () => {
  const f = fake(); const pending = f.session.query('SELECT synthetic_failure');
  f.child.exitCode = 3; f.child.emit('exit', 3);
  await assert.rejects(f.session.query('ROLLBACK'), /session is closed/);
  f.child.stderr.write('ERROR: 23505\nsynthetic-secret-must-not-appear'); f.child.emit('close', 3);
  await assert.rejects(pending, (error) => error.sqlstate === '23505' && !error.message.includes('synthetic-secret'));
  await f.session.close();
});
test('split stdout markers preserve a real result and sequential requests', async () => {
  const f = fake(); const first = f.session.query('SELECT 1');
  f.child.stdout.write('1\n__list_email_res'); f.child.stdout.write('ult_1__\n'); assert.equal(await first, '1');
  const second = f.session.query('SELECT 2'); f.child.stdout.write('2\n__list_email_result_2__\n');
  assert.equal(await second, '2'); await f.session.close(); assert.equal(f.child.kills, 0);
});
test('a stalled query is bounded and only its owned child is killed', async () => {
  const f = fake(); await assert.rejects(f.session.query('SELECT stalled'), /query timed out/);
  await f.session.close(); assert.equal(f.child.kills, 1);
});
test('a child ignoring termination cannot hold close or keep its pipes open', async () => {
  const f = fake({ closesOnKill: false, closesOnEnd: false });
  await assert.rejects(f.session.close(), /close timed out/);
  for (const stream of [f.child.stdin, f.child.stdout, f.child.stderr]) assert.equal(stream.destroyed, true);
  await assert.rejects(f.session.query('ROLLBACK'), /session is closed/);
});
test('spawn/input failures reject outstanding work without exposing raw errors', async () => {
  const f = fake(); const pending = f.session.query('SELECT 1');
  f.child.emit('error', new Error('synthetic-DSN-secret'));
  await assert.rejects(pending, (error) => !error.message.includes('synthetic-DSN-secret') && /process failed/.test(error.message));
  await f.session.close();
});
test('excess output fails closed without exposing its contents', async () => {
  const f = fake(); f.session.maxBytes = 8; const pending = f.session.query('SELECT 1'); f.child.stdout.write('synthetic-secret-output');
  await assert.rejects(pending, /output exceeded/); await f.session.close();
});
test('an actual exited Node child cannot suspend later queries or cleanup', async () => {
  let child; const session = new SqlSession(() => { child = spawn(process.execPath, ['-e', 'process.exit(3)'], { env: {}, stdio: ['pipe','pipe','pipe'] }); return child; });
  await once(child, 'close'); await assert.rejects(session.query('ROLLBACK'), /session is closed/); await session.close();
});
test('invalid or unbounded timeout settings refuse before spawning', () => {
  for (const options of [{ queryTimeoutMs: 0 }, { queryTimeoutMs: 15001 }, { closeTimeoutMs: Infinity }]) {
    assert.throws(() => new SqlSession(() => assert.fail('spawned'), options), /Invalid disposable SQL bounds/);
  }
});
