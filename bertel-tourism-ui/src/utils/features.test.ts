import { isDemoOnlyModule } from './features';

describe('isDemoOnlyModule', () => {
  it('flags demo-only routes', () => {
    expect(isDemoOnlyModule('/audits')).toBe(true);
    expect(isDemoOnlyModule('/publications')).toBe(true);
  });

  it('keeps core routes available', () => {
    expect(isDemoOnlyModule('/explorer')).toBe(false);
    expect(isDemoOnlyModule('/dashboard')).toBe(false);
  });

  it('le CRM est branche sur ses RPC reels (§61) — plus demo-only', () => {
    expect(isDemoOnlyModule('/crm')).toBe(false);
  });

  it('la modération est branchée sur ses RPC réels (§120) — plus demo-only (D5)', () => {
    expect(isDemoOnlyModule('/moderation')).toBe(false);
  });
});
