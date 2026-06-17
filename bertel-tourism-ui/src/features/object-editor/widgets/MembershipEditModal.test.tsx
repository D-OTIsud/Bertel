import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MembershipEditModal } from './MembershipEditModal';
import type { ObjectWorkspaceMembershipModule } from '../../../services/object-workspace-parser';

jest.mock('../../../services/object-workspace', () => ({
  createMembershipCampaign: jest.fn(async (_o: string, name: string) => ({ id: 'new-c', code: 'charte_x', label: name })),
  createMembershipTier: jest.fn(async (_o: string, name: string) => ({ id: 'new-t', code: 'charte_t', label: name })),
}));

const mod = (): ObjectWorkspaceMembershipModule => ({
  campaignOptions: [{ id: 'c1', code: 'adhesion_2026', label: 'Adhésion 2026' }],
  tierOptions: [{ id: 't1', code: 'membre', label: 'Membre' }],
  scopeOptions: [{ orgObjectId: 'ORG1', label: 'OTI du Sud', isPrimary: true }],
  items: [],
  unavailableReason: null,
});

describe('MembershipEditModal', () => {
  it('creates a new adhésion (add mode) and calls onSave', () => {
    const onSave = jest.fn();
    render(<MembershipEditModal open mode="add" objectId="o1" module={mod()} item={null} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ campaignCode: 'adhesion_2026', tierCode: 'membre', orgObjectId: 'ORG1' });
  });

  it('creates a campaign on the go and selects it', async () => {
    const onCreateOption = jest.fn();
    render(<MembershipEditModal open mode="add" objectId="o1" module={mod()} item={null} onSave={() => {}} onClose={() => {}} onCreateOption={onCreateOption} />);
    fireEvent.change(screen.getByLabelText(/Campagne — rechercher ou créer/i), { target: { value: 'Charte écolo' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer « Charte écolo »/i }));
    await waitFor(() => expect(onCreateOption).toHaveBeenCalledWith('campaign', { id: 'new-c', code: 'charte_x', label: 'Charte écolo' }));
  });
});
