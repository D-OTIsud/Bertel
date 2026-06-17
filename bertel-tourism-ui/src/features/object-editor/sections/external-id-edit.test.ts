import {
  EXTERNAL_ID_SOURCE_OPTIONS,
  isCanonicalSourceSystem,
  createExternalIdDraft,
  isExternalIdSaveDisabled,
} from './external-id-edit';

describe('external-id-edit', () => {
  it('offers only non-canonical sources (AT / AP / DT), never OTI or SU', () => {
    const codes = EXTERNAL_ID_SOURCE_OPTIONS.map((o) => o.v);
    expect(codes).toEqual(['AT', 'AP', 'DT']);
    expect(codes).not.toContain('OTI');
    expect(codes).not.toContain('SU');
  });

  it('flags canonical sources case-insensitively and via the *canonical* substring', () => {
    expect(isCanonicalSourceSystem('OTI')).toBe(true);
    expect(isCanonicalSourceSystem('oti')).toBe(true);
    expect(isCanonicalSourceSystem('SU')).toBe(true);
    expect(isCanonicalSourceSystem('su')).toBe(true);
    expect(isCanonicalSourceSystem('my_canonical_feed')).toBe(true);
    expect(isCanonicalSourceSystem('CanonicalThing')).toBe(true);
    expect(isCanonicalSourceSystem('AT')).toBe(false);
    expect(isCanonicalSourceSystem('Apidae')).toBe(false);
    expect(isCanonicalSourceSystem('')).toBe(false);
  });

  it('creates an empty draft with no id and the first source preselected', () => {
    const draft = createExternalIdDraft();
    expect(draft.id).toBe('');
    expect(draft.sourceSystem).toBe('AT');
    expect(draft.externalId).toBe('');
    expect(draft.lastSyncedAt).toBe('');
    expect(draft.organizationObjectId).toBe('');
  });

  it('disables save until both source and identifier are present', () => {
    expect(isExternalIdSaveDisabled(createExternalIdDraft())).toBe(true);
    expect(isExternalIdSaveDisabled({ ...createExternalIdDraft(), externalId: 'recABC' })).toBe(false);
    expect(isExternalIdSaveDisabled({ ...createExternalIdDraft(), externalId: '   ' })).toBe(true);
    expect(isExternalIdSaveDisabled({ ...createExternalIdDraft(), sourceSystem: '', externalId: 'x' })).toBe(true);
  });

  it('disables save for a canonical source even with an identifier (defence in depth)', () => {
    expect(isExternalIdSaveDisabled({ ...createExternalIdDraft(), sourceSystem: 'OTI', externalId: 'x' })).toBe(true);
  });
});
