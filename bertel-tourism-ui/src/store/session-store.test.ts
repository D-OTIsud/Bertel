import { useSessionStore } from './session-store';

describe('session active org', () => {
  it('stores orgId/orgName from hydrateFromAuth', () => {
    useSessionStore.getState().hydrateFromAuth({
      role: 'tourism_agent', userId: 'u1', email: 'a@b.c', userName: 'A', avatar: 'A', avatarUrl: null,
      langPrefs: ['fr'], canEditObjects: true, canCreateObjects: false, orgId: 'ORG-OTI', orgName: 'OTI du Sud',
      adminRank: null, adminRoleCode: null,
    });
    expect(useSessionStore.getState().orgId).toBe('ORG-OTI');
    expect(useSessionStore.getState().orgName).toBe('OTI du Sud');
    expect(useSessionStore.getState().canCreateObjects).toBe(false);
  });

  it('applyProfile updates name + recomputes initials + sets avatarUrl', () => {
    useSessionStore.getState().applyProfile({ userName: 'David Philippe', avatarUrl: 'https://cdn/x.jpg?v=1' });
    expect(useSessionStore.getState().userName).toBe('David Philippe');
    expect(useSessionStore.getState().avatar).toBe('DP');
    expect(useSessionStore.getState().avatarUrl).toBe('https://cdn/x.jpg?v=1');
  });

  it('applyProfile leaves avatarUrl untouched when the key is omitted', () => {
    useSessionStore.getState().applyProfile({ avatarUrl: 'https://cdn/y.jpg' });
    useSessionStore.getState().applyProfile({ userName: 'Marie Dupont' });
    expect(useSessionStore.getState().avatarUrl).toBe('https://cdn/y.jpg');
    expect(useSessionStore.getState().avatar).toBe('MD');
  });
});
