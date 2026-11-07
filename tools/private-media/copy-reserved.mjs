// One-shot reservation gate around the existing verified Storage copy operator.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';
import { copyVerified, initialReceipt } from './copy-verified.mjs';
import { prepareCutover } from './prepare-cutover.mjs';

const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const validId = (value) => typeof value === 'string' && UUID.test(value);
const fail = (code) => { throw new Error(code); };
const requireThat = (condition, code) => { if (!condition) fail(code); };
const digest = (value) => createHash('sha256').update(value).digest('hex');
const stable = (value) => JSON.stringify(value, (_, item) => item && !Array.isArray(item) && typeof item === 'object'
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
const freeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const bridge = fileURLToPath(new URL('../storage-reservation/copy_claim.py', import.meta.url));

export function copyBinding(inventory, record, source, config, storageOrigin = inventory.origin) {
  requireThat(config.project_ref === inventory.projectRef && config.manifest_sha256 === inventory.digest
    && HASH.test(inventory.digest) && UUID.test(config.namespace_id) && UUID.test(config.epoch)
    && config.storage_origin_sha256 === digest(storageOrigin), 'reservation_target');
  const origin = new URL(storageOrigin);
  requireThat(storageOrigin === origin.origin && (config.mode === 'hosted' ? storageOrigin === inventory.origin
    : config.mode === 'owned_fixture' && origin.protocol === 'http:' && origin.hostname === '127.0.0.1'), 'reservation_origin');
  requireThat(record.destination_bucket === 'legal-documents'
    && record.destination_path === `objects/${record.object_id}/${record.document_id}`
    && /^[A-Z0-9]{16}$/.test(record.object_id) && UUID.test(record.document_id)
    && HASH.test(source.sha256) && Number.isSafeInteger(source.bytes) && source.bytes === record.source_metadata.size
    && source.bytes > 0 && source.bytes <= 42305170, 'reservation_copy_binding');
  return freeze({ project_ref: inventory.projectRef, storage_origin_sha256: config.storage_origin_sha256,
    namespace_id: config.namespace_id, epoch: config.epoch, manifest_sha256: inventory.digest,
    bucket: record.destination_bucket, key: record.destination_path, document_id: record.document_id,
    object_id: record.object_id, source_fingerprint_sha256: digest(stable({ bucket: record.source_bucket,
      path: record.source_path, url: record.source_url, metadata: record.source_metadata })),
    payload_sha256: source.sha256, payload_bytes: source.bytes, mime: record.source_metadata.content_type });
}

export async function psqlClaim(binding, config, { python, signal } = {}) {
  requireThat(typeof python === 'string' && isAbsolute(python), 'reservation_python');
  requireThat(!signal?.aborted, 'interrupted');
  // No target, credentials, owner capability or document data in argv/logs.
  return new Promise((resolve, reject) => {
    const env = { PYTHONUTF8: '1' };
    for (const key of ['SystemRoot', 'SystemDrive', 'WINDIR', 'COMSPEC', 'PATHEXT',
      'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    const child = spawn(python, [bridge], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let size = 0; let failed = false;
    const stop = () => { failed = true; child.kill(); };
    const timer = setTimeout(stop, 30000);
    signal?.addEventListener('abort', stop, { once: true });
    child.stdout.on('data', (chunk) => { size += chunk.length; if (size > 65536) stop(); else stdout += chunk.toString('utf8'); });
    child.stderr.resume(); // Never forward psql/Python diagnostics containing private inputs.
    child.stdin.on('error', stop);
    child.on('error', stop);
    child.on('close', (code) => {
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      if (failed || code !== 0) { reject(new Error('reservation_result_unknown')); return; }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('reservation_result_unknown')); }
    });
    child.stdin.end(JSON.stringify({ schema_version: 1, binding, config }));
  });
}

function validGrant(reply, binding) {
  requireThat(reply && typeof reply === 'object' && Object.keys(reply).sort().join(',') === 'attempt_id,binding,receipt_id,schema_version,state'
    && reply.schema_version === 1 && reply.state === 'dispatch_granted'
    && validId(reply.receipt_id) && validId(reply.attempt_id) && stable(reply.binding) === stable(binding), 'reservation_reply');
}

function validateResumedReservations(inventory, receipt, config, storageOrigin) {
  requireThat(receipt.attempts.every((attempt) => receipt.copies.some((copy) => copy.document_id === attempt.document_id)),
    'copy_attempt_requires_review');
  for (const copy of receipt.copies) {
    const attempt = receipt.attempts.find((item) => item.document_id === copy.document_id);
    const reservation = attempt.reservation;
    requireThat(reservation, 'reservation_receipt_missing');
    const record = inventory.records.find((item) => item.document_id === copy.document_id);
    const binding = copyBinding(inventory, record, { sha256: copy.source_sha256, bytes: copy.source_bytes }, config, storageOrigin);
    const verified = receipt.records.find((item) => item.document_id === copy.document_id);
    requireThat(Object.keys(reservation).sort().join(',') === 'attempt_id,binding,receipt_id'
      && validId(reservation.receipt_id) && validId(reservation.attempt_id)
      && stable(reservation.binding) === stable(binding)
      && (verified?.reservation === undefined || stable(verified.reservation) === stable(reservation)),
    'reservation_receipt_binding');
  }
}

export async function copyReserved(inventory, { transport, receipt, checkpoint, signal, reservationConfig,
  python, storageOrigin = inventory.origin, claim = psqlClaim }) {
  const pinned = freeze(structuredClone(inventory));
  const config = freeze(structuredClone(reservationConfig));
  requireThat(config && config.project_ref === pinned.projectRef && config.manifest_sha256 === pinned.digest,
    'reservation_target');
  const resume = initialReceipt(pinned, receipt === undefined ? undefined : structuredClone(receipt));
  validateResumedReservations(pinned, resume, config, storageOrigin);
  requireThat(!signal?.aborted, 'interrupted');
  let state;
  const issued = new Set();
  const persist = async (value) => { state = value; await checkpoint(value); };
  await persist(resume); // Establish local persistence only after validating every existing ACK.
  const gated = { ...transport, async copy(record, currentSignal) {
    const attempt = state?.attempts.find((value) => value.document_id === record.document_id);
    requireThat(attempt && !issued.has(record.destination_path), 'reservation_not_fresh');
    const binding = copyBinding(pinned, record, { sha256: attempt.source_sha256, bytes: attempt.source_bytes }, config, storageOrigin);
    issued.add(record.destination_path); // Never rearm on any failure, including a rolled-back/unknown claim.
    const reply = await claim(binding, config, { python, signal: currentSignal });
    validGrant(reply, binding);
    attempt.reservation = { receipt_id: reply.receipt_id, attempt_id: reply.attempt_id, binding };
    await persist(state); // Durable receipt binding before the one Storage POST.
    requireThat(!currentSignal?.aborted, 'interrupted');
    return transport.copy(record, currentSignal);
  } };
  const result = await copyVerified(pinned, { transport: gated, receipt: resume, checkpoint: persist, signal });
  for (const record of result.records) {
    const attempt = result.attempts.find((value) => value.document_id === record.document_id);
    requireThat(attempt?.reservation, 'reservation_receipt_missing');
    const binding = copyBinding(pinned, pinned.records.find((r) => r.document_id === record.document_id),
      { sha256: record.source_sha256, bytes: record.source_bytes }, config, storageOrigin);
    requireThat(stable(attempt.reservation.binding) === stable(binding), 'reservation_receipt_binding');
    record.reservation = structuredClone(attempt.reservation);
  }
  result.reservation_protocol = 'db07_copy_v1';
  await persist(result);
  return result;
}

export function prepareReservedCutover(inventory, receipt, config, storageOrigin = inventory.origin) {
  const state = initialReceipt(inventory, receipt);
  requireThat(state.reservation_protocol === 'db07_copy_v1' && state.records.length === inventory.records.length,
    'reservation_cutover_receipt');
  for (const record of inventory.records) {
    const verified = state.records.find((r) => r.document_id === record.document_id);
    const attempt = state.attempts.find((r) => r.document_id === record.document_id);
    const reservation = verified?.reservation;
    const binding = verified && copyBinding(inventory, record, { sha256: verified.source_sha256, bytes: verified.source_bytes }, config, storageOrigin);
    requireThat(reservation && validId(reservation.receipt_id) && validId(reservation.attempt_id)
      && stable(reservation) === stable(attempt?.reservation) && stable(reservation.binding) === stable(binding),
      'reservation_cutover_binding');
  }
  return prepareCutover({ schema_version: 1, classification: 'legal_private', expected_count: inventory.records.length,
    records: inventory.records }, state, inventory.digest, inventory.records.length);
}
