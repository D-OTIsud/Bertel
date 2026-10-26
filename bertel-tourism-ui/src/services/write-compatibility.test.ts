import { assertWriteCompatible, readWriteCompatibility, WRITE_CONTRACT_VERSION } from './write-compatibility';

const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('write compatibility', () => {
  it('accepts a client inside the server-supported interval and disables caching', async () => {
    const fetcher = jest.fn().mockResolvedValue(response({ minimumClientVersion: 1, writeContractVersion: 2 }));
    await expect(readWriteCompatibility(fetcher)).resolves.toMatchObject({ compatible: true, clientVersion: WRITE_CONTRACT_VERSION });
    expect(fetcher).toHaveBeenCalledWith('/api/app-version', expect.objectContaining({ cache: 'no-store', signal: expect.anything() }));
  });

  it('fails closed for missing, invalid, and incompatible server versions', async () => {
    expect((await readWriteCompatibility(jest.fn().mockResolvedValue(response({}, 404)))).compatible).toBe(false);
    expect((await readWriteCompatibility(jest.fn().mockResolvedValue(response({ minimumClientVersion: '1', writeContractVersion: 2 })))).compatible).toBe(false);
    expect((await readWriteCompatibility(jest.fn().mockResolvedValue(response({ minimumClientVersion: 1, writeContractVersion: 0 })))).compatible).toBe(false);
    expect((await readWriteCompatibility(jest.fn().mockResolvedValue(response({ minimumClientVersion: 3, writeContractVersion: 2 })))).compatible).toBe(false);
    expect((await readWriteCompatibility(jest.fn().mockRejectedValue(new Error('offline')))).compatible).toBe(false);
  });

  it('accepts a shared rolling interval and rejects a server that requires a newer client', async () => {
    const sharedInterval = await readWriteCompatibility(jest.fn().mockResolvedValue(response({ minimumClientVersion: 1, writeContractVersion: 2 })));
    expect(sharedInterval).toMatchObject({ compatible: true, minimumClientVersion: 1, serverWriteContractVersion: 2 });

    const oldClientAgainstNewMinimum = await readWriteCompatibility(jest.fn().mockResolvedValue(response({ minimumClientVersion: 2, writeContractVersion: 2 })));
    expect(oldClientAgainstNewMinimum.compatible).toBe(false);
  });

  it('throws before a write when the snapshot is incompatible', () => {
    expect(() => assertWriteCompatible({ compatible: false, clientVersion: 1, minimumClientVersion: 1, serverWriteContractVersion: 0, reason: 'old server' })).toThrow('old server');
  });
});
