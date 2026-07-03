import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateOrgDialog } from './CreateOrgDialog';

jest.mock('@/services/orgs', () => ({ createOrg: jest.fn(), friendlyOrgError: (e: { message?: string }) => e?.message ?? '' }));
jest.mock('@/services/rbac', () => ({
  inviteUser: jest.fn(), upsertMembership: jest.fn(), setAdminRole: jest.fn(), grantUserPermission: jest.fn(),
  friendlyRbacError: (e: { message?: string }) => e?.message ?? '',
}));
jest.mock('@/features/team/permission-presets', () => ({
  BUSINESS_ROLE_CODES: ['contributor', 'editor'],
  businessRoleLabel: (c: string) => c,
  presetPermissionsFor: () => ['edit_org_enrichment'],
}));
import { createOrg } from '@/services/orgs';
import { inviteUser, upsertMembership, setAdminRole } from '@/services/rbac';

beforeEach(() => {
  jest.clearAllMocks();
  (createOrg as jest.Mock).mockResolvedValue('ORGNEW');
  (inviteUser as jest.Mock).mockResolvedValue({ userId: 'u9', alreadyExisted: false });
  (upsertMembership as jest.Mock).mockResolvedValue('m9');
  (setAdminRole as jest.Mock).mockResolvedValue(undefined);
});

test('étape 1 : « Créer » désactivé tant que le nom est vide', () => {
  render(<CreateOrgDialog onDone={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /nouvelle organisation/i }));
  expect(screen.getByRole('button', { name: /créer l.organisation/i })).toBeDisabled();
});

test('crée l’ORG puis invite le premier admin dans l’ordre', async () => {
  const onDone = jest.fn();
  render(<CreateOrgDialog onDone={onDone} />);
  fireEvent.click(screen.getByRole('button', { name: /nouvelle organisation/i }));
  fireEvent.change(screen.getByLabelText(/nom de l.organisation/i), { target: { value: 'OTI Ouest' } });
  fireEvent.click(screen.getByRole('button', { name: /créer l.organisation/i }));
  await waitFor(() => expect(createOrg).toHaveBeenCalledWith({ name: 'OTI Ouest', regionCode: 'RUN', accessScope: 'own_objects_only' }));
  // étape 2
  fireEvent.change(await screen.findByLabelText(/adresse e.mail/i), { target: { value: 'chef@oti.re' } });
  fireEvent.click(screen.getByRole('button', { name: /inviter comme premier admin/i }));
  await waitFor(() => expect(inviteUser).toHaveBeenCalled());
  await waitFor(() => expect(upsertMembership).toHaveBeenCalledWith('u9', 'ORGNEW', expect.any(String)));
  await waitFor(() => expect(setAdminRole).toHaveBeenCalledWith('m9', 'org_admin'));
});

test('« Inviter plus tard » ferme sans invitation', async () => {
  const onDone = jest.fn();
  render(<CreateOrgDialog onDone={onDone} />);
  fireEvent.click(screen.getByRole('button', { name: /nouvelle organisation/i }));
  fireEvent.change(screen.getByLabelText(/nom de l.organisation/i), { target: { value: 'OTI X' } });
  fireEvent.click(screen.getByRole('button', { name: /créer l.organisation/i }));
  fireEvent.click(await screen.findByRole('button', { name: /inviter plus tard/i }));
  await waitFor(() => expect(inviteUser).not.toHaveBeenCalled());
  expect(onDone).toHaveBeenCalled();
});
