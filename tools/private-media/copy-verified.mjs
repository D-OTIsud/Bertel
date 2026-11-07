// Operator-only Storage copy. Preview is offline; execution never deletes,
// replaces, changes visibility, changes reference rows, or follows redirects.
import { createHash } from 'node:crypto';
import { readFile, open, rename, unlink, lstat, realpath, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename, join, relative, isAbsolute } from 'node:path';
import { tmpdir, hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateManifest, sha256 } from './prepare-cutover.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const REF = /^[a-z0-9]{20}$/;
export const MIME_TYPES = Object.freeze(['application/pdf', 'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/heif']);
const MAX_BYTES = 42_305_170;
const fail = (code) => { throw new Error(code); };
const requireThat = (condition, code) => { if (!condition) fail(code); };
const mime = (value) => typeof value === 'string' ? value.split(';')[0].trim().toLowerCase() : '';
const etag = (value) => typeof value === 'string' ? value.replace(/^"|"$/g, '') : '';
const safePath = (value) => typeof value === 'string' && value.length > 0 && value.length < 2048
  && !/[\u0000-\u001f\u007f\\%?#]/.test(value) && !value.startsWith('/')
  && value.split('/').every((part) => part && part !== '.' && part !== '..');
const encoded = (value) => value.split('/').map(encodeURIComponent).join('/');

export function inspectManifest(bytes, projectRef, expectedCount = 1710) {
  requireThat(REF.test(projectRef), 'project_ref');
  let input;
  try { input = JSON.parse(bytes); } catch { fail('manifest_json'); }
  const records = validateManifest(input, expectedCount);
  const origin = `https://${projectRef}.supabase.co`;
  for (const r of records) {
    requireThat(safePath(r.source_path) && safePath(r.destination_path), 'manifest_path');
    let url;
    try { url = new URL(r.source_url); } catch { fail('manifest_source_origin'); }
    const prefix = '/storage/v1/object/public/old_legal_media/';
    requireThat(url.origin === origin && !url.username && !url.password && !url.search && !url.hash
      && url.pathname.startsWith(prefix), 'manifest_source_origin');
    let sourceKey;
    try { sourceKey = decodeURIComponent(url.pathname.slice(prefix.length)); } catch { fail('manifest_source_path'); }
    requireThat(sourceKey === r.source_path, 'manifest_source_path');
    requireThat(r.source_metadata.size > 0 && r.source_metadata.size <= MAX_BYTES, 'manifest_size');
    requireThat(MIME_TYPES.includes(r.source_metadata.content_type), 'manifest_mime');
    requireThat(typeof r.source_metadata.cache_control === 'string'
      && !/[\r\n\0]/.test(r.source_metadata.cache_control), 'manifest_cache');
  }
  return { records, digest: sha256(bytes), origin, projectRef };
}

export function previewInventory(inventory) {
  return { mode: 'preview', network: false, records: inventory.records.length,
    bytes: inventory.records.reduce((sum, r) => sum + r.source_metadata.size, 0),
    max_bytes: Math.max(...inventory.records.map((r) => r.source_metadata.size)),
    mime_types: [...new Set(inventory.records.map((r) => r.source_metadata.content_type))].sort(),
    source_bucket: 'old_legal_media', destination_bucket: 'legal-documents', manifest_sha256: inventory.digest };
}

// Private receipt is atomically replaced only after an acknowledged copy or a
// completed byte verification. An absent acknowledgement is never guessed.
export async function saveReceipt(filename, receipt) {
  const temporary = `${filename}.next`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`);
    await handle.sync();
    await handle.close(); handle = null;
    await rename(temporary, filename);
    if (process.platform !== 'win32') {
      const directory = await open(dirname(filename), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    }
  } catch {
    if (handle) await handle.close().catch(() => {});
    fail('receipt_write_failed');
  }
}

export async function withOperatorLocks(filename, inventory, action,
  lockDirectory = join(tmpdir(), `bertel-db07-copy-locks-${process.getuid?.() ?? 'windows-user'}`)) {
  const canonical = join(await realpath(dirname(filename)), basename(filename));
  await mkdir(lockDirectory, { recursive: true, mode: 0o700 });
  const directory = await lstat(lockDirectory);
  requireThat(directory.isDirectory() && !directory.isSymbolicLink(), 'lock_directory');
  if (process.getuid) requireThat(directory.uid === process.getuid() && (directory.mode & 0o077) === 0, 'lock_directory_private');
  const operation = join(await realpath(lockDirectory), `${inventory.projectRef}.lock`);
  const held = []; let result; let originalError; let cleanupFailed = false;
  try {
    for (const path of [operation, `${canonical}.lock`]) {
      let handle;
      try { handle = await open(path, 'wx', 0o600); } catch (error) { fail(error.code === 'EEXIST' ? 'operator_locked' : 'lock_io'); }
      held.push({ handle, path });
      await handle.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), started_at: new Date().toISOString(),
        project_ref: inventory.projectRef, manifest_sha256: inventory.digest }));
      await handle.sync();
    }
    result = await action(canonical);
  } catch (error) { originalError = error; }
  for (const lock of held.reverse()) {
    try { await lock.handle.close(); await unlink(lock.path); } catch { cleanupFailed = true; }
  }
  if (originalError) throw originalError;
  requireThat(!cleanupFailed, 'lock_cleanup_failed');
  return result;
}

const cancelBody = async (response) => { await response.body?.cancel().catch(() => {}); };

async function limitedJson(response) {
  const chunks = []; let size = 0;
  requireThat(response.body, 'storage_json');
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      requireThat(size <= 65536, 'storage_json_size');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error.message === 'storage_json_size') throw error;
    fail('storage_json');
  }
}

export function storageTransport({ projectRef, serviceKey, testOrigin, timeoutMs = 300_000 }) {
  requireThat(REF.test(projectRef), 'project_ref');
  let origin = `https://${projectRef}.supabase.co`;
  const headers = { apikey: serviceKey };
  if (testOrigin !== undefined) {
    const test = new URL(testOrigin);
    requireThat(test.protocol === 'http:' && test.hostname === '127.0.0.1' && !test.username && !test.password
      && test.pathname === '/' && !test.search && !test.hash && serviceKey === 'test-only-no-real-key', 'test_origin');
    origin = test.origin;
  } else {
    requireThat(typeof serviceKey === 'string' && !/[\r\n]/.test(serviceKey), 'service_key');
    if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(serviceKey)) {
      let claims;
      try { claims = JSON.parse(Buffer.from(serviceKey.split('.')[1], 'base64url').toString('utf8')); } catch { fail('service_key'); }
      requireThat(serviceKey.split('.').length === 3 && claims.role === 'service_role' && claims.ref === projectRef, 'service_key');
      headers.Authorization = `Bearer ${serviceKey}`;
    }
  }
  async function request(suffix, options = {}, signal) {
    requireThat(suffix.startsWith('/storage/v1/') && !/[?#\\]/.test(suffix), 'request_scope');
    const target = new URL(origin + suffix);
    requireThat(target.origin === origin && target.pathname === suffix, 'request_scope');
    try {
      return await fetch(target, { ...options, headers: { ...headers, ...options.headers }, redirect: 'error',
        signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]) });
    } catch { fail(signal?.aborted ? 'interrupted' : 'storage_network'); }
  }
  async function json(suffix, options, signal, missingAllowed = false) {
    const response = await request(suffix, options, signal);
    if (missingAllowed && [400, 404].includes(response.status)) {
      const error = await limitedJson(response);
      requireThat(['NoSuchKey', 'NoSuchObject', 'not_found'].includes(error.code ?? error.error)
        && Number(error.statusCode ?? response.status) === 404, 'storage_missing_unproven');
      return null;
    }
    if (!response.ok) { await cancelBody(response); fail('storage_http'); }
    return limitedJson(response);
  }
  return {
    bucket: (signal) => json('/storage/v1/bucket/legal-documents', {}, signal),
    info: (bucket, key, signal) => {
      requireThat(['old_legal_media', 'legal-documents'].includes(bucket) && safePath(key), 'request_scope');
      return json(`/storage/v1/object/info/${bucket}/${encoded(key)}`, {}, signal, true);
    },
    async copy(r, signal) {
      requireThat(r.source_bucket === 'old_legal_media' && r.destination_bucket === 'legal-documents'
        && safePath(r.source_path) && safePath(r.destination_path) && UUID.test(r.document_id)
        && /^[A-Z0-9]{16}$/.test(r.object_id)
        && r.destination_path === `objects/${r.object_id}/${r.document_id}`, 'request_scope');
      return json('/storage/v1/object/copy', { method: 'POST', headers: { 'content-type': 'application/json', 'x-upsert': 'false' },
        body: JSON.stringify({ bucketId: r.source_bucket, sourceKey: r.source_path,
          destinationBucket: r.destination_bucket, destinationKey: r.destination_path }) }, signal);
    },
    async hashObject(bucket, key, expected, signal, onChunk) {
      requireThat(['old_legal_media', 'legal-documents'].includes(bucket) && safePath(key), 'request_scope');
      const response = await request(`/storage/v1/object/authenticated/${bucket}/${encoded(key)}`, { headers: { 'accept-encoding': 'identity' } }, signal);
      if (!response.ok) { await cancelBody(response); fail('storage_http'); }
      try {
        requireThat(!response.headers.get('content-encoding') || response.headers.get('content-encoding') === 'identity', 'content_encoding');
        requireThat(mime(response.headers.get('content-type')) === expected.content_type, 'content_type');
        // Delivery cache policy may be rewritten by Storage/CDN; exact stored
        // cache_control is checked by assertSource/assertDestination via GETinfo.
        requireThat(response.headers.get('etag') && !response.headers.get('etag').startsWith('W/')
          && etag(response.headers.get('etag')) === etag(expected.etag), 'content_etag');
        const length = response.headers.get('content-length');
        requireThat(length !== null && Number(length) === expected.size, 'content_length');
      } catch (error) { await cancelBody(response); throw error; }
      const digest = createHash('sha256'); let size = 0;
      try {
        requireThat(response.body, 'content_body');
        for await (const chunk of response.body) {
          requireThat(!signal?.aborted, 'interrupted');
          size += chunk.length; requireThat(size <= expected.size, 'content_size'); digest.update(chunk);
          if (onChunk) {
            try { await onChunk(chunk); } catch { fail('content_sink'); }
          }
        }
      } catch (error) {
        if (['interrupted', 'content_size', 'content_body', 'content_sink'].includes(error.message)) throw error;
        fail(signal?.aborted ? 'interrupted' : 'content_network');
      }
      requireThat(size === expected.size, 'content_size');
      return { sha256: digest.digest('hex'), bytes: size };
    },
  };
}

export function assertSource(info, r) {
  requireThat(info && info.id === r.source_metadata.id && info.name === r.source_path
    && info.bucket_id === r.source_bucket && etag(info.etag) === etag(r.source_metadata.etag)
    && Number(info.size) === r.source_metadata.size && info.content_type === r.source_metadata.content_type
    && info.cache_control === r.source_metadata.cache_control, 'source_changed');
}
function assertDestination(info, r, acknowledged) {
  requireThat(info && info.id === acknowledged.destination_id && info.name === r.destination_path
    && info.bucket_id === r.destination_bucket && Number(info.size) === r.source_metadata.size
    && info.content_type === r.source_metadata.content_type && info.cache_control === r.source_metadata.cache_control
    && typeof info.etag === 'string' && info.etag.length > 0, 'destination_changed');
}
export function initialReceipt(inventory, receipt) {
  const state = receipt === undefined ? { schema_version: 1, manifest_sha256: inventory.digest,
    project_ref: inventory.projectRef, destination_bucket_private: true, attempts: [], copies: [], records: [] } : receipt;
  requireThat(state && typeof state === 'object' && !Array.isArray(state), 'receipt_scope');
  requireThat(state.schema_version === 1 && state.manifest_sha256 === inventory.digest && state.project_ref === inventory.projectRef
    && state.destination_bucket_private === true && Array.isArray(state.attempts)
    && Array.isArray(state.copies) && Array.isArray(state.records), 'receipt_scope');
  const byId = new Map(inventory.records.map((r) => [r.document_id, r]));
  const attempts = new Set();
  for (const item of state.attempts) {
    const r = byId.get(item.document_id);
    requireThat(r && !attempts.has(item.document_id) && item.destination_path === r.destination_path
      && item.source_id === r.source_metadata.id && HASH.test(item.source_sha256)
      && item.source_bytes === r.source_metadata.size, 'receipt_attempt');
    attempts.add(item.document_id);
  }
  for (const list of [state.copies, state.records]) {
    const seen = new Set();
    for (const item of list) {
      const r = byId.get(item.document_id);
      requireThat(r && attempts.has(item.document_id) && !seen.has(item.document_id) && item.destination_path === r.destination_path
        && item.source_etag === r.source_metadata.etag && UUID.test(item.destination_id)
        && HASH.test(item.source_sha256) && item.source_bytes === r.source_metadata.size
        && item.source_content_type === r.source_metadata.content_type
        && item.source_cache_control === r.source_metadata.cache_control, 'receipt_identity');
      seen.add(item.document_id);
    }
  }
  for (const c of state.copies) requireThat(state.attempts.some((a) => a.document_id === c.document_id
    && a.source_sha256 === c.source_sha256), 'receipt_attempt');
  for (const r of state.records) requireThat(state.copies.some((c) => c.document_id === r.document_id
    && c.destination_id === r.destination_id && c.source_sha256 === r.source_sha256)
    && r.destination_sha256 === r.source_sha256 && r.destination_bytes === r.source_bytes
    && typeof r.destination_etag === 'string' && r.destination_etag.length > 0
    && r.destination_content_type === byId.get(r.document_id).source_metadata.content_type
    && r.destination_cache_control === byId.get(r.document_id).source_metadata.cache_control, 'receipt_content');
  return state;
}

export async function copyVerified(inventory, { transport, receipt, checkpoint, signal }) {
  const state = initialReceipt(inventory, receipt);
  requireThat(state.attempts.every((a) => state.copies.some((c) => c.document_id === a.document_id)), 'copy_attempt_requires_review');
  const checkBucket = async () => {
    const bucket = await transport.bucket(signal);
    requireThat(bucket?.id === 'legal-documents' && bucket.public === false, 'destination_not_private');
    requireThat(Number(bucket.file_size_limit) >= Math.max(...inventory.records.map((r) => r.source_metadata.size))
      && Array.isArray(bucket.allowed_mime_types)
      && inventory.records.every((r) => bucket.allowed_mime_types.includes(r.source_metadata.content_type)), 'destination_incompatible');
  };
  await checkBucket();
  for (const r of inventory.records) {
    requireThat(!signal?.aborted, 'interrupted');
    assertSource(await transport.info(r.source_bucket, r.source_path, signal), r);
    const acknowledged = state.copies.find((c) => c.document_id === r.document_id);
    let destination = await transport.info(r.destination_bucket, r.destination_path, signal);
    requireThat(!destination || acknowledged, 'unreceipted_collision');
    if (acknowledged) assertDestination(destination, r, acknowledged);
    const source = await transport.hashObject(r.source_bucket, r.source_path, r.source_metadata, signal);
    if (acknowledged) requireThat(source.sha256 === acknowledged.source_sha256, 'source_content_changed');
    let copy = acknowledged;
    if (!copy) {
      await checkBucket();
      assertSource(await transport.info(r.source_bucket, r.source_path, signal), r);
      requireThat(!signal?.aborted, 'interrupted');
      state.attempts.push({ document_id: r.document_id, destination_path: r.destination_path,
        source_id: r.source_metadata.id, source_sha256: source.sha256, source_bytes: source.bytes,
        attempted_at: new Date().toISOString() });
      await checkpoint(state);
      let ack;
      try { ack = await transport.copy(r, signal); } catch { fail('copy_outcome_uncertain'); }
      requireThat(ack?.Key === `${r.destination_bucket}/${r.destination_path}` && UUID.test(ack.Id), 'copy_acknowledgement');
      copy = { document_id: r.document_id, destination_path: r.destination_path, destination_id: ack.Id,
        source_etag: r.source_metadata.etag, source_sha256: source.sha256, source_bytes: source.bytes,
        source_content_type: r.source_metadata.content_type, source_cache_control: r.source_metadata.cache_control,
        copy_acknowledged_at: new Date().toISOString() };
      state.copies.push(copy);
      await checkpoint(state);
      destination = await transport.info(r.destination_bucket, r.destination_path, signal);
      assertDestination(destination, r, copy);
    }
    const previous = state.records.find((item) => item.document_id === r.document_id);
    if (previous) requireThat(etag(destination.etag) === etag(previous.destination_etag), 'destination_changed');
    const target = await transport.hashObject(r.destination_bucket, r.destination_path,
      { ...r.source_metadata, etag: destination.etag }, signal);
    requireThat(target.sha256 === source.sha256 && target.bytes === source.bytes, 'copy_content_mismatch');
    assertSource(await transport.info(r.source_bucket, r.source_path, signal), r);
    const finalDestination = await transport.info(r.destination_bucket, r.destination_path, signal);
    assertDestination(finalDestination, r, copy);
    requireThat(etag(finalDestination.etag) === etag(destination.etag), 'destination_changed');
    await checkBucket();
    if (!previous) state.records.push({ ...copy, source_id: r.source_metadata.id,
      destination_sha256: target.sha256, destination_bytes: target.bytes, destination_etag: destination.etag,
      destination_content_type: destination.content_type, destination_cache_control: destination.cache_control,
      verified_at: new Date().toISOString() });
    await checkpoint(state);
  }
  return state;
}

async function run() {
  const options = {};
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i];
    requireThat(['--manifest', '--project-ref', '--source-bucket', '--destination-bucket', '--expect-sha256', '--receipt', '--execute', '--reservation-config', '--python'].includes(key)
      && !Object.hasOwn(options, key), 'arguments');
    options[key] = key === '--execute' ? true : process.argv[++i];
    requireThat(options[key] && (options[key] === true || !options[key].startsWith('--')), 'arguments');
  }
  requireThat(options['--manifest'] && options['--project-ref'] && options['--source-bucket'] === 'old_legal_media'
    && options['--destination-bucket'] === 'legal-documents', 'arguments');
  const manifestPath = await realpath(resolve(options['--manifest']));
  const repository = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  requireThat(repository.status === 0, 'repository');
  const repositoryRoot = await realpath(repository.stdout.trim());
  const privateArtifact = (path, code) => {
    const local = relative(repositoryRoot, path);
    if (!local.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(local)) {
      requireThat(spawnSync('git', ['check-ignore', '--quiet', '--', path]).status === 0, code);
    }
  };
  privateArtifact(manifestPath, 'manifest_must_be_private');
  const inventory = inspectManifest(await readFile(manifestPath), options['--project-ref']);
  if (options['--expect-sha256']) requireThat(inventory.digest === options['--expect-sha256'], 'manifest_digest');
  if (!options['--execute']) { console.log(JSON.stringify(previewInventory(inventory))); return; }
  requireThat(options['--receipt'] && HASH.test(options['--expect-sha256'] || '')
    && options['--reservation-config'] && options['--python'] && isAbsolute(options['--python']), 'execution_arguments');
  const configPath = await realpath(resolve(options['--reservation-config']));
  privateArtifact(configPath, 'reservation_config_must_be_private');
  const reservationConfig = JSON.parse(await readFile(configPath));
  const { copyReserved } = await import('./copy-reserved.mjs');
  const requestedFilename = resolve(options['--receipt']);
  const filename = join(await realpath(dirname(requestedFilename)), basename(requestedFilename));
  for (const path of [filename, `${filename}.next`, `${filename}.lock`]) {
    privateArtifact(path, 'receipt_must_be_private');
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP', ...(process.platform === 'win32' ? ['SIGBREAK'] : [])];
  for (const signal of signals) process.on(signal, stop);
  try {
    const state = await withOperatorLocks(filename, inventory, async (canonicalFilename) => {
      const staged = await lstat(`${canonicalFilename}.next`).catch((error) => {
        if (error.code !== 'ENOENT') fail('receipt_write_failed');
      });
      requireThat(!staged, 'receipt_write_failed');
      let receipt;
      try { const stat = await lstat(canonicalFilename); requireThat(!stat.isSymbolicLink() && stat.isFile(), 'receipt_file'); receipt = JSON.parse(await readFile(canonicalFilename)); }
      catch (error) { if (error.code !== 'ENOENT') fail('receipt_read_failed'); }
      if (receipt !== undefined) initialReceipt(inventory, receipt);
      const transport = storageTransport({ projectRef: inventory.projectRef, serviceKey: process.env.DB07_STORAGE_SERVICE_KEY });
      return copyReserved(inventory, { transport, receipt, signal: controller.signal,
        reservationConfig, python: options['--python'],
        checkpoint: (next) => saveReceipt(canonicalFilename, next) });
    });
    console.log(JSON.stringify({ mode: 'executed', records: state.records.length, manifest_sha256: inventory.digest, verified: true }));
  } finally {
    for (const signal of signals) process.off(signal, stop);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(`DB07 copy refused: ${/^[a-z_]+$/.test(error.message) ? error.message : 'invalid_input_or_io'}`);
    process.exitCode = 1;
  });
}
