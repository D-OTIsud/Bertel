import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server.node';
import { hydrateRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from './DashboardPage';
import { useDashboardExplorerStore } from '../store/explorer-store';
import { useDashboardFilterStore } from '../store/dashboard-filter-store';
import { useSessionStore } from '../store/session-store';
import { listExplorerReferences } from '../services/explorer-reference';
import type { ExplorerReferences } from '../types/domain';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../services/explorer-reference', () => ({ listExplorerReferences: jest.fn() }));
jest.mock('../hooks/useDashboardQuery', () => ({
  DASHBOARD_STALE_TIME_MS: 300000,
  useDashboardQuery: () => ({ isPending: true, error: null, refetch: jest.fn() }),
}));
jest.mock('../services/dashboard-rpc', () => ({
  getDashboardCrmOpen: jest.fn().mockResolvedValue({ total: 0 }),
  getDashboardTeamActivity: jest.fn().mockResolvedValue({}),
  getDashboardCrmActivity: jest.fn().mockResolvedValue({}),
}));
jest.mock('../components/dashboard/TimeseriesWidget', () => ({ TimeseriesWidget: () => null }));

const references: ExplorerReferences = {
  cities: ['Le Tampon'], lieuDits: [], taxonomies: [], accessibilityDisabilityTypes: [], accessibilityAmenities: [],
  sustainabilityCategories: [], rankedLabelSchemes: [{ code: 'hot_stars', name: 'Classement hôtelier' }],
  rankedLabelSchemeValues: {}, tags: [], environmentTags: [], amenityFamilies: [], accommodationUnitTypes: [],
  hotCapacityMetrics: [], resCapacityMetrics: [], capacityBounds: {}, itiPractices: [],
};

beforeEach(() => {
  useDashboardExplorerStore.getState().resetAll();
  useDashboardFilterStore.setState({ activeTab: 'quality', updatedAtFrom: null, updatedAtTo: null });
  useSessionStore.setState({ canEditObjects: false, orgId: null, userId: null });
  jest.mocked(listExplorerReferences).mockReset().mockResolvedValue(references);
});

it.each(['chaud', 'froid'] as const)('hydrate le Dashboard sans divergence avec un cache %s puis expose le catalogue réel', async (cache) => {
  const serverClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (queryClient: QueryClient) => <QueryClientProvider client={queryClient}><DashboardPage /></QueryClientProvider>;
  const html = renderToString(view(serverClient));
  expect(html).toContain('Tags');
  expect(html).not.toContain('Labels &amp; certifications');
  expect(listExplorerReferences).not.toHaveBeenCalled();
  // This reproduces the first client render after references have been restored
  // from persistence; the real reference hook and FiltersPanel remain mounted.
  if (cache === 'chaud') client.setQueryData(['explorer-references'], references);
  useDashboardExplorerStore.getState().setCities(['Le Tampon']);
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  const onRecoverableError = jest.fn();
  let root: Root | undefined;
  try {
    await act(async () => { root = hydrateRoot(container, view(client), { onRecoverableError }); });
    await waitFor(() => expect(screen.getByText('Labels & certifications')).toBeInTheDocument());
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Retirer le filtre.*Le Tampon/ })).toBeInTheDocument();
    expect(useDashboardExplorerStore.getState().common.cities).toEqual(['Le Tampon']);
    expect(client.getQueryData(['explorer-references'])).toEqual(references);
    fireEvent.click(screen.getByRole('button', { name: 'Toutes les distinctions' }));
    fireEvent.click(screen.getByRole('option', { name: 'Classement hôtelier' }));
    expect(useDashboardExplorerStore.getState().common.rankedLabelSchemeCode).toBe('hot_stars');
    expect(listExplorerReferences).toHaveBeenCalledTimes(cache === 'chaud' ? 0 : 1);
  } finally {
    act(() => root?.unmount());
    container.remove();
    serverClient.clear();
    client.clear();
  }
});
