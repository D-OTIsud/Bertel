import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import {
  admitStartReference,
  computeStartFingerprint,
  isConfirmedCompletion,
  isResultBoundToRequest,
  readStartReference,
  releaseConfirmedStartReference,
  rgpdStartReferenceKey,
  type RgpdStartReference,
} from './rgpd-start-reference';
import type { ErasureResult } from './rgpd';

const USER = 'user a/1';
const KEY = 'bertel-rgpd-start:v1:user%20a%2F1';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const OPERATION_ID = '22222222-2222-4222-8222-222222222222';
const FINGERPRINT = 'a'.repeat(64);
const REFERENCE: RgpdStartReference = { version: 1, requestId: REQUEST_ID, fingerprint: FINGERPRINT };

const completed: ErasureResult = {
  ok: true,
  status: 'completed',
  operationId: OPERATION_ID,
  report: { startRequestId: REQUEST_ID },
  tasks: [],
  cleanupStatusUnavailable: false,
  counts: { total: 0, succeeded: 0, pending: 0, failed: 0 },
};

function installLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(window.navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, callback: () => unknown) => {
        const run = tail.then(() => callback());
        tail = run.catch(() => undefined);
        return run;
      },
    },
  });
}

function seed(reference: unknown = REFERENCE) {
  window.localStorage.setItem(KEY, typeof reference === 'string' ? reference : JSON.stringify(reference));
}

const admit = (send: (reference: RgpdStartReference) => string = () => 'sent', isCurrent = () => true) =>
  admitStartReference({ userId: USER, fingerprint: FINGERPRINT, isCurrent, send });

beforeAll(() => {
  Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
  global.TextEncoder = NodeTextEncoder as typeof TextEncoder;
});

beforeEach(() => {
  window.localStorage.clear();
  installLocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('rgpdStartReferenceKey', () => {
  it('encode le userId dans la clef exacte', () => {
    expect(rgpdStartReferenceKey(USER)).toBe(KEY);
  });
});

describe('computeStartFingerprint', () => {
  it('hache le JSON canonique avec SHA-256, sujet et motif normalisés', async () => {
    const expected = createHash('sha256')
      .update(JSON.stringify(['actor', 'subject-1', 'delete', 'motif']))
      .digest('hex');
    await expect(
      computeStartFingerprint({ subjectKind: 'actor', subjectId: ' subject-1 ', mode: 'delete', reason: ' motif ' }),
    ).resolves.toBe(expected);
  });

  it('utilise null pour un motif vide', async () => {
    const expected = createHash('sha256')
      .update(JSON.stringify(['review', 'subject-1', 'anonymize', null]))
      .digest('hex');
    await expect(
      computeStartFingerprint({ subjectKind: 'review', subjectId: 'subject-1', mode: 'anonymize', reason: '   ' }),
    ).resolves.toBe(expected);
  });

  it('refuse fermé sans WebCrypto', async () => {
    Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: undefined });
    try {
      await expect(
        computeStartFingerprint({ subjectKind: 'actor', subjectId: 'id', mode: 'delete' }),
      ).resolves.toBeNull();
    } finally {
      Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
    }
  });
});

describe('readStartReference', () => {
  it('distingue absence et référence exacte', () => {
    expect(readStartReference(USER)).toEqual({ kind: 'absent' });
    seed();
    expect(readStartReference(USER)).toEqual({ kind: 'present', reference: REFERENCE });
  });

  it.each([
    ['JSON illisible', '{'],
    ['champ en plus', { ...REFERENCE, subjectId: 'x' }],
    ['version inconnue', { ...REFERENCE, version: 2 }],
    ['requestId invalide', { ...REFERENCE, requestId: 'nope' }],
    ['empreinte invalide', { ...REFERENCE, fingerprint: 'abc' }],
    ['forme non canonique', ` ${JSON.stringify(REFERENCE)}`],
  ])('rejette une valeur existante invalide : %s', (_label, value) => {
    seed(value);
    expect(readStartReference(USER)).toEqual({ kind: 'invalid' });
  });

  it('rapporte un stockage illisible', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readStartReference(USER)).toEqual({ kind: 'unavailable' });
  });
});

describe('admitStartReference', () => {
  it('écrit exactement la référence puis envoie avec le même requestId', async () => {
    const send = jest.fn(() => 'sent');
    const admission = await admit(send);

    expect(admission.kind).toBe('started');
    if (admission.kind !== 'started') throw new Error('admission attendue');
    expect(admission.sent).toBe('sent');
    expect(send).toHaveBeenCalledWith(admission.reference);
    expect(window.localStorage.getItem(KEY)).toBe(
      JSON.stringify({ version: 1, requestId: admission.reference.requestId, fingerprint: FINGERPRINT }),
    );
  });

  it("ne remplace jamais une référence existante et n'envoie rien", async () => {
    seed();
    const send = jest.fn(() => 'sent');
    await expect(admit(send)).resolves.toEqual({ kind: 'blocked', reference: REFERENCE });
    expect(send).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify(REFERENCE));
  });

  it('refuse sur valeur invalide sans la modifier', async () => {
    seed('garbage');
    const send = jest.fn(() => 'sent');
    await expect(admit(send)).resolves.toEqual({ kind: 'refused' });
    expect(send).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBe('garbage');
  });

  it("refuse si l'écriture échoue", async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const send = jest.fn(() => 'sent');
    await expect(admit(send)).resolves.toEqual({ kind: 'refused' });
    expect(send).not.toHaveBeenCalled();
  });

  it('refuse si la relecture diffère', async () => {
    const realGetItem = Storage.prototype.getItem;
    let reads = 0;
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(this: Storage, key: string) {
      reads += 1;
      return reads === 1 ? realGetItem.call(this, key) : 'autre';
    });
    const send = jest.fn(() => 'sent');
    await expect(admit(send)).resolves.toEqual({ kind: 'refused' });
    expect(send).not.toHaveBeenCalled();
  });

  it('refuse sans UUID aléatoire disponible', async () => {
    const realRandomUUID = window.crypto.randomUUID;
    Object.defineProperty(window.crypto, 'randomUUID', {
      configurable: true,
      value: () => {
        throw new Error('unavailable');
      },
    });
    try {
      const send = jest.fn(() => 'sent');
      await expect(admit(send)).resolves.toEqual({ kind: 'refused' });
      expect(send).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(KEY)).toBeNull();
    } finally {
      Object.defineProperty(window.crypto, 'randomUUID', { configurable: true, value: realRandomUUID });
    }
  });

  it('refuse sans Web Locks, car rien ne protège alors entre onglets', async () => {
    Object.defineProperty(window.navigator, 'locks', { configurable: true, value: undefined });
    const send = jest.fn(() => 'sent');
    await expect(admit(send)).resolves.toEqual({ kind: 'refused' });
    expect(send).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("n'écrit rien si le snapshot n'est plus courant", async () => {
    const send = jest.fn(() => 'sent');
    await expect(admit(send, () => false)).resolves.toEqual({ kind: 'refused' });
    expect(send).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('deux admissions concurrentes : une seule envoie, la première référence reste', async () => {
    const send = jest.fn(() => 'sent');
    const [first, second] = await Promise.all([admit(send), admit(send)]);

    expect(first.kind).toBe('started');
    expect(second.kind).toBe('blocked');
    expect(send).toHaveBeenCalledTimes(1);
    if (first.kind !== 'started' || second.kind !== 'blocked') throw new Error('issues attendues');
    expect(second.reference).toEqual(first.reference);
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify(first.reference));
  });
});

describe('liaison du résultat', () => {
  it('exige le même requestId et un operationId distinct', () => {
    expect(isResultBoundToRequest(completed, REQUEST_ID)).toBe(true);
    expect(isResultBoundToRequest({ ...completed, report: {} }, REQUEST_ID)).toBe(false);
    expect(isResultBoundToRequest({ ...completed, operationId: REQUEST_ID }, REQUEST_ID)).toBe(false);
    expect(isResultBoundToRequest(completed, REQUEST_ID, REQUEST_ID)).toBe(false);
  });

  it.each<[string, ErasureResult]>([
    ['partial', { ...completed, ok: false, status: 'partial' }],
    ['failed', { ...completed, ok: false, status: 'failed' }],
    ['ok faux', { ...completed, ok: false }],
    ['statut non rechargé', { ...completed, cleanupStatusUnavailable: true }],
    ['revue manuelle', { ...completed, report: { startRequestId: REQUEST_ID, manualReviewRequired: true } }],
    ['tâche en attente', { ...completed, counts: { total: 1, succeeded: 0, pending: 1, failed: 0 } }],
    ['autre START', { ...completed, report: { startRequestId: OPERATION_ID } }],
    ['operationId non UUID', { ...completed, operationId: 'not-a-uuid' }],
    ['compteurs négatifs égaux', { ...completed, counts: { total: -1, succeeded: -1, pending: 0, failed: 0 } }],
    ['compteurs fractionnaires', { ...completed, counts: { total: 0.5, succeeded: 0.5, pending: 0, failed: 0 } }],
    ['total différent des tâches', { ...completed, counts: { total: 1, succeeded: 1, pending: 0, failed: 0 } }],
  ])("n'accepte pas comme confirmé : %s", (_label, result) => {
    expect(isConfirmedCompletion(result, REQUEST_ID)).toBe(false);
  });
});

describe('releaseConfirmedStartReference', () => {
  const release = (result: ErasureResult, reference = REFERENCE, isCurrent = () => true) =>
    releaseConfirmedStartReference({ userId: USER, reference, result, isCurrent });

  it('retire la référence après un completed lié', async () => {
    seed();
    await expect(release(completed)).resolves.toBe(true);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('conserve la référence sur un partial', async () => {
    seed();
    await expect(release({ ...completed, ok: false, status: 'partial' })).resolves.toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify(REFERENCE));
  });

  it("ne retire pas une autre référence stockée", async () => {
    const other = { ...REFERENCE, fingerprint: 'b'.repeat(64) };
    seed(other);
    await expect(release(completed)).resolves.toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify(other));
  });

  it("ne retire rien si le compte n'est plus courant", async () => {
    seed();
    await expect(release(completed, REFERENCE, () => false)).resolves.toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify(REFERENCE));
  });
});
