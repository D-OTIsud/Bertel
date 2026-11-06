import 'server-only';

/** Trusted deployment configuration only. Request Origin/Host/Forwarded never participate. */
export function getCanonicalAppOrigin(): string | null {
  // Read runtime configuration instead of freezing NEXT_PUBLIC_APP_URL at build.
  const env = process.env;
  const configured = (env.NEXT_PUBLIC_APP_URL ?? '').trim();
  if (!configured || /[\u0000-\u0020\u007f\\]/.test(configured)) return null;
  try {
    const url = new URL(configured);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    const developmentLoopback = env.NODE_ENV !== 'production' && url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !developmentLoopback) return null;
    return url.origin;
  } catch {
    return null;
  }
}
