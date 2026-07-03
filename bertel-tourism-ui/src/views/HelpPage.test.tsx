import { render, screen, fireEvent } from '@testing-library/react';
import HelpPage from './HelpPage';

const replace = jest.fn();
let searchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

describe('HelpPage', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    replace.mockClear();
  });

  test('rend les rubriques et les questions en accordéon fermé', () => {
    render(<HelpPage />);
    expect(screen.getByRole('heading', { name: 'Aide' })).toBeInTheDocument();
    // getByRole heading (le chip de rubrique porte le même libellé → getByText serait ambigu)
    expect(screen.getByRole('heading', { name: 'Créer une fiche' })).toBeInTheDocument();
    const artisan = screen.getByRole('button', { name: /Je veux créer un artisan/ });
    expect(artisan).toHaveAttribute('aria-expanded', 'false');
  });

  test('la recherche « artisan » remonte l’arbitrage en premier résultat', async () => {
    render(<HelpPage />);
    fireEvent.change(screen.getByLabelText("Rechercher dans l'aide"), {
      target: { value: 'artisan' },
    });
    // debounce 150 ms → findBy* attend
    const status = await screen.findByRole('status');
    expect(status.textContent).toMatch(/résultat/);
    const questions = screen.getAllByRole('button', { name: /./ })
      .filter((b) => b.className.includes('help-qa__question'));
    expect(questions[0]).toHaveAccessibleName(/Je veux créer un artisan/);
  });

  test('état vide : message + suggestion', async () => {
    render(<HelpPage />);
    fireEvent.change(screen.getByLabelText("Rechercher dans l'aide"), {
      target: { value: 'zzzzzzz' },
    });
    expect(await screen.findByText(/Aucun résultat pour/)).toBeInTheDocument();
  });

  test('deep-link ?question= ouvre l’entrée ciblée', () => {
    searchParams = new URLSearchParams('question=choisir-artisan');
    render(<HelpPage />);
    expect(screen.getByRole('button', { name: /Je veux créer un artisan/ }))
      .toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/ce que le visiteur vient faire/)).toBeInTheDocument();
  });

  test('deep-link ?q= préremplit la recherche', async () => {
    searchParams = new URLSearchParams('q=artisan');
    render(<HelpPage />);
    expect(screen.getByLabelText("Rechercher dans l'aide")).toHaveValue('artisan');
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  test('ouvrir une entrée synchronise l’URL (replace, pas push)', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: /Je veux créer un artisan/ }));
    expect(replace).toHaveBeenCalledWith('/aide?question=choisir-artisan');
  });
});
