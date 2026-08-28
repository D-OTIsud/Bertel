// Garde du tiroir de notifications (16w) : états (chargement / vide / erreur), marquage
// lu, et navigation vers le kanban. La boîte n'est chargée que tiroir OUVERT.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationDrawer, notificationLabel } from './NotificationDrawer';
import { useSessionStore } from '../../store/session-store';
import * as notifications from '../../services/notifications';
import type { AppNotification } from '../../services/notifications';

jest.mock('../../services/notifications', () => ({
  ...jest.requireActual('../../services/notifications'),
  listMyNotifications: jest.fn(),
  countMyUnreadNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const mocked = notifications as jest.Mocked<typeof notifications>;

function notif(over: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    kind: 'crm_task_assigned',
    createdAt: '2026-08-28T10:00:00Z',
    readAt: null,
    taskId: 't1',
    taskTitle: 'Rappeler le directeur',
    objectId: 'obj-1',
    objectName: 'Hôtel Test',
    createdById: 'u-jean',
    createdByName: 'Jean P.',
    ...over,
  };
}

function renderDrawer(open = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = jest.fn();
  render(
    <QueryClientProvider client={client}>
      <NotificationDrawer open={open} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange, client };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ userId: 'u-me', demoMode: false } as never);
  mocked.listMyNotifications.mockResolvedValue({ items: [notif()], unreadCount: 1 });
  mocked.markNotificationRead.mockResolvedValue(1);
  mocked.markAllNotificationsRead.mockResolvedValue(1);
});

describe('notificationLabel', () => {
  it('nomme l’émetteur et la tâche', () => {
    expect(notificationLabel(notif())).toBe('Jean P. vous a assigné « Rappeler le directeur »');
  });

  it('un émetteur ou une tâche inconnus se DISENT, ils ne se devinent pas', () => {
    expect(notificationLabel(notif({ createdByName: null, taskTitle: null }))).toBe(
      'Quelqu’un vous a assigné « une tâche »',
    );
  });
});

describe('NotificationDrawer', () => {
  it('tiroir FERMÉ : aucune requête (une boîte fermée ne coûte rien)', () => {
    renderDrawer(false);
    expect(mocked.listMyNotifications).not.toHaveBeenCalled();
  });

  it('liste les notifications avec leur contexte', async () => {
    renderDrawer();
    expect(await screen.findByText('Jean P. vous a assigné « Rappeler le directeur »')).toBeInTheDocument();
    expect(screen.getByText(/Hôtel Test/)).toBeInTheDocument();
  });

  it('le non-lu porte DEUX signaux : la classe is-unread et un texte accessible', async () => {
    renderDrawer();
    await screen.findByText(/Rappeler le directeur/);
    expect(document.querySelector('.notif-item.is-unread')).toBeTruthy();
    expect(screen.getByText('Non lue')).toBeInTheDocument();
  });

  it('une notification DÉJÀ lue ne porte ni la classe ni le texte', async () => {
    mocked.listMyNotifications.mockResolvedValue({
      items: [notif({ readAt: '2026-08-28T11:00:00Z' })],
      unreadCount: 0,
    });
    renderDrawer();
    await screen.findByText(/Rappeler le directeur/);
    expect(document.querySelector('.notif-item.is-unread')).toBeFalsy();
    expect(screen.queryByText('Non lue')).not.toBeInTheDocument();
  });

  it('clic : marque lu, ferme le tiroir et navigue vers le kanban', async () => {
    const { onOpenChange } = renderDrawer();
    fireEvent.click(await screen.findByText(/Rappeler le directeur/));
    await waitFor(() => expect(mocked.markNotificationRead).toHaveBeenCalledWith('n1'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(push).toHaveBeenCalledWith('/crm?tab=taches');
  });

  it('clic sur une notification DÉJÀ lue : on navigue sans ré-écrire en base', async () => {
    mocked.listMyNotifications.mockResolvedValue({
      items: [notif({ readAt: '2026-08-28T11:00:00Z' })],
      unreadCount: 0,
    });
    renderDrawer();
    fireEvent.click(await screen.findByText(/Rappeler le directeur/));
    expect(mocked.markNotificationRead).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/crm?tab=taches');
  });

  it('« Tout marquer comme lu » : proposé seulement s’il reste des non-lues', async () => {
    renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: /Tout marquer comme lu/i }));
    await waitFor(() => expect(mocked.markAllNotificationsRead).toHaveBeenCalledTimes(1));
  });

  it('aucune non-lue : le bouton « Tout marquer comme lu » n’est pas rendu', async () => {
    mocked.listMyNotifications.mockResolvedValue({
      items: [notif({ readAt: '2026-08-28T11:00:00Z' })],
      unreadCount: 0,
    });
    renderDrawer();
    await screen.findByText(/Rappeler le directeur/);
    expect(screen.queryByRole('button', { name: /Tout marquer comme lu/i })).not.toBeInTheDocument();
  });

  it('boîte vide : message explicite, jamais un tiroir muet', async () => {
    mocked.listMyNotifications.mockResolvedValue({ items: [], unreadCount: 0 });
    renderDrawer();
    expect(await screen.findByText(/Aucune notification/)).toBeInTheDocument();
  });

  it('erreur : message + bouton Réessayer qui relance vraiment la requête', async () => {
    mocked.listMyNotifications.mockRejectedValueOnce(new Error('réseau coupé'));
    renderDrawer();
    expect(await screen.findByRole('alert')).toHaveTextContent('réseau coupé');
    mocked.listMyNotifications.mockResolvedValue({ items: [notif()], unreadCount: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText(/Rappeler le directeur/)).toBeInTheDocument();
  });
});
