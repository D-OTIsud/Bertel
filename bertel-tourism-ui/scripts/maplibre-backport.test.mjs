import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTIFACT, MANIFEST, PATCHES, UPSTREAM, buildPackage, loadUpstream, patchFile, readArchive, sha256 } from './build-maplibre-backport.mjs';
import { verifyInstalled } from './verify-maplibre-backport.mjs';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
// CI always exercises its own npm-ci installation. Local probes may name an
// isolated npm installation to avoid changing any shared worktree dependencies.
const installedProject = process.env.MAPLIBRE_TEST_PROJECT_ROOT || appRoot;
const probe = fileURLToPath(new URL('./check-maplibre-sanitizer.cjs', import.meta.url));
let upstream;
let built;
let fixture;
let upstreamFixture;

async function extractPackage(records, directory) {
  await fs.mkdir(directory, { recursive: true });
  for (const record of records) {
    const relative = record.name.slice(8);
    const target = path.resolve(directory, relative);
    assert.ok(target.startsWith(`${path.resolve(directory)}${path.sep}`), 'Fixture path escapes its package');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, record.bytes);
  }
}

async function stageProject(directory, archive, manifest) {
  await extractPackage(readArchive(archive), path.join(directory, 'node_modules/maplibre-gl'));
  await fs.mkdir(path.join(directory, 'vendor'), { recursive: true });
  await fs.writeFile(path.join(directory, 'vendor', ARTIFACT), archive);
  await fs.writeFile(path.join(directory, 'vendor', MANIFEST), JSON.stringify(manifest));
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ dependencies: { 'maplibre-gl': `file:vendor/${ARTIFACT}` } }));
  await fs.writeFile(path.join(directory, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {
    'node_modules/maplibre-gl': { version: '5.20.1', resolved: `file:vendor/${ARTIFACT}`, integrity: manifest.artifact.integrity },
  } }));
}

before(async () => {
  upstream = await loadUpstream(process.env.MAPLIBRE_UPSTREAM_ARCHIVE);
  built = buildPackage(upstream);
  fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'bertel-maplibre-proof-'));
  upstreamFixture = await fs.mkdtemp(path.join(os.tmpdir(), 'bertel-maplibre-proof-'));
  await stageProject(fixture, built.archive, built.manifest);
  // The negative witness is the unchanged published default bundle, staged in
  // isolation. It must fail for surviving handlers, not a loader/host-API error.
  const original = readArchive(upstream).filter((record) => ['package/package.json', 'package/dist/package.json', 'package/dist/maplibre-gl.js'].includes(record.name));
  await extractPackage(original, path.join(upstreamFixture, 'node_modules/maplibre-gl'));
  await fs.writeFile(path.join(upstreamFixture, 'package.json'), '{}');
});

after(async () => {
  for (const directory of [fixture, upstreamFixture].filter(Boolean)) {
    const expectedPrefix = path.join(os.tmpdir(), 'bertel-maplibre-proof-');
    assert.ok(path.resolve(directory).startsWith(path.resolve(expectedPrefix)), 'Refusing cleanup outside this disposable fixture');
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('reconstructs the reviewed archive twice with the same transport and payload bytes', async () => {
  assert.ok(built.archive.equals(buildPackage(upstream).archive));
  assert.ok(built.archive.equals(await fs.readFile(path.join(appRoot, 'vendor', ARTIFACT))));
  assert.deepEqual(built.manifest, JSON.parse(await fs.readFile(path.join(appRoot, 'vendor', MANIFEST), 'utf8')));
  assert.equal(built.manifest.changes.length, 5);
  assert.ok(built.manifest.changes.every((item) => item.substitutions === 1));
  assert.equal(built.manifest.omitted.length, 4);
  assert.equal(Object.keys(built.manifest.files).length, UPSTREAM.files - 4);
});

test('keeps every other package payload byte, including workers, CSS, types and licenses', () => {
  const original = new Map(readArchive(upstream).map((record) => [record.name.slice(8), record.bytes]));
  const changed = new Set(PATCHES.map((spec) => spec.path));
  for (const [name, hash] of Object.entries(built.manifest.files)) {
    if (!changed.has(name)) assert.equal(hash, sha256(original.get(name)), `Unintended payload change: ${name}`);
  }
});

test('is idempotent at every patch and rejects unknown source bytes', () => {
  const original = new Map(readArchive(upstream).map((record) => [record.name.slice(8), record.bytes]));
  for (const spec of PATCHES) {
    const first = patchFile(spec, original.get(spec.path));
    const second = patchFile(spec, first.bytes);
    assert.ok(first.bytes.equals(second.bytes));
    assert.equal(second.substitutions, 0);
    assert.equal(second.sourceMapReferencesRemoved, 0);
    assert.throws(() => patchFile(spec, Buffer.concat([first.bytes, Buffer.from('unknown')])), /Unknown upstream bytes/);
  }
  const unknown = Buffer.from(upstream);
  unknown[100] ^= 1;
  assert.throws(() => buildPackage(unknown), /Unknown upstream archive integrity/);
});

test('verifies the actually installed default entry and all four runnable bundles', async () => {
  const attestation = await verifyInstalled(installedProject);
  assert.match(attestation.resolvedEntry, /node_modules\/maplibre-gl\/dist\/maplibre-gl\.js$/);
  const output = execFileSync(process.execPath, [probe, installedProject], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
  const result = JSON.parse(output.trim());
  assert.equal(result.status, 'safe attribution');
  assert.equal(result.bundles.length, 4);
  assert.equal(result.payloads, 2);
});

test('reproduces the actual sanitizer bypass in the pinned unchanged upstream entry', () => {
  const result = spawnSync(process.execPath, [probe, upstreamFixture], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsafe attributes survived in maplibre-gl\.js/);
});

test('refuses unknown installed versions, altered alternate bundles, licenses and extra files', async () => {
  const root = path.join(fixture, 'node_modules/maplibre-gl');
  for (const name of ['package.json', 'dist/maplibre-gl-csp.js', 'LICENSE.txt']) {
    const filename = path.join(root, name);
    const saved = await fs.readFile(filename);
    try {
      const changed = name === 'package.json' ? Buffer.from(saved.toString().replace('"version": "5.20.1"', '"version": "5.20.2"'))
        : Buffer.concat([saved, Buffer.from('unknown')]);
      assert.ok(!changed.equals(saved));
      await fs.writeFile(filename, changed);
      await assert.rejects(verifyInstalled(fixture), /Unknown installed MapLibre version|Unrecognized installed MapLibre bytes/);
    } finally { await fs.writeFile(filename, saved); }
  }
  const extra = path.join(root, 'unknown-entry.js');
  try {
    await fs.writeFile(extra, 'unknown');
    await assert.rejects(verifyInstalled(fixture), /payload differs/);
  } finally { await fs.unlink(extra); }
  await verifyInstalled(fixture);
});

test('refuses a lost necessary file and a manifest edited to disguise payload drift', async () => {
  const filename = path.join(fixture, 'node_modules/maplibre-gl/dist/maplibre-gl-dev.js');
  const saved = await fs.readFile(filename);
  try {
    await fs.unlink(filename);
    await assert.rejects(verifyInstalled(fixture), /payload differs/);
  } finally { await fs.writeFile(filename, saved); }
  const manifestPath = path.join(fixture, 'vendor', MANIFEST);
  const manifestBytes = await fs.readFile(manifestPath);
  try {
    const disguised = JSON.parse(manifestBytes);
    disguised.files['dist/maplibre-gl-dev.js'] = sha256(Buffer.from('unknown'));
    await fs.writeFile(manifestPath, JSON.stringify(disguised));
    await assert.rejects(verifyInstalled(fixture), /Manifest does not describe/);
  } finally { await fs.writeFile(manifestPath, manifestBytes); }
  await verifyInstalled(fixture);
});

test('rejects a nested registry copy and alternate browser/module entrypoints', async () => {
  const lockPath = path.join(fixture, 'package-lock.json');
  const originalLock = await fs.readFile(lockPath);
  try {
    const duplicate = JSON.parse(originalLock);
    duplicate.packages['node_modules/some-wrapper/node_modules/maplibre-gl'] = {
      version: '5.20.1', resolved: UPSTREAM.url, integrity: UPSTREAM.integrity,
    };
    await fs.writeFile(lockPath, JSON.stringify(duplicate));
    await assert.rejects(verifyInstalled(fixture), /Nested or duplicate MapLibre/);
  } finally { await fs.writeFile(lockPath, originalLock); }
  const packagePath = path.join(fixture, 'node_modules/maplibre-gl/package.json');
  const originalPackage = await fs.readFile(packagePath);
  try {
    for (const field of ['exports', 'browser', 'module']) {
      const alternate = { ...JSON.parse(originalPackage), [field]: './unknown-alternate.js' };
      await fs.writeFile(packagePath, JSON.stringify(alternate));
      await assert.rejects(verifyInstalled(fixture), /Unreviewed alternate MapLibre entrypoint/);
    }
  } finally { await fs.writeFile(packagePath, originalPackage); }
  await verifyInstalled(fixture);
});
