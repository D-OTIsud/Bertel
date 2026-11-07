import { requestObjectDeletion } from './object-delete';

describe('requestObjectDeletion', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });

  it('POSTs to /api/objects/delete with bearer token and JSON body', async () => {
    const json = jest.fn().mockResolvedValue({
      ok: true, report: { object_id: 'o1' }, mediaDeleted: [], documentsDeleted: [], storageError: null,
    });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await requestObjectDeletion({ objectId: 'o1', confirmName: 'Hôtel X', accessToken: 'jwt-123' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/objects/delete');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123');
    expect(JSON.parse(init.body as string)).toEqual({ objectId: 'o1', confirmName: 'Hôtel X' });
    expect(res.report).toEqual({ object_id: 'o1' });
  });

  it('throws the server detail on a non-ok response (e.g. 403 gate)', async () => {
    const json = jest.fn().mockResolvedValue({ error: 'delete_failed', detail: 'réservée aux administrateurs plateforme' });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, json }) as unknown as typeof fetch;
    await expect(
      requestObjectDeletion({ objectId: 'o1', confirmName: 'X', accessToken: 't' }),
    ).rejects.toThrow('administrateurs');
  });
});
