import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { cleanChildEnvironment, initializeListEmailDisposable, loadListEmailDisposable, prepareListEmailDisposable, verifyStartedListEmailDisposable, validateDatabaseUrl, validateEnvironment } from './disposable.mjs';

const markerName = '.bertel-list-email-disposable';
const dsn = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const origin = 'http://127.0.0.1:54321';
const serviceKey = 'synthetic-service-key-with-no-authority';
const anonKey = 'synthetic-anon-key-with-no-authority';
const hash = (value) => createHash('sha256').update(value).digest('hex');

function fixture(t, { marker = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'bertel-mail-guard-')));
  const workdir = join(root, 'fresh');
  mkdirSync(join(workdir, 'supabase'), { recursive: true });
  writeFileSync(join(workdir, 'supabase/config.toml'), 'project_id = "bertel-ci"\n');
  const env = {
    CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '2', GITHUB_JOB: 'fresh-apply',
    RUNNER_TEMP: root, LIST_EMAIL_DISPOSABLE: 'true', LIST_EMAIL_SUPABASE_WORKDIR: workdir,
    LIST_EMAIL_TEST_DB_URL: dsn, PATH: '/synthetic/bin',
    SUPABASE_ACCESS_TOKEN: 'private-account-token-must-not-be-inherited',
    DOCKER_HOST: 'tcp://do-not-use.invalid:2375', NODE_OPTIONS: '--do-not-inherit',
  };
  const payload = {
    version: 'BERTEL_LIST_EMAIL_DISPOSABLE_V1', phase: 'ready', nonce: 'a'.repeat(64),
    targetsAbsent: true, preparedAtUTC: new Date(Date.now() - 2000).toISOString(),
    containerCreatedAt: new Date(Date.now() - 1000).toISOString(),
    volumeName: 'supabase_db_bertel-ci', volumeCreatedAt: new Date(Date.now() - 1000).toISOString(), dataDirectory: '/var/lib/postgresql/data',
    runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, job: env.GITHUB_JOB,
    workdir, runnerTemp: root, projectId: 'bertel-ci', dsnSha256: hash(dsn),
    origin, containerId: 'b'.repeat(64), systemIdentifier: '7359000000000000000',
    functionName: `list_email_ci_${'a'.repeat(32)}`,
  };
  if (marker) {
    writeFileSync(join(workdir, markerName), JSON.stringify(payload), { mode: 0o600 });
    mkdirSync(join(workdir, '.bertel-list-email-empty-home'), { mode: 0o700 });
  }
  const state = { calls: [], fetches: [], spawns: [], status: { DB_URL: dsn, API_URL: origin, SERVICE_ROLE_KEY: serviceKey, ANON_KEY: anonKey },
    container: { id: payload.containerId, name: '/supabase_db_bertel-ci', running: true, created: payload.containerCreatedAt,
      mounts: [{ Type: 'volume', Name: payload.volumeName, Destination: payload.dataDirectory }],
      ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '54322' }] } },
    volume: { name: payload.volumeName, created: payload.volumeCreatedAt } };
  const currentMarker = () => JSON.parse(readFileSync(join(workdir, markerName), 'utf8'));
  const responsePayload = () => {
    const m = currentMarker();
    return { nonce: m.nonce, system_identifier: m.systemIdentifier ?? payload.systemIdentifier, database: 'postgres' };
  };
  state.run = (file, args, options) => {
    state.calls.push({ file, args, options });
    if (file === 'supabase') return JSON.stringify(state.status);
    if (file === 'docker' && args.includes('ls')) return args.includes('volume') ? (state.preexistingVolumes ?? '') : (state.preexistingContainers ?? '');
    if (file === 'docker' && args.includes('volume') && args.includes('inspect')) return JSON.stringify(state.volume);
    if (file === 'docker' && args.includes('inspect')) return JSON.stringify(state.container);
    if (file === 'docker' && args.includes('exec')) {
      if (options.input.includes("'data_directory'") && !options.input.includes('CREATE FUNCTION')) return JSON.stringify(state.physical ?? {system_identifier: payload.systemIdentifier, data_directory: payload.dataDirectory});
      return '';
    }
    if (file === 'psql') return JSON.stringify(state.database ?? responsePayload());
    throw new Error('Unexpected synthetic executor');
  };
  state.fetchImpl = async (url, options) => {
    state.fetches.push({ url: String(url), options });
    return { status: state.apiStatus ?? 200, json: async () => state.apiPayload ?? responsePayload() };
  };
  state.spawnImpl = (file, args, options) => {
    state.spawns.push({ file, args, options });
    return { synthetic: true };
  };
  const load = () => loadListEmailDisposable({ env, run: state.run, fetchImpl: state.fetchImpl, spawnImpl: state.spawnImpl });
  const saveMarker = (changes) => {
    Object.assign(payload, changes);
    writeFileSync(join(workdir, markerName), JSON.stringify(payload));
  };
  t.after(() => {
    // Paths are generated under this test's own mkdtemp root only.
    assert.match(root, /bertel-mail-guard-/);
    rmSync(root, { recursive: true, force: true });
  });
  return { root, workdir, env, payload, state, load, saveMarker, currentMarker };
}

function assertNoEffects(f) {
  assert.equal(f.state.calls.length, 0, 'no executable may run before static refusals');
  assert.equal(f.state.fetches.length, 0, 'no HTTP connection before static refusals');
  assert.equal(f.state.spawns.length, 0, 'no session/fixture before static refusals');
}

for (const [label, value] of Object.entries({
  remote: 'postgresql://postgres:postgres@db.example.invalid:54322/postgres',
  localhost_alias: 'postgresql://postgres:postgres@localhost:54322/postgres',
  numeric_alias: 'postgresql://postgres:postgres@2130706433:54322/postgres',
  encoded_host: 'postgresql://postgres:postgres@%31%32%37.0.0.1:54322/postgres',
  ipv6: 'postgresql://postgres:postgres@[::1]:54322/postgres',
  query_host: `${dsn}?host=db.example.invalid`,
  query_hostaddr: `${dsn}?hostaddr=203.0.113.9`,
  query_service: `${dsn}?service=production`,
  query_options: `${dsn}?options=-csearch_path%3Dpublic`,
  query_password: `${dsn}?password=do-not-use`,
  fragment: `${dsn}#ignored-by-WHATWG`,
  keyword_dsn: 'host=127.0.0.1 hostaddr=203.0.113.9 dbname=postgres',
  multiple_hosts: 'postgresql://postgres:postgres@127.0.0.1:54322,db.example.invalid:5432/postgres',
  socket: 'postgresql://postgres:postgres@%2Fvar%2Frun%2Fpostgresql/postgres',
  missing_password: 'postgresql://postgres@127.0.0.1:54322/postgres',
  other_database: 'postgresql://postgres:postgres@127.0.0.1:54322/live',
  leading_zero_port: 'postgresql://postgres:postgres@127.0.0.1:054322/postgres',
  invalid_port: 'postgresql://postgres:postgres@127.0.0.1:99999/postgres',
  whitespace: ` ${dsn}`,
})) {
  test(`pre-reject database ${label} without process or network effects`, async (t) => {
    const f = fixture(t);
    f.env.LIST_EMAIL_TEST_DB_URL = value;
    await assert.rejects(f.load(), /database|port/);
    assertNoEffects(f);
  });
}

for (const name of ['PGHOST', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGPASSWORD', 'PGPASSFILE', 'PGSYSCONFDIR', 'pgHostAddr']) {
  test(`pre-reject inherited ${name} before any executable`, async (t) => {
    const f = fixture(t);
    f.env[name] = 'private-value-must-not-appear';
    await assert.rejects(f.load(), (error) => {
      assert.match(error.message, /Inherited PostgreSQL/);
      assert.ok(!error.message.includes('private-value'));
      return true;
    });
    assertNoEffects(f);
  });
}

for (const name of ['CI', 'GITHUB_ACTIONS', 'LIST_EMAIL_DISPOSABLE', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_JOB']) {
  test(`pre-reject absent CI ownership field ${name}`, async (t) => {
    const f = fixture(t);
    delete f.env[name];
    await assert.rejects(f.load(), /authorization|identity/);
    assertNoEffects(f);
  });
}

test('missing marker never falls back to loopback-only authorization', async (t) => {
  const f = fixture(t, { marker: false });
  await assert.rejects(f.load(), /marker/);
  assertNoEffects(f);
});

for (const [label, changes] of Object.entries({
  pending: { phase: 'pending' }, wrong_run: { runId: '999' }, wrong_attempt: { attempt: '3' },
  wrong_job: { job: 'other' }, changed_database: { dsnSha256: hash(dsn.replace('54322', '54329')) },
  wrong_nonce: { nonce: 'not-hex' }, wrong_function: { functionName: 'list_email_ci_other' },
  wrong_workdir: { workdir: '/not-this-run' }, remote_api: { origin: 'http://example.invalid:54321' },
})) {
  test(`pre-reject marker ${label}`, async (t) => {
    const f = fixture(t);
    f.saveMarker(changes);
    await assert.rejects(f.load(), /attestation|marker|origin/);
    assertNoEffects(f);
  });
}

test('outside workdir and linked-project file refuse before status', async (t) => {
  const f = fixture(t);
  f.env.RUNNER_TEMP = join(f.root, 'different-temp');
  mkdirSync(f.env.RUNNER_TEMP);
  await assert.rejects(f.load(), /inside runner/);
  assertNoEffects(f);
  f.env.RUNNER_TEMP = f.root;
  mkdirSync(join(f.workdir, 'supabase/.temp'));
  writeFileSync(join(f.workdir, 'supabase/.temp/project-ref'), 'not-a-local-stack');
  await assert.rejects(f.load(), /Linked/);
  assertNoEffects(f);
});

test('symlinked workdir resolving outside runner temp refuses', async (t) => {
  const f = fixture(t);
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'bertel-mail-outside-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const link = join(f.root, 'escape');
  try { symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('OS does not permit a synthetic symlink'); return; } throw error; }
  f.env.LIST_EMAIL_SUPABASE_WORKDIR = link;
  await assert.rejects(f.load(), /inside runner/);
  assertNoEffects(f);
});

test('POSIX marker permissions must exclude group and other', { skip: process.platform === 'win32' }, async (t) => {
  const f = fixture(t);
  chmodSync(join(f.workdir, markerName), 0o644);
  await assert.rejects(f.load(), /private CI/);
  assertNoEffects(f);
});

test('the accepted child environment does not inherit credentials, proxy or remote Docker', () => {
  const clean = cleanChildEnvironment({
    PATH: '/bin', PGHOSTADDR: '203.0.113.9', PGSERVICE: 'remote', PGPASSWORD: 'secret', PGSERVICEFILE: '/secret',
    SUPABASE_ACCESS_TOKEN: 'account-secret', HTTP_PROXY: 'http://remote', NODE_OPTIONS: '--require attacker',
    DOCKER_HOST: 'tcp://remote', DOCKER_CONTEXT: 'remote',
  }, '/owned/ci');
  assert.deepEqual(Object.keys(clean).filter((k) => k.startsWith('PG')).sort(),
    ['PGCONNECT_TIMEOUT', 'PGGSSENCMODE', 'PGPASSFILE', 'PGSSLMODE']);
  assert.equal(clean.PGCONNECT_TIMEOUT, '5');
  assert.equal(clean.PGSSLMODE, 'disable');
  assert.equal(clean.PGGSSENCMODE, 'disable');
  assert.equal(clean.PGPASSFILE, resolve('/owned/ci', '.bertel-list-email-empty-home/no-password-file'));
  assert.equal(clean.DOCKER_HOST, 'unix:///var/run/docker.sock');
  for (const key of ['SUPABASE_ACCESS_TOKEN', 'HTTP_PROXY', 'NODE_OPTIONS', 'DOCKER_CONTEXT', 'PGHOSTADDR', 'PGSERVICE', 'PGPASSWORD']) {
    assert.equal(clean[key], undefined);
  }
});

for (const [label, mutate] of Object.entries({
  status_database: (f) => { f.state.status.DB_URL = dsn.replace('54322', '54329'); },
  status_password: (f) => { f.state.status.DB_URL = dsn.replace(':postgres@', ':different@'); },
  status_query_override: (f) => { f.state.status.DB_URL = `${dsn}?hostaddr=203.0.113.9`; },
  status_remote_api: (f) => { f.state.status.API_URL = 'https://example.invalid'; },
  status_different_api: (f) => { f.state.status.API_URL = origin.replace('54321', '54329'); },
  stopped_container: (f) => { f.state.container.running = false; },
  different_container: (f) => { f.state.container.id = 'c'.repeat(64); },
  wrong_container_name: (f) => { f.state.container.name = '/supabase_db_other'; },
  database_sysid: (f) => { f.state.database = { nonce: f.payload.nonce, system_identifier: '7359111111111111111', database: 'postgres' }; },
  database_nonce: (f) => { f.state.database = { nonce: 'c'.repeat(64), system_identifier: f.payload.systemIdentifier, database: 'postgres' }; },
  api_nonce: (f) => { f.state.apiPayload = { nonce: 'c'.repeat(64), system_identifier: f.payload.systemIdentifier, database: 'postgres' }; },
  api_sysid: (f) => { f.state.apiPayload = { nonce: f.payload.nonce, system_identifier: '7359222222222222222', database: 'postgres' }; },
  api_wrong_database: (f) => { f.state.apiPayload = { nonce: f.payload.nonce, system_identifier: f.payload.systemIdentifier, database: 'wrong' }; },
  api_outage: (f) => { f.state.apiStatus = 503; f.state.apiPayload = { opaque: true }; },
})) {
  test(`effective target attestation rejects ${label} before fixture sessions`, async (t) => {
    const f = fixture(t);
    mutate(f);
    await assert.rejects(f.load());
    assert.equal(f.state.spawns.length, 0);
    assert.ok(!f.state.calls.some((c) => c.options.input?.includes('INSERT')));
  });
}

test('valid run binds status/container/effective database/API before exposing test handles', async (t) => {
  const f = fixture(t);
  const local = await f.load();
  assert.equal(f.state.calls.length, 4);
  assert.equal(f.state.fetches.length, 1);
  assert.equal(local.dsn, dsn);
  assert.equal(local.origin, origin);
  assert.match(f.state.calls[3].options.input, /^BEGIN READ ONLY;/);
  assert.match(f.state.calls[3].options.input, /pg_control_system/);
  assert.equal(f.state.fetches[0].options.redirect, 'error');
  assert.equal(f.state.fetches[0].options.headers['accept-profile'], 'api');
  local.spawnPsql();
  assert.equal(f.state.spawns.length, 1);
  assert.equal(f.state.spawns[0].options.env, local.childEnv);
  assert.equal(f.state.spawns[0].options.env.PGHOSTADDR, undefined);
  assert.equal(f.state.spawns[0].options.env.PGPASSWORD, undefined);
  assert.ok(f.state.spawns[0].args.includes('-w'));
  assert.ok(f.state.spawns[0].args.includes('-X'));
  for (const call of f.state.calls) {
    assert.equal(call.options.env.SUPABASE_ACCESS_TOKEN, undefined);
    assert.equal(call.options.env.DOCKER_HOST, 'unix:///var/run/docker.sock');
  }
  const before = f.state.fetches.length;
  assert.throws(() => local.request('https://outside.invalid/path', local.service, {}), /attested loopback/);
  assert.throws(() => local.request('//outside.invalid/path', local.service, {}), /attested loopback/);
  assert.throws(() => local.request('http://user@127.0.0.1:54321/path', local.service, {}), /attested loopback/);
  assert.equal(f.state.fetches.length, before);
  await local.request('/auth/v1/token?grant_type=password', local.anonymous, { fixture: true });
  assert.equal(f.state.fetches.at(-1).options.redirect, 'error');
  assert.equal(f.state.fetches.at(-1).url, `${origin}/auth/v1/token?grant_type=password`);
});

test('executor errors never re-emit DSN, API keys or raw output', async (t) => {
  const f = fixture(t);
  f.state.run = () => { throw new Error(`connection ${dsn} ${serviceKey} secret stderr`); };
  await assert.rejects(f.load(), (error) => {
    assert.ok(!error.message.includes(dsn) && !error.message.includes(serviceKey) && !error.message.includes('secret stderr'));
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('initializer creates a fresh private nonce and installs probe only inside owned container', async (t) => {
  const f = fixture(t, { marker: false });
  prepareListEmailDisposable({ env: f.env, run: f.state.run });
  f.state.container.created = new Date().toISOString(); f.state.volume.created = new Date().toISOString();
  verifyStartedListEmailDisposable({ env: f.env, run: f.state.run });
  const result = await initializeListEmailDisposable({ env: f.env, run: f.state.run, fetchImpl: f.state.fetchImpl });
  assert.deepEqual(result, { initialized: true });
  const ready = f.currentMarker();
  assert.equal(ready.phase, 'ready');
  assert.match(ready.nonce, /^[0-9a-f]{64}$/);
  assert.notEqual(ready.nonce, 'a'.repeat(64));
  const markerText = readFileSync(join(f.workdir, markerName), 'utf8');
  for (const forbidden of [dsn, serviceKey, anonKey, f.env.SUPABASE_ACCESS_TOKEN]) assert.ok(!markerText.includes(forbidden));
  const installs = f.state.calls.filter((c) => c.options.input?.includes('CREATE FUNCTION'));
  assert.equal(installs.length, 1);
  assert.equal(installs[0].file, 'docker');
  assert.ok(installs[0].args.includes(f.payload.containerId));
  assert.ok(installs[0].args.includes('env') && installs[0].args.includes('-i'));
  assert.match(installs[0].options.input, /SECURITY INVOKER/);
  assert.match(installs[0].options.input, /FROM PUBLIC, anon, authenticated/);
  assert.match(installs[0].options.input, /TO service_role/);
  assert.ok(!f.state.calls.some((c) => c.file === 'psql' && c.options.input?.includes('CREATE')));
  const loaded = await f.load();
  assert.equal(loaded.origin, origin);
  await assert.rejects(initializeListEmailDisposable({ env: f.env, run: f.state.run, fetchImpl: f.state.fetchImpl }), /attestation/);
});

test('failed initialization leaves an incomplete marker that cannot authorize fixtures', async (t) => {
  const f = fixture(t, { marker: false });
  prepareListEmailDisposable({ env: f.env, run: f.state.run });
  f.state.container.created = new Date().toISOString(); f.state.volume.created = new Date().toISOString();
  verifyStartedListEmailDisposable({ env: f.env, run: f.state.run });
  f.state.apiStatus = 503;
  f.state.apiPayload = { opaque: true };
  await assert.rejects(initializeListEmailDisposable({ env: f.env, run: f.state.run, fetchImpl: f.state.fetchImpl }), /discard this stack/);
  assert.equal(f.currentMarker().phase, 'started');
  f.state.calls.length = 0;
  f.state.fetches.length = 0;
  await assert.rejects(f.load(), /attestation/);
  assertNoEffects(f);
});

test('canonical safe alias preserves one explicit database target', () => {
  assert.equal(validateDatabaseUrl(dsn.replace('postgresql:', 'postgres:')), dsn);
  assert.throws(() => validateDatabaseUrl(dsn + '?sslmode=disable'));
});
for (const name of ['HTTP_PROXY', 'https_proxy', 'ALL_PROXY', 'NODE_USE_ENV_PROXY', 'GLOBAL_AGENT_HTTP_PROXY']) {
  test(`pre-reject inherited HTTP proxy ${name}`, async (t) => {
    const f = fixture(t);
    f.env[name] = 'do-not-echo-private-proxy';
    await assert.rejects(f.load(), /Proxy-controlled/);
    assertNoEffects(f);
  });
}

test('oversized and malformed marker refuse before all executables', async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.workdir, markerName), 'x'.repeat(9000));
  await assert.rejects(f.load(), /marker/);
  assertNoEffects(f);
  writeFileSync(join(f.workdir, markerName), '{"version":');
  await assert.rejects(f.load(), /marker/);
  assertNoEffects(f);
});

test('unsafe executable selector refuses before any child process', async (t) => {
  const f = fixture(t);
  f.env.LIST_EMAIL_PSQL = 'curl';
  await assert.rejects(f.load(), /psql executable/);
  assertNoEffects(f);
});

test('only the explicit PostgREST cache-miss code may be retried', async (t) => {
  const f = fixture(t);
  let calls = 0;
  const local = await loadListEmailDisposable({
    env: f.env, run: f.state.run, spawnImpl: f.state.spawnImpl,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return { status: 404, json: async () => ({ code: 'PGRST202' }) };
      return { status: 200, json: async () => ({
        nonce: f.payload.nonce, system_identifier: f.payload.systemIdentifier, database: 'postgres',
      }) };
    },
  });
  assert.equal(local.origin, origin);
  assert.equal(calls, 2);
  f.state.apiStatus = 404;
  f.state.apiPayload = { code: 'UNKNOWN' };
  await assert.rejects(f.load(), /API identity/);
  assert.equal(f.state.fetches.length, 1);
});

test('SQL helper keeps the attested DSN and sanitized environment and withholds failures', async (t) => {
  const f = fixture(t);
  const local = await f.load();
  assert.equal(local.sql('SELECT 1;', 'non-sensitive stage'), JSON.stringify({
    nonce: f.payload.nonce, system_identifier: f.payload.systemIdentifier, database: 'postgres',
  }));
  const call = f.state.calls.at(-1);
  assert.equal(call.file, 'psql');
  assert.equal(call.args[0], dsn);
  assert.equal(call.options.env, local.childEnv);
  assert.equal(call.options.env.PGPASSWORD, undefined);
  f.state.run = () => { throw new Error('unused replacement closure'); };
  // A separate loader closes over this controlled executor, which succeeds
  // during attestation then fails only on a later synthetic fixture statement.
  const safe = await loadListEmailDisposable({
    env: f.env, fetchImpl: f.state.fetchImpl,
    run: (file, args, options) => {
      if (options.input === 'SELECT synthetic_failure;') throw new Error(`${dsn} ${serviceKey} raw fixture output`);
      if (file === 'supabase') return JSON.stringify(f.state.status);
      if (file === 'docker') return JSON.stringify(args.includes('volume') ? f.state.volume : f.state.container);
      return JSON.stringify({ nonce: f.payload.nonce, system_identifier: f.payload.systemIdentifier, database: 'postgres' });
    },
  });
  assert.throws(() => safe.sql('SELECT synthetic_failure;', serviceKey), (error) => {
    assert.equal(error.message, 'Disposable SQL fixture failed; raw output withheld');
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('failed API transport does not propagate URL, authorization or a cause', async (t) => {
  const f = fixture(t);
  await assert.rejects(loadListEmailDisposable({
    env: f.env, run: f.state.run,
    fetchImpl: async () => { throw new Error(`${serviceKey} ${origin} private transport detail`); },
  }), (error) => {
    assert.equal(error.message, 'Cannot attest the effective disposable API');
    assert.equal(error.cause, undefined);
    return true;
  });
});
for (const kind of ['Containers', 'Volumes']) {
  test(`pre-start preparation refuses preexisting database ${kind.toLowerCase()}`, (t) => {
    const f = fixture(t, { marker: false });
    f.state[`preexisting${kind}`] = 'supabase_db_bertel-ci';
    assert.throws(() => prepareListEmailDisposable({ env: f.env, run: f.state.run }), /Preexisting/);
    assert.equal(f.currentMarker().phase, 'pending');
    assert.ok(f.state.calls.every((c) => c.file === 'docker' && c.args.includes('ls')));
    assert.equal(f.state.fetches.length, 0);
  });
}

for (const [label, mutate] of Object.entries({
  old_container: (f) => { f.state.container.created = '2020-01-01T00:00:00Z'; },
  old_volume: (f) => { f.state.volume.created = '2020-01-01T00:00:00Z'; },
  bind_data: (f) => { f.state.container.mounts[0].Type = 'bind'; },
  reused_volume: (f) => { f.state.container.mounts[0].Name = 'unowned-data'; },
  nested_data_mount: (f) => { f.state.container.mounts.push({ Type: 'volume', Name: 'old-wal', Destination: '/var/lib/postgresql/data/pg_wal' }); },
  different_port: (f) => { f.state.container.ports['5432/tcp'][0].HostPort = '54329'; },
})) {
  test(`post-start ownership rejects ${label} before any SQL or HTTP`, (t) => {
    const f = fixture(t, { marker: false });
    prepareListEmailDisposable({ env: f.env, run: f.state.run });
    f.state.container.created = new Date().toISOString(); f.state.volume.created = new Date().toISOString();
    mutate(f);
    assert.throws(() => verifyStartedListEmailDisposable({ env: f.env, run: f.state.run }));
    assert.ok(!f.state.calls.some((c) => c.file === 'psql' || c.args.includes('exec')));
    assert.equal(f.state.fetches.length, 0);
    assert.equal(f.currentMarker().phase, 'prepared');
  });
}

test('prepared and started markers never authorize fixture consumers', async (t) => {
  const f = fixture(t, { marker: false });
  prepareListEmailDisposable({ env: f.env, run: f.state.run });
  f.state.calls.length = 0;
  await assert.rejects(f.load(), /attestation/);
  assertNoEffects(f);
  f.state.container.created = new Date().toISOString(); f.state.volume.created = new Date().toISOString();
  verifyStartedListEmailDisposable({ env: f.env, run: f.state.run });
  f.state.calls.length = 0;
  await assert.rejects(f.load(), /attestation/);
  assertNoEffects(f);
});

test('a fresh volume with a changed physical data path cannot receive the probe', async (t) => {
  const f = fixture(t, { marker: false });
  prepareListEmailDisposable({ env: f.env, run: f.state.run });
  f.state.container.created = new Date().toISOString(); f.state.volume.created = new Date().toISOString();
  verifyStartedListEmailDisposable({ env: f.env, run: f.state.run });
  f.state.physical = { system_identifier: f.payload.systemIdentifier, data_directory: '/unowned/production-data' };
  await assert.rejects(initializeListEmailDisposable({ env: f.env, run: f.state.run, fetchImpl: f.state.fetchImpl }), /discard this stack/);
  assert.ok(!f.state.calls.some((c) => c.options.input?.includes('CREATE FUNCTION')));
  assert.equal(f.state.fetches.length, 0);
});

test('changed volume after attestation refuses before fixture sessions', async (t) => {
  const f = fixture(t);
  f.state.volume.created = new Date().toISOString();
  await assert.rejects(f.load(), /volume changed/);
  assert.equal(f.state.spawns.length, 0);
  assert.equal(f.state.fetches.length, 0);
});

test('workflow DB_URL cannot disagree with the attested database', async (t) => {
  const f = fixture(t);
  f.env.DB_URL = dsn.replace('54322', '54329');
  await assert.rejects(f.load(), /Workflow database URL/);
  assertNoEffects(f);
});
