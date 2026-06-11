import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmObjectView } from './CrmObjectView';
import * as crm from '../../services/crm';
import type { ObjectCrmSnapshot } from '../../services/crm';
import { mockCrmDirectory } from '../../data/mock';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

const snapshot: ObjectCrmSnapshot = {
  interactions: [
    {
      id: 'i1', interactionType: 'call', subject: 'Appel tarifs', body: 'Tarifs validés.',
      occurredAt: '2026-06-04T10:00:00Z', actorName: 'Mme Marie Hoarau',
      topicCode: 'modification_infos_bdd', topicName: 'Modification infos BDD',
      sentimentCode: 'positif', sentimentName: 'Positif', ownerName: 'Florence', source: 'bertel_ui',
    },
    {
      id: 'i2', interactionType: 'email', subject: 'Adhésion 2026', body: null,
      occurredAt: '2026-03-24T09:00:00Z', actorName: 'SARL Basalte & Lagon',
      topicCode: null, topicName: null, sentimentCode: null, sentimentName: null,
      ownerName: 'Awa', source: 'bertel_ui',
    },
  ],
  topics: [{ code: 'modification_infos_bdd', name: 'Modification infos BDD', count: 1 }],
  actors: [
    { actorId: 'actor-1', displayName: 'Mme Marie Hoarau', roleCode: 'manager', roleName: 'Gérante', isPrimary: true },
    { actorId: 'actor-2', displayName: 'SARL Basalte & Lagon', roleCode: 'operator', roleName: 'Exploitant', isPrimary: false },
  ],
  tasks: [],
};

function renderView(overrides: Partial<Parameters<typeof CrmObjectView>[0]> = {}) {
  const props = {
    objectId: 'obj-1',
    backLabel: 'Annuaire des acteurs',
    onBack: jest.fn(),
    onOpenActor: jest.fn(),
    ...overrides,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrmObjectView {...props} />
    </QueryClientProvider>,
  );
  return props;
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listObjectCrm.mockResolvedValue(snapshot);
  crmMock.listCrmDirectory.mockResolvedValue(mockCrmDirectory);
});

describe('CrmObjectView (§61 — vue établissement)', () => {
  it('résout nom + type depuis l annuaire et rend le lien éditeur', async () => {
    renderView();
    expect(await screen.findByText('Hotel Basalte & Lagon')).toBeInTheDocument();
    expect(screen.getByText('HOT')).toBeInTheDocument();
    const editorLink = screen.getByRole('link', { name: /ouvrir dans l.éditeur/i });
    expect(editorLink).toHaveAttribute('href', '/objects/obj-1/edit');
  });

  it('rend les acteurs liés avec rôle + badge principal ; clic → onOpenActor', async () => {
    const props = renderView();
    await screen.findByText('Hotel Basalte & Lagon');
    expect(screen.getByText('Gérante')).toBeInTheDocument();
    expect(screen.getByText('Exploitant')).toBeInTheDocument();
    expect(screen.getByText('principal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sarl basalte & lagon exploitant/i }));
    expect(props.onOpenActor).toHaveBeenCalledWith('actor-2');
  });

  it('historique tous acteurs confondus : chaque carte porte le QUI (actorName)', async () => {
    renderView();
    await screen.findByText('Appel tarifs');
    expect(screen.getByText('Adhésion 2026')).toBeInTheDocument();
    // WHO par carte — les deux acteurs apparaissent dans le flux.
    expect(screen.getAllByText('Mme Marie Hoarau').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SARL Basalte & Lagon').length).toBeGreaterThan(0);
  });

  it('bouton retour avec le libellé d origine', async () => {
    const props = renderView({ backLabel: 'Mme Marie Hoarau' });
    // Nom accessible EXACT : ne matche que le bouton retour, pas la ligne acteur du rail.
    fireEvent.click(await screen.findByRole('button', { name: 'Mme Marie Hoarau' }));
    expect(props.onBack).toHaveBeenCalled();
  });

  it('échec de chargement → erreur visible', async () => {
    crmMock.listObjectCrm.mockRejectedValue(new Error('refus RLS'));
    renderView();
    expect(await screen.findByText(/refus RLS/)).toBeInTheDocument();
  });
});
