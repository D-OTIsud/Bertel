import { NextResponse } from 'next/server';

// Readiness probe: checks whether the app can actually serve requests, unlike /api/health
// (process liveness only). Non-demo mode probes the configured Supabase Auth gateway
// (GET /auth/v1/health) — this validates reachability of the auth endpoint only, NOT a
// full DB/Storage/RLS guarantee.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 5000;
const FETCH_TIMEOUT_MS = 2000;

interface ReadyResult {
  status: 200 | 503;
  body: Record<string, unknown>;
}

let cached: { result: ReadyResult; expiresAt: number } | null = null;
let inFlight: Promise<ReadyResult> | null = null;

function isConfiguredHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

async function probeSupabaseAuth(url: string, anonKey: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/health`, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
      headers: { apikey: anonKey },
    });
    // Status class only — never read the body (avoids leaking upstream diagnostics).
    const ready = res.status >= 200 && res.status < 300;
    await res.body?.cancel().catch(() => {});
    return ready;
  } catch {
    // Network failure, non-2xx-via-redirect-error, or abort on timeout.
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

  const ok = await probeSupabaseAuth(url, anonKey);
  return ok
    ? { status: 200, body: { ready: true, mode: 'live' } }
    : { status: 503, body: { ready: false, reason: 'degraded' } };
}

// Shares one in-flight probe across concurrent requests and caches the completed result for
// CACHE_TTL_MS per process, to avoid a poll storm hammering the Supabase Auth gateway.
async function getReady(): Promise<ReadyResult> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }
  if (!inFlight) {
    inFlight = computeReady().finally(() => {
      inFlight = null;
    });
  }
  const result = await inFlight;
  cached = { result, expiresAt: Date.now() + CACHE_TTL_MS };
  return result;
}

export async function GET(): Promise<NextResponse> {
  const { status, body } = await getReady();
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
