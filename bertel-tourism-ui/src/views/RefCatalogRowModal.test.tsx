// §211 — revue T8 de RefCatalogRowModal.
// Constat 1 (CRITIQUE) : Modal reste MONTEE (contrat) donc l'initialiseur paresseux de
// `useState` ne resynchronise jamais `draft` quand `row` change sur la MEME instance —
// annuler sur la ligne A puis rouvrir sur B ecrivait silencieusement les valeurs de A dans B.
// Constat 2 (important) : les listes de reference ne distinguaient pas chargement/echec/vide.
// Gabarit de montage : WebChannelEditModal.test.tsx (QueryClientProvider requis ici car le
// composant appelle useQueries).

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RefCatalogRowModal } from './RefCatalogRowModal';
import * as refCatalogs from '../services/ref-catalogs';
import type { RefCatalogDetail } from '../services/ref-catalogs';

jest.mock('../services/ref-catalogs');
const mock = refCatalogs as jest.Mocked<typeof refCatalogs>;

// Catalogue porteur : une colonne texte libre (name), une colonne verrouillee en edition
// (code, PK sans defaut) et une reference sortante (family_id -> ref_code:family) — de quoi
// eprouver les deux constats dans le meme montage.
const CATALOG: RefCatalogDetail = {
  catalogKey: 'ref_code:price_type',
  kind: 'ref_code_domain',
  label: 'Type de prix',
  family: 'Tarifs',
  usedIn: null,
  access: 'editable',
  readonlyReason: null,
  isIdentifiable: true,
  primaryKeyColumns: ['id'],
  labelColumn: 'name',
  columns: [
    { name: 'id', type: 'uuid', isRequired: true, hasDefault: true, enumValues: null },
    { name: 'code', type: 'text', isRequired: true, hasDefault: false, enumValues: null },
    { name: 'name', type: 'text', isRequired: true, hasDefault: false, enumValues: null },
    { name: 'family_id', type: 'uuid', isRequired: false, hasDefault: false, enumValues: null },
  ],
  fks: [{ column: 'family_id', target: 'ref_code:family' }],
  rows: [],
  usage: {},
};

const FAMILY_CATALOG: RefCatalogDetail = {
  catalogKey: 'ref_code:family',
  kind: 'ref_code_domain',
  label: 'Famille',
  family: 'Tarifs',
  usedIn: null,
  access: 'editable',
  readonlyReason: null,
  isIdentifiable: true,
  primaryKeyColumns: ['id'],
  labelColumn: 'name',
  columns: [],
  fks: [],
  rows: [
    { id: 'f1', name: 'Famille 1' },
    { id: 'f2', name: 'Famille 2' },
  ],
  usage: {},
};

const ROW_A = { id: 'a1', code: 'A', name: 'Row A', family_id: 'f1' };
const ROW_B = { id: 'b1', code: 'B', name: 'Row B', family_id: 'f2' };

function tree(props: Partial<Parameters<typeof RefCatalogRowModal>[0]>, client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <RefCatalogRowModal
        catalog={CATALOG}
        row={ROW_A}
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
        {...props}
      />
    </QueryClientProvider>
  );
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  mock.getRefCatalog.mockResolvedValue(FAMILY_CATALOG);
  mock.upsertRefRow.mockResolvedValue(undefined);
});

describe('RefCatalogRowModal — resynchronisation du draft (constat 1, revue T8)', () => {
  it("n'ecrase pas la ligne B avec les valeurs de A apres un cycle annuler A -> ouvrir B", async () => {
    const client = newClient();
    const { rerender } = render(tree({ row: ROW_A, open: true }, client));

    expect(screen.getByLabelText('name')).toHaveValue('Row A');

    // Le parent referme la modale (elle reste MONTEE — contrat Modal) ; `row` n'a pas
    // encore change a cet instant.
    rerender(tree({ row: ROW_A, open: false }, client));

    // Reouverture de la MEME instance sur une AUTRE ligne.
    rerender(tree({ row: ROW_B, open: true }, client));

    expect(screen.getByLabelText('name')).toHaveValue('Row B');
    expect(screen.getByLabelText('code')).toHaveValue('B');

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(mock.upsertRefRow).toHaveBeenCalled());
    const [catalogKey, key, values] = mock.upsertRefRow.mock.calls[0];
    expect(catalogKey).toBe('ref_code:price_type');
    expect(key).toEqual({ id: 'b1' });
    // La preuve du piege : sans resynchronisation, `values.name` porterait 'Row A'.
    expect(values.name).toBe('Row B');
  });

  it('vide le message d\'erreur affiche pour A quand on rouvre sur B', async () => {
    mock.upsertRefRow.mockRejectedValueOnce(new Error('STILL_REFERENCED'));
    const client = newClient();
    const { rerender } = render(tree({ row: ROW_A, open: true }, client));

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cette valeur est utilisee par des fiches.');

    rerender(tree({ row: ROW_A, open: false }, client));
    rerender(tree({ row: ROW_B, open: true }, client));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('RefCatalogRowModal — etats des listes de reference (constat 2, revue T8)', () => {
  it('affiche un etat de chargement explicite sans masquer la valeur courante', async () => {
    mock.getRefCatalog.mockReturnValue(new Promise(() => {})); // ne se resout jamais
    const client = newClient();
    render(tree({ row: ROW_A, open: true }, client));

    const select = screen.getByLabelText('family_id') as HTMLSelectElement;
    expect(select).toBeDisabled();
    expect(select).toHaveValue('f1'); // la vraie valeur reste visible, pas "—"
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…');
  });

  it("affiche un message d'echec lisible sans masquer la valeur courante", async () => {
    mock.getRefCatalog.mockRejectedValue(new Error('boom'));
    const client = newClient();
    render(tree({ row: ROW_A, open: true }, client));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger les valeurs de reference.',
    );
    const select = screen.getByLabelText('family_id') as HTMLSelectElement;
    expect(select).toHaveValue('f1');
  });

  it('une fois chargee, la liste propose les options reelles', async () => {
    const client = newClient();
    render(tree({ row: ROW_A, open: true }, client));

    expect(await screen.findByRole('option', { name: 'Famille 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Famille 2' })).toBeInTheDocument();
    const select = screen.getByLabelText('family_id') as HTMLSelectElement;
    expect(select).not.toBeDisabled();
    expect(select).toHaveValue('f1');
  });
});
