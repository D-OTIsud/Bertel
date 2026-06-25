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
    { id: 'v1', code: 'adult', name: 'Adulte', nameI18n: {}, position: 1, isActive: true },
    { id: 'v2', code: 'child', name: 'Enfant', nameI18n: {}, position: 2, isActive: true },
  ]);
  // v1 référencé (3 fiches) ⇒ suppression bloquée ; v2 à 0 ⇒ supprimable.
  mock.getRefCodeUsageCounts.mockResolvedValue({ v1: 3, v2: 0 });
  mock.upsertRefCode.mockResolvedValue('vX');
  mock.setRefCodeActive.mockResolvedValue();
  mock.reorderRefCode.mockResolvedValue();
  mock.deleteRefCode.mockResolvedValue();
});

describe('RefCodeEditor (Phase 7.5)', () => {
  it('rend les domaines (maître) et les valeurs du 1er domaine (détail) avec code verrouillé', async () => {
    renderEditor();
    expect(await screen.findByRole('button', { name: /Type de prix/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Transport/ })).toBeInTheDocument();
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

  it('la bascule (interrupteur) Actif → Inactif appelle setRefCodeActive(id, domain, false)', async () => {
    renderEditor();
    await screen.findByText('adult');
    const switches = screen.getAllByRole('switch');
    expect(switches[0]).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(switches[0]);
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
    mock.listRefCodeValues.mockResolvedValueOnce([{ id: 't1', code: 'bus', name: 'Bus', nameI18n: {}, position: 1, isActive: true }]);
    fireEvent.click(screen.getByRole('button', { name: /Transport/ }));
    await waitFor(() => expect(mock.listRefCodeValues).toHaveBeenLastCalledWith('transport_type'));
  });

  it('affiche « utilisé par N fiches » et bloque la suppression d’une valeur référencée', async () => {
    renderEditor();
    await screen.findByText('adult');
    expect(await screen.findByText('3 fiches')).toBeInTheDocument();
    expect(screen.getByText('0 fiche')).toBeInTheDocument();
    // v1 référencé ⇒ bouton supprimer désactivé ; v2 à 0 ⇒ activé.
    expect(screen.getByRole('button', { name: 'Supprimer adult' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Supprimer child' })).toBeEnabled();
  });

  it('supprime une valeur à 0 référence après confirmation', async () => {
    renderEditor();
    await screen.findByText('child');
    await screen.findByText('0 fiche');
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer child' }));
    // ConfirmDialog ouvert
    expect(await screen.findByRole('dialog', { name: /Supprimer définitivement/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }));
    await waitFor(() => expect(mock.deleteRefCode).toHaveBeenCalledWith('price_type', 'v2'));
  });

  it('édite les traductions via la modale i18n → upsertRefCode avec nameI18n', async () => {
    renderEditor();
    await screen.findByText('adult');
    fireEvent.click(screen.getAllByRole('button', { name: /^FR/ })[0]);
    const en = await screen.findByLabelText('Anglais (EN)');
    fireEvent.change(en, { target: { value: 'Adult' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les traductions' }));
    await waitFor(() =>
      expect(mock.upsertRefCode).toHaveBeenCalledWith({ domain: 'price_type', id: 'v1', name: 'Adulte', nameI18n: { en: 'Adult' } }),
    );
  });
});
