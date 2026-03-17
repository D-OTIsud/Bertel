import { isDemoOnlyModule } from './features';

describe('isDemoOnlyModule', () => {
  it('flags demo-only routes', () => {
    expect(isDemoOnlyModule('/crm')).toBe(true);
    expect(isDemoOnlyModule('/moderation')).toBe(true);
  });

  it('keeps core routes available', () => {
    expect(isDemoOnlyModule('/explorer')).toBe(false);
    expect(isDemoOnlyModule('/dashboard')).toBe(false);
  });
});