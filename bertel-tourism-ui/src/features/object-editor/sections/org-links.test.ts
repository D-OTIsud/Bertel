import { addOrgLink, removeOrgLink, setOrgRole, setPrimaryOrgLink, updateOrgLink } from './org-links';
import type { ObjectWorkspaceOrganizationLinkItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';

const ROLES: WorkspaceReferenceOption[] = [
  { id: 'r-pub', code: 'publisher', label: 'Éditeur (publisher)' },
  { id: 'r-con', code: 'contributor', label: 'Contributeur' },
];

const base = (): ObjectWorkspaceOrganizationLinkItem[] => [
  { id: 'ORG1', source: 'org_link', type: 'ORG', name: 'OTI du Sud', status: '', roleId: 'r-pub', roleCode: 'publisher', roleLabel: 'Éditeur (publisher)', isPrimary: true, note: '', contacts: [] },
];

describe('org-links', () => {
  it('adds a picked org defaulting to publisher; primary only when first', () => {
    const out = addOrgLink([], { id: 'ORG1', name: 'OTI du Sud' }, ROLES);
    expect(out).toHaveLength(1);
    expect(out[0].roleCode).toBe('publisher');
    expect(out[0].isPrimary).toBe(true);
    expect(out[0].source).toBe('org_link');
  });

  it('does not duplicate the same org+role', () => {
    const out = addOrgLink(base(), { id: 'ORG1', name: 'OTI du Sud' }, ROLES);
    expect(out).toHaveLength(1);
  });

  it('returns input unchanged when no role catalog', () => {
    expect(addOrgLink([], { id: 'ORG1', name: 'X' }, [])).toEqual([]);
  });

  it('setOrgRole rewrites id/code/label from the catalog', () => {
    const out = setOrgRole(base(), 0, 'contributor', ROLES);
    expect(out[0]).toMatchObject({ roleCode: 'contributor', roleId: 'r-con', roleLabel: 'Contributeur' });
  });

  it('setPrimaryOrgLink keeps exactly one primary (uq_object_primary_org)', () => {
    const two = addOrgLink(base(), { id: 'ORG2', name: 'OTI Nord' }, ROLES);
    const out = setPrimaryOrgLink(two, 1);
    expect(out.map((l) => l.isPrimary)).toEqual([false, true]);
  });

  it('updateOrgLink patches a single row; removeOrgLink drops it', () => {
    expect(updateOrgLink(base(), 0, { note: 'hi' })[0].note).toBe('hi');
    expect(removeOrgLink(base(), 0)).toHaveLength(0);
  });
});
