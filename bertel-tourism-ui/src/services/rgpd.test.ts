import { lookupErasureStart, requestErasure, resumeErasureCleanup } from './rgpd';

const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const OPERATION_ID = '22222222-2222-4222-8222-222222222222';

const completedResult = {
  ok: true,
  status: 'completed',
  operationId: 'op-1',
  report: { actor: 'a1' },
  tasks: [],
  cleanupStatusUnavailable: false,
  counts: { total: 0, succeeded: 0, pending: 0, failed: 0 },
};

describe('requestErasure', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('POSTs to /api/rgpd/erase with bearer token and JSON body', async () => {
    const json = jest.fn().mockResolvedValue(completedResult);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await requestErasure({
      requestId: REQUEST_ID, subjectKind: 'actor', subjectId: 'a1', mode: 'anonymize', reason: 'demande X', accessToken: 'jwt-123',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/rgpd/erase');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-123');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      requestId: REQUEST_ID, subjectKind: 'actor', subjectId: 'a1', mode: 'anonymize', reason: 'demande X',
    });
    expect(res.report).toEqual({ actor: 'a1' });
    expect(res.operationId).toBe('op-1');
  });

  it('throws the server detail on a non-ok response (e.g. 403 gate)', async () => {
    const json = jest.fn().mockResolvedValue({
      error: 'erase_failed', detail: 'Effacement RGPD réservé aux administrateurs plateforme.',
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, json }) as unknown as typeof fetch;
    await expect(
      requestErasure({ requestId: REQUEST_ID, subjectKind: 'actor', subjectId: 'a1', mode: 'anonymize', accessToken: 't' }),
    ).rejects.toThrow('réservé aux administrateurs');
  });

  it('defaults reason to null when omitted', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => completedResult });
    global.fetch = fetchMock as unknown as typeof fetch;
    await requestErasure({ requestId: REQUEST_ID, subjectKind: 'review', subjectId: 'r1', mode: 'delete', accessToken: 't' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).reason).toBeNull();
  });

  it('surfaces a partial/incomplete result without throwing (ok=false is data, not an HTTP error)', async () => {
    const partial = { ...completedResult, ok: false, status: 'partial', counts: { total: 2, succeeded: 1, pending: 1, failed: 0 } };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => partial }) as unknown as typeof fetch;
    const res = await requestErasure({ requestId: REQUEST_ID, subjectKind: 'actor', subjectId: 'a1', mode: 'delete', accessToken: 't' });
    expect(res.ok).toBe(false);
    expect(res.status).toBe('partial');
  });

  it.each([
    ['null', null],
    ['statut inconnu', { ...completedResult, status: 'unknown' }],
    ['report absent', { ...completedResult, report: undefined }],
    ['compteurs incomplets', { ...completedResult, counts: { total: 0 } }],
  ])('rejects a response outside the ErasureResult contract: %s', async (_label, payload) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload }) as unknown as typeof fetch;
    await expect(
      requestErasure({ requestId: REQUEST_ID, subjectKind: 'actor', subjectId: 'a1', mode: 'delete', accessToken: 't' }),
    ).rejects.toThrow();
  });
});

describe('lookupErasureStart', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('POSTs only { requestId } and returns the real operationId', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ requestId: REQUEST_ID, operationId: OPERATION_ID }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(lookupErasureStart(REQUEST_ID, 'jwt-abc')).resolves.toEqual({
      requestId: REQUEST_ID, operationId: OPERATION_ID,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/rgpd/erase');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-abc');
    expect(JSON.parse(init.body as string)).toEqual({ requestId: REQUEST_ID });
  });

  it.each([
    ['champ en plus', { requestId: REQUEST_ID, operationId: OPERATION_ID, status: 'completed' }],
    ['operationId absent', { requestId: REQUEST_ID }],
    ['autre requestId', { requestId: OPERATION_ID, operationId: OPERATION_ID }],
    ['operationId non UUID', { requestId: REQUEST_ID, operationId: 'op-1' }],
    ['operationId confondu avec requestId', { requestId: REQUEST_ID, operationId: REQUEST_ID }],
    ['tableau', [REQUEST_ID, OPERATION_ID]],
  ])('rejects an invalid envelope: %s', async (_label, payload) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload }) as unknown as typeof fetch;
    await expect(lookupErasureStart(REQUEST_ID, 't')).rejects.toThrow();
  });

  it.each([404, 500])('throws on HTTP %i', async (status) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status, json: async () => ({ error: status === 404 ? 'operation_not_found' : 'operation_lookup_failed' }),
    }) as unknown as typeof fetch;
    await expect(lookupErasureStart(REQUEST_ID, 't')).rejects.toThrow();
  });
});

describe('resumeErasureCleanup', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('POSTs only { operationId } — never subject fields', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => completedResult });
    global.fetch = fetchMock as unknown as typeof fetch;

    await resumeErasureCleanup('op-1', 'jwt-abc');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/rgpd/erase');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-abc');
    expect(JSON.parse(init.body as string)).toEqual({ operationId: 'op-1' });
  });

  it('throws the server detail on a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 404, json: async () => ({ error: 'operation_not_found' }),
    }) as unknown as typeof fetch;
    await expect(resumeErasureCleanup('missing', 't')).rejects.toThrow();
  });
});
