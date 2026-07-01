import { NextResponse, type NextRequest } from 'next/server';

/**
 * CORS for the partner-facing public API only (audit API R2). The matcher is STRICT
 * `/api/public/:path*` — the internal app (every other route) is untouched, so the front
 * cannot be broken by this. Auth is a Bearer token in the Authorization header (never a
 * cookie), so `Access-Control-Allow-Origin: *` WITHOUT credentials is safe: a browser-based
 * partner app can read the public API cross-origin, but no ambient credentials are exposed.
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function middleware(req: NextRequest): NextResponse {
  // Preflight — answer before the route runs.
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
  const res = NextResponse.next();
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}

export const config = {
  matcher: ['/api/public/:path*'],
};
