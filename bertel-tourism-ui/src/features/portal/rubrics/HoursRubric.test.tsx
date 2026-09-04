/**
 * « Vos horaires » — l'écran le plus utilisé d'un restaurateur, et le plus piégé.
 *
 * DEUX étapes (jamais une grille 7 × 5 sur un téléphone), TROIS modes, et la SENTINELLE :
 * un jour ouvert sans horaires fixes s'écrit `[{ start: '', end: '' }]`, jamais `slots: []`
 * qui se relit FERMÉ — c'est le cas de 26 % des tranches ouvertes en production.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HoursRubric } from './HoursRubric';
import { fakeEditor, openingPeriod, portalModules, weekday } from '../__fixtures__/portal-fixtures';
import { PORTAL_RUBRICS, type BuiltPortalRubric } from '../portal-rubrics';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';

const rubric = (over: Partial<BuiltPortalRubric> = {}): BuiltPortalRubric =>
  ({
    ...PORTAL_RUBRICS.find((entry) => entry.id === 'hours')!,
    state: 'todo',
    readOnlyReason: null,
    ...over,
  }) as BuiltPortalRubric;

function setup(draft: ObjectWorkspaceModules = portalModules(), over: Partial<BuiltPortalRubric> = {}) {
  const editor = fakeEditor(draft);
  const onDone = jest.fn();
  const onCancel = jest.fn();
  render(
    <HoursRubric
      rubric={rubric(over)}
      archetype="RES"
      editor={editor}
      formKey="hours"
      onDone={onDone}
      onCancel={onCancel}
      onDirtyChange={jest.fn()}
    />,
  );
  return { editor, onDone, onCancel };
}

/** Les jours écrits par « Valider », lus dans l'unique période de la tranche. */
function writtenWeekdays(editor: ReturnType<typeof fakeEditor>) {
  const [, value] = (editor.replaceModule as jest.Mock).mock.calls[0];
  const periods = (
    value as { periods: { weekdays: { code: string; slots: { start: string; end: string }[] }[] }[] }
  ).periods;
  return periods[0].weekdays;
}

async function goToStepTwo() {
  await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));
}

describe('HoursRubric — étape 1, les jours', () => {
  it('propose les sept jours et trois raccourcis', () => {
    setup();
    for (const day of ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']) {
      expect(screen.getByRole('checkbox', { name: day })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Tous les jours' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Du lundi au vendredi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Le week-end' })).toBeInTheDocument();
  });

  it('« Du lundi au vendredi » coche exactement cinq jours', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Du lundi au vendredi' }));

    expect(screen.getByRole('checkbox', { name: 'Vendredi' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Samedi' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Dimanche' })).not.toBeChecked();
  });

  it('« Suivant » mène aux heures, et on peut revenir aux jours', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
    await goToStepTwo();

    expect(screen.getByRole('radio', { name: 'Les mêmes heures tous les jours ouverts' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Revenir aux jours' }));
    expect(screen.getByRole('checkbox', { name: 'Lundi' })).toBeInTheDocument();
  });
});

describe('HoursRubric — étape 2, les heures', () => {
  it('« les mêmes heures » écrit le même créneau sur TOUS les jours ouverts, et rien sur les autres', async () => {
    const { editor, onDone } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Le week-end' }));
    await goToStepTwo();

    await userEvent.type(screen.getByLabelText('de quelle heure'), '11:30');
    await userEvent.type(screen.getByLabelText('à quelle heure'), '14:30');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    const days = writtenWeekdays(editor);
    expect(days.find((day) => day.code === 'saturday')?.slots).toEqual([{ start: '11:30', end: '14:30' }]);
    expect(days.find((day) => day.code === 'sunday')?.slots).toEqual([{ start: '11:30', end: '14:30' }]);
    // Un jour non coché est explicitement FERMÉ (aucun créneau) — jamais la sentinelle,
    // qui vaudrait « ouvert sans horaires ».
    expect(days.find((day) => day.code === 'monday')?.slots).toEqual([]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('« sans horaires fixes » pose la SENTINELLE, jamais un tableau vide', async () => {
    // `slots: []` se relit FERMÉ : ce serait fermer la fiche d'un prestataire sur
    // rendez-vous, en silence, avec l'accord d'un modérateur qui ne verrait rien.
    const { editor } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
    await goToStepTwo();
    await userEvent.click(screen.getByRole('radio', { name: 'Sans horaires fixes (sur rendez-vous)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    const days = writtenWeekdays(editor);
    expect(days).toHaveLength(7);
    for (const day of days) {
      expect(day.slots).toEqual([{ start: '', end: '' }]);
    }
  });

  it('une fin AVANT le début : l’erreur est un TEXTE annoncé, et rien n’est écrit', async () => {
    const { editor, onDone } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
    await goToStepTwo();
    await userEvent.type(screen.getByLabelText('de quelle heure'), '18:00');
    await userEvent.type(screen.getByLabelText('à quelle heure'), '11:00');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    const error = screen.getByText('Indiquez une heure de fin après l’heure de début.');
    expect(error).toHaveAttribute('role', 'alert');
    expect(editor.replaceModule).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('une heure d’ouverture SANS heure de fermeture est refusée, dite, et le focus va sur le champ manquant', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════
    // Le scénario réel : le restaurateur tape « 09:00 », est interrompu, clique
    // « Valider ». Sans refus, `toWeekHours` calcule `fixedHours = filled(slots) > 0`
    // ⇒ FALSE, `desiredSlots` pose la sentinelle, et son horaire devient « ouvert sans
    // horaires fixes » — sans message, sans champ en erreur, retour direct au hub.
    // ═══════════════════════════════════════════════════════════════════════════════
    const { editor, onDone } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
    await goToStepTwo();
    await userEvent.type(screen.getByLabelText('de quelle heure'), '09:00');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    const error = screen.getByText('Indiquez aussi l’heure de fermeture.');
    expect(error).toHaveAttribute('role', 'alert');
    expect(editor.replaceModule).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    // Le focus reste sinon sur « Valider » : il faut retrouver le champ à l'aveugle.
    expect(screen.getByLabelText('à quelle heure')).toHaveFocus();
  });

  it('l’heure de fermeture SEULE est refusée de la même façon, focus sur l’ouverture', async () => {
    const { editor } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
    await goToStepTwo();
    await userEvent.type(screen.getByLabelText('à quelle heure'), '14:30');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    expect(screen.getByText('Indiquez aussi l’heure d’ouverture.')).toBeInTheDocument();
    expect(editor.replaceModule).not.toHaveBeenCalled();
    expect(screen.getByLabelText('de quelle heure')).toHaveFocus();
  });

  it('« ça dépend du jour » : le créneau à moitié saisi est trouvé SUR SON JOUR', async () => {
    const { editor } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Le week-end' }));
    await goToStepTwo();
    await userEvent.click(screen.getByRole('radio', { name: 'Ça dépend du jour' }));
    await userEvent.type(screen.getByLabelText('de quelle heure, Samedi'), '11:30');
    await userEvent.type(screen.getByLabelText('à quelle heure, Samedi'), '14:30');
    await userEvent.type(screen.getByLabelText('de quelle heure, Dimanche'), '11:30');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    expect(screen.getByText('Indiquez aussi l’heure de fermeture.')).toBeInTheDocument();
    expect(editor.replaceModule).not.toHaveBeenCalled();
    expect(screen.getByLabelText('à quelle heure, Dimanche')).toHaveFocus();
  });

  it('« ça dépend du jour » rend une carte par jour OUVERT, avec des champs nommés distinctement', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Le week-end' }));
    await goToStepTwo();
    await userEvent.click(screen.getByRole('radio', { name: 'Ça dépend du jour' }));

    // Sept paires « de »/« à » identiques sont indistinguables au lecteur d'écran : chaque
    // champ porte son jour.
    expect(screen.getByLabelText('de quelle heure, Samedi')).toBeInTheDocument();
    expect(screen.getByLabelText('à quelle heure, Samedi')).toBeInTheDocument();
    expect(screen.getByLabelText('de quelle heure, Dimanche')).toBeInTheDocument();
    expect(screen.queryByLabelText('de quelle heure, Lundi')).not.toBeInTheDocument();
  });

  it('« Ajouter une pause » ouvre un second créneau, une seule fois', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
    await goToStepTwo();

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une pause (fermeture le midi)' }));

    expect(screen.getAllByLabelText(/^de quelle heure/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Ajouter une pause (fermeture le midi)' })).not.toBeInTheDocument();
  });
});

describe('HoursRubric — lecture de l’existant', () => {
  const withHours = (slots: { start: string; end: string }[]) =>
    portalModules({
      openings: {
        periods: [openingPeriod({ weekdays: [weekday('monday', slots), weekday('tuesday', slots)] })],
        periodTypeOptions: [],
        unavailableReason: null,
      },
    });

  it('des heures identiques partout ⇒ le mode « les mêmes heures » est présélectionné', async () => {
    setup(withHours([{ start: '09:00', end: '17:00' }]));
    await goToStepTwo();

    expect(screen.getByRole('radio', { name: 'Les mêmes heures tous les jours ouverts' })).toBeChecked();
    expect(screen.getByLabelText('de quelle heure')).toHaveValue('09:00');
  });

  it('un jour OUVERT sans horaires ⇒ le mode « sans horaires fixes » est présélectionné', async () => {
    setup(withHours([{ start: '', end: '' }]));
    await goToStepTwo();

    expect(screen.getByRole('radio', { name: 'Sans horaires fixes (sur rendez-vous)' })).toBeChecked();
  });

  it('les jours enregistrés sont cochés à l’ouverture', () => {
    setup(withHours([{ start: '09:00', end: '17:00' }]));

    expect(screen.getByRole('checkbox', { name: 'Lundi' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Mercredi' })).not.toBeChecked();
  });

  it('décocher un jour le FERME (aucun créneau), sans toucher aux autres', async () => {
    const { editor } = setup(withHours([{ start: '09:00', end: '17:00' }]));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lundi' }));
    await goToStepTwo();
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    const days = writtenWeekdays(editor);
    expect(days.find((day) => day.code === 'monday')?.slots).toEqual([]);
    expect(days.find((day) => day.code === 'tuesday')?.slots).toEqual([{ start: '09:00', end: '17:00' }]);
  });
});

/**
 * La ligne que le partenaire relit sur le hub. Elle ne rendait QUE le nombre de jours
 * ouverts : rigoureusement identique avant et après une saisie d'heures — donc aucune
 * erreur d'horaire n'était rattrapable depuis la fiche. L'état est PRODUIT par le
 * formulaire, jamais posé à la main.
 */
describe('HoursRubric — ce que le hub REDIT de la saisie', () => {
  const HOURS_RUBRIC = PORTAL_RUBRICS.find((entry) => entry.id === 'hours')!;

  /** Le résumé du hub, calculé sur la tranche que « Valider » vient d'écrire. */
  function summaryOfWritten(editor: ReturnType<typeof fakeEditor>): string {
    const [, value] = (editor.replaceModule as jest.Mock).mock.calls[0];
    return HOURS_RUBRIC.summary(portalModules({ openings: value }), 'RES');
  }

  it('des heures saisies sont REDITES, pas seulement comptées', async () => {
    const { editor } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
    await goToStepTwo();
    await userEvent.type(screen.getByLabelText('de quelle heure'), '11:30');
    await userEvent.type(screen.getByLabelText('à quelle heure'), '14:30');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    expect(summaryOfWritten(editor)).toBe('Ouvert tous les jours · 11:30–14:30');
  });

  it('« sans horaires fixes » se lit sur le hub, et ne se confond plus avec des heures', async () => {
    const { editor } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Du lundi au vendredi' }));
    await goToStepTwo();
    await userEvent.click(screen.getByRole('radio', { name: 'Sans horaires fixes (sur rendez-vous)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    expect(summaryOfWritten(editor)).toBe('Ouvert 5 jours sur 7 · sans horaires fixes');
  });

  it('des heures DIFFÉRENTES selon les jours le disent, sans mentir sur une valeur unique', async () => {
    const { editor } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Le week-end' }));
    await goToStepTwo();
    await userEvent.click(screen.getByRole('radio', { name: 'Ça dépend du jour' }));
    await userEvent.type(screen.getByLabelText('de quelle heure, Samedi'), '11:30');
    await userEvent.type(screen.getByLabelText('à quelle heure, Samedi'), '14:30');
    await userEvent.type(screen.getByLabelText('de quelle heure, Dimanche'), '09:00');
    await userEvent.type(screen.getByLabelText('à quelle heure, Dimanche'), '13:00');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    expect(summaryOfWritten(editor)).toBe('Ouvert 2 jours sur 7 · horaires selon les jours');
  });
});

describe('HoursRubric — cibles tactiles', () => {
  it('les champs heure portent la classe qui tient les 48 px', async () => {
    setup();
    expect(screen.getByRole('button', { name: 'Tous les jours' })).toHaveClass('portal-pill');
    await goToStepTwo();
    // La taille est posée par la CSS ; on épingle la classe qui la porte, pour qu'un
    // renommage ne fasse pas retomber les champs sous la cible du pouce en silence.
    expect(screen.getByLabelText('de quelle heure')).toHaveClass('portal-input--time');
  });
});
