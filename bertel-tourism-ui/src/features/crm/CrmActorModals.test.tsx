import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as crm from '../../services/crm';
import { CrmActorEditModal } from './CrmActorModals';

jest.mock('../../services/crm');
const crmMock = crm as jest.Mocked<typeof crm>;

const actor = { id: 'actor-1', displayName: 'Mme Marie Hoarau', gender: 'Mme', firstName: 'Marie', lastName: 'Hoarau', photoUrl: null };
const channels = [{ id: 'ch-1', kindCode: 'email', kindName: 'Email', value: 'marie@basalte.re', isPrimary: true }];

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listContactKinds.mockResolvedValue([
    { code: 'email', name: 'Email' },
    { code: 'phone', name: 'Téléphone' },
    { code: 'address', name: 'Adresse' },
  ]);
});

function renderModal(addressSuggestions: crm.ObjectAddressSuggestion[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CrmActorEditModal actor={actor} channels={channels} addressSuggestions={addressSuggestions} onClose={jest.fn()} onSaved={jest.fn()} />
    </QueryClientProvider>,
  );
}

describe('CrmActorEditModal — §19 adresses prestataire', () => {
  it('adds an address row via "Ajouter une adresse"', async () => {
    renderModal();
    const addButton = await screen.findByRole('button', { name: /Ajouter une adresse/ });
    await waitFor(() => expect(addButton).toBeEnabled());

    act(() => { fireEvent.click(addButton); });

    expect(screen.getByLabelText('Adresse 1')).toBeInTheDocument();
  });

  it('prefills an address from an attached-object suggestion', async () => {
    renderModal([{ objectId: 'o1', objectName: 'Hotel Basalte', address: '12 rue des Lataniers, 97410 Saint-Pierre' }]);
    const chip = await screen.findByRole('button', { name: /Hotel Basalte — 12 rue des Lataniers/ });

    act(() => { fireEvent.click(chip); });

    expect(screen.getByLabelText('Adresse 1')).toHaveValue('12 rue des Lataniers, 97410 Saint-Pierre');
    // The suggestion is now disabled (already added — no duplicate).
    expect(screen.getByRole('button', { name: /Hotel Basalte — 12 rue des Lataniers/ })).toBeDisabled();
  });

  it('excludes the address kind from the communication-channel dropdown', async () => {
    renderModal();
    // The existing email channel row exposes a comm kind <select>.
    const kindSelect = await screen.findByLabelText('Type du canal 1');
    // Wait for the kinds query to resolve (real options replace the fail-soft fallback).
    await within(kindSelect).findByRole('option', { name: 'Téléphone' });
    expect(within(kindSelect).queryByRole('option', { name: 'Adresse' })).toBeNull();
    expect(within(kindSelect).getByRole('option', { name: 'Email' })).toBeInTheDocument();
  });
});
