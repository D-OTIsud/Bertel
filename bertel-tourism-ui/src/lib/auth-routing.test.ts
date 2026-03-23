import { getDefaultAppPath, getLoginPath, getPostLoginPath, isSafeInternalPath } from './auth-routing';

describe('auth routing', () => {
  it('defaults tourism users to the explorer', () => {
    expect(getDefaultAppPath(null)).toBe('/explorer');
    expect(getDefaultAppPath('tourism_agent')).toBe('/explorer');
    expect(getDefaultAppPath('super_admin')).toBe('/explorer');
  });

  it('keeps owners on the dashboard', () => {
    expect(getDefaultAppPath('owner')).toBe('/dashboard');
  });

  it('builds the login redirect only for safe internal paths', () => {
    expect(getLoginPath('/explorer')).toBe('/login?from=%2Fexplorer');
    expect(getLoginPath('https://example.com')).toBe('/login');
    expect(getLoginPath('//example.com')).toBe('/login');
  });

  it('returns to a safe internal path after login', () => {
    expect(getPostLoginPath('tourism_agent', '/crm')).toBe('/crm');
    expect(getPostLoginPath('owner', '/explorer')).toBe('/explorer');
  });

  it('falls back to the default route when the return path is unsafe', () => {
    expect(getPostLoginPath('tourism_agent', 'https://example.com')).toBe('/explorer');
    expect(getPostLoginPath('owner', '//example.com')).toBe('/dashboard');
  });

  it('recognizes safe internal paths', () => {
    expect(isSafeInternalPath('/explorer')).toBe(true);
    expect(isSafeInternalPath('explorer')).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
  });
});
