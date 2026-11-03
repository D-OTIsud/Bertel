import { readFileSync } from 'node:fs';
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
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
  'run', 'test:run', '--', '--ci', '--runInBand',
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
process.exit(result.status ?? 1);
