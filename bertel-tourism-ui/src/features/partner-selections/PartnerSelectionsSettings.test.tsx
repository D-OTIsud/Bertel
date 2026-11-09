import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PartnerSelectionsSettings } from './PartnerSelectionsSettings';
import { useSessionStore } from '../../store/session-store';
import { useExplorerStore, type createExplorerStore } from '../../store/explorer-store';
import * as service from '../../services/partner-selection-admin';
import { listOrgs } from '../../services/orgs';
import { listExplorerReferences } from '../../services/explorer-reference';
import { ensureReferenceCatalogs } from '../../hooks/useReferenceCatalogsQuery';
import type { PartnerSelectionAdmin } from '../../services/partner-selection-admin';

jest.mock('../../services/partner-selection-admin');
jest.mock('../../services/orgs');
jest.mock('../../services/explorer-reference');
jest.mock('../../hooks/useReferenceCatalogsQuery');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
// Exercise store ownership/serialization here; the real shared panel has its own suite.
jest.mock('../../components/explorer/FiltersPanel', () => ({ FiltersPanel: ({ useStore, selectionScope, lockedCommonGroups = [] }: {
  useStore: ReturnType<typeof createExplorerStore>; selectionScope: string; lockedCommonGroups?: string[];
}) => {
  const pets = useStore((state) => state.common.petsAccepted);
  const cities = useStore((state) => state.common.cities);
  return <div data-testid={`filters-${selectionScope}`}>
    {!lockedCommonGroups.includes('pets') && <label>Animaux {selectionScope}<input type="checkbox" checked={pets} onChange={(event) => useStore.getState().setPetsAccepted(event.target.checked)} /></label>}
    {!lockedCommonGroups.includes('city') && <label>Villes {selectionScope}<input value={cities.join(',')} onChange={(event) => useStore.getState().setCities(event.target.value ? [event.target.value] : [])} /></label>}
  </div>;
} }));

const saved = (extra: Partial<PartnerSelectionAdmin> = {}): PartnerSelectionAdmin => ({ id: '1006', orgObjectId: 'org-1', name: 'Terroir',
  state: 'active', revision: 1, buckets: [{ types: ['PRD'] }], explorerState: null, communeInsee: null, createdAt: '', updatedAt: '', ...extra });
const references = { rankedLabelSchemes: [], taxonomies: [], cities: ['Saint-Joseph'], lieuDits: [], tags: [], rankedLabelSchemeValues: {},
  environmentTags: [], amenityFamilies: [], accommodationUnitTypes: [], hotCapacityMetrics: [], resCapacityMetrics: [], capacityBounds: {},
  itiPractices: [], sustainabilityCategories: [], accessibilityDisabilityTypes: [], accessibilityAmenities: [] };
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PartnerSelectionsSettings /></QueryClientProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ role: 'tourism_agent', adminRank: 30, userId: 'admin-1', orgId: 'org-1', orgName: 'Office du Sud', demoMode: false, isTestRealm: false });
  (service.listPartnerSelections as jest.Mock).mockResolvedValue([saved()]);
  (service.previewPartnerSelection as jest.Mock).mockResolvedValue({ meta: { total: 1, next_cursor: null, preview: true }, data: [{ id: 'p1', name: 'Producteur réel', type: 'PRD' }] });
  (listExplorerReferences as jest.Mock).mockResolvedValue(references);
  (ensureReferenceCatalogs as jest.Mock).mockResolvedValue({ tables: { ref_commune: [{ insee_code: '97403', name: 'Entre-Deux' }] } });
  (listOrgs as jest.Mock).mockResolvedValue([{ id: 'org-1', name: 'Office du Sud' }, { id: 'org-2', name: 'Autre office' }]);
});

it('refuses members and lower-ranked administrators before loading any selections', () => {
  useSessionStore.setState({ adminRank: 10 }); renderPage();
  expect(screen.getByText('Réservé aux administrateurs')).toBeInTheDocument();
  expect(service.listPartnerSelections).not.toHaveBeenCalled(); expect(listOrgs).not.toHaveBeenCalled();
});
it('scopes an ORG administrator to the current organisation and searches stable IDs', async () => {
  renderPage(); await screen.findByRole('button', { name: 'Terroir' });
  expect(service.listPartnerSelections).toHaveBeenCalledWith('org-1');
  expect(screen.queryByRole('combobox', { name: 'Organisation des sélections' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: /Rechercher une sélection/ }), { target: { value: '1006' } });
  expect(screen.getByRole('button', { name: 'Terroir' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: /Rechercher une sélection/ }), { target: { value: 'inconnu' } });
  expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
});
it('lets a platform administrator select an organisation and reload its own list', async () => {
  useSessionStore.setState({ role: 'super_admin' }); renderPage();
  const select = await screen.findByRole('combobox', { name: 'Organisation des sélections' });
  await screen.findByRole('option', { name: 'Autre office' });
  fireEvent.change(select, { target: { value: 'org-2' } });
  await waitFor(() => expect(service.listPartnerSelections).toHaveBeenLastCalledWith('org-2'));
});
it('uses independent branch stores, applies common criteria once, and leaves Explorer untouched', async () => {
  const previous = useExplorerStore.getState().common.petsAccepted;
  (service.createPartnerSelection as jest.Mock).mockImplementation(async (input) => saved({ id: '2001', name: input.name, buckets: input.buckets, explorerState: input.explorerState }));
  renderPage(); await screen.findByRole('button', { name: 'Terroir' });
  fireEvent.click(screen.getByRole('button', { name: 'Nouvelle sélection' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Nom de la sélection' }), { target: { value: 'Repas et services' } });
  fireEvent.click(screen.getByRole('button', { name: 'Restaurants' }));
  const first = await screen.findByRole('region', { name: 'Bloc 1 Restaurants' });
  await within(first).findByText('Ajouter ou modifier des critères');
  fireEvent.click(within(first).getByText('Ajouter ou modifier des critères'));
  fireEvent.change(within(first).getByRole('combobox', { name: 'Ajouter un critère dans ce bloc' }), { target: { value: 'pets' } });
  fireEvent.click(await within(first).findByRole('checkbox', { name: 'Animaux branch' }));
  fireEvent.click(screen.getByRole('button', { name: 'Services' }));
  const second = await screen.findByRole('region', { name: 'Bloc 2 Services' });
  fireEvent.click(within(second).getByText('Ajouter ou modifier des critères'));
  fireEvent.change(within(second).getByRole('combobox', { name: 'Ajouter un critère dans ce bloc' }), { target: { value: 'pets' } });
  expect(within(second).getByRole('checkbox', { name: 'Animaux branch' })).not.toBeChecked();
  expect(useExplorerStore.getState().common.petsAccepted).toBe(previous);
  const common = screen.getByRole('region', { name: 'Critères communs' });
  fireEvent.click(within(common).getByText('Ajouter ou modifier des critères'));
  fireEvent.change(within(common).getByRole('combobox', { name: 'Ajouter un critère commun' }), { target: { value: 'pets' } });
  fireEvent.click(within(common).getByRole('checkbox', { name: 'Animaux common' }));
  expect(within(first).queryByRole('checkbox', { name: 'Animaux branch' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la sélection' }));
  await waitFor(() => expect(service.createPartnerSelection).toHaveBeenCalledTimes(1));
  const input = (service.createPartnerSelection as jest.Mock).mock.calls[0][0];
  expect(input.orgObjectId).toBe('org-1'); expect(input.buckets).toHaveLength(2);
  expect(input.buckets.every((bucket: { filters: Record<string, unknown> }) => bucket.filters.pet_accepted === true)).toBe(true);
});
it('renames an advanced definition without silently replacing any payload', async () => {
  const original = saved({ buckets: [{ types: ['ITI'], filters: { future_filter: true }, only_without_practices: true }], communeInsee: ['97403'] });
  (service.listPartnerSelections as jest.Mock).mockResolvedValue([original]);
  (service.updatePartnerSelection as jest.Mock).mockImplementation(async (_id, _revision, input) => ({ ...original, name: input.name, revision: 2 }));
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Terroir' }));
  expect(screen.getByText(/Cette sélection contient des critères avancés/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Nom de la sélection' }), { target: { value: 'Nouveau nom' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la sélection' }));
  await waitFor(() => expect(service.updatePartnerSelection).toHaveBeenCalledWith('1006', 1, expect.objectContaining({ name: 'Nouveau nom', buckets: original.buckets, communeInsee: ['97403'] })));
});
it('shows the inherited INSEE perimeter, then removes it when cities are explicitly edited', async () => {
  const original = saved({ communeInsee: ['97403'] });
  (service.listPartnerSelections as jest.Mock).mockResolvedValue([original]);
  (service.updatePartnerSelection as jest.Mock).mockImplementation(async (_id, _revision, input) => ({ ...original, ...input, revision: 2 }));
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Terroir' }));
  await screen.findByText('Entre-Deux', { exact: false });
  const common = screen.getByRole('region', { name: 'Critères communs' });
  fireEvent.click(within(common).getByText('Ajouter ou modifier des critères'));
  fireEvent.change(within(common).getByRole('combobox', { name: 'Ajouter un critère commun' }), { target: { value: 'city' } });
  fireEvent.change(within(common).getByRole('textbox', { name: 'Villes common' }), { target: { value: 'Saint-Joseph' } });
  expect(screen.queryByText('Communes du périmètre enregistré')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la sélection' }));
  await waitFor(() => expect(service.updatePartnerSelection).toHaveBeenCalledWith('1006', 1, expect.objectContaining({ communeInsee: null, buckets: [{ types: ['PRD'], filters: { city_any: ['Saint-Joseph'] } }] })));
});
it('does not show a failed preview as zero records and preserves the editor', async () => {
  (service.previewPartnerSelection as jest.Mock).mockRejectedValue(new Error('Backend indisponible'));
  renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'Terroir' }));
  expect(await screen.findByText('Aperçu indisponible')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Nom de la sélection' })).toHaveValue('Terroir');
  expect(screen.queryByText('0 fiche')).not.toBeInTheDocument();
});
it('shows a real zero volume, and does not claim a suspension until the service confirms it', async () => {
  let finish!: (selection: PartnerSelectionAdmin) => void;
  (service.previewPartnerSelection as jest.Mock).mockResolvedValue({ meta: { total: 0, next_cursor: null, preview: true }, data: [] });
  (service.setPartnerSelectionState as jest.Mock).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  renderPage();
  const volume = await screen.findByLabelText('Volume de Terroir');
  expect(await within(volume).findByText('0')).toBeInTheDocument();
  expect(service.previewPartnerSelection).toHaveBeenCalledWith(expect.objectContaining({ orgObjectId: 'org-1' }), expect.objectContaining({ pageSize: 1 }));
  fireEvent.click(screen.getByRole('button', { name: 'Suspendre Terroir' }));
  expect(screen.getByText('Active')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Suspendre Terroir' })).toBeDisabled();
  await act(async () => { finish(saved({ state: 'suspended', revision: 2 })); });
  expect(screen.getByText('Suspendue')).toBeInTheDocument();
  expect(service.setPartnerSelectionState).toHaveBeenCalledTimes(1);
});
it('disregards list responses from an organisation that was left', async () => {
  let finish!: (rows: PartnerSelectionAdmin[]) => void;
  (service.listPartnerSelections as jest.Mock).mockImplementation((orgId) => orgId === 'org-1' ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve([saved({ id: '2002', name: 'Autre sélection' })]));
  useSessionStore.setState({ role: 'super_admin' }); renderPage();
  await screen.findByRole('option', { name: 'Autre office' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Organisation des sélections' }), { target: { value: 'org-2' } });
  await screen.findByRole('button', { name: 'Autre sélection' });
  await act(async () => { finish([saved({ name: 'Ancienne sélection' })]); });
  expect(screen.queryByRole('button', { name: 'Ancienne sélection' })).not.toBeInTheDocument();
});
