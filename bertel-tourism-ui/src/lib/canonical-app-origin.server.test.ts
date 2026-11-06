/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { getCanonicalAppOrigin } from './canonical-app-origin.server';

const originalEnv = process.env;
beforeEach(() => { jest.replaceProperty(process, 'env', { ...originalEnv, NODE_ENV: 'production' }); });
afterEach(() => { jest.restoreAllMocks(); });

test.each([
  undefined, '', 'https://user:password@bertel.example', 'https://bertel.example/path',
  'https://bertel.example/?next=other', 'https://bertel.example/#fragment',
  'javascript:alert(1)', '//bertel.example', 'http://bertel.example', 'http://localhost:3000',
  'https://bertel.example\\outside.example', 'https://bertel.\texample',
])('fails closed for absent or invalid canonical configuration %p', (value) => {
  if (value === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = value;
  expect(getCanonicalAppOrigin()).toBeNull();
});

test('normalizes HTTPS and reads runtime changes on each request', () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://BERTEL.example/';
  expect(getCanonicalAppOrigin()).toBe('https://bertel.example');
  process.env.NEXT_PUBLIC_APP_URL = 'https://preview.example:8443';
  expect(getCanonicalAppOrigin()).toBe('https://preview.example:8443');
});

test('allows explicit HTTP loopback only outside production', () => {
  jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'test', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000' });
  expect(getCanonicalAppOrigin()).toBe('http://127.0.0.1:3000');
  process.env.NEXT_PUBLIC_APP_URL = 'http://outside.example';
  expect(getCanonicalAppOrigin()).toBeNull();
});
