import { useSessionStore } from './session-store';

describe('session active org', () => {
  it('stores orgId/orgName from hydrateFromAuth', () => {
    useSessionStore.getState().hydrateFromAuth({
      role: 'tourism_agent', userId: 'u1', email: 'a@b.c', userName: 'A', avatar: 'A',
      langPrefs: ['fr'], canEditObjects: true, canCreateObjects: false, orgId: 'ORG-OTI', orgName: 'OTI du Sud',
      adminRank: null, adminRoleCode: null,
    });
    expect(useSessionStore.getState().orgId).toBe('ORG-OTI');
    expect(useSessionStore.getState().orgName).toBe('OTI du Sud');
    expect(useSessionStore.getState().canCreateObjects).toBe(false);
  });
});
