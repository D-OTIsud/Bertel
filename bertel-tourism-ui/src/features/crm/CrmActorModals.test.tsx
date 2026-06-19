import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as crm from '../../services/crm';
import { geocodeAddress, searchAddresses } from '../object-editor/widgets/geocode-address';
import { CrmActorEditModal } from './CrmActorModals';

jest.mock('../../services/crm');
jest.mock('../object-editor/widgets/geocode-address', () => ({
  geocodeAddress: jest.fn(),
  searchAddresses: jest.fn(),
}));
const crmMock = crm as jest.Mocked<typeof crm>;
const geocodeAddressMock = geocodeAddress as jest.Mock;
const searchAddressesMock = searchAddresses as jest.Mock;

const actor = { id: 'actor-1', displayName: 'Mme Marie Hoarau', gender: 'Mme', firstName: 'Marie', lastName: 'Hoarau', photoUrl: null };
const channels = [{ id: 'ch-1', kindCode: 'email', kindName: 'Email', value: 'marie@basalte.re', isPrimary: true }];
const BAN_HIT = {
  latitude: '-21.271070',
  longitude: '55.467030',
  label: '38 Chemin Dijoux 97414 Entre-Deux',
  name: '38 Chemin Dijoux',
  postcode: '97414',
  city: 'Entre-Deux',
  citycode: '97403',
  score: 0.82,
};

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listContactKinds.mockResolvedValue([
    { code: 'email', name: 'Email' },
    { code: 'phone', name: 'Téléphone' },
    { code: 'address', name: 'Adresse' },
  ]);
  crmMock.saveActorChannel.mockResolvedValue('new-channel');
  searchAddressesMock.mockResolvedValue([]);
  geocodeAddressMock.mockResolvedValue(BAN_HIT);
});

function renderModal(addressSuggestions: crm.ObjectAddressSuggestion[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CrmActorEditModal actor={actor} channels={channels} addressSuggestions={addressSuggestions} onClose={jest.fn()} onSaved={jest.fn()} />
    </QueryClientProvider>,
  );
}

async function addAddressRow() {
  const addButton = await screen.findByRole('button', { name: /Ajouter une adresse/ });
  await waitFor(() => expect(addButton).toBeEnabled());
  fireEvent.click(addButton);
}

describe('CrmActorEditModal — §19 adresses prestataire', () => {
  it('adds an address row via "Ajouter une adresse"', async () => {
    renderModal();
    await addAddressRow();

    expect(screen.getByLabelText('Adresse 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Code postal adresse 1')).toHaveValue('');
    expect(screen.getByLabelText('Commune adresse 1')).toHaveValue('');
  });

  it('prefills an address from an attached-object suggestion', async () => {
    renderModal([{ objectId: 'o1', objectName: 'Hotel Basalte', address: '12 rue des Lataniers, 97410 Saint-Pierre' }]);
    const chip = await screen.findByRole('button', { name: /Hotel Basalte — 12 rue des Lataniers/ });

    act(() => { fireEvent.click(chip); });

    expect(screen.getByLabelText('Adresse 1')).toHaveValue('12 rue des Lataniers');
    expect(screen.getByLabelText('Code postal adresse 1')).toHaveValue('97410');
    expect(screen.getByLabelText('Commune adresse 1')).toHaveValue('Saint-Pierre');
    // The suggestion is now disabled (already added — no duplicate).
    expect(screen.getByRole('button', { name: /Hotel Basalte — 12 rue des Lataniers/ })).toBeDisabled();
  });

  it('standardizes an address from BAN autocomplete before saving', async () => {
    jest.useFakeTimers();
    try {
      searchAddressesMock.mockResolvedValue([BAN_HIT]);
      renderModal();
      await addAddressRow();

      const address = screen.getByRole('combobox', { name: 'Adresse 1' });
      fireEvent.change(address, { target: { value: '38 chemin dij' } });
      await act(async () => {
        jest.advanceTimersByTime(350);
      });
      fireEvent.click(await screen.findByRole('option', { name: /38 Chemin Dijoux 97414 Entre-Deux/ }));

      expect(screen.getByLabelText('Adresse 1')).toHaveValue('38 Chemin Dijoux');
      expect(screen.getByLabelText('Code postal adresse 1')).toHaveValue('97414');
      expect(screen.getByLabelText('Commune adresse 1')).toHaveValue('Entre-Deux');

      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
      await waitFor(() =>
        expect(crmMock.saveActorChannel).toHaveBeenCalledWith({
          actorId: 'actor-1',
          kindCode: 'address',
          value: '38 Chemin Dijoux, 97414 Entre-Deux',
          isPrimary: false,
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('standardizes a manually entered address with the BAN API button', async () => {
    renderModal();
    await addAddressRow();
    const address = screen.getByRole('combobox', { name: 'Adresse 1' });

    fireEvent.change(address, { target: { value: '38 chemin dij' } });
    fireEvent.blur(address);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "Standardiser l'adresse 1" }));
    });

    expect(geocodeAddressMock).toHaveBeenCalledWith({ address1: '38 Chemin Dij', postcode: '', city: '' });
    expect(screen.getByLabelText('Code postal adresse 1')).toHaveValue('97414');
    expect(screen.getByLabelText('Commune adresse 1')).toHaveValue('Entre-Deux');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
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
