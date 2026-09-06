/** @jest-environment node */

const ORIGINAL_ENV = { ...process.env };

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

  it('probes the Supabase Auth gateway and returns 200 on success', async () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });
    fetchMock.mockResolvedValue({ status: 200 });
    const { GET } = await loadRoute();

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ready: true, mode: 'live' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/auth/v1/health',
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
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
    await jest.advanceTimersByTimeAsync(2000);
    const res = await pending;
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({ ready: false, reason: 'degraded' });
    jest.useRealTimers();
  });

  it('dedupes concurrent requests into a single fetch, then caches for 5s', async () => {
    jest.useFakeTimers();
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });
    fetchMock.mockResolvedValue({ status: 200 });
    const { GET } = await loadRoute();

    const [a, b] = await Promise.all([GET(), GET()]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await GET();
    expect(fetchMock).toHaveBeenCalledTimes(1); // still cached

    await jest.advanceTimersByTimeAsync(5001);
    await GET();
    expect(fetchMock).toHaveBeenCalledTimes(2); // cache expired
    jest.useRealTimers();
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
