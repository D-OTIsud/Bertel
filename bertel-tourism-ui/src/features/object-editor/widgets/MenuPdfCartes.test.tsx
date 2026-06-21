import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('../../../services/object-cartes', () => ({
  listObjectCartes: jest.fn(),
  linkObjectCarte: jest.fn(),
  unlinkObjectCarte: jest.fn(),
  updateObjectCarte: jest.fn(),
}));
jest.mock('../../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 't' } } }) },
  }),
}));

import { listObjectCartes, unlinkObjectCarte, updateObjectCarte } from '../../../services/object-cartes';
import { MenuPdfCartes } from './MenuPdfCartes';

const mockList = listObjectCartes as jest.Mock;
const mockUnlink = unlinkObjectCarte as jest.Mock;
const mockUpdate = updateObjectCarte as jest.Mock;

describe('MenuPdfCartes (§06 P3)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the empty state when there is no carte', async () => {
    mockList.mockResolvedValue([]);
    render(<MenuPdfCartes objectId="o1" canEdit />);
    expect(await screen.findByText(/Aucune carte PDF/)).toBeInTheDocument();
  });

  it('renders a carte with a PDF link and detaches it on remove', async () => {
    mockList.mockResolvedValue([{ documentId: 'd1', url: 'https://x.test/c.pdf', title: 'Carte midi', validFrom: '', validTo: '', position: 1 }]);
    mockUnlink.mockResolvedValue(undefined);
    render(<MenuPdfCartes objectId="o1" canEdit />);

    expect(await screen.findByDisplayValue('Carte midi')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voir le PDF Carte midi/ })).toHaveAttribute('href', 'https://x.test/c.pdf');

    fireEvent.click(screen.getByRole('button', { name: /Supprimer la carte Carte midi/ }));
    await waitFor(() => expect(mockUnlink).toHaveBeenCalledWith('o1', 'd1'));
  });

  it('commits a validity edit on blur', async () => {
    mockList.mockResolvedValue([{ documentId: 'd1', url: 'u', title: 'Carte', validFrom: '', validTo: '', position: 1 }]);
    mockUpdate.mockResolvedValue(undefined);
    render(<MenuPdfCartes objectId="o1" canEdit />);

    const from = await screen.findByLabelText('Valide du');
    fireEvent.change(from, { target: { value: '2026-03-01' } });
    fireEvent.blur(from);
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('o1', 'd1', { validFrom: '2026-03-01' }));
  });

  it('hides edit controls when read-only', async () => {
    mockList.mockResolvedValue([{ documentId: 'd1', url: 'u', title: 'Carte', validFrom: '', validTo: '', position: 1 }]);
    render(<MenuPdfCartes objectId="o1" canEdit={false} />);

    await screen.findByDisplayValue('Carte');
    expect(screen.queryByRole('button', { name: /Supprimer la carte/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Choisir un justificatif')).not.toBeInTheDocument();
  });
});
