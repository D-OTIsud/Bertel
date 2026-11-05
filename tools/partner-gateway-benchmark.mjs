/** Real Next HTTP, controlled loopback PostgREST. No production credentials/network.
 * node tools/partner-gateway-benchmark.mjs [--run]
 * Measures gateway effects only; injected DB latency is not production evidence.
 */
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { readFile, writeFile, mkdir, copyFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repo, 'bertel-tourism-ui');
const scratch = path.join(repo, '.tmp_partner_gateway_baseline');
const baseline = path.join(scratch, 'bertel-tourism-ui');
const id = 'HOTAAA0000000001';
const fixture = { id, name: 'Controlled fixture', canonical_description: 'private', org_description: 'private' };
const stages = { partner_authenticate: 25, partner_rate_check: 25, partner_admit: 25, partner_log_call: 40, resource: 35 };
let scenario = 'ok';
let calls = [];
let releaseAudit;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function stopChild(proc) {
  if (!proc) return;
  if (process.platform === 'win32') await new Promise(resolve => execFile('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => resolve()));
  else proc.kill('SIGTERM');
}
const backend = createServer(async (req, res) => {
  let raw = ''; for await (const part of req) raw += part;
  const rpc = req.url.split('/').pop().split('?')[0];
  calls.push({ rpc, at: performance.now() });
  if (rpc === 'partner_log_call' && scenario === 'blocked-audit') await new Promise(resolve => { releaseAudit = resolve; });
  await sleep(stages[rpc] ?? stages.resource);
  const denied = scenario === 'unauthorized';
  const rate = { allowed: scenario !== 'limited', retry_after: 30, limit: 120, remaining: scenario === 'limited' ? 0 : 119 };
  const identity = { ok: !denied, id: '11111111-1111-1111-1111-111111111111', label: 'fixture', scopes: ['read'] };
  let body;
  if (rpc === 'partner_authenticate') body = identity;
  else if (rpc === 'partner_admit') body = { ...identity, rate };
  else if (rpc === 'partner_rate_check') body = rate;
  else if (rpc === 'partner_log_call') body = null;
  else if (rpc === 'object') body = { status: scenario === 'draft' ? 'draft' : 'published' };
  else if (rpc === 'list_object_resources_page_text') body = { info: { next_cursor: null }, data: [fixture] };
  else if (rpc === 'get_object_resource') body = fixture;
  else if (rpc.includes('batch')) body = { [id]: { fixture: true } };
  else body = { fixture: true };
  if (scenario === 'upstream' && ['get_object_resource', 'list_object_resources_page_text'].includes(rpc)) {
    res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 'XX000', message: 'fixture error' })); return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
});
await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
const backendUrl = `http://127.0.0.1:${backend.address().port}`;
async function prepare(mode) {
  const target = path.join(scratch, `runtime-${mode}`);
  await mkdir(target, { recursive: true });
  try { await symlink(path.join(source, 'node_modules'), path.join(target, 'node_modules'), 'junction'); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await writeFile(path.join(target, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await writeFile(path.join(target, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'esnext'], module: 'esnext', moduleResolution: 'bundler', jsx: 'react-jsx', esModuleInterop: true, paths: { '@/*': ['./src/*'] } } }));
  await writeFile(path.join(target, 'next.config.mjs'), 'export default { devIndicators: false };');
  const files = ['src/app/api/public/objects/route.ts', 'src/app/api/public/objects/[id]/route.ts', 'src/lib/partner-auth.ts', 'src/lib/public-api.ts'];
  for (const relative of files) {
    await mkdir(path.dirname(path.join(target, relative)), { recursive: true });
    await copyFile(path.join(mode === 'before' ? baseline : source, relative), path.join(target, relative));
  }
  // Copy pure helpers and genuine Supabase client; only its HTTP destination changes.
  for (const name of ['object-types.ts', 'tourinsoft-export.ts', 'supabase-server.ts', 'env.server.ts']) await copyFile(path.join(source, 'src/lib', name), path.join(target, 'src/lib', name));
  // Newly introduced runtime helpers are copied without overwriting baseline sources.
  const { readdir } = await import('node:fs/promises');
  for (const name of await readdir(path.join(source, 'src/lib'))) if (/partner.*(?:timing|telemetry|metrics)|public.*(?:timing|telemetry)/.test(name) && name.endsWith('.ts') && !name.includes('.test.')) await copyFile(path.join(source, 'src/lib', name), path.join(target, 'src/lib', name));
  return target;
}
const targets = {};
for (const mode of ['before', 'after']) targets[mode] = await prepare(mode);
if (!process.argv.includes('--run')) { console.log('Prepared isolated Next fixtures; pass --run to execute loopback benchmark.'); backend.close(); process.exit(0); }
const cases = [
  ['list', '/api/public/objects', 'ok', 200],
  ['list-full', '/api/public/objects?view=full', 'ok', 200],
  ['list-pivot', '/api/public/objects?format=tourinsoft', 'ok', 200],
  ['detail', `/api/public/objects/${id}`, 'ok', 200],
  ['detail-additive', `/api/public/objects/${id}?lang=all&format=jsonld`, 'ok', 200],
  ['invalid-types', '/api/public/objects?types=INVALID', 'ok', 400],
  ['invalid-id', '/api/public/objects/invalid', 'ok', 400],
  ['draft', `/api/public/objects/${id}`, 'draft', 404],
  ['quota', '/api/public/objects', 'limited', 429],
  ['unknown-key', '/api/public/objects', 'unauthorized', 401],
  ['upstream', '/api/public/objects', 'upstream', 502],
];
const report = { kind: 'real-next-http-controlled-db', node: process.version, next: JSON.parse(await readFile(path.join(source, 'node_modules/next/package.json'), 'utf8')).version, injected_latency_ms: stages, samples: 5, results: {} };
let child;
try {
  for (const [index, mode] of ['before', 'after'].entries()) {
    const port = 3191 + index;
    let logs = '';
    child = spawn(process.execPath, [path.join(source, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: targets[mode], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: backendUrl, SUPABASE_SERVICE_ROLE_KEY: 'controlled-fixture-only' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b);
    console.log(`Starting ${mode} on loopback ${port}`);
    const origin = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 120; i++) { if (logs.includes('Ready')) break; if (child.exitCode !== null) throw Error(logs); await sleep(500); }
    report.results[mode] = {};
    for (const [name, url, state, status] of cases) {
      scenario = state;
      const timings = []; let canonical; let serverTiming;
      for (let sample = -1; sample < report.samples; sample++) {
        calls = [];
        const start = performance.now();
        const response = await fetch(origin + url, { signal: AbortSignal.timeout(30000), headers: { authorization: `Bearer bk_live_${'a'.repeat(48)}` } }).catch(error => { throw Error(`${error.message}\n${logs}`); });
        const body = await response.json();
        const elapsed = performance.now() - start;
        serverTiming = response.headers.get('server-timing');
        assert.equal(response.status, status, `${mode}/${name}: ${JSON.stringify(body)}`);
        const value = { status: response.status, body, version: response.headers.get('x-bertel-api-version'), limit: response.headers.get('x-ratelimit-limit'), remaining: response.headers.get('x-ratelimit-remaining'), retry: response.headers.get('retry-after') };
        if (sample >= 0) { timings.push(elapsed); canonical = value; }
        await sleep(100); // allow genuine Next after audit completion before next case
      }
      const sorted = [...timings].sort((a, b) => a - b);
      report.results[mode][name] = { median_ms: Math.round(sorted[2] * 10) / 10, min_ms: Math.round(sorted[0] * 10) / 10, response: canonical, server_timing: serverTiming, rpc_sequence: calls.map(call => call.rpc) };
      console.log(`${mode}/${name}: ${report.results[mode][name].median_ms} ms`);
      if (mode === 'after') assert.deepEqual(canonical, report.results.before[name].response, `Contract changed: ${name}`);
    }
    if (mode === 'after') {
      scenario = 'blocked-audit'; calls = [];
      const response = await fetch(origin + '/api/public/objects', { signal: AbortSignal.timeout(3000), headers: { authorization: `Bearer bk_live_${'a'.repeat(48)}` } });
      await response.json();
      for (let i = 0; !releaseAudit && i < 40; i++) await sleep(25);
      assert(releaseAudit, 'Audit must execute through real Next after');
      report.after_response_before_audit_release = true;
      releaseAudit(); releaseAudit = undefined;
      await sleep(150);
      assert(logs.includes('partner_api_audit'), 'Audit completion telemetry missing');
    }
    assert(!logs.includes('after() was called outside'), 'after context missing');
    report.results[mode].stage_logs_seen = logs.includes('partner_api_response');
    await stopChild(child); child = undefined;
  }
  report.contracts_identical = true;
  await writeFile(path.join(scratch, 'benchmark-report.json'), JSON.stringify(report, null, 2));
  console.log('All contracts identical; report saved to ignored baseline directory.');
} finally { await stopChild(child); backend.close(); }
