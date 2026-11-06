import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ADVISORY, PATCH_COMMIT, PACKAGED_INTEGRITY, PATCHES, UPSTREAM, readArchive } from './build-maplibre-backport.mjs';

export const ARTIFACT = 'maplibre-gl-5.20.1-bertel-security.1.tgz';
export const MANIFEST = 'maplibre-gl-5.20.1-bertel-security.1.manifest.json';
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const integrity = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

async function ownPackageFiles(directory, prefix = '') {
  const files = [];
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    // npm may place independently installed dependencies here. They are not
    // payload files of the MapLibre package attested by this narrow exception.
    if (item.name === 'node_modules' && !prefix) continue;
    const name = `${prefix}${item.name}`;
    if (item.isDirectory()) files.push(...await ownPackageFiles(path.join(directory, item.name), `${name}/`));
    else {
      assert.ok(item.isFile(), `Unexpected link or special file in MapLibre: ${name}`);
      files.push(name);
    }
  }
  return files.sort();
}

export async function verifyInstalled(projectRoot = appRoot) {
  const manifest = JSON.parse(await fs.readFile(path.join(projectRoot, 'vendor', MANIFEST), 'utf8'));
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.name, 'maplibre-gl');
  assert.equal(manifest.version, '5.20.1');
  assert.equal(manifest.advisory, ADVISORY);
  assert.equal(manifest.patchCommit, PATCH_COMMIT);
  assert.deepEqual(manifest.upstream, UPSTREAM);
  assert.equal(manifest.artifact.filename, ARTIFACT);
  assert.equal(manifest.artifact.integrity, PACKAGED_INTEGRITY, 'Unknown backport artifact');
  const artifact = await fs.readFile(path.join(projectRoot, 'vendor', ARTIFACT));
  assert.equal(integrity(artifact), manifest.artifact.integrity, 'Vendored MapLibre archive integrity mismatch');
  assert.equal(sha256(artifact), manifest.artifact.sha256, 'Vendored MapLibre archive hash mismatch');
  const archiveFiles = Object.fromEntries(readArchive(artifact).map((record) => [record.name.slice(8), sha256(record.bytes)]));
  assert.deepEqual(archiveFiles, manifest.files, 'Manifest does not describe the attested archive payload');
  for (const spec of PATCHES) assert.equal(manifest.files[spec.path], spec.afterSha256, `Unknown patch result: ${spec.path}`);
  const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(await fs.readFile(path.join(projectRoot, 'package-lock.json'), 'utf8'));
  const expectedSource = `file:vendor/${ARTIFACT}`;
  assert.equal(packageJson.dependencies?.['maplibre-gl'], expectedSource, 'MapLibre must use the reviewed local artifact');
  assert.deepEqual(Object.keys(lock.packages || {}).filter((key) => /(^|\/)node_modules\/maplibre-gl$/.test(key)),
    ['node_modules/maplibre-gl'], 'Nested or duplicate MapLibre installation is not reviewed');
  const locked = lock.packages?.['node_modules/maplibre-gl'];
  assert.equal(locked?.version, '5.20.1', 'Unknown locked MapLibre version');
  assert.equal(locked?.resolved, expectedSource, 'Unknown locked MapLibre source');
  assert.equal(locked?.integrity, manifest.artifact.integrity, 'MapLibre lock integrity differs from the attested archive');

  const requireFromProject = createRequire(path.join(projectRoot, 'package.json'));
  const resolvedEntry = await fs.realpath(requireFromProject.resolve('maplibre-gl'));
  const packageRoot = path.dirname(await fs.realpath(requireFromProject.resolve('maplibre-gl/package.json')));
  const installed = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(installed.name, 'maplibre-gl');
  assert.equal(installed.version, '5.20.1', 'Unknown installed MapLibre version');
  assert.equal(installed.main, 'dist/maplibre-gl.js', 'Unknown MapLibre entrypoint');
  for (const field of ['exports', 'browser', 'module']) {
    assert.equal(installed[field], undefined, `Unreviewed alternate MapLibre entrypoint: ${field}`);
  }
  assert.equal(resolvedEntry, path.join(packageRoot, 'dist/maplibre-gl.js'), 'Unexpected resolved MapLibre entrypoint');
  const expectedFiles = Object.keys(manifest.files).sort();
  assert.equal(expectedFiles.length, 686, 'Unexpected backport payload file count');
  assert.deepEqual(await ownPackageFiles(packageRoot), expectedFiles, 'Installed MapLibre payload differs from the reviewed archive');
  for (const name of expectedFiles) {
    assert.ok(!/[\\:\0]/.test(name) && !name.startsWith('/') && path.posix.normalize(name) === name && !name.split('/').includes('..'), 'Unsafe manifest path');
    assert.equal(sha256(await fs.readFile(path.join(packageRoot, name))), manifest.files[name], `Unrecognized installed MapLibre bytes: ${name}`);
  }
  return { advisory: manifest.advisory, patchCommit: manifest.patchCommit, version: installed.version,
    resolvedEntry: path.relative(projectRoot, resolvedEntry).split(path.sep).join('/'),
    entrySha256: manifest.files[installed.main], artifactIntegrity: manifest.artifact.integrity, files: expectedFiles.length };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  verifyInstalled().then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(`MapLibre backport verification failed: ${error.message}`); process.exitCode = 1; });
}
