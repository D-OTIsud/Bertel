import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SeasonRubric } from './SeasonRubric';
import { fakeEditor, portalModules, openingPeriod } from '../__fixtures__/portal-fixtures';
import { buildPortalRubrics } from '../portal-rubrics';
import { savePortalStayTimes } from '../../../services/portal';
jest.mock('../../../services/portal', () => ({ savePortalStayTimes: jest.fn() }));

function setup(complex = false, masked: string[] = [],objectType?:string) {
  const modules = portalModules();
  modules.openings.periods = [openingPeriod(), ...(complex ? [openingPeriod({ recordId: 'second' })] : [])] as never;
  modules.capacityPolicies.stayPolicy = { checkInFrom: '14:00', checkInUntil: '', checkOutUntil: '10:00', conditions: 'Ne pas écraser' };
  const editor = fakeEditor(modules); editor.objectId = 'HOT1';
  const rubric = buildPortalRubrics({ archetype: 'HEB', draft: modules, dirty: {}, masked, floor: [], pendingModules: new Set(), rejectedModules: new Set() }).find((entry) => entry.id === 'season')!;
  const onDone = jest.fn();
  const view=render(<SeasonRubric rubric={rubric} archetype="HEB" objectType={objectType} editor={editor} formKey="season" onDone={onDone} onCancel={jest.fn()} onDirtyChange={jest.fn()} />);
  return { editor, onDone,unmount:view.unmount };
}
beforeEach(() => jest.clearAllMocks());

test('l’accueil est pré-coché pour un hôtel et reste décoché pour un gîte',()=>{
  const view=setup(false,[],'HOT');expect(screen.getByRole('checkbox',{name:'Il y a un accueil sur place'})).toBeChecked();view.unmount();
  setup(false,[],'HLO');expect(screen.getByRole('checkbox',{name:'Il y a un accueil sur place'})).not.toBeChecked();
});

test('un service renseigné sans période d’ouverture reste dans le formulaire au lieu d’être perdu',()=>{
  const modules=portalModules();modules.openings.periods=[];
  const editor=fakeEditor(modules);
  const rubric=buildPortalRubrics({archetype:'HEB',draft:modules,dirty:{},masked:[],floor:[],pendingModules:new Set(),rejectedModules:new Set()}).find(entry=>entry.id==='season')!;
  render(<SeasonRubric rubric={rubric} archetype="HEB" objectType="HLO" editor={editor} formKey="new-season" onDone={jest.fn()} onCancel={jest.fn()} onDirtyChange={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Petit-déjeuner'}));fireEvent.click(screen.getByRole('button',{name:'Tous les jours'}));fireEvent.click(screen.getByRole('checkbox',{name:'Ouvert, sans horaires fixes'}));
  fireEvent.click(screen.getByRole('button',{name:'Valider'}));expect(screen.getByRole('alert')).toHaveTextContent('Indiquez d’abord si vous êtes ouvert toute l’année.');expect(editor.replaceModule).not.toHaveBeenCalled();expect(screen.getByLabelText('Nom du service')).toHaveValue('Petit-déjeuner');
});

test('l’arrivée et le départ sont enregistrés sans soumettre les autres champs', async () => {
  const { editor, onDone } = setup();
  jest.mocked(savePortalStayTimes).mockResolvedValue({ checkInFrom: '15:00', checkInUntil: '23:00', checkOutUntil: '11:00' });
  fireEvent.change(screen.getByLabelText('Arrivée à partir de'), { target: { value: '15:00' } });
  fireEvent.change(screen.getByLabelText('Départ jusqu’à'), { target: { value: '11:00' } });
  fireEvent.click(screen.getByLabelText('Préciser une heure limite d’arrivée'));
  fireEvent.change(screen.getByLabelText('Arrivée jusqu’à'), { target: { value: '23:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
  expect(savePortalStayTimes).toHaveBeenCalledWith('HOT1', { checkInFrom: '15:00', checkInUntil: '23:00', checkOutUntil: '11:00' });
  expect(editor.commitModules).not.toHaveBeenCalled();
  expect(editor.replaceModule).not.toHaveBeenCalled();
  const update = jest.mocked(editor.mergeSavedModule).mock.calls[0][1];
  expect(update(editor.draft.capacityPolicies)).toMatchObject({ stayPolicy: { checkInFrom: '15:00', conditions: 'Ne pas écraser' } });
});

test('plusieurs périodes empêchent de modifier la saison mais pas les heures', () => {
  setup(true);
  expect(screen.getByLabelText('Oui, toute l’année')).toBeDisabled();
  expect(screen.getByLabelText('Arrivée à partir de')).toBeEnabled();
});

test('une panne conserve les heures saisies et garde le formulaire ouvert', async () => {
  const { onDone } = setup();
  jest.mocked(savePortalStayTimes).mockRejectedValue(new Error('Connexion indisponible.'));
  fireEvent.change(screen.getByLabelText('Arrivée à partir de'), { target: { value: '16:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connexion indisponible.');
  expect(screen.getByLabelText('Arrivée à partir de')).toHaveValue('16:00');
  expect(onDone).not.toHaveBeenCalled();
});

test('les heures masquées par l’office ne sont pas proposées', () => {
  setup(false, ['capacity-policies']);
  expect(screen.queryByLabelText('Arrivée à partir de')).not.toBeInTheDocument();
});
