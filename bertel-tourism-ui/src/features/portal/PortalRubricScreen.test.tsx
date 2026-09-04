/**
 * Le chrome d'une rubrique : titre, notices, et surtout LA GARDE DE SORTIE.
 *
 * Quitter une rubrique modifiée doit TOUJOURS demander — pas seulement par les deux
 * boutons de l'écran. Sur ordinateur la liste des rubriques reste collée à gauche et
 * cliquable pendant toute la saisie : un clic sur « Vos tarifs » jetait les horaires en
 * cours, en silence.
 *
 * Et la hiérarchie des titres : à partir de 1024 px, le titre de la fiche et celui de la
 * rubrique sont montés ENSEMBLE. Deux `h1` visibles simultanément, c'est un document sans
 * structure pour un lecteur d'écran.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalRubricScreen } from './PortalRubricScreen';
import { fakeEditor } from './__fixtures__/portal-fixtures';
import { PORTAL_RUBRICS, type BuiltPortalRubric } from './portal-rubrics';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

const rubric = (id: string, over: Partial<BuiltPortalRubric> = {}): BuiltPortalRubric =>
  ({
    ...PORTAL_RUBRICS.find((entry) => entry.id === id)!,
    state: 'todo',
    readOnlyReason: null,
    ...over,
  }) as BuiltPortalRubric;

function setup(over: Partial<React.ComponentProps<typeof PortalRubricScreen>> = {}) {
  const onBack = jest.fn();
  const onDirtyChange = jest.fn();
  const editor = fakeEditor();
  const props: React.ComponentProps<typeof PortalRubricScreen> = {
    rubric: rubric('contacts'),
    archetype: 'RES',
    editor,
    sentLines: [],
    sentAt: null,
    approved: false,
    hubHref: '/espace/fiches/RES1',
    formCache: new Map(),
    onBack,
    onDirtyChange,
    ...over,
  };
  const view = render(<PortalRubricScreen {...props} />);
  return { onBack, onDirtyChange, editor, view, props };
}

describe('PortalRubricScreen — structure', () => {
  it('le titre de la rubrique est un h2 : le h1 de la page reste celui de la fiche', () => {
    setup();
    // Les deux sont montés ensemble à partir de 1024 px — deux h1 visibles à la fois
    // laissent un lecteur d'écran sans hiérarchie.
    expect(screen.getByRole('heading', { level: 2, name: 'Vos coordonnées' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('le titre reçoit le focus à l’ouverture', () => {
    setup();
    expect(screen.getByRole('heading', { level: 2, name: 'Vos coordonnées' })).toHaveFocus();
  });

  it('une rubrique indisponible remplace le formulaire par une phrase, jamais un champ mort', () => {
    setup({ rubric: rubric('contacts', { state: 'unavailable', readOnlyReason: 'Rubrique fermée par l’office.' }) });

    expect(screen.getByText('Rubrique fermée par l’office.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Téléphone')).not.toBeInTheDocument();
  });

  it('rubrique en vérification : la notice dit la date ET ce qui avait été envoyé', () => {
    setup({
      rubric: rubric('contacts', { state: 'pending' }),
      sentAt: '2026-09-02T08:00:00.000Z',
      sentLines: ['Téléphone : 0692 45 12 30'],
    });

    expect(screen.getByText(/Vous avez envoyé une mise à jour de cette rubrique le 2 septembre/)).toBeInTheDocument();
    // Sans cet instantané, un rechargement remet les valeurs PUBLIÉES dans les champs et
    // le partenaire ressaisit de mémoire, puis bute sur « vérification en cours ».
    expect(screen.getByText('Téléphone : 0692 45 12 30')).toBeInTheDocument();
  });

  it('modification ACCEPTÉE mais pas encore reportée : la notice le dit, sinon il ressaisit', () => {
    // `approved` est la forme DOMINANTE (5 rubriques sur 7). Entre l'acceptation et la
    // recopie par l'office, la rubrique montre l'ANCIENNE valeur publiée.
    setup({
      rubric: rubric('contacts', { state: 'filled' }),
      approved: true,
      sentAt: '2026-09-02T08:00:00.000Z',
      sentLines: ['Téléphone : 0692 45 12 30'],
    });

    expect(screen.getByText(/L’office a accepté cette modification/)).toBeInTheDocument();
    expect(screen.getByText('Téléphone : 0692 45 12 30')).toBeInTheDocument();
  });
});

describe('PortalRubricScreen — la garde de sortie', () => {
  it('un formulaire NON touché sort sans rien demander', async () => {
    const { onBack } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Retour sans changer' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un formulaire touché demande, et la sortie SÛRE est « Rester »', async () => {
    const { onBack } = setup();
    await userEvent.type(screen.getByLabelText('Téléphone'), '0692');

    await userEvent.click(screen.getByRole('button', { name: 'Retour sans changer' }));

    const dialog = await screen.findByRole('dialog', { name: 'Quitter sans valider ?' });
    expect(dialog).toHaveClass('portal-modal');
    // Échap et le clic hors fenêtre tombent tous deux sur `onCancel` : la sortie sûre doit
    // donc être l'annulation.
    expect(dialog).toHaveTextContent('Rester');
    expect(onBack).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Rester' }));
    expect(onBack).not.toHaveBeenCalled();
  });

  it('« Quitter sans garder » sort ET oublie la saisie en cours', async () => {
    const cache = new Map<string, unknown>();
    const { onBack } = setup({ formCache: cache });
    await userEvent.type(screen.getByLabelText('Téléphone'), '0692');
    expect(cache.size).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: 'Retour sans changer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitter sans garder' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    // Le message promet que rien n'est gardé : il doit dire vrai.
    expect(cache.size).toBe(0);
  });

  it('remonte au parent que le formulaire est touché — c’est ce qui garde TOUTES les sorties', async () => {
    // Les liens de la liste des rubriques, « Corriger » et « Pour compléter » vivent dans
    // le hub : sans ce signal, ils sortiraient sans rien demander.
    const { onDirtyChange } = setup();
    onDirtyChange.mockClear();

    await userEvent.type(screen.getByLabelText('Téléphone'), '0692');

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('une sortie DEMANDÉE PAR LE PARENT ouvre la même confirmation', async () => {
    // Le hub intercepte un clic sur la liste et demande à l'écran de rubrique de garder
    // la sortie : une seule fenêtre, un seul vocabulaire.
    const { view, props } = setup();
    await userEvent.type(screen.getByLabelText('Téléphone'), '0692');

    view.rerender(<PortalRubricScreen {...props} leaveRequested onLeaveResolved={jest.fn()} />);

    expect(await screen.findByRole('dialog', { name: 'Quitter sans valider ?' })).toBeInTheDocument();
  });
});

describe('PortalRubricScreen — le brouillon de formulaire', () => {
  it('revenir sur une rubrique quittée SANS confirmer retrouve la saisie (bouton Retour du téléphone)', async () => {
    const cache = new Map<string, unknown>();
    const first = setup({ formCache: cache });
    await userEvent.type(screen.getByLabelText('Téléphone'), '0692 45 12 30');
    first.view.unmount();

    // Le bouton Retour du système ne passe par aucun lien : rien ne peut l'intercepter.
    // La saisie doit donc survivre au démontage de l'écran.
    setup({ formCache: cache });
    expect(screen.getByLabelText('Téléphone')).toHaveValue('0692 45 12 30');
  });
});
