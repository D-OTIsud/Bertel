import { canAdministerTeam } from './session-selectors';

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
