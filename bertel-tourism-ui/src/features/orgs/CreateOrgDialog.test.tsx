import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateOrgDialog } from './CreateOrgDialog';
import { toast } from 'sonner';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
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
  (inviteUser as jest.Mock).mockResolvedValue({ userId: 'u9', membershipId: 'm9', alreadyExisted: false });
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
  fireEvent.change(screen.getByLabelText(/^Rôle métier/), { target: { value: 'editor' } });
  fireEvent.click(screen.getByRole('button', { name: /inviter comme premier admin/i }));
  await waitFor(() => expect(inviteUser).toHaveBeenCalledWith({
    email: 'chef@oti.re', orgObjectId: 'ORGNEW', businessRoleCode: 'editor',
  }));
  await waitFor(() => expect(setAdminRole).toHaveBeenCalledWith('m9', 'org_admin'));
  expect(upsertMembership).not.toHaveBeenCalled();
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

const recipient = 'chef@example.invalid';
const pending = { userId: 'u9', membershipId: 'm9', alreadyExisted: true, neverSignedIn: true };
const sentMessage = expect.stringContaining('Invitation envoyée');

async function fillAdminForm(address = recipient) {
  fireEvent.click(await screen.findByRole('button', { name: /nouvelle organisation/i }));
  fireEvent.change(screen.getByLabelText(/nom de l.organisation/i), { target: { value: 'OTI Ouest' } });
  fireEvent.click(screen.getByRole('button', { name: /créer l.organisation/i }));
  fireEvent.change(await screen.findByLabelText(/adresse e.mail/i), { target: { value: address } });
}

function submitInvite() {
  fireEvent.click(screen.getByRole('button', { name: /inviter comme premier admin/i }));
}

test('requires a pending receipt and another click before retrying delivery', async () => {
  jest.mocked(inviteUser)
    .mockRejectedValueOnce(new Error('resend_failed'))
    .mockResolvedValueOnce(pending)
    .mockRejectedValueOnce(new Error('resend_failed'));
  const onDone = jest.fn();
  render(<CreateOrgDialog onDone={onDone} />);
  await fillAdminForm();

  const input = { email: recipient, orgObjectId: 'ORGNEW', businessRoleCode: 'contributor' };
  const firstSubmit = screen.getByRole('button', { name: /inviter comme premier admin/i });
  fireEvent.click(firstSubmit);
  expect(firstSubmit).toBeDisabled();
  fireEvent.click(firstSubmit);
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('resend_failed'));
  expect(inviteUser).toHaveBeenCalledTimes(1);

  submitInvite();
  await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith(expect.stringContaining('invitation est en attente')));
  expect(inviteUser).toHaveBeenNthCalledWith(1, input);
  expect(inviteUser).toHaveBeenNthCalledWith(2, input);
  expect(inviteUser).toHaveBeenCalledTimes(2);
  expect(setAdminRole).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalledWith(sentMessage);
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText(/adresse e.mail/i)).toHaveValue(recipient);

  submitInvite();
  await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith('resend_failed'));
  expect(inviteUser).toHaveBeenNthCalledWith(3, { ...input, resend: true });
  expect(setAdminRole).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalledWith(sentMessage);

  submitInvite();
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith(sentMessage));
  expect(inviteUser).toHaveBeenNthCalledWith(4, { ...input, resend: true });
  expect(inviteUser).toHaveBeenCalledTimes(4);
  expect(setAdminRole).toHaveBeenCalledTimes(1);
  expect(setAdminRole).toHaveBeenCalledWith('m9', 'org_admin');
  expect(onDone).toHaveBeenCalledTimes(2);
});

test('rechecks the membership on the next click when the recipient becomes active', async () => {
  jest.mocked(inviteUser)
    .mockResolvedValueOnce(pending)
    .mockRejectedValueOnce(Object.assign(new Error('Ce compte est déjà actif.'), { code: 'already_active' }))
    .mockResolvedValueOnce({ ...pending, neverSignedIn: false });
  render(<CreateOrgDialog onDone={jest.fn()} />);
  await fillAdminForm();

  const input = { email: recipient, orgObjectId: 'ORGNEW', businessRoleCode: 'contributor' };
  submitInvite();
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('invitation est en attente')));
  submitInvite();
  await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith('Ce compte est déjà actif.'));
  expect(inviteUser).toHaveBeenNthCalledWith(2, { ...input, resend: true });
  expect(inviteUser).toHaveBeenCalledTimes(2);
  expect(setAdminRole).not.toHaveBeenCalled();

  submitInvite();
  await waitFor(() => expect(setAdminRole).toHaveBeenCalledWith('m9', 'org_admin'));
  expect(inviteUser).toHaveBeenNthCalledWith(3, input);
  expect(toast.success).not.toHaveBeenCalledWith(sentMessage);
});

test.each(['address', 'organization'])('discards a pending receipt when the %s changes', async (changed) => {
  jest.mocked(inviteUser).mockResolvedValueOnce(pending);
  render(<CreateOrgDialog onDone={jest.fn()} />);
  await fillAdminForm();
  submitInvite();
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('invitation est en attente')));

  if (changed === 'address') {
    const field = screen.getByLabelText(/adresse e.mail/i);
    fireEvent.change(field, { target: { value: 'other@example.invalid' } });
    fireEvent.change(field, { target: { value: recipient } });
  } else {
    fireEvent.click(screen.getByRole('button', { name: /inviter plus tard/i }));
    jest.mocked(createOrg).mockResolvedValueOnce('ORGOTHER');
    await fillAdminForm();
  }
  expect(inviteUser).toHaveBeenCalledTimes(1);
  submitInvite();
  await waitFor(() => expect(inviteUser).toHaveBeenCalledTimes(2));
  expect(inviteUser).toHaveBeenNthCalledWith(2, {
    email: recipient, orgObjectId: changed === 'organization' ? 'ORGOTHER' : 'ORGNEW', businessRoleCode: 'contributor',
  });
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith(sentMessage));
});

test('assigns the admin role to an existing active member without announcing an email', async () => {
  jest.mocked(inviteUser).mockResolvedValueOnce({ ...pending, neverSignedIn: false });
  render(<CreateOrgDialog onDone={jest.fn()} />);
  await fillAdminForm();
  submitInvite();
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Le rôle de premier administrateur a été attribué')));
  expect(toast.success).not.toHaveBeenCalledWith(sentMessage);
  expect(inviteUser).toHaveBeenCalledTimes(1);
  expect(setAdminRole).toHaveBeenCalledWith('m9', 'org_admin');
});

test('retries only the admin grant once delivery was acknowledged', async () => {
  jest.mocked(setAdminRole).mockRejectedValueOnce(new Error('assignment failed'));
  render(<CreateOrgDialog onDone={jest.fn()} />);
  await fillAdminForm();
  submitInvite();
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('assignment failed'));
  expect(toast.success).not.toHaveBeenCalledWith(sentMessage);

  submitInvite();
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith(sentMessage));
  expect(inviteUser).toHaveBeenCalledTimes(1);
  expect(setAdminRole).toHaveBeenCalledTimes(2);
  expect(setAdminRole).toHaveBeenLastCalledWith('m9', 'org_admin');
});
