import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import * as rbac from '@/services/rbac';
import { useSessionStore } from '@/store/session-store';
import TeamAdminPage from './TeamAdminPage';

jest.mock('@/services/rbac');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() } }));

const hiddenCodes = ['edit_hours', 'edit_pricing', 'edit_gallery', 'attach_documents'];
const member: rbac.OrgMember = {
  membershipId: 'membership-1', userId: 'other', email: null, displayName: 'Membre test',
  isActive: true, businessRoleCode: 'editor', adminRoleCode: null, permissionCodes: [],
  lastSeenAt: null, rolePermissionCodes: [], isPlatformSuperuser: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ role: 'tourism_agent', adminRank: 20, orgId: 'ORG-TEST', userId: 'caller' });
  jest.mocked(rbac.listBusinessRoles).mockResolvedValue([
    { code: 'editor', name: 'Éditeur', rank: null, position: 1 },
    { code: 'viewer', name: 'Lecteur', rank: null, position: 2 },
  ]);
  jest.mocked(rbac.listAdminRoles).mockResolvedValue([]);
  jest.mocked(rbac.listPermissionCatalog).mockResolvedValue([]);
  jest.mocked(rbac.listRolePermissions).mockResolvedValue({ viewer: [] });
  jest.mocked(rbac.setBusinessRole).mockResolvedValue(undefined);
});

it.each([
  ['avec un droit visible', ['publish_object'], ' À révoquer dans « Permissions » : publish_object.'],
  ['avec seulement des droits masqués', [], ''],
])('avertit des exceptions %s et n’indique que les cases visibles', async (_label, visible, advice) => {
  const permissionCodes = [...hiddenCodes, ...visible];
  jest.mocked(rbac.listOrgMembers).mockResolvedValue([{ ...member, permissionCodes }]);
  render(<TeamAdminPage />);

  const role = await screen.findByRole('combobox', { name: 'Rôle métier de Membre test' });
  await screen.findByRole('option', { name: 'Lecteur' });
  fireEvent.change(role, { target: { value: 'viewer' } });

  await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(
    'Membre test conserve ' + permissionCodes.length + ' droits au-delà du rôle Lecteur.',
    { duration: Infinity, description: 'Accordés en exception individuelle, ils ne sont PAS retirés par le changement de rôle.' + advice },
  ));
  expect(rbac.setBusinessRole).toHaveBeenCalledTimes(1);
  expect(rbac.setBusinessRole).toHaveBeenCalledWith(member.membershipId, 'viewer');
});
