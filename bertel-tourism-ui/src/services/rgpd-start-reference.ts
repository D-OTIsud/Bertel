// RGPD Art. 17 — référence technique locale d'un START d'effacement, par compte.
// C'est une référence minimale ({version, requestId, fingerprint}), jamais une copie du formulaire :
// ni sujet, ni motif, ni jeton, ni URL. Toute impossibilité (stockage, relecture, crypto, verrou)
// refuse fermé : aucun START n'est émis sans référence écrite ET relue à l'identique.
import type { ErasureMode, ErasureResult, ErasureSubjectKind } from './rgpd';

export interface RgpdStartReference {
  version: 1;
  requestId: string;
  fingerprint: string;
}

export interface RgpdStartSnapshot {
  subjectKind: ErasureSubjectKind;
  subjectId: string;
  mode: ErasureMode;
  reason?: string | null;
}

export type RgpdStartReferenceRead =
  | { kind: 'absent' }
  | { kind: 'present'; reference: RgpdStartReference }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

export type RgpdStartAdmission<T> =
  | { kind: 'started'; reference: RgpdStartReference; sent: T }
  | { kind: 'blocked'; reference: RgpdStartReference }
  | { kind: 'refused' };

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPERATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

export function rgpdStartReferenceKey(userId: string): string {
  return `bertel-rgpd-start:v1:${encodeURIComponent(userId)}`;
}

function serializeReference(reference: RgpdStartReference): string {
  return JSON.stringify({
    version: reference.version,
    requestId: reference.requestId,
    fingerprint: reference.fingerprint,
  });
}

function parseReference(raw: string): RgpdStartReference | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    typeof candidate.requestId !== 'string' ||
    !REQUEST_ID_RE.test(candidate.requestId) ||
    typeof candidate.fingerprint !== 'string' ||
    !FINGERPRINT_RE.test(candidate.fingerprint)
  ) {
    return null;
  }
  const reference: RgpdStartReference = {
    version: 1,
    requestId: candidate.requestId,
    fingerprint: candidate.fingerprint,
  };
  // La forme canonique exclut tout champ supplémentaire, ordre différent ou espace parasite.
  return serializeReference(reference) === raw ? reference : null;
}

export function readStartReference(userId: string): RgpdStartReferenceRead {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(rgpdStartReferenceKey(userId));
  } catch {
    return { kind: 'unavailable' };
  }
  if (raw === null) return { kind: 'absent' };
  const reference = parseReference(raw);
  return reference ? { kind: 'present', reference } : { kind: 'invalid' };
}

/** SHA-256 hexadécimal du snapshot confirmé ; null si WebCrypto est indisponible. */
export async function computeStartFingerprint(snapshot: RgpdStartSnapshot): Promise<string | null> {
  try {
    const canonical = JSON.stringify([
      snapshot.subjectKind,
      snapshot.subjectId.trim(),
      snapshot.mode,
      (snapshot.reason ?? '').trim() || null,
    ]);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return FINGERPRINT_RE.test(hex) ? hex : null;
  } catch {
    return null;
  }
}

/**
 * Sérialise lecture-écriture entre onglets. Le travail est synchrone : le verrou n'est jamais tenu
 * pendant le réseau. Sans Web Locks l'exclusion inter-onglets n'existe pas, donc l'appel échoue.
 */
async function withReferenceLock<T>(key: string, work: () => T): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (!locks || typeof locks.request !== 'function') throw new Error('web_locks_unavailable');
  const box: { value?: T } = {};
  await locks.request(key, () => {
    box.value = work();
  });
  if (!('value' in box)) throw new Error('web_locks_callback_not_run');
  return box.value as T;
}

/**
 * Admet un START : sous verrou, refuse si `isCurrent` est faux, ne remplace jamais une référence
 * existante, écrit puis relit à l'identique. `send` est appelé de façon synchrone dans la même
 * section critique : aucun changement de compte ou de saisie ne peut s'intercaler entre la
 * dernière vérification et l'émission.
 */
export async function admitStartReference<T>({
  userId,
  fingerprint,
  isCurrent,
  send,
}: {
  userId: string;
  fingerprint: string;
  isCurrent: () => boolean;
  send: (reference: RgpdStartReference) => T;
}): Promise<RgpdStartAdmission<T>> {
  if (!FINGERPRINT_RE.test(fingerprint)) return { kind: 'refused' };
  const key = rgpdStartReferenceKey(userId);
  try {
    return await withReferenceLock<RgpdStartAdmission<T>>(key, () => {
      if (!isCurrent()) return { kind: 'refused' };
      const existing = readStartReference(userId);
      if (existing.kind === 'present') return { kind: 'blocked', reference: existing.reference };
      if (existing.kind !== 'absent') return { kind: 'refused' };

      const requestId = globalThis.crypto.randomUUID();
      if (!REQUEST_ID_RE.test(requestId)) return { kind: 'refused' };
      const reference: RgpdStartReference = { version: 1, requestId, fingerprint };
      const serialized = serializeReference(reference);
      window.localStorage.setItem(key, serialized);
      if (window.localStorage.getItem(key) !== serialized) return { kind: 'refused' };

      return { kind: 'started', reference, sent: send(reference) };
    });
  } catch {
    return { kind: 'refused' };
  }
}

function sameId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** Le résultat appartient-il bien à ce START, et à la vraie opération quand elle est connue ? */
export function isResultBoundToRequest(result: ErasureResult, requestId: string, operationId?: string): boolean {
  const startRequestId = result.report.startRequestId;
  return (
    typeof startRequestId === 'string' &&
    OPERATION_ID_RE.test(result.operationId) &&
    sameId(startRequestId, requestId) &&
    !sameId(result.operationId, requestId) &&
    (operationId === undefined || sameId(result.operationId, operationId))
  );
}

/** Seule preuve admise pour libérer une référence : `completed` confirmé ET lié au même START. */
export function isConfirmedCompletion(result: ErasureResult, requestId: string, operationId?: string): boolean {
  return (
    isResultBoundToRequest(result, requestId, operationId) &&
    result.ok === true &&
    result.status === 'completed' &&
    result.cleanupStatusUnavailable === false &&
    result.report.manualReviewRequired !== true &&
    result.tasks.every((task) => task.status === 'succeeded') &&
    result.counts.total === result.tasks.length &&
    result.counts.pending === 0 &&
    result.counts.failed === 0 &&
    result.counts.succeeded === result.counts.total
  );
}

/** Retire la référence seulement si elle est encore exactement celle prouvée par le résultat. */
export async function releaseConfirmedStartReference({
  userId,
  reference,
  result,
  operationId,
  isCurrent,
}: {
  userId: string;
  reference: RgpdStartReference;
  result: ErasureResult;
  operationId?: string;
  isCurrent: () => boolean;
}): Promise<boolean> {
  if (!isConfirmedCompletion(result, reference.requestId, operationId)) return false;
  const key = rgpdStartReferenceKey(userId);
  try {
    return await withReferenceLock(key, () => {
      if (!isCurrent()) return false;
      const stored = readStartReference(userId);
      if (
        stored.kind !== 'present' ||
        stored.reference.requestId !== reference.requestId ||
        stored.reference.fingerprint !== reference.fingerprint
      ) {
        return false;
      }
      window.localStorage.removeItem(key);
      return window.localStorage.getItem(key) === null;
    });
  } catch {
    return false;
  }
}
