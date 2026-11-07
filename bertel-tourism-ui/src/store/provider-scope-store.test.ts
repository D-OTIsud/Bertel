import { useProviderScopeStore } from './provider-scope-store';
import { useDashboardExplorerStore, useExplorerStore } from './explorer-store';
import { saveProviderPreference } from '../services/provider-preference';
import { buildSearchParams, parseSearchParams } from '../lib/explorer-search-params';
import { dashboardStatsParams } from '../lib/dashboard-stats-params';
import { buildBucketRpcFilters } from '../utils/facets';

jest.mock('../services/provider-preference', () => ({ saveProviderPreference: jest.fn() }));
const save = jest.mocked(saveProviderPreference);

beforeEach(() => {
  useProviderScopeStore.getState().clear();
  useExplorerStore.getState().resetAll();
  useDashboardExplorerStore.getState().resetAll();
  save.mockReset().mockResolvedValue(undefined);
});

it('restaure la préférence du compte sur les deux pages et isole les comptes successifs', () => {
  useExplorerStore.getState().setCities(['Saint-Pierre']);
  useProviderScopeStore.getState().initialize('alice', true);
  expect(useExplorerStore.getState().common.providerOnly).toBe(true);
  expect(useDashboardExplorerStore.getState().common.providerOnly).toBe(true);
  expect(useExplorerStore.getState().common.cities).toEqual(['Saint-Pierre']);
  useProviderScopeStore.getState().initialize('bob', false);
  expect(useExplorerStore.getState().common.providerOnly).toBe(false);
  expect(useDashboardExplorerStore.getState().common.providerOnly).toBe(false);
  expect(save).not.toHaveBeenCalled();
});

it('un clic met à jour le compte et le filtre serveur des deux écrans', async () => {
  useProviderScopeStore.getState().initialize('alice', false);
  await useProviderScopeStore.getState().setEnabled(true);
  expect(save).toHaveBeenCalledWith(true);
  expect(buildBucketRpcFilters(useExplorerStore.getState(), 'VIS')).toMatchObject({ has_provider: true });
  expect(dashboardStatsParams(useDashboardExplorerStore.getState(), {}).p_filters).toMatchObject({ has_provider: true });
  useExplorerStore.getState().resetAll();
  useDashboardExplorerStore.getState().resetAll();
  expect(useExplorerStore.getState().common.providerOnly).toBe(true);
  expect(useDashboardExplorerStore.getState().common.providerOnly).toBe(true);
  await useProviderScopeStore.getState().setEnabled(false);
  expect(buildBucketRpcFilters(useExplorerStore.getState(), 'VIS')).not.toHaveProperty('has_provider');
});

it('les liens explicites priment temporairement sans modifier la préférence enregistrée', () => {
  useProviderScopeStore.getState().initialize('alice', true);
  useExplorerStore.getState().replaceFiltersFromUrl(parseSearchParams(new URLSearchParams('providerOnly=false&cities=Saint-Pierre')));
  expect(useExplorerStore.getState().common.providerOnly).toBe(false);
  expect(useDashboardExplorerStore.getState().common.providerOnly).toBe(true);
  expect(useProviderScopeStore.getState().enabled).toBe(true);
  expect(buildSearchParams(useExplorerStore.getState()).get('providerOnly')).toBe('false');
  useExplorerStore.getState().setProviderOnly(true);
  expect(buildSearchParams(useExplorerStore.getState()).get('providerOnly')).toBe('true');
  expect(save).not.toHaveBeenCalled();
});

it('les anciennes URLs, même avec une commune, conservent la préférence', () => {
  useProviderScopeStore.getState().initialize('alice', true);
  useExplorerStore.getState().replaceFiltersFromUrl(parseSearchParams(new URLSearchParams('cities=Saint-Pierre')));
  expect(useExplorerStore.getState().common.providerOnly).toBe(true);
  useExplorerStore.getState().replaceFiltersFromUrl(parseSearchParams(new URLSearchParams('providerOnly=garbage')));
  expect(useExplorerStore.getState().common.providerOnly).toBe(true);
});

it('un renouvellement de session ne réinitialise pas le filtre courant', () => {
  useProviderScopeStore.getState().initialize('alice', true);
  useExplorerStore.getState().setProviderOnly(false);
  useProviderScopeStore.getState().initialize('alice', true);
  expect(useExplorerStore.getState().common.providerOnly).toBe(false);
});

it('un échec de mémorisation restaure les deux états précédents et signale l’erreur', async () => {
  useProviderScopeStore.getState().initialize('alice', false);
  useExplorerStore.getState().setProviderOnly(true);
  save.mockRejectedValue(new Error('offline'));
  await useProviderScopeStore.getState().setEnabled(true);
  expect(useExplorerStore.getState().common.providerOnly).toBe(true);
  expect(useDashboardExplorerStore.getState().common.providerOnly).toBe(false);
  expect(useProviderScopeStore.getState()).toMatchObject({ enabled: false, saving: false });
  expect(useProviderScopeStore.getState().error).toContain('Réessayez');
});

it('une réponse tardive après déconnexion ne modifie pas la nouvelle session, même du même compte', async () => {
  let reject!: (reason: Error) => void;
  save.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  useProviderScopeStore.getState().initialize('alice', false);
  const pending = useProviderScopeStore.getState().setEnabled(true);
  useProviderScopeStore.getState().clear();
  useProviderScopeStore.getState().initialize('alice', true);
  reject(new Error('old request'));
  await pending;
  expect(useProviderScopeStore.getState()).toMatchObject({ enabled: true, saving: false, error: null });
  expect(useExplorerStore.getState().common.providerOnly).toBe(true);
});
