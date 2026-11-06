import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { Readable } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import { PROJECT_ORIGIN, KEYS, parsePublicConfig, validatePublicConfig, buildArguments, releaseContext,
  compressedArchive, readBounded, digest, validateImageMetadata, MAX_IMAGE_BYTES } from './candidate.mjs';

const sha = 'a'.repeat(40);
const config = () => ({ NEXT_PUBLIC_SUPABASE_URL: PROJECT_ORIGIN,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: `sb_publishable_${'x'.repeat(28)}`, NEXT_PUBLIC_ENABLE_DEMO_MODE: 'false',
  NEXT_PUBLIC_MAP_STYLE_CLASSIC: 'https://demotiles.maplibre.org/style.json',
  NEXT_PUBLIC_MAP_STYLE_SATELLITE: 'https://tiles.openfreemap.org/styles/liberty',
  NEXT_PUBLIC_MAP_STYLE_TOPO: 'https://tiles.openfreemap.org/styles/bright' });
const text = (value = config()) => `window.__APP_CONFIG__ = {\n${Object.entries(value).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(',\n')}\n};`;
async function removeOwnTemporary(folder) {
  const absolute = resolve(folder);
  assert.equal(dirname(absolute), resolve(tmpdir()));
  assert.ok(basename(absolute).startsWith('bertel-candidate-test-'));
  await rm(absolute, { recursive: true, force: true });
}

test('reads the actual template shape without evaluating JavaScript; keys have deterministic order', () => {
  assert.deepEqual(parsePublicConfig(text()), config());
  assert.deepEqual(Object.keys(parsePublicConfig(text())), KEYS);
  assert.throws(() => parsePublicConfig(`${text()} globalThis.shouldNotExecute = true;`), /syntax/);
  assert.equal(globalThis.shouldNotExecute, undefined);
});

test('rejects an expression, duplicate/extra/missing keys and oversized source', () => {
  for (const value of [text().replace('"false"', 'String(false)'),
    text().replace('NEXT_PUBLIC_ENABLE_DEMO_MODE:', 'NEXT_PUBLIC_SUPABASE_URL:'),
    text({ ...config(), SUPABASE_SERVICE_ROLE_KEY: 'should-never-enter-build' }),
    text(Object.fromEntries(Object.entries(config()).slice(1))), ' '.repeat(16385)]) {
    assert.throws(() => parsePublicConfig(value));
  }
});

test('only a public key can enter build arguments, including a legacy anon JWT positive', () => {
  const jwt = (claims) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic`;
  assert.equal(validatePublicConfig({ ...config(), NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: 'ryycrdhlkmzpxwwwwupy' }) }).NEXT_PUBLIC_ENABLE_DEMO_MODE, 'false');
  for (const key of ['sb_secret_forbidden', jwt({ role: 'service_role', ref: 'ryycrdhlkmzpxwwwwupy' }),
    jwt({ role: 'anon', ref: 'differentprojectref00' }), 'bad', `${config().NEXT_PUBLIC_SUPABASE_ANON_KEY}\nINJECT=x`]) {
    assert.throws(() => buildArguments(sha, { ...config(), NEXT_PUBLIC_SUPABASE_ANON_KEY: key }));
  }
});

test('refuses another project, demo fallback and new map destinations', () => {
  for (const patch of [{ NEXT_PUBLIC_SUPABASE_URL: 'https://attacker.invalid' },
    { NEXT_PUBLIC_SUPABASE_URL: `${PROJECT_ORIGIN}/?token=anything` },
    { NEXT_PUBLIC_ENABLE_DEMO_MODE: 'true' }, { NEXT_PUBLIC_MAP_STYLE_CLASSIC: 'https://attacker.invalid/map.json' }]) {
    assert.throws(() => validatePublicConfig({ ...config(), ...patch }));
  }
});

test('source identity must be exactly the manual master workflow snapshot', () => {
  const context = { expected: sha, actual: sha, workflowSha: sha, event: 'workflow_dispatch', ref: 'refs/heads/master' };
  assert.equal(releaseContext(context), sha);
  for (const patch of [{ expected: 'main; echo bad' }, { actual: 'b'.repeat(40) }, { workflowSha: 'b'.repeat(40) },
    { event: 'pull_request' }, { ref: 'refs/heads/another' }]) assert.throws(() => releaseContext({ ...context, ...patch }));
});

test('Docker gets only six public build parameters and the exact source/platform, with no shell', () => {
  const args = buildArguments(sha, config());
  assert.equal(args.filter((value) => value === '--build-arg').length, 6);
  assert.equal(args[args.indexOf('--platform') + 1], 'linux/amd64');
  assert.ok(args.includes(`org.opencontainers.image.revision=${sha}`));
  assert.equal(args.at(-1), 'bertel-tourism-ui');
  assert.ok(!args.join(' ').includes('SERVICE_ROLE'));
});

test('bounded HTTP source refuses failed and oversized responses without evaluating their bodies', async () => {
  assert.equal(await readBounded(new Response('small')), 'small');
  await assert.rejects(readBounded(new Response('upstream detail', { status: 403 })), /http/);
  await assert.rejects(readBounded(new Response('too large'), 4), /size/);
});

test('final image proof requires source labels, non-root amd64, a separate uncompressed size bound and no server credential env', () => {
  const info = { Id: `sha256:${'b'.repeat(64)}`, Os: 'linux', Architecture: 'amd64', Size: 275000000,
    Config: { User: 'node', Env: ['NODE_ENV=production', 'NODE_VERSION=22.0.0'], Labels: {
      'org.opencontainers.image.revision': sha, 'org.opencontainers.image.source': 'https://github.com/D-OTIsud/Bertel' } } };
  const result = validateImageMetadata(info, sha);
  assert.equal(result.revision, sha);
  assert.equal(result.size, 275000000);
  for (const invalid of [{ ...info, Architecture: 'arm64' }, { ...info, Size: MAX_IMAGE_BYTES + 1 },
    { ...info, Size: 0 }, { ...info, Config: { ...info.Config, User: 'root' } },
    { ...info, Config: { ...info.Config, Labels: {} } },
    { ...info, Config: { ...info.Config, Env: ['SUPABASE_SERVICE_ROLE_KEY=not-for-the-image'] } }]) {
    assert.throws(() => validateImageMetadata(invalid, sha));
  }
});

test('archive checksum describes the real compressed bytes and the full input roundtrips', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bertel-candidate-test-'));
  try {
    const source = Buffer.from('synthetic Docker stream\n'.repeat(500)); const file = join(folder, 'candidate.tar.gz');
    const result = await compressedArchive(Readable.from([source.subarray(0, 7), source.subarray(7)]), file);
    const bytes = await readFile(file);
    assert.deepEqual(gunzipSync(bytes), source);
    assert.deepEqual(result, { bytes: bytes.length, sha256: digest(bytes) });
    await assert.rejects(stat(`${file}.partial`), { code: 'ENOENT' });
  } finally { await removeOwnTemporary(folder); }
});

test('size cap and interrupted source do not publish a finished archive', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bertel-candidate-test-'));
  try {
    for (const [name, source, limit] of [['size', Readable.from([Buffer.from('synthetic')]), 1],
      ['interrupted', Readable.from((async function* () { yield Buffer.from('start'); throw new Error('synthetic interruption'); })()), 1000]]) {
      const file = join(folder, name);
      await assert.rejects(compressedArchive(source, file, limit));
      await assert.rejects(stat(file), { code: 'ENOENT' });
      await assert.rejects(stat(`${file}.partial`), { code: 'ENOENT' });
    }
  } finally { await removeOwnTemporary(folder); }
});

test('never overwrites a previous archive or deletes a previous partial attempt', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bertel-candidate-test-'));
  try {
    const file = join(folder, 'candidate');
    await writeFile(file, 'previous finished');
    await assert.rejects(compressedArchive(Readable.from(['new']), file), /archive_exists/);
    assert.equal(await readFile(file, 'utf8'), 'previous finished');
    const other = join(folder, 'other'); await writeFile(`${other}.partial`, 'previous partial');
    await assert.rejects(compressedArchive(Readable.from(['new']), other), { code: 'EEXIST' });
    assert.equal(await readFile(`${other}.partial`, 'utf8'), 'previous partial');
  } finally { await removeOwnTemporary(folder); }
});
