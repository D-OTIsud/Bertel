import {
  actorVisibilityLabel,
  addActorLink,
  commitActorEdit,
  removeActorLink,
  setActorRole,
  setPrimaryActorLink,
  updateActorLink,
} from './actor-links';
import type { ObjectWorkspaceActorLinkItem } from '../../../services/object-workspace-parser';
import type { ActorSearchResult } from '../../../services/object-workspace';

const ROLE_OPTIONS = [
  { id: 'r-op', code: 'operator', label: 'Exploitant' },
  { id: 'r-guide', code: 'guide', label: 'Guide' },
];

function actor(partial: Partial<ObjectWorkspaceActorLinkItem> & { id: string }): ObjectWorkspaceActorLinkItem {
  return {
    displayName: partial.id,
    firstName: '',
    lastName: '',
    gender: '',
    roleId: 'r-op',
    roleCode: 'operator',
    roleLabel: 'Exploitant',
    visibility: 'public',
    isPrimary: false,
    validFrom: '',
    validTo: '',
    note: '',
    contacts: [],
    ...partial,
  };
}

const picked: ActorSearchResult = {
  id: 'a-new',
  displayName: 'Nouvelle SARL',
  firstName: 'Jean',
  lastName: 'Payet',
  gender: '',
  email: '',
};

describe('addActorLink', () => {
  test('appends a new operator link, primary when the role has no primary yet', () => {
    const next = addActorLink([], picked, ROLE_OPTIONS);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: 'a-new', roleCode: 'operator', roleId: 'r-op', isPrimary: true, visibility: 'public' });
  });

  test('does not become primary when the role already has a primary', () => {
    const existing = [actor({ id: 'a1', isPrimary: true })];
    const next = addActorLink(existing, picked, ROLE_OPTIONS);
    expect(next[1].isPrimary).toBe(false);
  });

  test('is a no-op when the same actor is already linked in the default role', () => {
    const existing = [actor({ id: 'a-new', roleCode: 'operator' })];
    expect(addActorLink(existing, picked, ROLE_OPTIONS)).toBe(existing);
  });

  test('does not fabricate a row when no role catalog is available', () => {
    expect(addActorLink([], picked, [])).toEqual([]);
  });
});

describe('setPrimaryActorLink', () => {
  test('sets primary within the same role and clears same-role siblings', () => {
    const actors = [
      actor({ id: 'a1', roleCode: 'operator', isPrimary: true }),
      actor({ id: 'a2', roleCode: 'operator', isPrimary: false }),
      actor({ id: 'a3', roleCode: 'guide', roleId: 'r-guide', isPrimary: true }),
    ];
    const next = setPrimaryActorLink(actors, 1);
    expect(next[0].isPrimary).toBe(false);
    expect(next[1].isPrimary).toBe(true);
    expect(next[2].isPrimary).toBe(true); // a different role keeps its own primary
  });
});

describe('setActorRole', () => {
  test('rewrites role id/code/label from the catalog', () => {
    const actors = [actor({ id: 'a1' })];
    const next = setActorRole(actors, 0, 'guide', ROLE_OPTIONS);
    expect(next[0]).toMatchObject({ roleCode: 'guide', roleId: 'r-guide', roleLabel: 'Guide' });
  });
});

describe('updateActorLink / removeActorLink', () => {
  test('updateActorLink patches a single row', () => {
    const actors = [actor({ id: 'a1' }), actor({ id: 'a2' })];
    const next = updateActorLink(actors, 1, { note: 'Référent terrain', visibility: 'private' });
    expect(next[1]).toMatchObject({ note: 'Référent terrain', visibility: 'private' });
    expect(next[0].note).toBe('');
  });

  test('removeActorLink drops the row at the index', () => {
    const actors = [actor({ id: 'a1' }), actor({ id: 'a2' })];
    expect(removeActorLink(actors, 0).map((item) => item.id)).toEqual(['a2']);
  });
});

describe('commitActorEdit', () => {
  test('replaces the edited row in place', () => {
    const actors = [actor({ id: 'a1' }), actor({ id: 'a2' })];
    const patched = { ...actors[1], note: 'Référent', visibility: 'private' };
    const next = commitActorEdit(actors, 1, patched);
    expect(next[1]).toMatchObject({ id: 'a2', note: 'Référent', visibility: 'private' });
    expect(next[0]).toBe(actors[0]);
  });

  test('clears the primary flag on same-role siblings when the edited row becomes primary', () => {
    const actors = [
      actor({ id: 'a1', roleCode: 'operator', isPrimary: true }),
      actor({ id: 'a2', roleCode: 'operator', isPrimary: false }),
      actor({ id: 'a3', roleCode: 'guide', roleId: 'r-guide', isPrimary: true }),
    ];
    const next = commitActorEdit(actors, 1, { ...actors[1], isPrimary: true });
    expect(next[0].isPrimary).toBe(false);
    expect(next[1].isPrimary).toBe(true);
    expect(next[2].isPrimary).toBe(true); // other role keeps its primary
  });

  test('does not touch siblings when the edited row is not primary', () => {
    const actors = [
      actor({ id: 'a1', roleCode: 'operator', isPrimary: true }),
      actor({ id: 'a2', roleCode: 'operator', isPrimary: false }),
    ];
    const next = commitActorEdit(actors, 1, { ...actors[1], note: 'x' });
    expect(next[0].isPrimary).toBe(true);
  });
});

describe('actorVisibilityLabel', () => {
  test('maps the visibility code to its French label, falls back to the raw value', () => {
    expect(actorVisibilityLabel('public')).toBe('Public');
    expect(actorVisibilityLabel('private')).toBe('Interne');
    expect(actorVisibilityLabel('partners')).toBe('Partenaires');
    expect(actorVisibilityLabel('weird')).toBe('weird');
  });
});
