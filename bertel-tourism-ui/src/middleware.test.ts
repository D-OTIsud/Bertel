/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { middleware, config } from './middleware';

function req(method: string) {
  return new NextRequest('http://localhost/api/public/objects', { method });
}

describe('CORS middleware (public API only)', () => {
  it('is strictly scoped to /api/public/* so the internal front is untouched', () => {
    expect(config.matcher).toEqual(['/api/public/:path*']);
  });

  it('answers an OPTIONS preflight with 204 + CORS headers', () => {
    const res = middleware(req('OPTIONS'));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('adds CORS headers to a GET response WITHOUT credentials (token-in-header, not cookies)', () => {
    const res = middleware(req('GET'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});
