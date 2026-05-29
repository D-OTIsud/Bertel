import { uploadMedia } from './media-upload';

const ORIG_FETCH = globalThis.fetch;

describe('uploadMedia', () => {
  afterEach(() => {
    globalThis.fetch = ORIG_FETCH;
    jest.restoreAllMocks();
  });

  it('POSTs to /api/media/upload with bearer token and multipart body', async () => {
    const fakeJwt = 'fake-jwt';
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ url: 'https://cdn.test/media/x.jpg', width: 1000, height: 800, mimeType: 'image/jpeg' }),
    } as unknown as Response);
    globalThis.fetch = fetchMock;

    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
    const result = await uploadMedia({ file, objectId: 'obj-123', accessToken: fakeJwt });

    expect(result).toEqual({ url: 'https://cdn.test/media/x.jpg', width: 1000, height: 800, mimeType: 'image/jpeg' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/media/upload');
    expect(init).toBeDefined();
    expect(init!.method).toBe('POST');
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${fakeJwt}`);
    expect(init!.body).toBeInstanceOf(FormData);
    expect((init!.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    const fd = init!.body as FormData;
    expect(fd.get('object_id')).toBe('obj-123');
    expect(fd.get('file')).toBeInstanceOf(File);
  });

  it('throws on non-2xx response with the server error body', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 415,
      json: async () => ({ error: 'mime', detail: 'Unsupported MIME type: image/svg+xml' }),
    } as unknown as Response)) as unknown as typeof fetch;

    const file = new File([new Uint8Array([1])], 'logo.svg', { type: 'image/svg+xml' });
    await expect(uploadMedia({ file, objectId: 'obj-1', accessToken: 't' }))
      .rejects.toThrow(/Unsupported MIME type/);
  });
});
