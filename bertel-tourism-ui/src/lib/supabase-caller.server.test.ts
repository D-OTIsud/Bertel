/** @jest-environment node */
import { createClient } from '@supabase/supabase-js';
import { createCallerClient } from './supabase-caller.server';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

describe('caller-scoped Supabase clients', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards the route’s exact URL, anonymous key and token without changing session options', () => {
    const client = { schema: jest.fn() };
    jest.mocked(createClient).mockReturnValueOnce(client as unknown as ReturnType<typeof createClient>);
    expect(createCallerClient('https://example.supabase.co', 'anon-key', 'caller-jwt')).toBe(client);
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key', {
      global: { headers: { Authorization: 'Bearer caller-jwt' }, fetch: expect.any(Function) },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it('creates a separate client for each caller without reusing another request’s token', () => {
    const first = { id: 1 };
    const second = { id: 2 };
    jest.mocked(createClient)
      .mockReturnValueOnce(first as unknown as ReturnType<typeof createClient>)
      .mockReturnValueOnce(second as unknown as ReturnType<typeof createClient>);
    expect(createCallerClient('https://example.supabase.co', 'anon-key', 'user-1')).toBe(first);
    expect(createCallerClient('https://example.supabase.co', 'anon-key', 'user-2')).toBe(second);
    expect(jest.mocked(createClient).mock.calls.map((call) => call[2]?.global?.headers?.Authorization))
      .toEqual(['Bearer user-1', 'Bearer user-2']);
  });

  it('redacts the actual caller Auth transport failure and forwards its JWT', async () => {
    const sdk = jest.requireActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js');
    jest.mocked(createClient).mockImplementationOnce(sdk.createClient);
    const raw = new TypeError('raw synthetic caller cause');
    const transport = jest.spyOn(globalThis, 'fetch').mockRejectedValue(raw);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const caller = createCallerClient('https://caller.invalid', 'synthetic-anon', 'synthetic-jwt');
      const { error } = await caller.auth.getUser('synthetic-jwt');

      expect(transport).toHaveBeenCalledTimes(1);
      const [url, init] = transport.mock.calls[0];
      expect(String(url)).toBe('https://caller.invalid/auth/v1/user');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-jwt');
      expect(log.mock.calls[0][0]).not.toBe(raw);
      expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: 'Supabase transport request failed' }));
      expect(error).toMatchObject({ name: 'AuthRetryableFetchError', status: 0 });
    } finally {
      transport.mockRestore();
      log.mockRestore();
    }
  });
});
