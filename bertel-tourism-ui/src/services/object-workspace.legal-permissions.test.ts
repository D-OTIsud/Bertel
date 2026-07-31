import { canManageObjectLegalDirect } from './object-workspace';

describe('canManageObjectLegalDirect', () => {
  it('opens the legal editor for a regular user authorized by the object-scoped legal probe', () => {
    expect(canManageObjectLegalDirect({ directWrite: false, legal: true })).toBe(true);
  });

  it('keeps the legal editor closed when neither the dedicated probe nor a global role allows it', () => {
    expect(canManageObjectLegalDirect({ directWrite: false, legal: false })).toBe(false);
  });

  it('preserves owner and platform-superuser access', () => {
    expect(canManageObjectLegalDirect({ directWrite: true, legal: false })).toBe(true);
  });
});
