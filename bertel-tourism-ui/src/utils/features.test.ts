import { isDemoOnlyModule } from './features';

describe('isDemoOnlyModule', () => {
  it('flags demo-only routes', () => {
    expect(isDemoOnlyModule('/moderation')).toBe(true);
    expect(isDemoOnlyModule('/audits')).toBe(true);
    expect(isDemoOnlyModule('/publications')).toBe(true);
  });

  it('keeps core routes available', () => {
    expect(isDemoOnlyModule('/explorer')).toBe(false);
    expect(isDemoOnlyModule('/dashboard')).toBe(false);
  });

  it('le CRM est branche sur ses RPC reels (§58) — plus demo-only', () => {
    expect(isDemoOnlyModule('/crm')).toBe(false);
  });
});
