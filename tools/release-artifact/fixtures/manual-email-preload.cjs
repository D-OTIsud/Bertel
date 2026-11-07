'use strict';
// Test-only fetch boundary, loaded before the real SDK and compiled handler.
// Admission decisions and request DTO validation belong entirely to the application.
const fs = require('node:fs');
const net = require('node:net');
const tls = require('node:tls');
const path = require('node:path');
const id = process.env.BERTEL_SMTP_PROBE_ID;
const log = process.env.BERTEL_SMTP_PROBE_LOG;
let origin;
const fail = () => { throw new Error('SMTP_PROBE_REFUSED'); };
try {
  const url = new URL(process.env.BERTEL_SMTP_PROBE_ORIGIN);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) fail();
  origin = url.origin;
  if (!/^[a-f0-9]{32}$/.test(id ?? '') || !path.isAbsolute(log ?? '') || path.basename(log) !== 'events.jsonl') fail();
} catch { fail(); }
function record(event) {
  const line = Buffer.from(JSON.stringify({ id, event }) + '\n');
  const fd = fs.openSync(log, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || (process.platform === 'linux' && (st.mode & 0o777) !== 0o600)
      || (process.getuid && st.uid !== process.getuid()) || st.size + line.length > 32768) fail();
    fs.writeSync(fd, line);
  } finally { fs.closeSync(fd); }
}
record('boot');
net.Socket.prototype.connect = function () { record('denied_socket'); fail(); };
tls.connect = function () { record('denied_socket'); fail(); };
globalThis.fetch = async (input, init) => {
  let request;
  try { request = new Request(input, init); } catch { record('denied_fetch'); fail(); }
  const url = new URL(request.url);
  const correctOrigin = url.origin === origin && !url.username && !url.password && !url.search && !url.hash;
  if (correctOrigin && request.method === 'GET' && url.pathname === '/auth/v1/user'
    && request.headers.get('authorization') === 'Bearer synthetic-manual-email-token') {
    record('auth');
    return Response.json({ id: 'd4000000-0000-4000-8000-000000000010', aud: 'authenticated', role: 'authenticated',
      email: 'synthetic@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
  }
  if (correctOrigin && request.method === 'POST' && url.pathname === '/rest/v1/rpc/get_smtp_config_secret'
    && request.headers.get('authorization') === 'Bearer synthetic-service-key-not-real'
    && request.headers.get('content-profile') === 'api') {
    const body = await request.text();
    if (body !== '{}' && body !== '') { record('denied_fetch'); fail(); }
    record('config'); return Response.json([{ enabled: false }]);
  }
  record('denied_fetch'); fail();
};
