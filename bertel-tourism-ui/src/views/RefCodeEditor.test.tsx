import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RefCodeEditor } from './RefCodeEditor';
import * as refCodes from '../services/ref-codes';

jest.mock('../services/ref-codes');
const mock = refCodes as jest.Mocked<typeof refCodes>;

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RefCodeEditor />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mock.listRefCodeDomains.mockResolvedValue([
    { domain: 'price_type', label: 'Type de prix', nValues: 2, nActive: 2 },
    { domain: 'transport_type', label: 'Transport', nValues: 1, nActive: 1 },
  ]);
  mock.listRefCodeValues.mockResolvedValue([
    { id: 'v1', code: 'adult', name: 'Adulte', position: 1, isActive: true },
    { id: 'v2', code: 'child', name: 'Enfant', position: 2, isActive: true },
  ]);
  mock.upsertRefCode.mockResolvedValue('vX');
  mock.setRefCodeActive.mockResolvedValue();
  mock.reorderRefCode.mockResolvedValue();
});

describe('RefCodeEditor (Phase 7.5)', () => {
  it('rend les domaines (maître) et les valeurs du 1er domaine (détail) avec code verrouillé', async () => {
    renderEditor();
    expect(await screen.findByRole('button', { name: /Type de prix/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Transport/ })).toBeInTheDocument();
    // valeurs du domaine actif (price_type) : code mono + libellé éditable
    expect(await screen.findByText('adult')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Adulte')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Enfant')).toBeInTheDocument();
  });

  it('édite un libellé puis « Enregistrer » appelle upsertRefCode (id fourni, code non touché)', async () => {
    renderEditor();
    const input = await screen.findByDisplayValue('Adulte');
    fireEvent.change(input, { target: { value: 'Adulte plein tarif' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Enregistrer' })[0]);
    await waitFor(() =>
      expect(mock.upsertRefCode).toHaveBeenCalledWith({ domain: 'price_type', id: 'v1', name: 'Adulte plein tarif' }),
    );
  });

  it('la bascule Actif → Inactif appelle setRefCodeActive(id, domain, false)', async () => {
    renderEditor();
    await screen.findByText('adult');
    fireEvent.click(screen.getAllByRole('button', { name: 'Actif' })[0]);
    await waitFor(() => expect(mock.setRefCodeActive).toHaveBeenCalledWith('v1', 'price_type', false));
  });

  it('création : code + libellé → upsertRefCode({domain, code, name}) ; bloqué si code/libellé vides', async () => {
    renderEditor();
    await screen.findByText('adult');
    const createBtn = screen.getByRole('button', { name: /Créer/ });
    expect(createBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Code de la nouvelle valeur'), { target: { value: 'senior' } });
    fireEvent.change(screen.getByLabelText('Libellé de la nouvelle valeur'), { target: { value: 'Senior' } });
    expect(createBtn).toBeEnabled();
    fireEvent.click(createBtn);
    await waitFor(() => expect(mock.upsertRefCode).toHaveBeenCalledWith({ domain: 'price_type', code: 'senior', name: 'Senior' }));
  });

  it('« Descendre » sur la 1re valeur appelle reorderRefCode avec l’ordre échangé', async () => {
    renderEditor();
    await screen.findByText('adult');
    fireEvent.click(screen.getAllByRole('button', { name: 'Descendre' })[0]);
    await waitFor(() => expect(mock.reorderRefCode).toHaveBeenCalledWith('price_type', ['v2', 'v1']));
  });

  it('changer de domaine recharge ses valeurs', async () => {
    renderEditor();
    await screen.findByText('adult');
    mock.listRefCodeValues.mockResolvedValueOnce([{ id: 't1', code: 'bus', name: 'Bus', position: 1, isActive: true }]);
    fireEvent.click(screen.getByRole('button', { name: /Transport/ }));
    await waitFor(() => expect(mock.listRefCodeValues).toHaveBeenLastCalledWith('transport_type'));
  });
});
