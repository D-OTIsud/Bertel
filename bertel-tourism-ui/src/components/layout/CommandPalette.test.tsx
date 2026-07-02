import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommandPalette } from './CommandPalette';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/explorer',
}));

jest.mock('../../services/palette-search', () => ({
  PALETTE_SEARCH_MIN_CHARS: 2,
  searchPaletteObjects: jest.fn(async (q: string) =>
    q.includes('basalte')
      ? [{ id: 'HOT-1', type: 'HOT', name: 'Hotel Basalte & Lagon', location: { city: 'Saint-Pierre' } }]
      : [],
  ),
}));

function renderPalette() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommandPalette />
    </QueryClientProvider>,
  );
}

describe('CommandPalette (D24)', () => {
  beforeEach(() => {
    pushMock.mockClear();
    useUiStore.setState({ commandPaletteOpen: false, drawerObjectId: null });
    useSessionStore.setState({ role: 'tourism_agent', demoMode: true, canCreateObjects: true });
  });

  it('reste fermée par défaut et s’ouvre sur Ctrl+K', () => {
    renderPalette();
    expect(screen.queryByRole('dialog', { name: 'Palette de commandes' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Palette de commandes' })).toBeInTheDocument();
  });

  it('liste la navigation rôle-filtrée et navigue au clic', () => {
    useUiStore.setState({ commandPaletteOpen: true });
    renderPalette();
    fireEvent.click(screen.getByRole('option', { name: /Dashboard/ }));
    expect(pushMock).toHaveBeenCalledWith('/dashboard');
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
  });

  it('le rôle filtre les destinations (owner ne voit pas le CRM)', () => {
    useSessionStore.setState({ role: 'owner' });
    useUiStore.setState({ commandPaletteOpen: true });
    renderPalette();
    expect(screen.queryByRole('option', { name: /CRM/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Dashboard/ })).toBeInTheDocument();
  });

  it('filtre par saisie et recherche les fiches (tsvector via service, debounce)', async () => {
    useUiStore.setState({ commandPaletteOpen: true });
    renderPalette();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'basalte' } });
    const result = await screen.findByRole('option', { name: /Hotel Basalte/ });
    fireEvent.click(result);
    expect(useUiStore.getState().drawerObjectId).toBe('HOT-1');
  });

  it('clavier : flèches + Entrée exécutent l’élément en surbrillance', async () => {
    useUiStore.setState({ commandPaletteOpen: true });
    renderPalette();
    const input = screen.getByRole('combobox');
    // Premier élément par défaut = première destination (Explorer).
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });

  it('« Raccourcis clavier » ouvre la feuille des raccourcis', () => {
    useUiStore.setState({ commandPaletteOpen: true });
    renderPalette();
    fireEvent.click(screen.getByRole('option', { name: /Raccourcis clavier/ }));
    expect(screen.getByRole('dialog', { name: 'Raccourcis clavier' })).toBeInTheDocument();
  });

  it('« Créer une fiche » absent sans le droit de création', () => {
    useSessionStore.setState({ canCreateObjects: false });
    useUiStore.setState({ commandPaletteOpen: true });
    renderPalette();
    expect(screen.queryByRole('option', { name: /Créer une fiche/ })).not.toBeInTheDocument();
  });
});
