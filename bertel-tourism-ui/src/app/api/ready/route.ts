import { NextResponse } from 'next/server';

// Readiness checks the configured Supabase Auth, REST and Storage endpoints.
// /api/health reports process liveness. The probes use status codes only.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 5000;
const FETCH_TIMEOUT_MS = 2000;
const SUPABASE_PROBES = [
  { method: 'GET', path: '/auth/v1/health' },
  // Depends on the existing anon SELECT grant on public.ref_code.
  { method: 'HEAD', path: '/rest/v1/ref_code?select=code&limit=0' },
  { method: 'GET', path: '/storage/v1/status' },
] as const;

interface ReadyResult {
  status: 200 | 503;
  body: Record<string, unknown>;
}

let cached: { result: ReadyResult; expiresAt: number } | null = null;
let inFlight: Promise<ReadyResult> | null = null;

function isConfiguredHttpUrl(value: string): boolean {
  // Reject the delimiters themselves, including an empty query or fragment.
  if (/[?#]/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

async function probeSupabase(url: string, anonKey: string): Promise<boolean> {
  const base = url.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const results = await Promise.all(SUPABASE_PROBES.map(async ({ path, method }) => {
      const res = await fetch(base + path, {
        method,
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
        headers: { apikey: anonKey },
      });
      // Discard the upstream body without extending the readiness deadline.
      void res.body?.cancel().catch(() => {});
      return res.status >= 200 && res.status < 300;
    }));
    return results.every(Boolean);
  } catch {
    // Abort sibling requests on transport failure.
    controller.abort();
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function computeReady(): Promise<ReadyResult> {
  // Reflect.get preserves a runtime lookup through Next's static-env postprocessing.
  // Even alias.NEXT_PUBLIC_* is rewritten to build values in the emitted server JS.
  const runtimeValue = (key: string): string => {
    const value: unknown = Reflect.get(process.env, key);
    return typeof value === 'string' ? value.trim() : '';
  };
  if (runtimeValue('NEXT_PUBLIC_ENABLE_DEMO_MODE').toLowerCase() === 'true') {
    return { status: 200, body: { ready: true, mode: 'demo' } };
  }

  const url = runtimeValue('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = runtimeValue('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anonKey || !isConfiguredHttpUrl(url)) {
    // Never echo the configured URL/key back to the client.
    return { status: 503, body: { ready: false, reason: 'misconfigured' } };
  }

  const ok = await probeSupabase(url, anonKey);
  return ok
    ? { status: 200, body: { ready: true, mode: 'live' } }
    : { status: 503, body: { ready: false, reason: 'degraded' } };
}

// Shares one in-flight batch across concurrent requests and caches the completed result for
// CACHE_TTL_MS per process.
function getReady(): Promise<ReadyResult> {
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.result);
  }
  if (!inFlight) {
    inFlight = computeReady()
      .then((result) => {
        cached = { result, expiresAt: Date.now() + CACHE_TTL_MS };
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export async function GET(): Promise<NextResponse> {
  const { status, body } = await getReady();
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
