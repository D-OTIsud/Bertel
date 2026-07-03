import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileDrawer, selectMyOpenTasks, isTaskOverdue } from './ProfileDrawer';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';
import * as crm from '../../services/crm';
import * as rpc from '../../services/rpc';
import type { CrmTask, PresenceMember } from '../../types/domain';

jest.mock('../../services/crm');
jest.mock('../../services/rpc');
jest.mock('../../services/auth', () => ({ signOut: jest.fn() }));
// ProfileEditModal est rendu (fermé) par le tiroir : neutraliser ses dépendances réseau.
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../services/user-profile', () => ({
  updateCurrentUserProfile: jest.fn(),
  uploadAvatar: jest.fn(),
}));

const crmMock = crm as jest.Mocked<typeof crm>;
const rpcMock = rpc as jest.Mocked<typeof rpc>;

function makeTask(over: Partial<CrmTask> = {}): CrmTask {
  return {
    id: 't1', objectId: 'obj-1', objectName: 'Hôtel Test', actorId: null, actorName: null,
    title: 'Rappeler le directeur', description: null, status: 'todo', priority: 'high',
    dueAt: null, ownerId: 'u-me', ownerName: 'David', relatedInteractionId: null,
    relatedInteractionSubject: null, relatedInteractionStatus: null,
    ...over,
  };
}

function member(over: Partial<PresenceMember> = {}): PresenceMember {
  return { userId: 'u-x', name: 'Marie', avatar: 'MA', color: '#1f7a6d', onlineSince: Date.now(), ...over };
}

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProfileDrawer open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listCrmTasks.mockResolvedValue([]);
  rpcMock.listPendingChanges.mockResolvedValue([]);
  useSessionStore.setState({
    status: 'ready', demoMode: false, role: 'tourism_agent', adminRank: null,
    userId: 'u-me', email: 'david@otisud.re', userName: 'David P.', avatarUrl: null,
    orgName: 'OTI du Sud',
  } as never);
  useUiStore.setState({
    networkStatus: 'connected',
    liveMembers: [member({ userId: 'u-me', name: 'David P.' })],
  } as never);
});

describe('selectMyOpenTasks / isTaskOverdue (purs)', () => {
  it('filtre owner+statut, trie par échéance (nulls en dernier), 4 max', () => {
    const tasks = [
      makeTask({ id: 'a', dueAt: null }),
      makeTask({ id: 'b', dueAt: '2026-07-10T09:00:00Z' }),
      makeTask({ id: 'autre', ownerId: 'u-other' }),
      makeTask({ id: 'finie', status: 'done' }),
      makeTask({ id: 'c', dueAt: '2026-07-01T09:00:00Z' }),
      makeTask({ id: 'd', dueAt: '2026-07-05T09:00:00Z', status: 'in_progress' }),
      makeTask({ id: 'e', dueAt: '2026-07-06T09:00:00Z' }),
    ];
    expect(selectMyOpenTasks(tasks, 'u-me').map((t) => t.id)).toEqual(['c', 'd', 'e', 'b']);
    expect(selectMyOpenTasks(tasks, null)).toEqual([]);
  });

  it('isTaskOverdue : échéance passée = vrai, sans échéance = faux', () => {
    const now = new Date('2026-07-03T12:00:00Z').getTime();
    expect(isTaskOverdue(makeTask({ dueAt: '2026-07-01T09:00:00Z' }), now)).toBe(true);
    expect(isTaskOverdue(makeTask({ dueAt: '2026-07-10T09:00:00Z' }), now)).toBe(false);
    expect(isTaskOverdue(makeTask({ dueAt: null }), now)).toBe(false);
  });
});

describe('ProfileDrawer (hub personnel)', () => {
  it('identité complète : nom, e-mail, organisation, rôle FR lisible', async () => {
    useSessionStore.setState({ adminRank: 12 } as never);
    renderDrawer();
    expect(await screen.findByText('David P.')).toBeInTheDocument();
    expect(screen.getByText('david@otisud.re')).toBeInTheDocument();
    expect(screen.getByText('OTI du Sud')).toBeInTheDocument();
    expect(screen.getByText('Agent touristique · Admin ORG')).toBeInTheDocument();
    // Plus aucun code brut.
    expect(screen.queryByText(/tourism_agent|ready|connected|workspace/i)).not.toBeInTheDocument();
  });

  it('seul connecté → message dédié ; collègues → noms listés sans le mien', async () => {
    const { unmount } = renderDrawer();
    expect(await screen.findByText('Vous êtes le seul connecté.')).toBeInTheDocument();
    unmount();

    useUiStore.setState({
      liveMembers: [member({ userId: 'u-me', name: 'David P.' }), member({ userId: 'u-2', name: 'Marie H.' }), member({ userId: 'u-3', name: 'Luc P.' })],
    } as never);
    renderDrawer();
    expect(await screen.findByText('Marie H.')).toBeInTheDocument();
    expect(screen.getByText('Luc P.')).toBeInTheDocument();
    expect(screen.queryByText('Vous êtes le seul connecté.')).not.toBeInTheDocument();
  });

  it('mes tâches : filtrées (owner + statut ouvert), badge « En retard », liens /crm?tab=taches', async () => {
    crmMock.listCrmTasks.mockResolvedValue([
      makeTask({ id: 't1', title: 'Rappeler le directeur', dueAt: '2020-01-01T09:00:00Z' }),
      makeTask({ id: 't2', title: 'Tâche d’un collègue', ownerId: 'u-other' }),
      makeTask({ id: 't3', title: 'Tâche terminée', status: 'done' }),
    ]);
    renderDrawer();
    expect(await screen.findByText('Rappeler le directeur')).toBeInTheDocument();
    expect(screen.queryByText('Tâche d’un collègue')).not.toBeInTheDocument();
    expect(screen.queryByText('Tâche terminée')).not.toBeInTheDocument();
    expect(screen.getByText('En retard')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Toutes mes tâches' })).toHaveAttribute('href', '/crm?tab=taches');
  });

  it('aucune tâche assignée → le bloc « Mes tâches » est absent', async () => {
    renderDrawer();
    expect(await screen.findByText('En ligne maintenant')).toBeInTheDocument();
    expect(screen.queryByText('Mes tâches')).not.toBeInTheDocument();
  });

  it('modération : compteur > 0 → lien /moderation ; 0 → bloc absent', async () => {
    rpcMock.listPendingChanges.mockResolvedValue([
      { id: 'pc-1', objectName: 'O', author: 'A', field: 'f', before: 'b', after: 'a', submittedAt: '2026-07-01', status: 'pending' },
      { id: 'pc-2', objectName: 'O', author: 'A', field: 'f', before: 'b', after: 'a', submittedAt: '2026-07-01', status: 'pending' },
    ] as never);
    renderDrawer();
    const link = await screen.findByRole('link', { name: /2 suggestions en attente/i });
    expect(link).toHaveAttribute('href', '/moderation');
  });

  it('pied : « Mon équipe » gated admin (/settings?section=team), Paramètres toujours là', async () => {
    const { unmount } = renderDrawer();
    expect(await screen.findByRole('link', { name: /Paramètres/i })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('link', { name: /Mon équipe/i })).not.toBeInTheDocument();
    unmount();

    useSessionStore.setState({ adminRank: 12 } as never);
    renderDrawer();
    expect(await screen.findByRole('link', { name: /Mon équipe/i })).toHaveAttribute('href', '/settings?section=team');
  });

  it('réseau : bandeau seulement si dégradé/hors-ligne', async () => {
    const { unmount } = renderDrawer();
    expect(await screen.findByText('En ligne maintenant')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    unmount();

    useUiStore.setState({ networkStatus: 'degraded' } as never);
    renderDrawer();
    expect(await screen.findByRole('status')).toHaveTextContent('Connexion dégradée');
  });

  it('déconnexion masquée en mode démo', async () => {
    useSessionStore.setState({ demoMode: true } as never);
    renderDrawer();
    expect(await screen.findByText('En ligne maintenant')).toBeInTheDocument();
    expect(screen.queryByText('Se deconnecter')).not.toBeInTheDocument();
    expect(screen.queryByText('Se déconnecter')).not.toBeInTheDocument();
  });
});
