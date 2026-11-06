import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

export const UPSTREAM = Object.freeze({
  name: 'maplibre-gl',
  version: '5.20.1',
  url: 'https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-5.20.1.tgz',
  integrity: 'sha512-57YIgfRct+rrk78ldoWRuLWRnXV/1vM2Rk0QYfEDQmsXdpgbACwvGoREIOZtyDIaq/GJK/ORYEriaAdVZuNfvw==',
  files: 690,
});
export const ADVISORY = 'GHSA-jrc7-96c5-q579';
export const PATCH_COMMIT = '1da69f3cd913a39fa948708e01478663bf48bc27';
export const ARTIFACT = 'maplibre-gl-5.20.1-bertel-security.1.tgz';
export const MANIFEST = 'maplibre-gl-5.20.1-bertel-security.1.manifest.json';
export const PACKAGED_INTEGRITY = 'sha512-/x4YJXIM2hIZES78uXC29jJMHUyszCIwpcPZVJY4rDIwFShFRuDB3rlevJlYWXM+yNVqYPhjtgaq/xQ9aPW1Kg==';
export const PATCHES = JSON.parse(await fs.readFile(new URL('./maplibre-backport.patches.json', import.meta.url), 'utf8'));
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const vendorRoot = path.join(appRoot, 'vendor');

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const integrity = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

function octal(header, from, length) {
  const text = header.toString('ascii', from, from + length).replace(/\0/g, '').trim();
  assert.match(text, /^[0-7]+$/, 'Unexpected tar numeric field');
  return Number.parseInt(text, 8);
}

// This is deliberately not a general tar extractor: the pinned npm archive has
// 690 ordinary files, no links/PAX records, and names shorter than 100 bytes.
// Unknown archive shapes fail before any filesystem extraction can occur.
export function readArchive(bytes) {
  const tar = gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 });
  const records = [];
  const names = new Set();
  let offset = 0;
  for (; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const checksum = octal(header, 148, 8);
    let sum = 0;
    for (let i = 0; i < 512; i += 1) sum += i >= 148 && i < 156 ? 32 : header[i];
    assert.equal(sum, checksum, 'Tar header checksum mismatch');
    assert.ok(header[156] === 48 || header[156] === 0, 'Only ordinary npm files are accepted');
    assert.ok(header.subarray(345, 500).every((byte) => byte === 0), 'Unexpected tar prefix');
    const name = header.toString('utf8', 0, 100).split('\0')[0];
    assert.ok(name.startsWith('package/'), 'Archive must contain only the npm package');
    assert.ok(!/[\\:\0]/.test(name) && path.posix.normalize(name) === name && !name.split('/').includes('..'), 'Unsafe tar path');
    assert.ok(!names.has(name), 'Duplicate tar path');
    names.add(name);
    const size = octal(header, 124, 12);
    const end = offset + 512 + size;
    assert.ok(Number.isSafeInteger(size) && end <= tar.length, 'Truncated tar entry');
    records.push({ name, header: Buffer.from(header), bytes: tar.subarray(offset + 512, end) });
    offset = end + (512 - size % 512) % 512;
  }
  assert.ok(tar.length - offset >= 1024 && tar.subarray(offset).every((byte) => byte === 0), 'Unexpected tar trailer');
  return records;
}

export function patchFile(spec, bytes) {
  const hash = sha256(bytes);
  if (hash === spec.afterSha256) return { bytes, substitutions: 0, sourceMapReferencesRemoved: 0 };
  assert.equal(hash, spec.beforeSha256, `Unknown upstream bytes: ${spec.path}`);
  let text = bytes.toString('utf8');
  assert.equal(text.split(spec.before).length - 1, 1, `Expected exactly one loop: ${spec.path}`);
  text = text.replace(spec.before, spec.after);
  if (spec.sourceMap) {
    const reference = `//# sourceMappingURL=${spec.sourceMap}`;
    assert.equal(text.split(reference).length - 1, 1, `Expected exactly one sourcemap reference: ${spec.path}`);
    text = text.replace(reference, '');
  }
  const result = Buffer.from(text);
  assert.equal(sha256(result), spec.afterSha256, `Unexpected patched bytes: ${spec.path}`);
  return { bytes: result, substitutions: 1, sourceMapReferencesRemoved: spec.sourceMap ? 1 : 0 };
}

function writeArchive(records) {
  const chunks = [];
  for (const record of records) {
    const header = Buffer.from(record.header);
    // Preserve the official names/modes/owners/timestamps/order. Only the size
    // and checksum change when a known payload changes; no host metadata enters.
    if (record.bytes.length !== octal(header, 124, 12)) {
      header.write(`${record.bytes.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
      header.fill(32, 148, 156);
      const sum = header.reduce((total, byte) => total + byte, 0);
      header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    }
    chunks.push(header, record.bytes, Buffer.alloc((512 - record.bytes.length % 512) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  const gzip = gzipSync(Buffer.concat(chunks), { level: 9 });
  // Normalize gzip's timestamp and OS byte across producer hosts.
  gzip.writeUInt32LE(0, 4);
  gzip[9] = 255;
  return gzip;
}

export function buildPackage(upstream) {
  assert.equal(integrity(upstream), UPSTREAM.integrity, 'Unknown upstream archive integrity');
  const records = readArchive(upstream);
  assert.equal(records.length, UPSTREAM.files, 'Unexpected upstream file count');
  const byName = new Map(records.map((record) => [record.name.slice(8), record]));
  const pkg = JSON.parse(byName.get('package.json').bytes.toString('utf8'));
  assert.equal(pkg.name, UPSTREAM.name);
  assert.equal(pkg.version, UPSTREAM.version);
  assert.equal(pkg.main, 'dist/maplibre-gl.js');
  assert.equal(pkg.license, 'BSD-3-Clause');
  const omitted = [];
  const changes = [];
  for (const spec of PATCHES) {
    const record = byName.get(spec.path);
    assert.ok(record, `Missing upstream file: ${spec.path}`);
    const result = patchFile(spec, record.bytes);
    record.bytes = result.bytes;
    changes.push({ path: spec.path, beforeSha256: spec.beforeSha256, afterSha256: spec.afterSha256,
      substitutions: result.substitutions, sourceMapReferencesRemoved: result.sourceMapReferencesRemoved });
    if (spec.sourceMap) {
      const mapPath = `dist/${spec.sourceMap}`;
      const sourceMap = byName.get(mapPath);
      assert.ok(sourceMap, `Missing original sourcemap: ${mapPath}`);
      omitted.push({ path: mapPath, upstreamSha256: sha256(sourceMap.bytes), reason: 'Mappings no longer describe the patched bundle' });
      byName.delete(mapPath);
    }
  }
  const outputRecords = records.filter((record) => byName.has(record.name.slice(8)));
  const archive = writeArchive(outputRecords);
  assert.equal(integrity(archive), PACKAGED_INTEGRITY, 'Unexpected archive output; producer/toolchain needs explicit review');
  const files = Object.fromEntries(outputRecords.map((record) => [record.name.slice(8), sha256(record.bytes)]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const manifest = {
    schema: 1, name: UPSTREAM.name, version: UPSTREAM.version, main: pkg.main, advisory: ADVISORY,
    upstream: UPSTREAM, patchCommit: PATCH_COMMIT, changes, omitted,
    artifact: { filename: ARTIFACT, integrity: integrity(archive), sha256: sha256(archive), bytes: archive.length },
    files,
  };
  return { archive, manifest };
}

export async function loadUpstream(sourcePath) {
  const bytes = sourcePath ? await fs.readFile(sourcePath) : await (async () => {
    const response = await fetch(UPSTREAM.url, { signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200, 'Cannot fetch the pinned official package');
    return Buffer.from(await response.arrayBuffer());
  })();
  assert.equal(integrity(bytes), UPSTREAM.integrity, 'Unknown upstream archive integrity');
  return bytes;
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.shift();
  assert.ok(mode === '--write' || mode === '--check', 'Usage: build-maplibre-backport.mjs --write|--check [--upstream file]');
  let sourcePath;
  if (args.length) {
    assert.equal(args.shift(), '--upstream');
    sourcePath = args.shift();
    assert.ok(sourcePath && args.length === 0, 'Expected one upstream archive path');
  }
  const { archive, manifest } = buildPackage(await loadUpstream(sourcePath));
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  if (mode === '--write') {
    await fs.mkdir(vendorRoot, { recursive: true });
    for (const [name, bytes] of [[ARTIFACT, archive], [MANIFEST, manifestBytes]]) {
      const target = path.join(vendorRoot, name);
      const existing = await fs.readFile(target).catch((error) => { if (error.code !== 'ENOENT') throw error; return null; });
      if (!existing?.equals(bytes)) await fs.writeFile(target, bytes);
    }
  } else {
    assert.ok(archive.equals(await fs.readFile(path.join(vendorRoot, ARTIFACT))), 'Vendored archive is not reproducible with this producer');
    assert.ok(manifestBytes.equals(await fs.readFile(path.join(vendorRoot, MANIFEST))), 'Vendored manifest does not match the pinned reconstruction');
  }
  console.log(JSON.stringify({ mode, artifact: ARTIFACT, files: Object.keys(manifest.files).length,
    substitutions: manifest.changes.reduce((sum, item) => sum + item.substitutions, 0), integrity: manifest.artifact.integrity }));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
