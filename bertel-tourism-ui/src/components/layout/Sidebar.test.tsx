import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import * as rpc from '../../services/rpc';
import type { PendingChangeItem } from '../../types/domain';

let mockPathname = '/explorer';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
jest.mock('../../services/rpc');
const mockedRpc = rpc as jest.Mocked<typeof rpc>;

function makePending(n: number): PendingChangeItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `pc-${i}`,
    objectName: 'Obj',
    author: 'A',
    field: 'f',
    before: 'b',
    after: 'a',
    submittedAt: '2026-03-12T14:30:00Z',
    status: 'pending',
  }));
}

function renderSidebar(onOpenProfile: () => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Sidebar onOpenProfile={onOpenProfile} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/explorer';
  // Défaut : aucune suggestion en attente ⇒ pas de badge (cas le plus courant).
  mockedRpc.listPendingChanges.mockResolvedValue([]);
  useSessionStore.setState({
    role: 'super_admin',
    adminRank: null,
    demoMode: true,
    canEditObjects: true,
    userName: 'D. Philippe',
  } as never);
  useThemeStore.setState({
    theme: { ...useThemeStore.getState().theme, brandName: 'Bertel', logoUrl: null },
  } as never);
});

describe('Sidebar', () => {
  it('renders nav items with their visible labels for the role', () => {
    renderSidebar();
    expect(screen.getByText('Explorer')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('CRM')).toBeInTheDocument();
  });

  it('marks the active route item with aria-current="page"', () => {
    mockPathname = '/dashboard';
    renderSidebar();
    expect(screen.getByRole('link', { name: /Dashboard/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Explorer/i })).not.toHaveAttribute('aria-current');
  });

  // 7.4 — l'Équipe a quitté le sidebar pour Paramètres → Mon organisation (route /team
  // redirigée). Plus aucune entrée « Équipe » dans le sidebar, quel que soit le rôle.
  it('n’affiche plus d’entrée « Équipe » dans le sidebar (déplacée dans Paramètres)', () => {
    useSessionStore.setState({ role: 'super_admin' } as never);
    renderSidebar();
    expect(screen.queryByText('Équipe')).not.toBeInTheDocument();
    expect(screen.getByText('Paramètres')).toBeInTheDocument();
  });

  // Un membre d'ORG en lecture seule (canEditObjects=false) reste `tourism_agent`
  // mais ne doit pas voir les surfaces « métier » : CRM, Modération, Listes sont
  // masquées ; Explorer + Dashboard (consultation) + Paramètres restent visibles.
  it('masque les surfaces métier (CRM/Modération/Listes) pour un lecteur seul', () => {
    useSessionStore.setState({ role: 'tourism_agent', canEditObjects: false } as never);
    renderSidebar();
    expect(screen.queryByText('CRM')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Moderation/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Listes')).not.toBeInTheDocument();
    // Consultation conservée.
    expect(screen.getByText('Explorer')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Paramètres')).toBeInTheDocument();
  });

  it('rend les surfaces métier pour un profil éditeur (canEditObjects=true)', () => {
    useSessionStore.setState({ role: 'tourism_agent', canEditObjects: true } as never);
    renderSidebar();
    expect(screen.getByText('CRM')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Moderation/i })).toBeInTheDocument();
    expect(screen.getByText('Listes')).toBeInTheDocument();
  });

  it('calls onOpenProfile when the profile button is clicked', () => {
    const onOpenProfile = jest.fn();
    renderSidebar(onOpenProfile);
    fireEvent.click(screen.getByRole('button', { name: /Profil/i }));
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it('renders the settings link', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: /Param[eè]tres/i })).toBeInTheDocument();
  });

  describe('badge de modération (§120)', () => {
    it('affiche un badge numérique sur Modération quand des suggestions sont en attente', async () => {
      mockedRpc.listPendingChanges.mockResolvedValue(makePending(3));
      renderSidebar();
      const badge = await screen.findByLabelText(/en attente de modération/i);
      expect(badge).toHaveTextContent('3');
      // Requête lancée sur la même clé que ModerationPage, statut 'pending'.
      expect(mockedRpc.listPendingChanges).toHaveBeenCalledWith('pending');
    });

    it('plafonne l’affichage à 99+', async () => {
      mockedRpc.listPendingChanges.mockResolvedValue(makePending(150));
      renderSidebar();
      expect(await screen.findByText('99+')).toBeInTheDocument();
    });

    it('n’affiche aucun badge quand il n’y a rien à modérer (count = 0)', async () => {
      mockedRpc.listPendingChanges.mockResolvedValue([]);
      renderSidebar();
      // Le lien Modération existe…
      expect(await screen.findByRole('link', { name: /Moderation/i })).toBeInTheDocument();
      // …mais pas de badge.
      expect(screen.queryByLabelText(/en attente de modération/i)).not.toBeInTheDocument();
    });

    it('ne sollicite pas le RPC pour un rôle sans accès Modération (owner)', async () => {
      useSessionStore.setState({ role: 'owner' } as never);
      renderSidebar();
      expect(screen.queryByRole('link', { name: /Moderation/i })).not.toBeInTheDocument();
      await waitFor(() => expect(mockedRpc.listPendingChanges).not.toHaveBeenCalled());
    });
  });
});
