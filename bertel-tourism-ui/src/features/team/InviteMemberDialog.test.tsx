import { fireEvent, render, screen, within } from '@testing-library/react';
import { inviteUser, upsertMembership } from '@/services/rbac';
import { InviteMemberDialog } from './InviteMemberDialog';

jest.mock('@/services/rbac', () => ({
  inviteUser: jest.fn(),
  upsertMembership: jest.fn(),
}));

it('sends the selected organization and role without a second membership write', async () => {
  jest.mocked(inviteUser).mockResolvedValue({ userId: 'u1', membershipId: 'm1', alreadyExisted: false });
  const onDone = jest.fn();
  render(<InviteMemberDialog orgId="ORG1" onDone={onDone} />);
  fireEvent.click(screen.getByRole('button', { name: 'Inviter' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Inviter des membres' }));
  fireEvent.change(dialog.getByLabelText(/^Adresses e-mail/), { target: { value: 'membre@example.test' } });
  fireEvent.change(dialog.getByLabelText(/^Rôle métier/), { target: { value: 'editor' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Inviter' }));

  expect(await dialog.findByText('Invitation envoyée')).toBeInTheDocument();
  expect(inviteUser).toHaveBeenCalledTimes(1);
  expect(inviteUser).toHaveBeenCalledWith({
    email: 'membre@example.test', orgObjectId: 'ORG1', businessRoleCode: 'editor', resend: false,
  });
  expect(upsertMembership).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledTimes(1);
});
