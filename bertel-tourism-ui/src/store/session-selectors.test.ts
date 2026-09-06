import { canAdministerTeam, isPlatformSuperuser } from './session-selectors';

describe('canAdministerTeam', () => {
  it('true for platform owner/super_admin regardless of admin rank', () => {
    expect(canAdministerTeam({ role: 'owner', adminRank: null })).toBe(true);
    expect(canAdministerTeam({ role: 'super_admin', adminRank: null })).toBe(true);
  });
  it('true for tourism_agent with an admin rank >= 10', () => {
    expect(canAdministerTeam({ role: 'tourism_agent', adminRank: 10 })).toBe(true);
    expect(canAdministerTeam({ role: 'tourism_agent', adminRank: 30 })).toBe(true);
  });
  it('false for tourism_agent without an admin role', () => {
    expect(canAdministerTeam({ role: 'tourism_agent', adminRank: null })).toBe(false);
  });
  it('false when role is null', () => {
    expect(canAdministerTeam({ role: null, adminRank: null })).toBe(false);
  });
});

// 17l — la création de listes est réservée au superuser plateforme. Ce sélecteur doit rester
// DISTINCT de `canAdministerTeam` : les confondre rouvrirait le bouton « Nouvelle liste » à des
// org_admins que `api.create_list` refuse en 42501.
describe('isPlatformSuperuser', () => {
  it('accepte owner et super_admin', () => {
    expect(isPlatformSuperuser({ role: 'owner' })).toBe(true);
    expect(isPlatformSuperuser({ role: 'super_admin' })).toBe(true);
  });

  it('refuse un rôle applicatif ordinaire', () => {
    expect(isPlatformSuperuser({ role: 'tourism_agent' })).toBe(false);
    expect(isPlatformSuperuser({ role: null })).toBe(false);
  });

  it('n’est PAS le même prédicat que canAdministerTeam', () => {
    const orgAdmin = { role: 'tourism_agent' as const, adminRank: 30 };
    expect(canAdministerTeam(orgAdmin)).toBe(true);
    expect(isPlatformSuperuser(orgAdmin)).toBe(false);
  });
});
