import type { NextConfig } from 'next';

// Audit API R2 — security response headers (defense in depth). Verified safe against the front's
// actual usage: no navigator.geolocation / getUserMedia / iframe in src, so Permissions-Policy and
// X-Frame-Options break nothing. CSP is intentionally NOT here — it needs a separate, app-verified
// pass (connect-src must include Supabase + wss, and must not break Mapbox tiles / Storage).
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: [],
  productionBrowserSourceMaps: false,
  experimental: {
    serverSourceMaps: false,
    webpackMemoryOptimizations: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
