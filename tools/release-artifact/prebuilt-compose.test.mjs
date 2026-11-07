import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../bertel-tourism-ui/docker-compose.yml', import.meta.url));
const prebuilt = fileURLToPath(new URL('../../bertel-tourism-ui/docker-compose.prebuilt.yml', import.meta.url));
const serviceName = 'bertel-tourism-ui';
const sourceSha = 'a'.repeat(40);
const runtimeKeys = [
  'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_ENABLE_DEMO_MODE', 'NEXT_PUBLIC_MAP_STYLE_CLASSIC',
  'NEXT_PUBLIC_MAP_STYLE_SATELLITE', 'NEXT_PUBLIC_MAP_STYLE_TOPO',
  'SUPABASE_SERVICE_ROLE_KEY', 'THESAURUS_CURSOR_SECRET', 'LIST_EMAIL_MODE',
];
const fixture = {
  NEXT_PUBLIC_APP_URL: 'https://synthetic.example.invalid',
  NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic-supabase.example.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-public-key-not-a-credential',
  NEXT_PUBLIC_ENABLE_DEMO_MODE: 'false',
  NEXT_PUBLIC_MAP_STYLE_CLASSIC: 'https://synthetic.example.invalid/classic.json',
  NEXT_PUBLIC_MAP_STYLE_SATELLITE: 'https://synthetic.example.invalid/satellite.json',
  NEXT_PUBLIC_MAP_STYLE_TOPO: 'https://synthetic.example.invalid/topo.json',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-placeholder-not-a-credential',
  THESAURUS_CURSOR_SECRET: 'synthetic-cursor-placeholder-not-a-secret',
  LIST_EMAIL_MODE: 'closed',
};
const temporaryRoot = await realpath(tmpdir());
const folder = await mkdtemp(join(temporaryRoot, 'bertel-prebuilt-compose-test-'));
const dockerConfig = join(folder, 'docker-config');
await mkdir(dockerConfig);
await writeFile(join(dockerConfig, 'config.json'), '{}\n');
// Do not inherit a real project key, Docker endpoint, SOURCE_COMMIT or Compose env.
const isolatedEnvironment = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP']) {
  if (process.env[key] !== undefined) isolatedEnvironment[key] = process.env[key];
}
isolatedEnvironment.DOCKER_CONFIG = dockerConfig;
isolatedEnvironment.COMPOSE_DISABLE_ENV_FILE = '1';

function docker(args) {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd: folder, env: isolatedEnvironment, encoding: 'utf8',
    timeout: 15000, maxBuffer: 1024 * 1024, shell: false,
  });
  assert.ifError(result.error);
  return result;
}
async function render(file, sha, mode = fixture.LIST_EMAIL_MODE) {
  const envFile = join(folder, 'synthetic.env');
  const values = { ...fixture, ...(sha === undefined ? {} : { SOURCE_COMMIT: sha }) };
  if (mode === null) delete values.LIST_EMAIL_MODE;
  else values.LIST_EMAIL_MODE = mode;
  await writeFile(envFile, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
  // config renders YAML only: no daemon operation, build, pull, run, up or registry lookup.
  return docker(['--project-name', 'bertel-prebuilt-contract', '--project-directory', folder,
    '--env-file', envFile, '-f', file, 'config', '--format', 'json']);
}
function parsed(result) {
  assert.equal(result.status, 0, `Compose config failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

before(() => {
  const version = docker(['version', '--short']);
  assert.equal(version.status, 0, 'native Docker Compose is required; do not skip this contract');
  console.log(`Native Docker Compose: ${version.stdout.trim()}`);
});
after(async () => {
  const actual = await realpath(folder);
  assert.equal(dirname(actual), temporaryRoot);
  assert.ok(basename(actual).startsWith('bertel-prebuilt-compose-test-'));
  await rm(actual, { recursive: true, force: true });
});

test('native rendering changes only build -> image and pull_policy, preserving the full service', async () => {
  const current = parsed(await render(source, sourceSha));
  const candidate = parsed(await render(prebuilt, sourceSha));
  assert.deepEqual(Object.keys(current.services), [serviceName], 'positive service witness');
  assert.deepEqual(Object.keys(current.services[serviceName].environment).sort(), [...runtimeKeys].sort());
  assert.ok(current.services[serviceName].build, 'source build must exist before the comparison');
  const ports = current.services[serviceName].ports;
  assert.equal(ports.length, 2, 'only the two loopback probes may be published');
  assert.deepEqual(new Set(ports.map(({ host_ip }) => host_ip)), new Set(['127.0.0.1', '::1']));
  for (const { published, target, protocol } of ports) {
    assert.deepEqual([published, target, protocol], ['8081', 3000, 'tcp']);
  }
  assert.equal(current.services[serviceName].environment.THESAURUS_CURSOR_SECRET, fixture.THESAURUS_CURSOR_SECRET);
  assert.equal(current.services[serviceName].environment.LIST_EMAIL_MODE, 'closed');
  const expected = structuredClone(current);
  delete expected.services[serviceName].build;
  expected.services[serviceName].image = `bertel-candidate:${sourceSha}`;
  expected.services[serviceName].pull_policy = 'never';
  assert.deepEqual(candidate, expected);
});

test('manual admission is runtime-only and defaults to closed in both Compose files', async () => {
  for (const file of [source, prebuilt]) {
    for (const mode of [undefined, '', 'closed', 'protocol-v1', 'unknown']) {
      // null explicitly requests absence; default arguments otherwise replace undefined.
      const rendered = parsed(await render(file, sourceSha, mode ?? null));
      assert.equal(rendered.services[serviceName].environment.LIST_EMAIL_MODE, mode || 'closed');
      assert.ok(!Object.hasOwn(rendered.services[serviceName].build?.args ?? {}, 'LIST_EMAIL_MODE'));
    }
  }
});

test('a second exact commit chooses its matching local tag without changing runtime references', async () => {
  const otherSha = 'b'.repeat(40);
  const first = parsed(await render(prebuilt, sourceSha));
  const second = parsed(await render(prebuilt, otherSha));
  assert.equal(second.services[serviceName].image, `bertel-candidate:${otherSha}`);
  const expected = structuredClone(first);
  expected.services[serviceName].image = `bertel-candidate:${otherSha}`;
  assert.deepEqual(second, expected);
});

test('missing SOURCE_COMMIT fails even if an implicit dotenv tries to supply a different commit', async () => {
  await writeFile(join(folder, '.env'), `SOURCE_COMMIT=${'c'.repeat(40)}\n`);
  // Positive baseline proves all other required substitutions are present.
  parsed(await render(source, undefined));
  const missing = await render(prebuilt, undefined);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /SOURCE_COMMIT.*Exact reviewed source commit is required/);
});

test('an explicitly empty SOURCE_COMMIT also fails closed', async () => {
  const empty = await render(prebuilt, '');
  assert.notEqual(empty.status, 0);
  assert.match(empty.stderr, /SOURCE_COMMIT.*Exact reviewed source commit is required/);
});
