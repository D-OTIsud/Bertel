import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmActorFiche } from './CrmActorFiche';
import * as crm from '../../services/crm';
import type { ActorCrmSnapshot } from '../../services/crm';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

// Fichier de test SÉPARÉ de CrmActorFiche.test.tsx (session parallèle sur ce
// fichier-là) — il ne couvre QUE le bouton « copier » des coordonnées (demande
// CES : un lien mailto:/tel: n'est pas sélectionnable à la souris).
const snapshot: ActorCrmSnapshot = {
  actor: { id: 'actor-1', displayName: 'Mme Florence Girard', gender: 'Mme', firstName: 'Florence', lastName: 'Girard', photoUrl: null },
  objects: [
    { objectId: 'obj-1', objectName: 'La Maison des Hôtes', objectType: 'HLO', roleCode: 'operator', roleName: 'Exploitant', isPrimary: true },
  ],
  channels: [
    { id: 'ch-1', kindCode: 'email', kindName: 'Email', value: 'flo.girard123@gmail.com', isPrimary: true, isPublic: false },
    { id: 'ch-2', kindCode: 'phone', kindName: 'Téléphone', value: '0693 87 57 74', isPrimary: false, isPublic: false },
    { id: 'ch-3', kindCode: 'website', kindName: 'Site web', value: 'https://maison-des-hotes.re', isPrimary: false, isPublic: false },
  ],
  interactions: [],
  topics: [],
};

function renderFiche() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrmActorFiche actorId="actor-1" canWrite={false} onBack={jest.fn()} onOpenObject={jest.fn()} />
    </QueryClientProvider>,
  );
}

function mockClipboard() {
  const writeText = jest.fn(() => Promise.resolve());
  Object.assign(navigator, { clipboard: { writeText } });
  return writeText;
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listActorCrm.mockResolvedValue(snapshot);
  crmMock.listActorSupport.mockResolvedValue({ defaultRole: { code: 'operator', name: 'Exploitant' }, documents: [] });
  crmMock.listObjectDocumentTypes.mockResolvedValue([]);
  crmMock.listDemandTopics.mockResolvedValue([]);
  crmMock.listObjectAddresses.mockResolvedValue([]);
});

describe('CrmActorFiche — bouton copier des coordonnées', () => {
  it('chaque canal affiché porte un bouton copier ; e-mail/tél restent cliquables', async () => {
    mockClipboard();
    renderFiche();

    const coords = await screen.findByLabelText('Coordonnées');
    // Les liens ne bougent pas (mailto:/tel:/URL externe)…
    expect(within(coords).getByRole('link', { name: 'flo.girard123@gmail.com' })).toHaveAttribute('href', 'mailto:flo.girard123@gmail.com');
    expect(within(coords).getByRole('link', { name: '0693 87 57 74' })).toHaveAttribute('href', 'tel:0693875774');
    // …l'URL reste cliquable ET copiable (demande utilisateur).
    expect(within(coords).getByRole('link', { name: 'https://maison-des-hotes.re' })).toBeInTheDocument();
    // …et CHAQUE canal a son bouton copier (3 canaux ⇒ 3 boutons).
    expect(within(coords).getByRole('button', { name: 'Copier flo.girard123@gmail.com' })).toBeInTheDocument();
    expect(within(coords).getByRole('button', { name: 'Copier 0693 87 57 74' })).toBeInTheDocument();
    expect(within(coords).getByRole('button', { name: 'Copier https://maison-des-hotes.re' })).toBeInTheDocument();
  });

  it('copie la valeur TELLE QU’AFFICHÉE (téléphone avec espaces, jamais le href tel:)', async () => {
    const writeText = mockClipboard();
    renderFiche();

    const coords = await screen.findByLabelText('Coordonnées');
    await act(async () => {
      fireEvent.click(within(coords).getByRole('button', { name: 'Copier 0693 87 57 74' }));
    });
    expect(writeText).toHaveBeenCalledWith('0693 87 57 74');

    await act(async () => {
      fireEvent.click(within(coords).getByRole('button', { name: 'Copier flo.girard123@gmail.com' }));
    });
    expect(writeText).toHaveBeenCalledWith('flo.girard123@gmail.com');
  });
});
