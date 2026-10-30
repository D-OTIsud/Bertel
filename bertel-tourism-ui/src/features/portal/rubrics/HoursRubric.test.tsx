import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HoursRubric } from './HoursRubric';
import { fakeEditor, openingPeriod, portalModules, weekday } from '../__fixtures__/portal-fixtures';
import { PORTAL_RUBRICS, type BuiltPortalRubric } from '../portal-rubrics';
import type { PortalFormCache } from './rubric-kit';
import type { ObjectWorkspaceModules, ObjectWorkspaceOpeningsModule } from '../../../services/object-workspace-parser';

function setup(draft: ObjectWorkspaceModules = portalModules(), formCache?: PortalFormCache) {
  const editor = fakeEditor(draft);
  const onDone = jest.fn();
  render(<HoursRubric editor={editor} rubric={{ ...PORTAL_RUBRICS.find((r) => r.id === 'hours')!, state: 'todo', readOnlyReason: null } as BuiltPortalRubric}
    archetype="RES" formKey="hours" formCache={formCache} onDone={onDone} onCancel={jest.fn()} onDirtyChange={jest.fn()} />);
  return { editor, onDone };
}

function fillTime(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function written(editor: ReturnType<typeof fakeEditor>) {
  return (editor.replaceModule as jest.Mock).mock.calls[0][1] as ObjectWorkspaceOpeningsModule;
}

test('un raccourci produit une seule carte, modifiable sans écran intermédiaire', async () => {
  const { editor } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Du mardi au samedi' }));
  expect(screen.getAllByRole('region')).toHaveLength(1);
  expect(screen.getByRole('region', { name: 'Du mardi au samedi' })).toBeInTheDocument();
  fillTime(/^de quelle heure/, '09:00');
  fillTime(/^à quelle heure/, '17:00');
  await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
  const days = written(editor).periods[0].weekdays;
  expect(days.find((d) => d.code === 'monday')?.slots ?? []).toEqual([]);
  expect(days.filter((d) => d.slots.length)).toHaveLength(5);
  expect(days.find((d) => d.code === 'saturday')?.slots).toEqual([{ start: '09:00', end: '17:00' }]);
});

test('chaque jour est activable et reprend les heures de la carte commune', async () => {
  const { editor } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Du mardi au samedi' }));
  fillTime(/^de quelle heure/, '09:00'); fillTime(/^à quelle heure/, '17:00');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Dimanche' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Mardi' }));
  expect(screen.getAllByRole('region')).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(written(editor).periods[0].weekdays.find((d) => d.code === 'sunday')?.slots).toEqual([{ start: '09:00', end: '17:00' }]);
  expect(written(editor).periods[0].weekdays.find((d) => d.code === 'tuesday')?.slots).toEqual([]);
});

test('deux créneaux au plus, avec retrait du second', async () => {
  setup(); await userEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
  await userEvent.click(screen.getByRole('button', { name: /Ajouter un créneau/ }));
  expect(screen.getAllByLabelText(/^de quelle heure/)).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /Ajouter un créneau/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Retirer le créneau 2/ }));
  expect(screen.getAllByLabelText(/^de quelle heure/)).toHaveLength(1);
});

test('sans horaires fixes écrit une sentinelle sur chaque jour ouvert', async () => {
  const { editor } = setup(); await userEvent.click(screen.getByRole('button', { name: 'Le week-end' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Ouvert, sans horaires fixes' }));
  await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(written(editor).periods[0].weekdays.filter((d) => d.slots.length).map((d) => d.slots)).toEqual([
    [{ start: '', end: '' }], [{ start: '', end: '' }],
  ]);
});

test('une borne manquante refuse la validation et prend le focus', async () => {
  const { editor, onDone } = setup(); await userEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
  fillTime(/^de quelle heure/, '09:00');
  await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Indiquez aussi l’heure de fermeture.');
  expect(screen.getByLabelText(/^à quelle heure/)).toHaveFocus();
  expect(editor.replaceModule).not.toHaveBeenCalled(); expect(onDone).not.toHaveBeenCalled();
});

test('la vue par jour conserve les horaires différents et les jours sans horaires fixes', async () => {
  const draft = portalModules({ openings: { ...portalModules().openings, periods: [openingPeriod({ weekdays: [
    weekday('monday', [{ start: '09:00', end: '12:00' }]),
    weekday('tuesday', [{ start: '', end: '' }]),
  ] })] } });
  const { editor } = setup(draft);
  await userEvent.click(screen.getByRole('button', { name: 'Horaires différents selon les jours ?' }));
  expect(within(screen.getByRole('region', { name: 'Mardi' })).getByRole('checkbox')).toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
  const days = written(editor).periods[0].weekdays;
  expect(days.find((d) => d.code === 'monday')?.slots).toEqual([{ start: '09:00', end: '12:00' }]);
  expect(days.find((d) => d.code === 'tuesday')?.slots).toEqual([{ start: '', end: '' }]);
});

test.each([
  ['09:00', '', 'Indiquez aussi l’heure de fermeture.', /^à quelle heure/],
  ['', '12:00', 'Indiquez aussi l’heure d’ouverture.', /^de quelle heure/],
  ['18:00', '11:00', 'Indiquez une heure de fin après l’heure de début.', /^à quelle heure/],
])('refuse un créneau incomplet ou inversé : %s–%s', async (start, end, message, focus) => {
  const { editor } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
  fillTime(/^de quelle heure/, start); fillTime(/^à quelle heure/, end);
  await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(screen.getByRole('alert')).toHaveTextContent(message);
  expect(screen.getByLabelText(focus)).toHaveFocus();
  expect(editor.replaceModule).not.toHaveBeenCalled();
});

test('une carte sans heures ne devient pas sans horaires fixes par accident', async () => {
  const { editor } = setup(); await userEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
  await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Indiquez un créneau ou cochez');
  expect(editor.replaceModule).not.toHaveBeenCalled();
});

test('refuse deux créneaux qui se chevauchent', async () => {
  const { editor } = setup(); await userEvent.click(screen.getByRole('button', { name: 'Tous les jours' }));
  fillTime(/^de quelle heure/, '09:00'); fillTime(/^à quelle heure/, '14:00');
  await userEvent.click(screen.getByRole('button', { name: /Ajouter un créneau/ }));
  fillTime(/^de quelle heure.*créneau 2/, '13:00'); fillTime(/^à quelle heure.*créneau 2/, '18:00');
  await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Les deux créneaux ne doivent pas se chevaucher.');
  expect(editor.replaceModule).not.toHaveBeenCalled();
});

test('décocher un jour ferme seulement ce jour et le résumé conserve les heures', async () => {
  const draft = portalModules({ openings: { ...portalModules().openings, periods: [openingPeriod({ weekdays: [
    weekday('monday', [{ start: '09:00', end: '17:00' }]), weekday('tuesday', [{ start: '09:00', end: '17:00' }]),
  ] })] } });
  const { editor } = setup(draft); await userEvent.click(screen.getByRole('checkbox', { name: 'Lundi' }));
  await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
  const value = written(editor);
  expect(value.periods[0].weekdays.find((d) => d.code === 'monday')?.slots).toEqual([]);
  expect(value.periods[0].weekdays.find((d) => d.code === 'tuesday')?.slots).toEqual([{ start: '09:00', end: '17:00' }]);
  expect(PORTAL_RUBRICS.find((r) => r.id === 'hours')!.summary(portalModules({ openings: value }), 'RES')).toBe('Ouvert 1 jour sur 7 · 09:00–17:00');
});

test('le raccourci et le writer conservent un jour à plus de deux créneaux', async () => {
  const slots = [{ start: '08:00', end: '10:00' }, { start: '12:00', end: '14:00' }, { start: '18:00', end: '20:00' }];
  const draft = portalModules({ openings: { ...portalModules().openings, periods: [openingPeriod({ weekdays: [weekday('monday', slots)] })] } });
  const { editor } = setup(draft);
  expect(screen.getByRole('checkbox', { name: 'Lundi' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Le week-end' }));
  const card = screen.getByRole('region', { name: 'Du samedi au dimanche' });
  await userEvent.click(within(card).getByRole('checkbox', { name: 'Ouvert, sans horaires fixes' }));
  await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(written(editor).periods[0].weekdays.find((d) => d.code === 'monday')?.slots).toEqual(slots);
});

test('changer une seule journée conserve les autres horaires', async () => {
  const { editor } = setup(); await userEvent.click(screen.getByRole('button', { name: 'Le week-end' }));
  fillTime(/^de quelle heure/, '09:00'); fillTime(/^à quelle heure/, '17:00');
  await userEvent.click(screen.getByRole('button', { name: 'Horaires différents selon les jours ?' }));
  fillTime(/^à quelle heure, Dimanche/, '12:00');
  await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(written(editor).periods[0].weekdays.find((d) => d.code === 'saturday')?.slots).toEqual([{ start: '09:00', end: '17:00' }]);
  expect(written(editor).periods[0].weekdays.find((d) => d.code === 'sunday')?.slots).toEqual([{ start: '09:00', end: '12:00' }]);
});

test('retrouve une saisie commencée dans l’ancien formulaire après la mise à jour', async () => {
  const cache = new Map<string, unknown>([['hours', {
    step: 2, open: { monday: true, tuesday: true }, mode: 'same',
    same: [{ start: '09:00', end: '12:00' }], perDay: {}, error: null,
  }]]);
  const { editor } = setup(portalModules(), cache);
  expect(screen.getByLabelText(/^de quelle heure/)).toHaveValue('09:00');
  await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(written(editor).periods[0].weekdays.filter((d) => d.slots.length)).toHaveLength(2);
});

test('fermer puis rouvrir un jour retrouve ses horaires propres', async () => {
  const { editor } = setup(); await userEvent.click(screen.getByRole('button', { name: 'Le week-end' }));
  fillTime(/^de quelle heure/, '09:00'); fillTime(/^à quelle heure/, '17:00');
  await userEvent.click(screen.getByRole('button', { name: 'Horaires différents selon les jours ?' }));
  fillTime(/^à quelle heure, Dimanche/, '12:00');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Dimanche' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Dimanche' }));
  expect(screen.getByLabelText(/^à quelle heure, Dimanche/)).toHaveValue('12:00');
  await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(written(editor).periods[0].weekdays.find((day) => day.code === 'sunday')?.slots).toEqual([{ start: '09:00', end: '12:00' }]);
});
