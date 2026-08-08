import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RefCatalogAdmin } from './RefCatalogAdmin';
import * as service from '../services/ref-catalogs';

jest.mock('../services/ref-catalogs', () => ({
  ...jest.requireActual('../services/ref-catalogs'),
  listRefCatalogs: jest.fn(),
  getRefCatalog: jest.fn(),
  upsertRefRow: jest.fn(),
  deleteRefRow: jest.fn(),
  reorderRefRows: jest.fn(),
}));

const mock = service as jest.Mocked<typeof service>;

const summary = (over: Partial<service.RefCatalogSummary> = {}): service.RefCatalogSummary => ({
  catalogKey: 'ref_legal_type',
  kind: 'table',
  label: 'Documents juridiques',
  family: 'Juridique et conformité',
  usedIn: '§18 Juridique',
  access: 'editable',
  readonlyReason: null,
  nValues: 2,
  ...over,
});

const detail = (over: Partial<service.RefCatalogDetail> = {}): service.RefCatalogDetail => ({
  catalogKey: 'ref_legal_type',
  kind: 'table',
  label: 'Documents juridiques',
  family: 'Juridique et conformité',
  usedIn: '§18 Juridique',
  access: 'editable',
  readonlyReason: null,
  isIdentifiable: true,
  primaryKeyColumns: ['id'],
  labelColumn: 'name',
  columns: [
    { name: 'id', type: 'uuid', isRequired: true, hasDefault: true, enumValues: null },
    { name: 'code', type: 'text', isRequired: true, hasDefault: false, enumValues: null },
    { name: 'name', type: 'text', isRequired: true, hasDefault: false, enumValues: null },
    { name: 'position', type: 'integer', isRequired: false, hasDefault: true, enumValues: null },
  ],
  fks: [],
  rows: [
    { id: 'u1', code: 'kbis', name: 'Extrait KBIS', position: 1 },
    { id: 'u2', code: 'siret', name: 'SIRET', position: 2 },
  ],
  usage: { u2: 2 },
  ...over,
});

function renderAdmin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RefCatalogAdmin />
    </QueryClientProvider>,
  );
}

describe('RefCatalogAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mock.listRefCatalogs.mockResolvedValue([
      summary(),
      summary({ catalogKey: 'ref_orphan', label: 'Orphelin', family: 'À classer', nValues: 0 }),
      summary({
        catalogKey: 'ref_permission',
        label: 'Permissions',
        family: 'Structure',
        access: 'readonly',
        readonlyReason: 'Chaque code est lu en dur par le contrôle d’accès.',
      }),
    ]);
    mock.getRefCatalog.mockImplementation(async (catalogKey) => {
      if (catalogKey === 'ref_permission') {
        return detail({
          catalogKey,
          label: 'Permissions',
          family: 'Structure',
          access: 'readonly',
          readonlyReason: 'Chaque code est lu en dur par le contrôle d’accès.',
        });
      }
      return detail({ catalogKey });
    });
    mock.upsertRefRow.mockResolvedValue(undefined);
    mock.deleteRefRow.mockResolvedValue(undefined);
    mock.reorderRefRows.mockResolvedValue(undefined);
  });

  it('range les catalogues par famille, « À classer » en dernier', async () => {
    renderAdmin();
    const families = await screen.findAllByRole('heading', { level: 3 });
    expect(families.at(-1)).toHaveTextContent('À classer');
  });

  it('affiche le motif d un catalogue en lecture seule et bloque ses mutations', async () => {
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: /Permissions/ }));

    expect(await screen.findByText(/lu en dur par le contrôle/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier Extrait KBIS' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Ajouter/ })).not.toBeInTheDocument();
  });

  it('garde la corbeille accessible et explique le blocage tant que la valeur est referencee', async () => {
    renderAdmin();
    expect(await screen.findByText('2 fiches')).toBeInTheDocument();

    const blockedDelete = screen.getByRole('button', { name: 'Supprimer SIRET' });
    expect(blockedDelete).toHaveAttribute('aria-disabled', 'true');
    expect(blockedDelete).toHaveAccessibleDescription(/Référencée par 2 fiches/);
    expect(screen.getByRole('button', { name: 'Supprimer Extrait KBIS' }))
      .not.toHaveAttribute('aria-disabled');
  });

  it('desactive l ajout et nomme la colonne bloquante', async () => {
    mock.getRefCatalog.mockResolvedValue(detail({
      columns: [
        { name: 'id', type: 'uuid', isRequired: true, hasDefault: true, enumValues: null },
        { name: 'metadata', type: 'jsonb', isRequired: true, hasDefault: false, enumValues: null },
      ],
    }));
    renderAdmin();

    expect(await screen.findByRole('button', { name: /Ajouter/ })).toBeDisabled();
    expect(screen.getByText(/metadata/)).toBeInTheDocument();
  });

  it('cree sans cle puis edite avec la cle canonique de la ligne', async () => {
    renderAdmin();
    await screen.findByText('Extrait KBIS');

    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));
    fireEvent.change(screen.getByLabelText('code'), { target: { value: 'inpi' } });
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Extrait INPI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(mock.upsertRefRow).toHaveBeenCalledWith(
      'ref_legal_type',
      null,
      expect.objectContaining({ code: 'inpi', name: 'Extrait INPI' }),
    ));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Modifier Extrait KBIS' }));
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'KBIS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(mock.upsertRefRow).toHaveBeenLastCalledWith(
      'ref_legal_type',
      { id: 'u1' },
      expect.objectContaining({ name: 'KBIS' }),
    ));
  });

  it('reordonne en envoyant toutes les cles dans le nouvel ordre', async () => {
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Descendre Extrait KBIS' }));

    await waitFor(() => expect(mock.reorderRefRows).toHaveBeenCalledWith(
      'ref_legal_type',
      [{ id: 'u2' }, { id: 'u1' }],
    ));
  });

  it('cherche dans les valeurs du catalogue ouvert et masque le reordonnancement filtre', async () => {
    renderAdmin();
    await screen.findByText('Extrait KBIS');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'siret' } });
    expect(screen.queryByText('Extrait KBIS')).not.toBeInTheDocument();
    expect(screen.getByText('SIRET')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Monter SIRET|Descendre SIRET/ }))
      .not.toBeInTheDocument();
  });

  it('supprime une valeur non referencee apres confirmation', async () => {
    renderAdmin();
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer Extrait KBIS' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer définitivement' }));

    await waitFor(() => expect(mock.deleteRefRow).toHaveBeenCalledWith(
      'ref_legal_type',
      { id: 'u1' },
    ));
  });

  it('rend une erreur de chargement recuperable', async () => {
    mock.listRefCatalogs.mockRejectedValue(new Error('réseau indisponible'));
    renderAdmin();

    expect(await screen.findByRole('alert')).toHaveTextContent('Catalogues indisponibles');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
