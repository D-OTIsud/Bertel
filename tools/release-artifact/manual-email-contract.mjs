import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';

export const PROOF_VERSION = 'BERTEL_MANUAL_EMAIL_RUNTIME_V1';
export const CALIBRATION_SOURCE = '50805933d9489974690f9bb208b633cfb5440070';
export const CALIBRATION_TREE = '2cd09ebcb055313aa0d325709d79eafce9ab04db';
export const MODES = Object.freeze(['absent', 'closed', 'unknown', 'protocol-v1']);
export const BRIDGE_CASES = Object.freeze(['legacy', 'context', 'prepare', 'dispatch', 'ack', 'invalid-json', 'no-auth', 'empty-body']);
const SHA = /^[a-f0-9]{40}$/;
const IMAGE = /^sha256:[a-f0-9]{64}$/;
const HASH = /^[a-f0-9]{64}$/;
const DECIMAL = /^[1-9][0-9]{0,18}$/;
const requireThat = (value, code) => { if (!value) throw new Error(code); };
export async function manualEmailToolsHash(root = process.cwd()) {
  const hash = createHash('sha256');
  for (const name of ['manual-email-contract.mjs', 'manual-email-runtime.mjs', 'fixtures/manual-email-preload.cjs', 'fixtures/manual-email-request.cjs']) {
    hash.update(name + '\0'); hash.update(await readFile(resolve(root, 'tools/release-artifact', name))); hash.update('\0');
  }
  return hash.digest('hex');
}

export function manualEmailProfile(value) {
  requireThat(value === 'hard-closed' || value === 'protocol-v1', 'manual_email_profile');
  return value;
}
export function caseNames(profile) {
  return manualEmailProfile(profile) === 'hard-closed' ? [...BRIDGE_CASES] : ['prepare'];
}
export function assertObservation(profile, mode, name, observation) {
  manualEmailProfile(profile);
  requireThat(MODES.includes(mode) && caseNames(profile).includes(name), 'manual_email_case');
  const events = observation?.events;
  requireThat(events && ['auth', 'config', 'deniedFetch', 'deniedSocket', 'boot'].every((key) => Number.isSafeInteger(events[key]) && events[key] >= 0)
    && events.boot >= 1 && events.boot <= 16 && events.deniedFetch === 0 && events.deniedSocket === 0, 'manual_email_boundary');
  const open = profile === 'protocol-v1' && mode === 'protocol-v1';
  requireThat(observation.status === 503 && observation.body && Object.keys(observation.body).length === 1
    && observation.body.error === (open ? 'smtp_not_configured' : 'email_protection_unavailable')
    && (open || observation.cacheControl === 'no-store')
    && events.auth === (profile === 'protocol-v1' ? 1 : 0) && events.config === (open ? 1 : 0), 'manual_email_observation');
}
export function assertCalibration(calibration, configHash, finalImage) {
  requireThat(calibration?.source_sha === CALIBRATION_SOURCE && calibration.source_tree === CALIBRATION_TREE
    && IMAGE.test(calibration.image_id) && calibration.image_id !== finalImage
    && /^[a-f0-9]{64}$/.test(calibration.container_id)
    && calibration.public_config_sha256 === configHash, 'manual_email_calibration_identity');
  const observation = calibration.observation;
  requireThat(observation?.status === 503 && Object.keys(observation.body ?? {}).length === 1
    && observation.body.error === 'smtp_not_configured' && observation.events?.auth === 1
    && observation.events.config === 1 && observation.events.deniedFetch === 0 && observation.events.deniedSocket === 0
    && Number.isSafeInteger(observation.events.boot) && observation.events.boot >= 1 && observation.events.boot <= 16,
  'manual_email_calibration_precondition');
  let refused = false;
  try { assertObservation('protocol-v1', 'closed', 'prepare', observation); }
  catch (error) { requireThat(error.message === 'manual_email_observation', 'manual_email_calibration_failure'); refused = true; }
  requireThat(refused, 'manual_email_calibration_not_red');
}
export function validateManualEmailProof(proof, context) {
  manualEmailProfile(context.profile);
  requireThat(SHA.test(context.source_sha) && SHA.test(context.source_tree) && IMAGE.test(context.image_id)
    && HASH.test(context.public_config_sha256) && HASH.test(context.tools_sha256)
    && DECIMAL.test(context.run_id) && DECIMAL.test(context.run_attempt), 'manual_email_context');
  requireThat(proof?.schema === PROOF_VERSION && proof.status === 'passed', 'manual_email_proof');
  for (const key of ['profile', 'source_sha', 'source_tree', 'image_id', 'public_config_sha256', 'tools_sha256', 'run_id', 'run_attempt']) {
    requireThat(proof[key] === context[key], 'manual_email_proof_identity');
  }
  const expected = MODES.flatMap((mode) => caseNames(context.profile).map((name) => `${mode}:${name}`));
  requireThat(Array.isArray(proof.cases) && proof.cases.length === expected.length, 'manual_email_cases');
  const observed = new Set();
  const containers = new Map();
  for (const entry of proof.cases) {
    const key = `${entry.mode}:${entry.name}`;
    requireThat(expected.includes(key) && !observed.has(key), 'manual_email_cases'); observed.add(key);
    requireThat(entry.image_id === context.image_id && /^[a-f0-9]{64}$/.test(entry.container_id), 'manual_email_case_identity');
    if (containers.has(entry.mode)) requireThat(containers.get(entry.mode) === entry.container_id, 'manual_email_case_identity');
    else containers.set(entry.mode, entry.container_id);
    assertObservation(context.profile, entry.mode, entry.name, entry.observation);
  }
  requireThat(new Set(containers.values()).size === MODES.length, 'manual_email_case_identity');
  assertCalibration(proof.calibration, context.public_config_sha256, context.image_id);
  requireThat(![...containers.values()].includes(proof.calibration.container_id), 'manual_email_calibration_identity');
  return proof;
}
export async function requireManualEmailProofFile(file, context) {
  let proof;
  try {
    const st = await lstat(file);
    requireThat(st.isFile() && !st.isSymbolicLink() && st.size > 0 && st.size <= 262144, 'manual_email_proof_file');
    proof = JSON.parse(await readFile(file, 'utf8'));
  } catch { throw new Error('manual_email_proof_file'); }
  return validateManualEmailProof(proof, context);
}
