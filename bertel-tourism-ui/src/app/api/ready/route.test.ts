/** @jest-environment node */

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

async function loadRoute() {
  jest.resetModules();
  return import('./route');
}

describe('GET /api/ready', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    setEnv({
      NEXT_PUBLIC_ENABLE_DEMO_MODE: undefined,
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = ORIGINAL_FETCH;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('is ready in demo mode without calling Supabase', async () => {
    setEnv({ NEXT_PUBLIC_ENABLE_DEMO_MODE: 'true' });
    const { GET } = await loadRoute();

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ready: true, mode: 'demo' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 503 misconfigured without leaking config when Supabase is not configured', async () => {
    const { GET } = await loadRoute();

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({ ready: false, reason: 'misconfigured' });
    expect(JSON.stringify(body)).not.toContain('supabase');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['https://project-a.supabase.test/', 'https://project-a.supabase.test', 'public-key-a'],
    ['https://project-b.supabase.test/proxy/', 'https://project-b.supabase.test/proxy', 'public-key-b'],
  ])('probes all three dependencies on the configured tenant %s', async (url, base, apikey) => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: apikey,
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key-must-not-be-used',
    });
    const cancel = jest.fn().mockResolvedValue(undefined);
    const readBody = jest.fn();
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => ({
      status: 200,
      body: init.method === 'HEAD' ? null : { cancel },
      json: readBody,
      text: readBody,
    }));
    const { GET } = await loadRoute();

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    await expect(res.json()).resolves.toEqual({ ready: true, mode: 'live' });
    const options = {
      cache: 'no-store',
      redirect: 'error',
      signal: expect.any(AbortSignal),
      headers: { apikey },
    };
    expect(fetchMock.mock.calls).toEqual([
      [base + '/auth/v1/health', { ...options, method: 'GET' }],
      [base + '/rest/v1/ref_code?select=code&limit=0', { ...options, method: 'HEAD' }],
      [base + '/storage/v1/status', { ...options, method: 'GET' }],
    ]);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(readBody).not.toHaveBeenCalled();
  });

  it.each([
    ['/auth/v1/health', 401],
    ['/rest/v1/ref_code?select=code&limit=0', 503],
    ['/storage/v1/status', 302],
  ])('reports generic degradation when only %s returns %i', async (failedPath, status) => {
    const base = 'https://project.supabase.test';
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: base,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-key',
    });
    fetchMock.mockImplementation(async (url: string) => ({ status: url === base + failedPath ? status : 200 }));
    const { GET } = await loadRoute();

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ ready: false, reason: 'degraded' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns 503 degraded on network failure', async () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });
    fetchMock.mockRejectedValue(new Error('network down'));
    const { GET } = await loadRoute();

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({ ready: false, reason: 'degraded' });
  });

  it('aborts and reports degraded on timeout', async () => {
    jest.useFakeTimers();
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const { GET } = await loadRoute();

    const pending = GET();
    const signals = fetchMock.mock.calls.map(([, init]) => init.signal as AbortSignal);
    await jest.advanceTimersByTimeAsync(1999);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
    await jest.advanceTimersByTimeAsync(1);
    const res = await pending;
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({ ready: false, reason: 'degraded' });
    expect(signals).toHaveLength(3);
    expect(new Set(signals).size).toBe(1);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it.each([200, 503])('shares a parallel probe batch and caches status %i for 5s', async (status) => {
    jest.useFakeTimers();
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.test',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-key',
    });
    let finishFetch!: (response: { status: number }) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { finishFetch = resolve; }));
    const { GET } = await loadRoute();

    const pending = Promise.all([GET(), GET()]);
    const startedBeforeAnyResponse = fetchMock.mock.calls.length;
    finishFetch({ status });
    const [a, b] = await pending;
    expect(a.status).toBe(status);
    expect(b.status).toBe(status);
    expect(startedBeforeAnyResponse).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await jest.advanceTimersByTimeAsync(4999);
    expect((await GET()).status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await jest.advanceTimersByTimeAsync(1);
    expect((await GET()).status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('rejects a configured URL that embeds credentials', async () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://user:pass@project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });
    const { GET } = await loadRoute();

    const res = await GET();

    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
