import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getObjectLifecycleDetails, restoreObjectVersion } from '../services/object-versions';
import { setObjectStatus } from '../services/object-workspace';
import { useSessionStore } from '../store/session-store';
import { useObjectLifecycleDetailsQuery } from './useObjectLifecycleDetailsQuery';
import { useRestoreObjectVersionMutation, useSetObjectStatusMutation } from './useExplorerQueries';

jest.mock('../services/object-versions', () => ({
  ...jest.requireActual('../services/object-versions'),
  getObjectLifecycleDetails: jest.fn(),
  restoreObjectVersion: jest.fn(),
}));
jest.mock('../services/object-workspace', () => ({
  ...jest.requireActual('../services/object-workspace'),
  setObjectStatus: jest.fn(),
}));

const initialSession = useSessionStore.getState();
const clients: QueryClient[] = [];
const archive = { createdAt: '2026-11-26T10:30:00Z', createdByName: 'Alice', changeReason: 'Fermeture' };

function setupClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ userId: 'user-a', orgId: 'org-a', demoMode: false, status: 'ready' });
  jest.mocked(getObjectLifecycleDetails).mockResolvedValue(archive);
  jest.mocked(setObjectStatus).mockResolvedValue('archived');
  jest.mocked(restoreObjectVersion).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useSessionStore.setState(initialSession);
});

it('loads details only when an object id and a relevant status are supplied', async () => {
  const { client, wrapper } = setupClient();
  const { result, rerender } = renderHook(
    ({ objectId, status }: { objectId: string | null; status: 'archived' | 'hidden' | null }) =>
      useObjectLifecycleDetailsQuery(objectId, status),
    { wrapper, initialProps: { objectId: null, status: 'archived' } },
  );
  expect(getObjectLifecycleDetails).not.toHaveBeenCalled();

  rerender({ objectId: 'object-a', status: null });
  expect(getObjectLifecycleDetails).not.toHaveBeenCalled();
  rerender({ objectId: 'object-a', status: 'archived' });
  await waitFor(() => expect(result.current.data).toEqual(archive));
  expect(getObjectLifecycleDetails).toHaveBeenCalledWith('object-a', 'archived');
  expect(client.getQueryCache().find({ queryKey: ['object-lifecycle-details', 'object-a', 'archived'], exact: false })?.meta)
    .toEqual({ persist: false });
});

it('keeps object and account changes in separate caches', async () => {
  const { wrapper } = setupClient();
  const { result, rerender } = renderHook(
    ({ objectId }) => useObjectLifecycleDetailsQuery(objectId, 'archived'),
    { wrapper, initialProps: { objectId: 'object-a' } },
  );
  await waitFor(() => expect(result.current.data).toEqual(archive));

  const otherObjectArchive = { ...archive, createdByName: 'Benoît' };
  jest.mocked(getObjectLifecycleDetails).mockResolvedValue(otherObjectArchive);
  rerender({ objectId: 'object-b' });
  expect(result.current.data).toBeUndefined();
  await waitFor(() => expect(result.current.data).toEqual(otherObjectArchive));

  const otherUserArchive = { ...archive, createdByName: 'Chloé' };
  jest.mocked(getObjectLifecycleDetails).mockResolvedValue(otherUserArchive);
  act(() => useSessionStore.setState({ userId: 'user-b' }));
  expect(result.current.data).toBeUndefined();
  await waitFor(() => expect(result.current.data).toEqual(otherUserArchive));
  expect(getObjectLifecycleDetails).toHaveBeenCalledTimes(3);
});

it('refreshes the author after a later archive instead of serving the previous episode', async () => {
  const { wrapper } = setupClient();
  const { result } = renderHook(() => ({
    details: useObjectLifecycleDetailsQuery('object-a', 'archived'),
    mutation: useSetObjectStatusMutation('object-a'),
  }), { wrapper });
  await waitFor(() => expect(result.current.details.data).toEqual(archive));

  const laterArchive = { createdAt: '2026-11-26T11:00:00Z', createdByName: 'Benoît', changeReason: 'Arrêt définitif' };
  jest.mocked(setObjectStatus).mockImplementation(async () => {
    jest.mocked(getObjectLifecycleDetails).mockResolvedValue(laterArchive);
    return 'archived';
  });
  await act(async () => {
    await result.current.mutation.mutateAsync({ status: 'archived', reason: 'Arrêt définitif' });
  });

  expect(setObjectStatus).toHaveBeenCalledWith('object-a', 'archived', 'Arrêt définitif');
  await waitFor(() => expect(result.current.details.data).toEqual(laterArchive));
  expect(getObjectLifecycleDetails).toHaveBeenCalledTimes(2);
});

it('refreshes archive details when a historical version is restored', async () => {
  const { wrapper } = setupClient();
  const { result } = renderHook(() => ({
    details: useObjectLifecycleDetailsQuery('object-a', 'archived'),
    restore: useRestoreObjectVersionMutation('object-a'),
  }), { wrapper });
  await waitFor(() => expect(result.current.details.data).toEqual(archive));

  const restoredArchive = { ...archive, createdByName: 'Chloé' };
  jest.mocked(restoreObjectVersion).mockImplementation(async () => {
    jest.mocked(getObjectLifecycleDetails).mockResolvedValue(restoredArchive);
  });
  await act(async () => { await result.current.restore.mutateAsync(2); });

  await waitFor(() => expect(result.current.details.data).toEqual(restoredArchive));
  expect(restoreObjectVersion).toHaveBeenCalledWith('object-a', 2);
});

it('invalidates the archived object even if the route changes while the mutation is pending', async () => {
  const { client, wrapper } = setupClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  let resolveStatus!: (status: 'archived') => void;
  jest.mocked(setObjectStatus).mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
  const { result, rerender } = renderHook(
    ({ objectId }) => useSetObjectStatusMutation(objectId),
    { wrapper, initialProps: { objectId: 'object-a' } },
  );

  let pending!: Promise<unknown>;
  act(() => { pending = result.current.mutateAsync('archived'); });
  await waitFor(() => expect(setObjectStatus).toHaveBeenCalledWith('object-a', 'archived'));
  rerender({ objectId: 'object-b' });
  await act(async () => { resolveStatus('archived'); await pending; });

  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['object-lifecycle-details', 'object-a'] });
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['object-lifecycle-details', 'object-b'] });
});

it('loads offline details separately from a previous archive and passes the unpublish reason', async () => {
  const { wrapper } = setupClient();
  const { result, rerender } = renderHook(
    ({ status }: { status: 'archived' | 'hidden' }) => ({
      details: useObjectLifecycleDetailsQuery('object-a', status),
      mutation: useSetObjectStatusMutation('object-a'),
    }),
    { wrapper, initialProps: { status: 'archived' } },
  );
  await waitFor(() => expect(result.current.details.data).toEqual(archive));

  const hidden = { ...archive, createdByName: 'David', changeReason: 'Informations à corriger' };
  jest.mocked(setObjectStatus).mockImplementation(async () => {
    jest.mocked(getObjectLifecycleDetails).mockResolvedValue(hidden);
    return 'hidden';
  });
  await act(async () => {
    await result.current.mutation.mutateAsync({ status: 'hidden', reason: 'Informations à corriger' });
  });
  rerender({ status: 'hidden' });

  expect(result.current.details.data).toBeUndefined();
  await waitFor(() => expect(result.current.details.data).toEqual(hidden));
  expect(getObjectLifecycleDetails).toHaveBeenLastCalledWith('object-a', 'hidden');
  expect(setObjectStatus).toHaveBeenCalledWith('object-a', 'hidden', 'Informations à corriger');
});
