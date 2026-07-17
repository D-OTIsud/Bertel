import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

// Turbopack refuses to follow a node_modules symlink/junction that points outside
// its configured root. In a git worktree, node_modules is a junction into the main
// checkout (see docs — avoids a full reinstall per worktree), so the root must be
// the common ancestor of cwd (the worktree) AND node_modules' real target (the main
// checkout) — computed dynamically so this works from any checkout/worktree without
// hardcoding a relative depth.
function commonAncestor(a: string, b: string): string {
  const segsA = path.resolve(a).split(path.sep);
  const segsB = path.resolve(b).split(path.sep);
  const shared: string[] = [];
  for (let i = 0; i < Math.min(segsA.length, segsB.length); i += 1) {
    if (segsA[i] !== segsB[i]) break;
    shared.push(segsA[i]);
  }
  return shared.join(path.sep) || path.sep;
}

function resolveTurbopackRoot(): string {
  const cwd = process.cwd();
  try {
    const nodeModulesReal = fs.realpathSync(path.join(cwd, 'node_modules'));
    return commonAncestor(cwd, nodeModulesReal);
  } catch {
    return cwd;
  }
}

// Content-Security-Policy (audit API R2, last tranche). Origins inventoried against the
// front's ACTUAL runtime usage and verified in the running app — see
// `docs/api-audit/2026-07-01-csp-origin-inventory.md`:
//  - script/style: 'unsafe-inline' — Next.js SSR hydration + the `beforeInteractive`
//    runtime-config bootstrap inject inline scripts/styles. 'unsafe-eval' is DEV-ONLY
//    (webpack HMR / React Fast Refresh); it is never shipped to production.
//  - connect-src: Supabase REST + Realtime (https + wss) + Storage downloads, the BAN
//    geocoder (api-adresse.data.gouv.fr), and the MapLibre style/tile/glyph/sprite hosts
//    (fetched via XHR, not <img>). 'self' covers the app's own /api routes; dev adds the
//    HMR websocket (`ws:`).
//  - img-src: Supabase Storage, DuckDuckGo favicons (ContactCard/drawer), Unsplash (demo
//    mode), the tile hosts, plus data:/blob: (upload previews, canvas, inline SVG glyphs).
//  - worker-src 'self' blob: — MapLibre GL spawns its worker from a Blob; 'self' also
//    covers the PDF.js worker served from /pdf.worker.min.mjs.
// The map style hosts are env-overridable (NEXT_PUBLIC_MAP_STYLE_*); the allow-list below
// tracks the shipped defaults. If a deployment repoints the tiles, extend img-src/connect-src.
//
// ponytail: script-src keeps 'unsafe-inline' (ceiling: no per-request nonce). Upgrade path =
// nonce-based CSP via middleware (Next.js propagates the nonce to its own <script> tags) if a
// stricter script policy is ever needed. Deliberately deferred: this tranche is edge hardening,
// and the app's XSS surface is already closed (React auto-escaping, SEC-7 URL-scheme allow-list,
// no dangerouslySetInnerHTML on untrusted input). The strong wins here are connect-src
// (exfiltration lockdown), object-src 'none', base-uri/form-action/frame-ancestors 'self'.
const SUPABASE_HTTPS = 'https://*.supabase.co';
const SUPABASE_WSS = 'wss://*.supabase.co';
const TILE_HOSTS = 'https://demotiles.maplibre.org https://tiles.openfreemap.org';

const cspDirectives: Record<string, string> = {
  'default-src': "'self'",
  'base-uri': "'self'",
  'object-src': "'none'",
  'frame-ancestors': "'self'",
  'form-action': "'self'",
  'script-src': `'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  'style-src': "'self' 'unsafe-inline'",
  'font-src': "'self'",
  'worker-src': "'self' blob:",
  'img-src': `'self' data: blob: ${SUPABASE_HTTPS} https://icons.duckduckgo.com https://images.unsplash.com ${TILE_HOSTS}`,
  'connect-src': `'self' ${SUPABASE_HTTPS} ${SUPABASE_WSS} https://api-adresse.data.gouv.fr ${TILE_HOSTS}${isDev ? ' ws:' : ''}`,
};

const contentSecurityPolicy = Object.entries(cspDirectives)
  .map(([directive, value]) => `${directive} ${value}`)
  .join('; ');

// Audit API R2 — security response headers (defense in depth). Verified safe against the front's
// actual usage: no navigator.geolocation / getUserMedia / iframe in src, so Permissions-Policy and
// X-Frame-Options break nothing.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Enforced after a Report-Only pass verified zero violations in the running app (map tiles,
  // images, fonts, runtime-config all within the allow-list). See the origin-inventory doc.
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: [],
  productionBrowserSourceMaps: false,
  // Pins the workspace root explicitly. Without this, Turbopack's nearest-lockfile
  // inference gets confused by git worktrees (each worktree checks out its own copy
  // of the tracked package-lock.json) combined with a symlinked/junctioned
  // node_modules, and can misdetect the workspace root — which has previously
  // triggered a stray `npm install` that corrupted a worktree's node_modules link.
  // See resolveTurbopackRoot() above for why this must be computed dynamically.
  turbopack: {
    root: resolveTurbopackRoot(),
  },
  experimental: {
    serverSourceMaps: false,
    webpackMemoryOptimizations: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
