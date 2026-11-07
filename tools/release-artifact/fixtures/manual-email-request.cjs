'use strict';
// Runs as a SEPARATE process without the server preload; real HTTP loopback only.
const fs = require('node:fs');
const log = process.env.BERTEL_SMTP_PROBE_LOG;
const id = process.env.BERTEL_SMTP_PROBE_ID;
const name = process.argv[2];
const allowed = ['legacy', 'context', 'prepare', 'dispatch', 'ack', 'invalid-json', 'no-auth', 'empty-body'];
function requireThat(value) { if (!value) throw new Error('SMTP_PROBE_REQUEST_REFUSED'); }
function counts() {
  const stat = fs.lstatSync(log); requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 32768);
  const result = { auth: 0, config: 0, deniedFetch: 0, deniedSocket: 0, boot: 0 };
  const map = { auth: 'auth', config: 'config', denied_fetch: 'deniedFetch', denied_socket: 'deniedSocket', boot: 'boot' };
  for (const line of fs.readFileSync(log, 'utf8').trim().split('\n')) {
    const record = JSON.parse(line); requireThat(record.id === id && Object.keys(record).length === 2 && Object.hasOwn(map, record.event));
    result[map[record.event]]++;
  }
  return result;
}
async function bounded(response) {
  requireThat(response.body);
  const chunks = []; let size = 0;
  for await (const part of response.body) { size += part.length; requireThat(size <= 16384); chunks.push(part); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function main() {
  requireThat(allowed.includes(name) && /^[a-f0-9]{32}$/.test(id ?? '') && process.env.NODE_OPTIONS === '' && process.getuid?.() === 1000);
  let healthy = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const health = await fetch('http://127.0.0.1:3000/api/health', { redirect: 'error', signal: AbortSignal.timeout(1000) });
      const body = await bounded(health); healthy = health.status === 200 && body.ok === true && body.service === 'bertel-tourism-ui';
      if (healthy) break;
    } catch {}
    await new Promise((done) => setTimeout(done, 250));
  }
  requireThat(healthy);
  const before = counts();
  const dto = { listId: 'd4000000-0000-4000-8000-000000000020', toEmail: 'recipient@example.invalid', phase: 'prepare',
    expectedGeneration: '0', dispatchToken: 'd4000000-0000-4000-8000-000000000002', resultToken: 'a'.repeat(64) };
  if (name === 'legacy') delete dto.phase;
  else if (['context', 'dispatch', 'ack'].includes(name)) dto.phase = name;
  const headers = { 'content-type': 'application/json', 'Idempotency-Key': 'd4000000-0000-4000-8000-000000000001' };
  if (name !== 'no-auth') headers.authorization = 'Bearer synthetic-manual-email-token';
  if (name === 'legacy') delete headers['Idempotency-Key'];
  const body = name === 'invalid-json' ? '{' : name === 'empty-body' ? undefined : JSON.stringify(dto);
  const response = await fetch('http://127.0.0.1:3000/api/lists/send', {
    method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  const data = await bounded(response); const after = counts();
  const events = { auth: after.auth - before.auth, config: after.config - before.config,
    deniedFetch: after.deniedFetch, deniedSocket: after.deniedSocket, boot: after.boot };
  console.log(JSON.stringify({ status: response.status, cacheControl: response.headers.get('cache-control'), body: data, events }));
}
main().catch(() => { console.error('SMTP_PROBE_REQUEST_REFUSED'); process.exitCode = 1; });
