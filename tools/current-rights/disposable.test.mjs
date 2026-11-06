import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTargets } from './disposable.mjs';

const env = { CURRENT_RIGHTS_DISPOSABLE: 'true', CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_TEMP: '/tmp/runner',
  CURRENT_RIGHTS_SUPABASE_WORKDIR: '/tmp/runner/bertel-fresh', CURRENT_RIGHTS_TEST_DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:54322/postgres' };
const status = { API_URL: 'http://127.0.0.1:54321', DB_URL: env.CURRENT_RIGHTS_TEST_DB_URL,
  SERVICE_ROLE_KEY: 'synthetic-not-real', ANON_KEY: 'synthetic-anon-not-real' };
test('only the explicitly owned disposable CI target is accepted', () => assert.ok(validateTargets(env, status).origin === status.API_URL));
test('remote, alternate-host DSNs, workdir escapes and missing authorization refuse before network', () => {
  const cases = [
    [{ ...env, CURRENT_RIGHTS_DISPOSABLE: 'false' }, status],
    [{ ...env, GITHUB_ACTIONS: 'false' }, status],
    [{ ...env, CURRENT_RIGHTS_SUPABASE_WORKDIR: '/tmp/other' }, status],
    [{ ...env, CURRENT_RIGHTS_TEST_DB_URL: 'postgresql://postgres:synthetic@remote.invalid:54322/postgres' }, status],
    [{ ...env, CURRENT_RIGHTS_TEST_DB_URL: `${env.CURRENT_RIGHTS_TEST_DB_URL}?host=remote.invalid` }, status],
    [env, { ...status, API_URL: 'https://remote.invalid' }],
    [env, { ...status, API_URL: 'http://user:synthetic@127.0.0.1:54321' }],
    [env, { ...status, DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:54323/postgres' }],
  ];
  for (const [candidate, local] of cases) assert.throws(() => validateTargets(candidate, local));
});
