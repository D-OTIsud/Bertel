import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute, join } from 'node:path';

export const CLI_VERSION = '2.78.1';
export const STORAGE_VERSION = 'v1.41.8';
export const PROJECT = 'bertel-storage-create-only';
export const MARKER = 'BERTEL_STORAGE_CREATE_ONLY_DISPOSABLE_V1';

export function validateEnvironment(env) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'GitHub disposable runner required');
  assert.equal(env.CI, 'true', 'CI required');
  assert.equal(env.STORAGE_CREATE_ONLY_DISPOSABLE, 'true', 'explicit disposable opt-in required');
  assert.ok(env.RUNNER_TEMP && isAbsolute(env.RUNNER_TEMP), 'runner temporary root required');
  assert.ok(env.STORAGE_CREATE_ONLY_WORKDIR && isAbsolute(env.STORAGE_CREATE_ONLY_WORKDIR), 'absolute owned project required');
  const workdir = resolve(env.STORAGE_CREATE_ONLY_WORKDIR);
  const expected = join(resolve(env.RUNNER_TEMP), PROJECT);
  assert.equal(workdir, expected, 'only the exact owned temporary project is accepted');
  const child = relative(resolve(env.RUNNER_TEMP), workdir);
  assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
  return workdir;
}

export function assertLoopbackApi(value) {
  const url = new URL(value);
  assert.equal(url.origin, 'http://127.0.0.1:54321', 'only the disposable local API is accepted');
  assert.ok(url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash);
  return url.origin;
}

export function processContext(env = process.env) {
  const workdir = validateEnvironment(env);
  assert.equal(readFileSync(join(workdir, '.bertel-storage-create-only'), 'utf8').trim(), MARKER, 'owned project marker required');
  const config = readFileSync(join(workdir, 'supabase/config.toml'), 'utf8');
  assert.match(config, /^project_id\s*=\s*"bertel-storage-create-only"\s*$/m);
  const home = join(workdir, 'private-home');
  mkdirSync(home, { recursive: true });
  const childEnv = Object.fromEntries(['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'ComSpec', 'TMPDIR', 'TEMP', 'TMP']
    .filter(key => env[key]).map(key => [key, env[key]]));
  Object.assign(childEnv, { HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
    XDG_CONFIG_HOME: home, XDG_DATA_HOME: home, XDG_CACHE_HOME: home,
    CI: 'true', DO_NOT_TRACK: '1', SUPABASE_ACCESS_TOKEN: `sbp_${'0'.repeat(40)}` });
  return { workdir, env: childEnv };
}

export function command(binary, args, context, timeout = 30_000) {
  try {
    return execFileSync(binary, args, { cwd: context.workdir, env: context.env,
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: 32 * 1024 * 1024 }).toString();
  } catch {
    // CLI startup/status can contain generated local keys. Never rethrow its raw
    // exception, stdout, stderr or command environment, even on failure.
    throw new Error(`Disposable ${binary} command failed; raw output withheld`);
  }
}

export function assertCli(context) {
  assert.equal(command('supabase', ['--version'], context).trim(), CLI_VERSION);
}

export function loadDisposable(env = process.env) {
  const context = processContext(env);
  assertCli(context);
  const status = JSON.parse(command('supabase', ['status', '--workdir', context.workdir, '--output', 'json'], context));
  const api = assertLoopbackApi(status.API_URL);
  assert.ok(typeof status.SERVICE_ROLE_KEY === 'string' && status.SERVICE_ROLE_KEY.split('.').length === 3,
    'generated local service token required');
  const claims = JSON.parse(Buffer.from(status.SERVICE_ROLE_KEY.split('.')[1], 'base64url').toString());
  assert.equal(claims.role, 'service_role');
  const container = `supabase_storage_${PROJECT}`;
  const image = command('docker', ['inspect', '--format', '{{.Config.Image}}', container], context).trim();
  assert.ok(image === `public.ecr.aws/supabase/storage-api:${STORAGE_VERSION}`
    || image === `supabase/storage-api:${STORAGE_VERSION}`, 'the exact Storage image version is required');
  const imageId = command('docker', ['inspect', '--format', '{{.Image}}', container], context).trim();
  assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
  const headers = { authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, apikey: status.SERVICE_ROLE_KEY };
  return { api, headers, version: STORAGE_VERSION, image, imageId };
}
