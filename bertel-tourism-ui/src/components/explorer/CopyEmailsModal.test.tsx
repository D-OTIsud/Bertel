import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyEmailsModal } from './CopyEmailsModal';
import { fetchSelectionEmails } from '@/services/selection-emails';

jest.mock('@/services/selection-emails', () => ({
  ...jest.requireActual('@/services/selection-emails'),
  fetchSelectionEmails: jest.fn(),
}));

const mockFetch = fetchSelectionEmails as jest.MockedFunction<typeof fetchSelectionEmails>;

// Cohérence obligatoire du faux : eligibleCount = rows.length + missing.length
// (3 + 1 = 4), et excludedCount = requestedCount - eligibleCount (5 - 4 = 1).
// Un faux incohérent rendrait les assertions de compteurs ininterprétables.
const RESULT = {
  requestedCount: 5,
  eligibleCount: 4,
  excludedCount: 1,
  rows: [
    { objectId: 'o1', email: 'a@x.test', source: 'actor' as const, ord: 1 },
    { objectId: 'o2', email: 'a@x.test', source: 'object' as const, ord: 2 },
    { objectId: 'o3', email: 'b@x.test', source: 'object' as const, ord: 3 },
  ],
  missing: [{ objectId: 'o4', name: 'Fiche sans e-mail' }],
};

function setClipboard(impl: () => Promise<void>) {
  Object.assign(navigator, { clipboard: { writeText: jest.fn(impl) } });
}

describe('CopyEmailsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setClipboard(() => Promise.resolve());
  });

  it('annonce les compteurs, dont la mention « sur N » quand des fiches sont écartées', async () => {
    mockFetch.mockResolvedValue(RESULT);
    // Cinq ids, parce que le faux annonce cinq demandes : un test dont l'entrée
    // contredit la sortie ne décrit aucun scénario réel.
    render(
      <CopyEmailsModal objectIds={['o1', 'o2', 'o3', 'o4', 'o5']} open onOpenChange={jest.fn()} />,
    );

    expect(await screen.findByText(/4 fiches éligibles sur 5/)).toBeInTheDocument();
    expect(screen.getByText(/2 adresses/)).toBeInTheDocument();
    expect(screen.getByText(/1 sans e-mail/)).toBeInTheDocument();
  });

  it('propose de réessayer sur une erreur non métier (réseau)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'));
    mockFetch.mockResolvedValueOnce(RESULT);
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    expect(await screen.findByText('Chargement impossible.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Réessayer/ }));
    expect(await screen.findByText(/4 fiches éligibles sur 5/)).toBeInTheDocument();
  });

  it('ne propose PAS de réessayer sur un refus d autorisation', async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error('x'), { code: '42501' }));
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    await screen.findByText('Réservé aux éditeurs.');
    expect(screen.queryByRole('button', { name: /Réessayer/ })).toBeNull();
  });

  it('exprime la répartition en FICHES, pas en adresses', async () => {
    mockFetch.mockResolvedValue(RESULT);
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    expect(
      await screen.findByText(/1 fiche résolue via le prestataire, 2 via la fiche/),
    ).toBeInTheDocument();
  });

  it('rend les adresses dédoublonnées et recompose au changement de séparateur', async () => {
    mockFetch.mockResolvedValue(RESULT);
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    const zone = (await screen.findByLabelText(/Adresses à copier/)) as HTMLTextAreaElement;
    expect(zone.value).toBe('a@x.test, b@x.test');

    await userEvent.click(screen.getByRole('button', { name: 'Point-virgule' }));
    expect(zone.value).toBe('a@x.test; b@x.test');
  });

  it('rappelle d utiliser le champ Cci', async () => {
    mockFetch.mockResolvedValue(RESULT);
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);
    expect(await screen.findByText(/champ Cci/)).toBeInTheDocument();
  });

  it('ne bascule sur « Copié » qu APRÈS résolution du presse-papiers', async () => {
    mockFetch.mockResolvedValue(RESULT);
    let release: () => void = () => {};
    setClipboard(() => new Promise<void>((resolve) => { release = resolve; }));
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Copier$/ }));
    expect(screen.queryByRole('button', { name: /Copié/ })).toBeNull();
    // Pendant l'attente : état visible ET bouton désactivé (pas de double-clic).
    const pending = screen.getByRole('button', { name: /Copie…/ });
    expect(pending).toBeDisabled();

    release();
    await waitFor(() => expect(screen.getByRole('button', { name: /Copié/ })).toBeInTheDocument());
  });

  it('affiche un message dédié quand le navigateur refuse la copie', async () => {
    mockFetch.mockResolvedValue(RESULT);
    setClipboard(() => Promise.reject(new Error('denied')));
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: /^Copier$/ }));
    expect(await screen.findByText(/Copie refusée par le navigateur/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copié/ })).toBeNull();
  });

  it('traduit le refus serveur en « Réservé aux éditeurs »', async () => {
    const err = Object.assign(new Error('FORBIDDEN_EMAIL_EXPORT'), { code: '42501' });
    mockFetch.mockRejectedValue(err);
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    expect(await screen.findByText('Réservé aux éditeurs.')).toBeInTheDocument();
  });

  it('traduit PT413 en message de sélection trop large', async () => {
    const err = Object.assign(new Error('TOO_MANY_OBJECTS'), { code: 'PT413' });
    mockFetch.mockRejectedValue(err);
    render(<CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />);

    expect(await screen.findByText(/Sélection trop large/)).toBeInTheDocument();
  });

  it('ignore la réponse d un chargement obsolète après fermeture puis réouverture', async () => {
    let resolveFirst: (value: typeof RESULT) => void = () => {};
    mockFetch
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ ...RESULT, eligibleCount: 99, excludedCount: 0, requestedCount: 99 });

    const { rerender } = render(
      <CopyEmailsModal objectIds={['o1']} open onOpenChange={jest.fn()} />,
    );
    rerender(<CopyEmailsModal objectIds={['o1']} open={false} onOpenChange={jest.fn()} />);
    rerender(<CopyEmailsModal objectIds={['o2']} open onOpenChange={jest.fn()} />);

    expect(await screen.findByText(/99 fiches éligibles/)).toBeInTheDocument();
    resolveFirst(RESULT);
    await waitFor(() => expect(screen.getByText(/99 fiches éligibles/)).toBeInTheDocument());
    expect(screen.queryByText(/3 fiches éligibles/)).toBeNull();
  });
});
