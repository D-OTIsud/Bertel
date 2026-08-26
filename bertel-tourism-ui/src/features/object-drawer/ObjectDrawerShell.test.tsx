import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ObjectDrawerShell } from './ObjectDrawerShell';
import { useSessionStore } from '../../store/session-store';

// Le tiroir est en LECTURE SEULE : il ne doit consommer que le chargeur léger
// (1 RPC), jamais le chargeur d'espace de travail (~85 requêtes) qui n'existe
// que pour peupler les sélecteurs de l'éditeur. Cette garde échoue si quelqu'un
// re-branche le tiroir sur useObjectWorkspaceQuery.
const detailSpy = jest.fn();
const workspaceSpy = jest.fn();
const prefetchWorkspaceSpy = jest.fn();

// Payload par défaut du chargeur léger — mutable pour que chaque test puisse
// poser son propre `raw` (ex. la taxonomie de l'en-tête), remis à zéro en beforeEach.
const baseDetailData = { id: 'RESRUN0000000001', name: 'Chez Testeur', type: 'RES', raw: {} as Record<string, unknown> };
let mockDetailData = baseDetailData;

jest.mock('../../hooks/useExplorerQueries', () => ({
  useObjectDetailQuery: (objectId: string | null) => {
    detailSpy(objectId);
    return {
      data: mockDetailData,
      isError: false,
      error: null,
      isLoading: false,
    };
  },
  useObjectWorkspaceQuery: (objectId: string | null) => {
    workspaceSpy(objectId);
    return { data: undefined, isError: false, error: null, isLoading: true };
  },
  usePrefetchObjectWorkspace: () => prefetchWorkspaceSpy,
}));

jest.mock('../../hooks/usePresenceRoom', () => ({
  usePresenceRoom: () => ({ peers: [], typingUsers: [] }),
}));

const mockPrefetch = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: (...args: unknown[]) => mockPrefetch(...args) }),
}));

jest.mock('./ObjectDetailView', () => ({
  ObjectDetailView: ({ data }: { data: { name: string } }) => (
    <div data-testid="detail-view">{data.name}</div>
  ),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('ObjectDrawerShell', () => {
  beforeEach(() => {
    detailSpy.mockClear();
    workspaceSpy.mockClear();
    mockPrefetch.mockClear();
    prefetchWorkspaceSpy.mockClear();
    mockDetailData = baseDetailData;
    // `canEditObjects` gate le prechargement ET le bouton « Modifier ».
    useSessionStore.setState({ role: 'tourism_agent', canEditObjects: true });
  });

  test('consomme le chargeur léger et jamais le chargeur d espace de travail', () => {
    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

    expect(detailSpy).toHaveBeenCalledWith('RESRUN0000000001');
    expect(workspaceSpy).not.toHaveBeenCalled();
  });

  test('affiche le nom et le type de la fiche depuis le payload léger', () => {
    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

    expect(screen.getByRole('heading', { name: 'Chez Testeur' })).toBeInTheDocument();
    expect(screen.getByTestId('detail-view')).toHaveTextContent('Chez Testeur');
  });

  // Demande CES : le type seul (« Gîtes, meublés & chambres d'hôtes ») ne dit pas
  // si la fiche est un meublé, une chambre d'hôtes… La nature taxonomique
  // (assigned_node) s'affiche en pastille à côté du type, chemin complet en title.
  test('affiche la nature taxonomique à côté du type quand la fiche en porte une', () => {
    mockDetailData = {
      id: 'HLORUN00000000U4',
      name: 'La Maison des Hôtes',
      type: 'HLO',
      raw: {
        taxonomy: {
          domains: [
            {
              domain: 'taxonomy_hlo',
              path: [
                { code: 'hebergement_locatif', name: 'Hébergement locatif', depth: 0 },
                { code: 'chambre_d_hotes', name: "Chambre d'hôtes", depth: 1 },
              ],
              assigned_node: { code: 'chambre_d_hotes', name: "Chambre d'hôtes", depth: 1 },
            },
          ],
        },
      },
    };

    render(<ObjectDrawerShell objectId="HLORUN00000000U4" onClose={() => {}} />, { wrapper });

    const chip = screen.getByText("Chambre d'hôtes");
    expect(chip).toHaveClass('drawer-header__nature');
    expect(chip).toHaveAttribute('title', "Hébergement locatif › Chambre d'hôtes");
    // La pastille vit dans la rangée type + catégorie de l'en-tête.
    expect(chip.closest('.drawer-header__eyebrow-row')).not.toBeNull();
  });

  test('pas de pastille sans taxonomie, ni quand la nature répète le libellé de type', () => {
    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });
    expect(document.querySelector('.drawer-header__nature')).toBeNull();

    // Nature « Restaurant » sur une fiche RES (« Restaurant ») : rien à apprendre.
    mockDetailData = {
      ...baseDetailData,
      raw: { taxonomy: { domains: [{ path: [{ name: 'Restaurant' }], assigned_node: { name: 'Restaurant' } }] } },
    };
    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });
    expect(document.querySelector('.drawer-header__nature')).toBeNull();
  });

  test('precharge la route editeur a l ouverture du tiroir', () => {
    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

    expect(mockPrefetch).toHaveBeenCalledWith('/objects/RESRUN0000000001/edit');
  });

  test('le survol de « Modifier » declenche le prechargement immediatement', () => {
    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

    // Rien ne part SYNCHRONEMENT au rendu : le tiroir peint d abord (le
    // prechargement automatique attend AUTO_PREFETCH_DELAY_MS, cf. bloc dedie).
    expect(prefetchWorkspaceSpy).not.toHaveBeenCalled();

    // Le survol reste un declencheur a part entiere : il court-circuite la
    // temporisation, et sert le chemin clavier via onFocus.
    fireEvent.mouseEnter(screen.getByRole('button', { name: /modifier/i }));

    expect(prefetchWorkspaceSpy).toHaveBeenCalledWith('RESRUN0000000001');
  });

  // §NN — mesure terrain : ~80 % des ouvertures de fiche par un editeur sont
  // suivies d un clic sur « Modifier ». L editeur est donc traite comme la
  // navigation ATTENDUE, pas comme une hypothese : on precharge sans attendre le
  // survol du bouton. La temporisation courte laisse le tiroir peindre d abord.
  describe('prechargement automatique de l editeur', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('part tout seul peu apres l affichage de la fiche, sans aucun survol', () => {
      render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

      expect(prefetchWorkspaceSpy).not.toHaveBeenCalled(); // le tiroir peint d abord
      jest.advanceTimersByTime(300);

      expect(prefetchWorkspaceSpy).toHaveBeenCalledWith('RESRUN0000000001');
    });

    test('ne part pas pour un membre en lecture seule', () => {
      useSessionStore.setState({ role: 'tourism_agent', canEditObjects: false });

      render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });
      jest.advanceTimersByTime(300);

      expect(prefetchWorkspaceSpy).not.toHaveBeenCalled();
    });

    test('est annule si le tiroir se ferme avant l echeance', () => {
      const { unmount } = render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

      jest.advanceTimersByTime(150);
      unmount();
      jest.advanceTimersByTime(300);

      expect(prefetchWorkspaceSpy).not.toHaveBeenCalled();
    });
  });

  test('un membre en lecture seule ne voit pas Modifier et ne declenche aucun prechargement', () => {
    // canEditObjects=false = membre d ORG sans droit d edition. `role !== null`
    // ne le distinguait PAS d un editeur : il voyait le bouton et aurait paye le
    // prechargement d un editeur qu il ne peut pas utiliser.
    useSessionStore.setState({ role: 'tourism_agent', canEditObjects: false });

    render(<ObjectDrawerShell objectId="RESRUN0000000001" onClose={() => {}} />, { wrapper });

    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument();
    expect(mockPrefetch).not.toHaveBeenCalled();
    expect(prefetchWorkspaceSpy).not.toHaveBeenCalled();
  });
});
