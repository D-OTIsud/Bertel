/** @jest-environment node */
import { __resetServerSupabaseClientForTests, getServerSupabaseClient } from './supabase-server';

type ServerClient = NonNullable<ReturnType<typeof getServerSupabaseClient>>;
const SYNTHETIC_URL = 'https://supabase-transport.invalid';
const SYNTHETIC_JWT = 'synthetic-jwt';

describe('getServerSupabaseClient', () => {
  beforeEach(() => {
    __resetServerSupabaseClientForTests();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it('returns null when service-role key is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    expect(getServerSupabaseClient()).toBeNull();
  });

  it('returns null when supabase url is missing', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv-key';
    expect(getServerSupabaseClient()).toBeNull();
  });

  it('returns a singleton client when both env are set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv-key';
    const a = getServerSupabaseClient();
    const b = getServerSupabaseClient();
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
});

describe('server Supabase transport', () => {
  beforeEach(() => {
    __resetServerSupabaseClientForTests();
    jest.replaceProperty(process, 'env', {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: SYNTHETIC_URL,
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role',
    });
  });

  afterEach(() => {
    __resetServerSupabaseClientForTests();
    jest.restoreAllMocks();
  });

  it.each([
    { path: '/auth/v1/user', run: (client: ServerClient) => client.auth.getUser(SYNTHETIC_JWT) },
    { path: '/auth/v1/invite', run: (client: ServerClient) => client.auth.admin.inviteUserByEmail('example@example.invalid') },
  ])('does not send a raw transport rejection to the SDK logger for $path', async ({ path, run }) => {
    const raw = new TypeError('raw synthetic transport message', { cause: new Error('raw synthetic transport cause') });
    const transport = jest.spyOn(globalThis, 'fetch').mockRejectedValue(raw);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { error } = await run(getServerSupabaseClient()!);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(String(transport.mock.calls[0][0])).toBe(SYNTHETIC_URL + path);
    expect(log).toHaveBeenCalledTimes(1);
    const [logged] = log.mock.calls[0];
    expect(logged).not.toBe(raw);
    expect(logged).toMatchObject({ name: 'TypeError', message: 'Supabase transport request failed' });
    expect(logged).not.toHaveProperty('cause');
    expect(logged.stack).toBeUndefined();
    expect(error).toMatchObject({
      name: 'AuthRetryableFetchError', status: 0, message: 'Supabase transport request failed',
    });
  });

  it.each([
    ['native abort', 'AbortError', new DOMException('raw abort', 'AbortError')],
    ['Node ABORT_ERR', 'AbortError', Object.assign(new Error('raw node abort'), { code: 'ABORT_ERR' })],
    ['a custom signal reason', 'AbortError', { message: 'raw custom abort reason' }],
    ['native timeout', 'TimeoutError', new DOMException('raw timeout', 'TimeoutError')],
  ])('redacts %s without losing %s classification', async (_case, name, reason) => {
    const controller = new AbortController();
    controller.abort(reason);
    const transport = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      init?.signal?.throwIfAborted();
      throw new Error('Expected the supplied signal to be aborted');
    });
    const result = getServerSupabaseClient()!.from('synthetic_table').select('id')
      .abortSignal(controller.signal).throwOnError();

    await expect(result).rejects.toMatchObject({ name, message: 'Supabase transport request failed' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it.each([
    { status: 200, body: { id: 'synthetic-user' }, expected: { data: { user: { id: 'synthetic-user' } }, error: null } },
    { status: 401, body: { code: 'bad_jwt', message: 'Structured Auth error' }, expected: { error: { status: 401, message: 'Structured Auth error' } } },
  ])('passes the resolved HTTP $status response through to Auth', async ({ status, body, expected }) => {
    const response = Response.json(body, { status });
    const transport = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);

    await expect(getServerSupabaseClient()!.auth.getUser(SYNTHETIC_JWT)).resolves.toMatchObject(expected);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(response.bodyUsed).toBe(true);
  });
});
