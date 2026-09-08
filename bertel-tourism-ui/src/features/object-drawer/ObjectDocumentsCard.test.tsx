import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getActiveObjectDocuments } from '../../services/object-documents';
import { useSessionStore } from '../../store/session-store';
import { ObjectDocumentsCard } from './ObjectDocumentsCard';

jest.mock('../../services/object-documents', () => ({
  getActiveObjectDocuments: jest.fn(),
}));

const mockGetDocuments = jest.mocked(getActiveObjectDocuments);

function documentResult() {
  return {
    authorized: true,
    documents: [{
      id: 'doc-1',
      title: 'Arrêté préfectoral',
      url: 'https://example.test/justificatif.pdf',
      category: 'legal' as const,
      typeCode: 'juridique',
      issuer: 'Préfecture',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      createdAt: '2026-01-01',
    }],
  };
}

describe('ObjectDocumentsCard', () => {
  beforeEach(() => {
    mockGetDocuments.mockReset();
    useSessionStore.setState({
      status: 'ready',
      userId: 'editor-1',
      orgId: 'org-1',
      role: 'tourism_agent',
      canEditObjects: true,
      demoMode: false,
    });
  });

  it('ne sonde ni affiche la carte pour un lecteur', () => {
    useSessionStore.setState({ canEditObjects: false });
    render(<ObjectDocumentsCard objectId="obj-1" />);
    expect(mockGetDocuments).not.toHaveBeenCalled();
    expect(screen.queryByText('Consulter les documents')).not.toBeInTheDocument();
  });

  it('affiche seulement après le verdict objet, puis charge la modale et ferme avec Échap', async () => {
    mockGetDocuments.mockResolvedValue(documentResult());
    render(<ObjectDocumentsCard objectId="obj-1" />);

    const trigger = await screen.findByRole('button', { name: 'Consulter les documents' });
    fireEvent.click(trigger);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des documents');

    const link = await screen.findByRole('link', { name: 'Ouvrir Arrêté préfectoral' });
    expect(link).toHaveAttribute('href', 'https://example.test/justificatif.pdf');
    expect(screen.getByText('Documents légaux')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('retire immédiatement les données quand le compte actif change', async () => {
    let resolveOldRequest!: (value: ReturnType<typeof documentResult>) => void;
    mockGetDocuments
      .mockResolvedValueOnce(documentResult())
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOldRequest = resolve; }))
      .mockImplementationOnce(() => new Promise(() => undefined));

    render(<ObjectDocumentsCard objectId="obj-1" />);
    const trigger = await screen.findByRole('button', { name: 'Consulter les documents' });
    fireEvent.click(trigger);

    act(() => useSessionStore.setState({ userId: 'editor-2', orgId: 'org-2' }));
    expect(screen.queryByText('Consulter les documents')).not.toBeInTheDocument();

    await act(async () => resolveOldRequest(documentResult()));
    expect(screen.queryByText('Consulter les documents')).not.toBeInTheDocument();
  });
});
