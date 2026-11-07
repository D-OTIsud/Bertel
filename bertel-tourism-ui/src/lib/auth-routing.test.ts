import { getDefaultAppPath, getLoginPath, getPostLoginPath, isSafeInternalPath } from './auth-routing';

describe('auth routing', () => {
  it.each(['/\\outside.example', '/\t/outside.example', '/\n/outside.example', '/\r/outside.example', '//outside.example'])('rejects an external or ambiguous return %p at both boundaries', (path) => {
    expect(isSafeInternalPath(path)).toBe(false);
    expect(getLoginPath(path)).toBe('/login');
    expect(getPostLoginPath('tourism_agent', path)).toBe('/explorer');
    expect(getPostLoginPath('owner', path)).toBe('/dashboard');
    expect(getPostLoginPath('actor', path)).toBe('/espace');
  });

  it.each(['/explorer?q=grand%20hôtel&sort=name#résultats', '/crm?value=two words#task', '/%09/outside.example'])('preserves an internal URL and its parameters exactly %p', (path) => {
    expect(isSafeInternalPath(path)).toBe(true);
    expect(getPostLoginPath('tourism_agent', path)).toBe(path);
    expect(getLoginPath(path)).toBe(`/login?from=${encodeURIComponent(path)}`);
  });

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

describe('auth-routing — persona actor (portail)', () => {
  it.each(['/espace/../crm', '/espace/%2e%2e/crm', '/espace/./../explorer'])('refuses a portal return that normalizes outside its scope %p', (path) => {
    expect(getPostLoginPath('actor', path)).toBe('/espace');
  });
  it("envoie l'acteur vers /espace par défaut", () => {
    expect(getDefaultAppPath('actor')).toBe('/espace');
  });

  it("n'accepte un ?from= acteur QUE sous /espace (allowlist portail)", () => {
    expect(getPostLoginPath('actor', '/espace/fiches/HOT123')).toBe('/espace/fiches/HOT123');
    expect(getPostLoginPath('actor', '/espace')).toBe('/espace');
    expect(getPostLoginPath('actor', '/espace?fiche=HOT123')).toBe('/espace?fiche=HOT123');
    // Un from back-office ne doit jamais faire atterrir un acteur hors portail.
    expect(getPostLoginPath('actor', '/crm')).toBe('/espace');
    expect(getPostLoginPath('actor', '//evil.example')).toBe('/espace');
    // Frontière de segment : un chemin qui COMMENCE par « /espace » sans y être
    // (« /espaces-verts ») n'est pas le portail — un `startsWith` nu le laisserait passer.
    expect(getPostLoginPath('actor', '/espaces-verts')).toBe('/espace');
    expect(getPostLoginPath('actor', '/espace-public/x')).toBe('/espace');
  });

  it('ne change rien pour les personas historiques', () => {
    expect(getDefaultAppPath('owner')).toBe('/dashboard');
    expect(getDefaultAppPath('tourism_agent')).toBe('/explorer');
    expect(getPostLoginPath('tourism_agent', '/crm')).toBe('/crm');
    // La branche acteur ne doit pas capturer les autres personas : un agent qui
    // revient sur /espace y va (il sera rejeté côté RLS), il n'est pas dérouté.
    expect(getPostLoginPath('tourism_agent', '/espaces-verts')).toBe('/espaces-verts');
  });
});
