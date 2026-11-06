import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Consume the disposable CLI status file without printing credentials or loading
// any developer .env file. This runner has no production mode.
const statusFile = process.argv[2];
if (!statusFile) throw new Error('Usage: node tools/partner-api/run-ephemeral-route-tests.mjs <local-status.json>');
const status = JSON.parse(readFileSync(statusFile, 'utf8'));
const url = new URL(status.API_URL);
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '54321') {
  throw new Error('Refusing integration tests outside the disposable localhost:54321 Supabase instance');
}
if (typeof status.SERVICE_ROLE_KEY !== 'string' || !status.SERVICE_ROLE_KEY) {
  throw new Error('Local Supabase status has no service-role credential');
}
const repo = fileURLToPath(new URL('../../', import.meta.url));
// NOTIFY reload is asynchronous. Poll the actual authenticated RPC, bounded to
// 30 seconds, without logging the local service credential or response body.
const keyHash = createHash('sha256').update(`bk_live_${'a'.repeat(48)}`).digest('hex');
const deadline = Date.now() + 30_000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(new URL('/rest/v1/rpc/partner_authenticate', url), {
      method: 'POST',
      headers: {
        apikey: status.SERVICE_ROLE_KEY,
        authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
        'content-profile': 'api',
      },
      body: JSON.stringify({ p_key_hash: keyHash }),
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok && (await response.json())?.ok === true) { ready = true; break; }
  } catch { /* A restarting local PostgREST may not yet accept connections. */ }
  await new Promise(resolveReady => setTimeout(resolveReady, 250));
}
if (!ready) throw new Error('Disposable partner authentication did not become ready within 30 seconds');
const report = resolve(mkdtempSync(resolve(tmpdir(), 'bertel-route-contract-')), 'jest.json');
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
  'run', 'test:run', '--', '--ci', '--runInBand',
  '--json', `--outputFile=${report}`,
  'src/app/api/public/contract.integration.test.ts',
], {
  cwd: resolve(repo, 'bertel-tourism-ui'),
  env: {
    ...process.env,
    BERTEL_EPHEMERAL_API_TEST: '1',
    NEXT_PUBLIC_SUPABASE_URL: url.href.replace(/\/$/, ''),
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_ENABLE_DEMO_MODE: 'false',
  },
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const summary = JSON.parse(readFileSync(report, 'utf8'));
if (summary.success !== true || summary.numPendingTests !== 0 || summary.numFailedTests !== 0
    || summary.numPassedTests < 12 || summary.numPassedTestSuites !== 1) {
  throw new Error('Real route contract suite did not execute every required test');
}
console.log(`Verified ${summary.numPassedTests} real route tests; zero skipped or failed.`);
