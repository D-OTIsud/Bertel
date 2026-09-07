import { canAdministerTeam, canCreateLists, isListsAdmin, isPlatformSuperuser } from './session-selectors';

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

// Listes 2026-09-07 règle 1 : remplace l'ancienne garde 17l (superuser-only).
describe('canCreateLists', () => {
  it('vrai pour tout membre connecté ayant une organisation active, lecteur compris', () => {
    expect(canCreateLists({ orgId: 'org-1' })).toBe(true);
  });

  it('faux sans organisation active (invité, session non résolue)', () => {
    expect(canCreateLists({ orgId: null })).toBe(false);
  });
});

describe('isListsAdmin', () => {
  it('vrai pour owner/super_admin quel que soit le rang', () => {
    expect(isListsAdmin({ role: 'owner', adminRank: null })).toBe(true);
    expect(isListsAdmin({ role: 'super_admin', adminRank: null })).toBe(true);
  });

  it('vrai pour un rang d’administration d’ORG >= 30', () => {
    expect(isListsAdmin({ role: 'tourism_agent', adminRank: 30 })).toBe(true);
  });

  it('faux pour un rang insuffisant (team_lead rang 10)', () => {
    expect(isListsAdmin({ role: 'tourism_agent', adminRank: 10 })).toBe(false);
  });

  it('faux sans rôle ni rang', () => {
    expect(isListsAdmin({ role: null, adminRank: null })).toBe(false);
  });
});
