import {
  createContactDraft,
  createWebChannelDraft,
  reconcileContactPrimary,
} from './contacts-edit';
import type { ObjectWorkspaceContactItem } from '../../../services/object-workspace-parser';

const KINDS = [
  { id: 'k1', code: 'phone', label: 'Téléphone' },
  { id: 'k2', code: 'email', label: 'E-mail' },
];

function contact(over: Partial<ObjectWorkspaceContactItem> = {}): ObjectWorkspaceContactItem {
  return {
    id: 'c1',
    kindId: 'k1',
    kindCode: 'phone',
    kindLabel: 'Téléphone',
    roleId: '',
    roleCode: '',
    roleLabel: '',
    value: '+262 000',
    isPublic: true,
    isPrimary: false,
    position: '0',
    ...over,
  };
}

describe('createContactDraft', () => {
  it('seeds the first available kind and a blank value', () => {
    const draft = createContactDraft(KINDS, false);
    expect(draft.kindCode).toBe('phone');
    expect(draft.kindId).toBe('k1');
    expect(draft.kindLabel).toBe('Téléphone');
    expect(draft.value).toBe('');
    expect(draft.isPublic).toBe(true);
    expect(draft.id).toMatch(/^draft-contact-/);
  });

  it('marks the very first channel of an object as primary', () => {
    expect(createContactDraft(KINDS, true).isPrimary).toBe(true);
    expect(createContactDraft(KINDS, false).isPrimary).toBe(false);
  });

  it('falls back to a phone default when no kinds are available', () => {
    const draft = createContactDraft([], false);
    expect(draft.kindCode).toBe('phone');
    expect(draft.kindId).toBe('');
  });
});

describe('createWebChannelDraft', () => {
  it('seeds the first available web kind and defaults to the social domain', () => {
    const draft = createWebChannelDraft([{ id: 'w1', code: 'facebook', label: 'Facebook' }]);
    expect(draft.kindCode).toBe('facebook');
    expect(draft.kindDomain).toBe('social_network');
    expect(draft.value).toBe('');
    expect(draft.isPublic).toBe(true);
    expect(draft.id).toMatch(/^draft-web-/);
  });

  it('falls back gracefully when no web kinds are available', () => {
    const draft = createWebChannelDraft([]);
    expect(draft.kindCode).toBe('');
    expect(draft.kindDomain).toBe('social_network');
  });
});

describe('reconcileContactPrimary', () => {
  it('clears the primary flag on other rows of the same kind', () => {
    const items = [
      contact({ id: 'c1', kindCode: 'phone', isPrimary: true }),
      contact({ id: 'c2', kindCode: 'phone', isPrimary: true }),
    ];
    const next = reconcileContactPrimary(items, 'c1');
    expect(next.find((i) => i.id === 'c1')?.isPrimary).toBe(true);
    expect(next.find((i) => i.id === 'c2')?.isPrimary).toBe(false);
  });

  it('leaves a primary of a different kind untouched (per-kind isolation)', () => {
    const items = [
      contact({ id: 'c1', kindCode: 'phone', isPrimary: true }),
      contact({ id: 'c2', kindCode: 'email', isPrimary: true }),
    ];
    const next = reconcileContactPrimary(items, 'c1');
    expect(next.find((i) => i.id === 'c2')?.isPrimary).toBe(true);
  });

  it('is a no-op when the target row is not primary', () => {
    const items = [
      contact({ id: 'c1', kindCode: 'phone', isPrimary: false }),
      contact({ id: 'c2', kindCode: 'phone', isPrimary: true }),
    ];
    expect(reconcileContactPrimary(items, 'c1')).toBe(items);
  });

  it('compares kinds case-insensitively (matches the saver normalisation)', () => {
    const items = [
      contact({ id: 'c1', kindCode: 'Phone', isPrimary: true }),
      contact({ id: 'c2', kindCode: 'phone', isPrimary: true }),
    ];
    const next = reconcileContactPrimary(items, 'c1');
    expect(next.find((i) => i.id === 'c2')?.isPrimary).toBe(false);
  });
});
