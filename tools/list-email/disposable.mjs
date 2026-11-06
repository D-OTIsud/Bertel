import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import {
  closeSync, constants, existsSync, fchmodSync, fsyncSync, fstatSync, ftruncateSync, lstatSync,
  mkdirSync, openSync, readFileSync, readSync, realpathSync, writeSync,
} from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';

const MARKER = '.bertel-list-email-disposable';
const VERSION = 'BERTEL_LIST_EMAIL_DISPOSABLE_V1';
const DOCKER_HOST = 'unix:///var/run/docker.sock';
const MAX_MARKER = 8192;
const failure = (message) => { throw new Error(message); };
const requireThat = (condition, message) => { if (!condition) failure(message); };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function validateDatabaseUrl(value) {
  // Check the original text: WHATWG URL normalizes aliases and libpq accepts
  // query overrides, multiple hosts, sockets, services and connection options.
  requireThat(typeof value === 'string' && /^postgres(?:ql)?:\/\/postgres:[A-Za-z0-9_-]{1,128}@127\.0\.0\.1:[1-9][0-9]{3,4}\/postgres$/.test(value),
    'Plain literal-loopback disposable database URL required');
  let url;
  try { url = new URL(value); } catch { failure('Invalid disposable database URL'); }
  requireThat(Number(url.port) >= 1024 && Number(url.port) <= 65535, 'Invalid disposable database port');
  return `postgresql://postgres:${url.password}@127.0.0.1:${url.port}/postgres`;
}

function validateApiOrigin(value) {
  requireThat(typeof value === 'string' && /^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}\/?$/.test(value),
    'Plain literal-loopback disposable API origin required');
  const url = new URL(value);
  requireThat(Number(url.port) >= 1024 && Number(url.port) <= 65535, 'Invalid disposable API port');
  return url.origin;
}

function privateFile(path) {
  let fd;
  try {
    const stat = lstatSync(path);
    requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_MARKER, 'Invalid CI ownership marker');
    if (process.platform !== 'win32') {
      requireThat((stat.mode & 0o077) === 0 && stat.uid === process.getuid(), 'CI marker must be private and owned by this runner');
    }
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(fd);
    requireThat(opened.isFile() && opened.ino === stat.ino && opened.dev === stat.dev && opened.size <= MAX_MARKER, 'CI marker changed during validation');
    if (process.platform !== 'win32') requireThat((opened.mode & 0o077) === 0 && opened.uid === process.getuid(), 'CI marker permissions changed');
    const bytes = Buffer.alloc(MAX_MARKER + 1);
    let length = 0, count;
    while (length < bytes.length && (count = readSync(fd, bytes, length, bytes.length - length, length)) > 0) length += count;
    requireThat(length <= MAX_MARKER, 'CI marker exceeds its bound');
    return JSON.parse(bytes.subarray(0, length).toString('utf8'));
  } catch { failure('Valid private CI ownership marker required'); }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function validateEnvironment(env) {
  requireThat(env.LIST_EMAIL_DISPOSABLE === 'true' && env.CI === 'true' && env.GITHUB_ACTIONS === 'true',
    'Explicit disposable GitHub CI authorization required');
  requireThat(/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID ?? '') && /^[1-9][0-9]{0,5}$/.test(env.GITHUB_RUN_ATTEMPT ?? '')
    && /^[A-Za-z0-9_-]{1,100}$/.test(env.GITHUB_JOB ?? ''), 'GitHub run identity required');
  requireThat(!Object.entries(env).some(([key, value]) => key.toUpperCase().startsWith('PG') && value),
    'Inherited PostgreSQL environment overrides are forbidden');
  requireThat(!Object.entries(env).some(([key, value]) => ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NODE_USE_ENV_PROXY', 'GLOBAL_AGENT_HTTP_PROXY'].includes(key.toUpperCase()) && value),
    'Proxy-controlled disposable HTTP execution is forbidden');
  const dsn = validateDatabaseUrl(env.LIST_EMAIL_TEST_DB_URL);
  if (env.DB_URL !== undefined) requireThat(validateDatabaseUrl(env.DB_URL) === dsn, 'Workflow database URL must match the attested database');
  requireThat(typeof env.RUNNER_TEMP === 'string' && typeof env.LIST_EMAIL_SUPABASE_WORKDIR === 'string',
    'Runner-owned disposable workdir required');
  let runnerTemp, workdir;
  try {
    runnerTemp = realpathSync(env.RUNNER_TEMP);
    workdir = realpathSync(env.LIST_EMAIL_SUPABASE_WORKDIR);
  } catch { failure('Existing runner-owned disposable workdir required'); }
  const inside = relative(runnerTemp, workdir);
  requireThat(inside && !inside.startsWith('..') && !isAbsolute(inside), 'Disposable workdir must be inside runner temp');
  requireThat(!existsSync(resolve(workdir, 'supabase/.temp/project-ref')), 'Linked Supabase project is forbidden');
  let config;
  try {
    const path = resolve(workdir, 'supabase/config.toml');
    requireThat(lstatSync(path).isFile() && lstatSync(path).size < 1024 * 1024, 'Invalid local stack config');
    const configInside = relative(workdir, realpathSync(path));
    requireThat(configInside && !configInside.startsWith('..') && !isAbsolute(configInside), 'Local stack config escaped workdir');
    config = readFileSync(path, 'utf8');
  } catch { failure('Disposable Supabase config required'); }
  const projectIds = [...config.matchAll(/^\s*project_id\s*=\s*"([a-z][a-z0-9_-]{0,62})"\s*(?:#[^\n]*)?$/gm)];
  requireThat(projectIds.length === 1, 'One explicit disposable project id required');
  const psql = env.LIST_EMAIL_PSQL ?? 'psql';
  requireThat(psql === 'psql' || (isAbsolute(psql) && /^psql(?:\.exe)?$/i.test(basename(psql))),
    'Explicit psql executable required');
  return { dsn, runnerTemp, workdir, projectId: projectIds[0][1], psql,
    runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, job: env.GITHUB_JOB };
}

export function cleanChildEnvironment(env, workdir) {
  // Allowlist, rather than spreading process.env: no PG credentials/overrides,
  // service files, Supabase account token, proxy, NODE_OPTIONS or remote Docker.
  const result = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TMP', 'TEMP', 'TMPDIR', 'LANG', 'LC_ALL']) {
    if (typeof env[name] === 'string') result[name] = env[name];
  }
  result.HOME = resolve(workdir, '.bertel-list-email-empty-home');
  result.XDG_CONFIG_HOME = resolve(result.HOME, '.config');
  result.DOCKER_HOST = DOCKER_HOST;
  result.PGPASSFILE = resolve(result.HOME, 'no-password-file');
  result.PGCONNECT_TIMEOUT = '5';
  result.PGSSLMODE = 'disable';
  result.PGGSSENCMODE = 'disable';
  return Object.freeze(result);
}

function runQuiet(run, file, args, childEnv, input, stage, maxBuffer = 1024 * 1024) {
  try {
    return run(file, args, { env: childEnv, input, encoding: 'utf8', windowsHide: true,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], timeout: 15000, maxBuffer }).trim();
  } catch { failure(`Disposable ${stage} failed; raw output withheld`); }
}

function captureStatus(context, childEnv, run) {
  let status;
  try {
    status = JSON.parse(runQuiet(run, 'supabase', ['status', '--workdir', context.workdir, '--output', 'json'],
      childEnv, undefined, 'stack status'));
  } catch { failure('Cannot capture the disposable stack status'); }
  requireThat(validateDatabaseUrl(status.DB_URL) === context.dsn, 'Database must match the owned local stack');
  const origin = validateApiOrigin(status.API_URL);
  for (const name of ['SERVICE_ROLE_KEY', 'ANON_KEY']) {
    requireThat(typeof status[name] === 'string' && /^[\x21-\x7e]{16,4096}$/.test(status[name]),
      'Local generated API keys required');
  }
  return { origin, service: Object.freeze({ apikey: status.SERVICE_ROLE_KEY, authorization: `Bearer ${status.SERVICE_ROLE_KEY}` }),
    anonymous: Object.freeze({ apikey: status.ANON_KEY, authorization: `Bearer ${status.ANON_KEY}` }) };
}

function inspectContainer(context, childEnv, run) {
  // Fixed local Docker socket and selected non-secret metadata only.
  const format = '{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"created":{{json .Created}},"mounts":{{json .Mounts}},"ports":{{json .NetworkSettings.Ports}}}';
  let container, volume;
  try {
    container = JSON.parse(runQuiet(run, 'docker', ['--host', DOCKER_HOST, 'inspect', '--format', format,
      `supabase_db_${context.projectId}`], childEnv, undefined, 'owned database container'));
  } catch { failure('Cannot attest the owned local database container'); }
  requireThat(/^[0-9a-f]{64}$/.test(container.id ?? '') && container.name === `/supabase_db_${context.projectId}`
    && container.running === true && Number.isFinite(Date.parse(container.created)), 'Running owned database container required');
  const mounts = container.mounts ?? [];
  requireThat(Array.isArray(mounts), 'Database mounts required');
  const data = mounts.filter((m) => m.Destination === '/var/lib/postgresql/data');
  requireThat(data.length === 1 && data[0].Type === 'volume' && data[0].Name === `supabase_db_${context.projectId}`
    && !mounts.some((m) => typeof m.Destination === 'string' && m.Destination.startsWith('/var/lib/postgresql/data/')),
    'One dedicated disposable database volume required');
  const ports = container.ports?.['5432/tcp'];
  requireThat(Array.isArray(ports) && ports.some((p) => ['127.0.0.1', '0.0.0.0'].includes(p.HostIp)
    && p.HostPort === new URL(context.dsn).port), 'Database port must belong to the owned container');
  try {
    volume = JSON.parse(runQuiet(run, 'docker', ['--host', DOCKER_HOST, 'volume', 'inspect', '--format',
      '{"name":{{json .Name}},"created":{{json .CreatedAt}}}', data[0].Name], childEnv, undefined, 'owned database volume'));
  } catch { failure('Cannot attest the owned local database volume'); }
  requireThat(volume.name === data[0].Name && Number.isFinite(Date.parse(volume.created)), 'Dated owned database volume required');
  return { containerId: container.id, containerCreatedAt: container.created,
    volumeName: volume.name, volumeCreatedAt: volume.created, dataDirectory: data[0].Destination };
}

function requireFreshTargets(context, childEnv, run) {
  const name = `supabase_db_${context.projectId}`;
  const containers = runQuiet(run, 'docker', ['--host', DOCKER_HOST, 'container', 'ls', '--all', '--filter', `name=${name}`,
    '--format', '{{.Names}}'], childEnv, undefined, 'pre-start container absence');
  const volumes = runQuiet(run, 'docker', ['--host', DOCKER_HOST, 'volume', 'ls', '--filter', `name=${name}`,
    '--format', '{{.Name}}'], childEnv, undefined, 'pre-start volume absence');
  // Substring matches are deliberately rejected as well. CI owns a new runner,
  // not a shared Docker namespace in which adoption could be ambiguous.
  requireThat(!containers && !volumes, 'Preexisting database container or volume is forbidden');
}

function requireNewStartedTargets(marker, observed) {
  requireThat(marker.targetsAbsent === true, 'Pre-start absence proof required');
  // Docker volumes may expose second precision. Absence before start is the
  // primary guard; dates only corroborate it, without claiming an atomic lease.
  const earliest = Math.floor(Date.parse(marker.preparedAtUTC) / 1000) * 1000;
  requireThat(Date.parse(observed.containerCreatedAt) >= earliest && Date.parse(observed.volumeCreatedAt) >= earliest
    && Date.parse(observed.containerCreatedAt) <= Date.now() + 5000 && Date.parse(observed.volumeCreatedAt) <= Date.now() + 5000,
    'Database container and data volume must be new for this CI preparation');
}

function requireSameStartedTargets(marker, observed) {
  requireNewStartedTargets(marker, observed);
  for (const key of ['containerId', 'containerCreatedAt', 'volumeName', 'volumeCreatedAt', 'dataDirectory']) {
    requireThat(marker[key] === observed[key], 'Owned CI database container or data volume changed');
  }
}

function containerSql(context, childEnv, run, containerId, text) {
  return runQuiet(run, 'docker', ['--host', DOCKER_HOST, 'exec', '--user', 'postgres', '-i', containerId, 'env', '-i',
    'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    'psql', '-X', '-w', '-h', '/var/run/postgresql', '-p', '5432', '-U', 'postgres', '-d', 'postgres',
    '-qAt', '-v', 'ON_ERROR_STOP=1'], childEnv, text, 'in-container ownership SQL');
}

function validateMarker(context, marker, phase = 'ready') {
  requireThat(marker?.version === VERSION && marker.phase === phase && /^[0-9a-f]{64}$/.test(marker.nonce ?? '')
    && Number.isFinite(Date.parse(marker.preparedAtUTC)) && marker.targetsAbsent === true, 'Complete CI stack ownership attestation required');
  requireThat(marker.runId === context.runId && marker.attempt === context.attempt && marker.job === context.job
    && marker.workdir === context.workdir && marker.runnerTemp === context.runnerTemp && marker.projectId === context.projectId
    && marker.dsnSha256 === sha256(context.dsn), 'CI stack marker does not match this run and database');
  if (phase !== 'prepared') {
    requireThat(/^[0-9a-f]{64}$/.test(marker.containerId ?? '') && marker.volumeName === `supabase_db_${context.projectId}`
      && Number.isFinite(Date.parse(marker.containerCreatedAt)) && Number.isFinite(Date.parse(marker.volumeCreatedAt))
      && marker.dataDirectory === '/var/lib/postgresql/data' && validateApiOrigin(marker.origin) === marker.origin,
      'Invalid started CI stack identity');
  }
  if (phase === 'ready') {
    requireThat(/^[0-9]{10,30}$/.test(marker.systemIdentifier ?? '')
      && marker.functionName === `list_email_ci_${marker.nonce.slice(0, 32)}`, 'Invalid CI attestation identity');
  }
}

function childHome(context, childEnv) {
  const stat = lstatSync(childEnv.HOME);
  requireThat(stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(childEnv.HOME) === childEnv.HOME,
    'Private CI child home required');
  if (process.platform !== 'win32') {
    requireThat((stat.mode & 0o077) === 0 && stat.uid === process.getuid(), 'Private CI child home ownership required');
  }
}

function saveMarker(path, marker, exclusive = false) {
  let fd;
  try {
    const before = exclusive ? undefined : lstatSync(path);
    fd = openSync(path, constants.O_WRONLY | (exclusive ? constants.O_CREAT | constants.O_EXCL : 0) | (constants.O_NOFOLLOW ?? 0), 0o600);
    const stat = fstatSync(fd);
    requireThat(stat.isFile() && (exclusive || (stat.ino === before.ino && stat.dev === before.dev)), 'CI marker path changed');
    if (process.platform !== 'win32') {
      requireThat(stat.uid === process.getuid(), 'CI marker owner changed');
      fchmodSync(fd, 0o600);
    }
    const bytes = Buffer.from(JSON.stringify(marker) + '\n');
    ftruncateSync(fd, 0);
    writeSync(fd, bytes, 0, bytes.length, 0);
    fsyncSync(fd);
  } catch { failure('Cannot save the private CI ownership marker'); }
  finally { if (fd !== undefined) closeSync(fd); }
}

function verifiedPayload(value, marker) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 3
    && value.nonce === marker.nonce && value.system_identifier === marker.systemIdentifier && value.database === 'postgres';
}

async function attestTargets(context, marker, childEnv, targets, run, fetchImpl) {
  requireThat(targets.origin === marker.origin, 'API must match the attested local stack');
  requireSameStartedTargets(marker, inspectContainer(context, childEnv, run));
  const text = `BEGIN READ ONLY;\nSELECT api.${marker.functionName}() || pg_catalog.jsonb_build_object('system_identifier', (pg_catalog.pg_control_system()).system_identifier::text);\nCOMMIT;\n`;
  let database;
  try {
    database = JSON.parse(runQuiet(run, context.psql, [context.dsn, '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1'],
      childEnv, text, 'database identity'));
  } catch { failure('Cannot attest the effective disposable database'); }
  requireThat(verifiedPayload(database, marker), 'Effective database identity does not match the owned CI stack');
  // PostgREST receives a schema-cache reload after creating the disposable probe.
  // Retry only its explicit not-yet-cached function error, never unknown failures.
  let verified = false;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let response, value;
    try {
      response = await fetchImpl(`${targets.origin}/rest/v1/rpc/${marker.functionName}`, {
        method: 'POST', redirect: 'error', headers: { ...targets.service, 'content-type': 'application/json',
          'content-profile': 'api', 'accept-profile': 'api' }, body: '{}', signal: AbortSignal.timeout(10000),
      });
      value = await response.json();
    } catch { failure('Cannot attest the effective disposable API'); }
    if (response.status === 200 && verifiedPayload(value, marker)) { verified = true; break; }
    requireThat(response.status === 404 && value?.code === 'PGRST202', 'Effective API identity does not match the owned CI stack');
    if (attempt < 9) await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  requireThat(verified, 'Disposable API attestation is not available');
}

export function prepareListEmailDisposable({ env = process.env, run = execFileSync } = {}) {
  const context = validateEnvironment(env);
  const childEnv = cleanChildEnvironment(env, context.workdir);
  const path = resolve(context.workdir, MARKER);
  requireThat(!existsSync(path) && !existsSync(childEnv.HOME), 'CI preparation already exists; use a new disposable stack');
  const marker = { version: VERSION, phase: 'pending', nonce: randomBytes(32).toString('hex'),
    preparedAtUTC: new Date().toISOString(), runId: context.runId, attempt: context.attempt, job: context.job,
    workdir: context.workdir, runnerTemp: context.runnerTemp, projectId: context.projectId, dsnSha256: sha256(context.dsn) };
  saveMarker(path, marker, true);
  mkdirSync(childEnv.HOME, { mode: 0o700 });
  requireFreshTargets(context, childEnv, run); // Docker metadata only; no SQL/HTTP.
  marker.targetsAbsent = true;
  marker.phase = 'prepared';
  saveMarker(path, marker);
  return { prepared: true };
}

export function verifyStartedListEmailDisposable({ env = process.env, run = execFileSync } = {}) {
  const context = validateEnvironment(env);
  const marker = privateFile(resolve(context.workdir, MARKER));
  validateMarker(context, marker, 'prepared');
  const childEnv = cleanChildEnvironment(env, context.workdir);
  childHome(context, childEnv);
  const targets = captureStatus(context, childEnv, run);
  const observed = inspectContainer(context, childEnv, run);
  requireNewStartedTargets(marker, observed);
  Object.assign(marker, observed, { origin: targets.origin, phase: 'started' });
  saveMarker(resolve(context.workdir, MARKER), marker);
  return { started: true };
}

export async function initializeListEmailDisposable({ env = process.env, run = execFileSync, fetchImpl = globalThis.fetch } = {}) {
  const context = validateEnvironment(env);
  const marker = privateFile(resolve(context.workdir, MARKER));
  validateMarker(context, marker, 'started');
  const childEnv = cleanChildEnvironment(env, context.workdir);
  childHome(context, childEnv);
  try {
    const targets = captureStatus(context, childEnv, run);
    requireThat(targets.origin === marker.origin, 'API must match the started local stack');
    requireSameStartedTargets(marker, inspectContainer(context, childEnv, run));
    let physical;
    try {
      physical = JSON.parse(containerSql(context, childEnv, run, marker.containerId,
        "SELECT pg_catalog.jsonb_build_object('system_identifier', (pg_catalog.pg_control_system()).system_identifier::text, 'data_directory', pg_catalog.current_setting('data_directory'));\n"));
    } catch { failure('Cannot read the owned database physical identity'); }
    requireThat(/^[0-9]{10,30}$/.test(physical.system_identifier ?? '') && physical.data_directory === marker.dataDirectory,
      'Owned database identity and data volume must agree');
    marker.systemIdentifier = physical.system_identifier;
    marker.functionName = `list_email_ci_${marker.nonce.slice(0, 32)}`;
    // CI-only, table-free probe. Write only through the already owned local
    // container socket; never through a potentially forwarded URL.
    containerSql(context, childEnv, run, marker.containerId, `BEGIN;
CREATE FUNCTION api.${marker.functionName}() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp
AS $probe$ SELECT pg_catalog.jsonb_build_object('nonce', '${marker.nonce}', 'system_identifier', '${marker.systemIdentifier}', 'database', pg_catalog.current_database()) $probe$;
REVOKE ALL ON FUNCTION api.${marker.functionName}() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.${marker.functionName}() TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
`);
    await attestTargets(context, marker, childEnv, targets, run, fetchImpl);
    marker.phase = 'ready';
    saveMarker(resolve(context.workdir, MARKER), marker);
    return { initialized: true };
  } catch { failure('Disposable CI attestation initialization failed; discard this stack, raw output withheld'); }
}

export async function loadListEmailDisposable({
  env = process.env, run = execFileSync, fetchImpl = globalThis.fetch, spawnImpl = spawn,
} = {}) {
  const context = validateEnvironment(env);
  const marker = privateFile(resolve(context.workdir, MARKER));
  validateMarker(context, marker); // All static refusals precede any spawn/network call.
  const childEnv = cleanChildEnvironment(env, context.workdir);
  childHome(context, childEnv);
  const targets = captureStatus(context, childEnv, run);
  await attestTargets(context, marker, childEnv, targets, run, fetchImpl);
  const psqlArgs = Object.freeze([context.dsn, '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1']);
  const request = (path, headers, body, method = 'POST') => {
    let url;
    try { url = new URL(path, targets.origin); } catch { failure('Invalid disposable HTTP target'); }
    requireThat(typeof path === 'string' && url.origin === targets.origin && !url.username && !url.password && !url.hash,
      'HTTP request must remain on the attested loopback origin');
    return fetchImpl(url, { method, redirect: 'error', headers: { ...headers, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  };
  const sql = (text) => runQuiet(run, context.psql, psqlArgs, childEnv, text, 'SQL fixture', 16 * 1024 * 1024);
  const spawnPsql = () => spawnImpl(context.psql, psqlArgs, {
    env: childEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  return { ...targets, dsn: context.dsn, workdir: context.workdir, psql: context.psql, childEnv, psqlArgs, request, sql, spawnPsql };
}
