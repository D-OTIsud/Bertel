import { requestErasure, resumeErasureCleanup } from './rgpd';

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
      subjectKind: 'actor', subjectId: 'a1', mode: 'anonymize', reason: 'demande X', accessToken: 'jwt-123',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/rgpd/erase');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-123');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      subjectKind: 'actor', subjectId: 'a1', mode: 'anonymize', reason: 'demande X',
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
      requestErasure({ subjectKind: 'actor', subjectId: 'a1', mode: 'anonymize', accessToken: 't' }),
    ).rejects.toThrow('réservé aux administrateurs');
  });

  it('defaults reason to null when omitted', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => completedResult });
    global.fetch = fetchMock as unknown as typeof fetch;
    await requestErasure({ subjectKind: 'review', subjectId: 'r1', mode: 'delete', accessToken: 't' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).reason).toBeNull();
  });

  it('surfaces a partial/incomplete result without throwing (ok=false is data, not an HTTP error)', async () => {
    const partial = { ...completedResult, ok: false, status: 'partial', counts: { total: 2, succeeded: 1, pending: 1, failed: 0 } };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => partial }) as unknown as typeof fetch;
    const res = await requestErasure({ subjectKind: 'actor', subjectId: 'a1', mode: 'delete', accessToken: 't' });
    expect(res.ok).toBe(false);
    expect(res.status).toBe('partial');
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
