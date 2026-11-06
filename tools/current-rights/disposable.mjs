import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export function validateEnvironment(env) {
  assert.ok(env.CURRENT_RIGHTS_DISPOSABLE === 'true' && env.CI === 'true' && env.GITHUB_ACTIONS === 'true', 'explicit disposable GitHub CI authorization required');
  assert.ok(env.RUNNER_TEMP && env.CURRENT_RIGHTS_SUPABASE_WORKDIR, 'fresh runner workdir required');
  const workdir = resolve(env.CURRENT_RIGHTS_SUPABASE_WORKDIR);
  const inside = relative(resolve(env.RUNNER_TEMP), workdir);
  assert.ok(inside && !inside.startsWith('..') && !isAbsolute(inside), 'workdir must be inside runner temp');
  return workdir;
}

export function validateTargets(env, status) {
  const workdir = validateEnvironment(env);
  const api = new URL(status.API_URL);
  assert.ok(['http:', 'https:'].includes(api.protocol) && api.hostname === '127.0.0.1'
    && !api.username && !api.password && api.pathname === '/' && !api.search && !api.hash, 'literal loopback API origin required');
  const dsn = new URL(env.CURRENT_RIGHTS_TEST_DB_URL);
  const owned = new URL(status.DB_URL);
  for (const url of [dsn, owned]) assert.ok(['postgres:', 'postgresql:'].includes(url.protocol)
    && url.hostname === '127.0.0.1' && url.username === 'postgres' && url.pathname === '/postgres'
    && url.port && !url.search && !url.hash, 'plain disposable loopback database URL required');
  assert.ok(dsn.port === owned.port && dsn.password === owned.password, 'database must match the owned local stack');
  assert.ok(typeof status.SERVICE_ROLE_KEY === 'string' && typeof status.ANON_KEY === 'string', 'local generated keys required');
  return { origin: api.origin, dsn: env.CURRENT_RIGHTS_TEST_DB_URL, workdir };
}

export function loadDisposable() {
  const env = process.env;
  const workdir = validateEnvironment(env);
  assert.ok(readFileSync(resolve(workdir, '.bertel-current-rights-disposable'), 'utf8').trim() === 'BERTEL_CURRENT_RIGHTS_DISPOSABLE_V1', 'owned disposable stack marker required');
  let status;
  try {
    // Keys never enter a file, console, child argument or exception cause.
    status = JSON.parse(execFileSync('supabase', ['status', '--workdir', workdir, '--output', 'json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    }));
  } catch { throw new Error('Cannot capture the disposable Supabase status in memory'); }
  const targets = validateTargets(env, status);
  const service = { apikey: status.SERVICE_ROLE_KEY, authorization: `Bearer ${status.SERVICE_ROLE_KEY}` };
  const anonymous = { apikey: status.ANON_KEY, authorization: `Bearer ${status.ANON_KEY}` };
  const request = (path, headers, body, method = 'POST', extra = {}) => {
    const url = new URL(path, targets.origin);
    assert.ok(url.origin === targets.origin, 'HTTP request must remain on owned loopback origin');
    return fetch(url, { method, redirect: 'error', headers: { ...headers, 'content-type': 'application/json', ...extra },
      ...(body === undefined ? {} : { body: body instanceof Uint8Array ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  };
  const sql = (text, stage) => {
    try {
      return execFileSync(process.env.CURRENT_RIGHTS_PSQL ?? 'psql', [targets.dsn, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
        input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, maxBuffer: 16 * 1024 * 1024,
      }).trim();
    } catch { throw new Error(`Disposable SQL stage failed: ${stage}`); }
  };
  const sqlFile = (file, stage) => {
    try {
      execFileSync(process.env.CURRENT_RIGHTS_PSQL ?? 'psql', [targets.dsn, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
        '-v', 'current_rights_http_disposable=true', '-f', file], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch { throw new Error(`Disposable SQL fixture failed: ${stage}`); }
  };
  return { ...targets, service, anonymous, request, sql, sqlFile };
}
