import { render, screen, fireEvent, act, within } from '@testing-library/react';
import HelpPage from './HelpPage';

const replace = jest.fn();
let searchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

const scrollIntoView = jest.fn();
beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});

describe('HelpPage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    searchParams = new URLSearchParams();
    replace.mockClear();
    scrollIntoView.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function advanceDebounce() {
    act(() => {
      jest.advanceTimersByTime(150);
    });
  }

  test('rend les rubriques et les questions en accordéon fermé', () => {
    render(<HelpPage />);
    expect(screen.getByRole('heading', { name: 'Aide' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Créer une fiche' })).toBeInTheDocument();
    const artisan = screen.getByRole('button', { name: /Je veux créer un artisan/ });
    expect(artisan).toHaveAttribute('aria-expanded', 'false');
  });

  test('« Toutes » a aria-pressed=true initialement', () => {
    render(<HelpPage />);
    expect(screen.getByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('sélectionner une rubrique met à jour aria-pressed', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Choisir le bon type' }));
    expect(screen.getByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Choisir le bon type' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('re-cliquer la rubrique active restaure « Toutes »', () => {
    render(<HelpPage />);
    const chip = screen.getByRole('button', { name: 'Choisir le bon type' });
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(screen.getByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  test('aria-controls relie la question à la région de réponse', () => {
    searchParams = new URLSearchParams('question=choisir-artisan');
    render(<HelpPage />);
    const question = screen.getByRole('button', { name: /Je veux créer un artisan/ });
    expect(question).toHaveAttribute('aria-controls', 'faq-answer-choisir-artisan');
    expect(document.getElementById('faq-answer-choisir-artisan')).toHaveAttribute(
      'aria-labelledby',
      'faq-question-choisir-artisan',
    );
  });

  test('la recherche « artisan » remonte l’arbitrage en premier résultat', async () => {
    render(<HelpPage />);
    fireEvent.change(screen.getByLabelText("Rechercher dans l'aide"), {
      target: { value: 'artisan' },
    });
    advanceDebounce();
    const status = await screen.findByRole('status');
    expect(status.textContent).toMatch(/résultat/);
    const questions = screen.getAllByRole('button', { name: /./ })
      .filter((b) => b.className.includes('help-qa__question'));
    expect(questions[0]).toHaveAccessibleName(/Je veux créer un artisan/);
  });

  test('la recherche met à jour l’URL après debounce', () => {
    render(<HelpPage />);
    fireEvent.change(screen.getByLabelText("Rechercher dans l'aide"), {
      target: { value: 'artisan' },
    });
    advanceDebounce();
    expect(replace).toHaveBeenCalledWith('/aide?q=artisan');
  });

  test('état vide : message + suggestion', async () => {
    render(<HelpPage />);
    fireEvent.change(screen.getByLabelText("Rechercher dans l'aide"), {
      target: { value: 'zzzzzzz' },
    });
    advanceDebounce();
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
    advanceDebounce();
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  test('ouvrir une entrée sans recherche synchronise l’URL (replace)', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: /Je veux créer un artisan/ }));
    expect(replace).toHaveBeenCalledWith('/aide?question=choisir-artisan');
  });

  test('ouvrir un résultat de recherche préserve q', () => {
    searchParams = new URLSearchParams('q=artisan');
    render(<HelpPage />);
    advanceDebounce();
    replace.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Je veux créer un artisan/ }));
    expect(replace).toHaveBeenCalledWith('/aide?q=artisan&question=choisir-artisan');
  });

  test('fermer un résultat de recherche préserve q et retire question', () => {
    searchParams = new URLSearchParams('q=artisan&question=choisir-artisan');
    render(<HelpPage />);
    advanceDebounce();
    replace.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Je veux créer un artisan/ }));
    expect(replace).toHaveBeenCalledWith('/aide?q=artisan');
  });

  test('un changement de useSearchParams resynchronise input et réponse ouverte', () => {
    const { rerender } = render(<HelpPage />);
    searchParams = new URLSearchParams('q=artisan&question=choisir-artisan');
    rerender(<HelpPage />);
    expect(screen.getByLabelText("Rechercher dans l'aide")).toHaveValue('artisan');
    expect(screen.getByRole('button', { name: /Je veux créer un artisan/ }))
      .toHaveAttribute('aria-expanded', 'true');
  });

  test('?question= inconnu n’ouvre pas d’accordéon et nettoie l’URL', () => {
    searchParams = new URLSearchParams('question=unknown-id');
    render(<HelpPage />);
    const artisan = screen.getByRole('button', { name: /Je veux créer un artisan/ });
    expect(artisan).toHaveAttribute('aria-expanded', 'false');
    expect(replace).toHaveBeenCalledWith('/aide');
  });

  test('navigation « Voir aussi » depuis une rubrique filtrée', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Choisir le bon type' }));
    fireEvent.click(screen.getByRole('button', { name: /Je veux créer un artisan/ }));
    const artisanArticle = document.getElementById('faq-choisir-artisan')!;
    fireEvent.click(
      within(artisanArticle).getByRole('button', { name: /Comment créer un commerce/ }),
    );
    expect(screen.getByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Comment créer un commerce/ }))
      .toHaveAttribute('aria-expanded', 'true');
    expect(replace).toHaveBeenCalledWith('/aide?question=creer-com');
    expect(scrollIntoView).toHaveBeenCalled();
  });

  test('navigation « Voir aussi » depuis la recherche efface q', () => {
    searchParams = new URLSearchParams('q=artisan');
    render(<HelpPage />);
    advanceDebounce();
    replace.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Je veux créer un artisan/ }));
    const artisanArticle = document.getElementById('faq-choisir-artisan')!;
    fireEvent.click(
      within(artisanArticle).getByRole('button', { name: /Comment créer un commerce/ }),
    );
    expect(screen.getByLabelText("Rechercher dans l'aide")).toHaveValue('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Comment créer un commerce/ }))
      .toHaveAttribute('aria-expanded', 'true');
    expect(replace).toHaveBeenCalledWith('/aide?question=creer-com');
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
