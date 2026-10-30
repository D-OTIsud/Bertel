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
      global: { headers: { Authorization: 'Bearer caller-jwt' } },
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
});
