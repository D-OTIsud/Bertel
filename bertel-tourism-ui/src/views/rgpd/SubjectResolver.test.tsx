import { render, screen, fireEvent } from '@testing-library/react';
import { SubjectResolver } from './SubjectResolver';
import { searchActors } from '@/services/object-workspace';

jest.mock('@/services/object-workspace', () => ({
  searchActors: jest.fn(),
}));
const searchActorsMock = searchActors as jest.MockedFunction<typeof searchActors>;

const ACTOR = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Marie Hoarau',
  firstName: 'Marie',
  lastName: 'Hoarau',
  gender: 'Mme',
  email: 'marie@ex.re',
};

describe('SubjectResolver', () => {
  beforeEach(() => {
    searchActorsMock.mockReset();
    searchActorsMock.mockResolvedValue([ACTOR]);
  });

  it('recherche par nom (actor) et liste les résultats', async () => {
    render(<SubjectResolver kind="actor" hint="UUID de l'acteur" onResolved={jest.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: /Sujet à effacer/i }), { target: { value: 'mar' } });
    expect(await screen.findByText('Marie Hoarau')).toBeInTheDocument();
    expect(searchActorsMock).toHaveBeenCalledWith('mar');
  });

  it("sélectionner un résultat remplit l'UUID (onResolved) et affiche la carte", async () => {
    const onResolved = jest.fn();
    render(<SubjectResolver kind="actor" hint="h" onResolved={onResolved} />);
    fireEvent.change(screen.getByRole('textbox', { name: /Sujet à effacer/i }), { target: { value: 'mar' } });
    fireEvent.click(await screen.findByText('Marie Hoarau'));
    expect(onResolved).toHaveBeenCalledWith(ACTOR.id);
    expect(screen.getByText(/Sujet sélectionné : Marie Hoarau/)).toBeInTheDocument();
  });

  it('le mode UUID rejette un format invalide et accepte un v4 valide', () => {
    const onResolved = jest.fn();
    render(<SubjectResolver kind="review" hint="UUID de l'avis" onResolved={onResolved} />);
    const input = screen.getByLabelText(/Identifiant du sujet/i);
    fireEvent.change(input, { target: { value: 'pas-un-uuid' } });
    expect(onResolved).toHaveBeenLastCalledWith('');
    expect(screen.getByText(/Format d'UUID invalide/i)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: ACTOR.id } });
    expect(onResolved).toHaveBeenLastCalledWith(ACTOR.id);
  });

  it('hint unique associé via aria-describedby', () => {
    render(<SubjectResolver kind="review" hint="UUID de l'avis" onResolved={jest.fn()} />);
    const input = screen.getByLabelText(/Identifiant du sujet/i);
    expect(input).toHaveAttribute('aria-describedby', 'rgpd-subject-hint');
    expect(document.getElementById('rgpd-subject-hint')).toHaveTextContent("UUID de l'avis");
  });

  it('un type non-acteur démarre en saisie UUID (pas de recherche serveur)', () => {
    render(<SubjectResolver kind="review" hint="h" onResolved={jest.fn()} />);
    expect(screen.queryByPlaceholderText(/Rechercher par nom/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Identifiant du sujet/i)).toBeInTheDocument();
  });
});
