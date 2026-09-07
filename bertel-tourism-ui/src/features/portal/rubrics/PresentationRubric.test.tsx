import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresentationRubric } from './PresentationRubric';
import type { PortalRubricFormProps } from './types';
import { fakeEditor, portalModules } from '../__fixtures__/portal-fixtures';
import { PORTAL_RUBRICS } from '../portal-rubrics';
import { buildContributorSubmission } from '../../object-editor/contributor-proposal';
import { translateWithAi } from '../../../services/ai-translate';
import type { ObjectWorkspaceDescriptionsModule } from '../../../services/object-workspace-parser';

jest.mock('../../../services/ai-translate', () => ({ translateWithAi: jest.fn() }));
const translate = jest.mocked(translateWithAi);

function descriptions(): ObjectWorkspaceDescriptionsModule {
  const field = (baseValue = '', values: Record<string, string> = {}) => ({ baseValue, values });
  const object: ObjectWorkspaceDescriptionsModule['object'] = {
    recordId: 'd1', scope: 'object', placeId: null, label: '', visibility: 'public',
    chapo: field('Une table créole.', { fr: 'Une table créole.', es: 'Una mesa criolla.' }),
    description: field('Cuisine **maison** sous les longanis.', { fr: 'Cuisine **maison** sous les longanis.' }),
    adaptedDescription: field('Entrée accessible'), mobileDescription: field(), editorialDescription: field(),
  };
  return {
    localLanguage: 'fr', activeLanguage: 'fr', availableLanguages: ['fr', 'en', 'es'],
    object, orgOverlay: { ...object, recordId: 'org1' }, places: [{ ...object, recordId: 'place1', placeId: 'p1' }],
  };
}

function setup(over: Partial<PortalRubricFormProps> = {}) {
  const editor = fakeEditor(portalModules({ descriptions: descriptions() }));
  const props: PortalRubricFormProps = {
    rubric: { ...PORTAL_RUBRICS.find((entry) => entry.id === 'presentation')!, state: 'todo', readOnlyReason: null },
    archetype: 'RES', editor, formKey: 'RES1:presentation', formCache: new Map(),
    onDone: jest.fn(), onCancel: jest.fn(), onDirtyChange: jest.fn(), ...over,
  };
  const view = render(<PresentationRubric {...props} />);
  return { props, view, editor: props.editor };
}

const choose = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const translateButton = () => screen.getByRole('button', { name: 'Traduire avec l’IA' });

beforeEach(() => {
  translate.mockReset();
  translate.mockResolvedValue({ chapo: 'A Creole table.', description: '**Homemade** food under the longan trees.' });
});

it('la navigation de langue seule reste sans modification et le français reste la saisie initiale', () => {
  const { props, editor } = setup();
  expect(screen.getByLabelText('En une phrase')).toHaveValue('Une table créole.');
  choose('English');
  expect(screen.getByLabelText('En une phrase')).toHaveValue('');
  expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
  expect(editor.replaceModule).not.toHaveBeenCalled();
});

it('traduit en anglais, permet la correction et conserve le français et le payload habituel de proposition', async () => {
  const { editor, props } = setup();
  const original = editor.draft.descriptions;
  choose('English');
  fireEvent.click(translateButton());
  await waitFor(() => expect(screen.getByLabelText('En une phrase')).toHaveValue('A Creole table.'));
  expect(editor.replaceModule).not.toHaveBeenCalled();
  expect(props.onDone).not.toHaveBeenCalled();
  expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
  fireEvent.change(screen.getByLabelText('En une phrase'), { target: { value: 'A welcoming Creole table.' } });
  choose('Français');
  expect(screen.getByLabelText('En une phrase')).toHaveValue('Une table créole.');
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));

  const [module, saved] = (editor.replaceModule as jest.Mock).mock.calls[0] as [string, ObjectWorkspaceDescriptionsModule];
  expect(module).toBe('descriptions');
  expect(saved.object.chapo).toEqual({
    baseValue: original.object.chapo.baseValue,
    values: { ...original.object.chapo.values, en: 'A welcoming Creole table.' },
  });
  expect(saved.object.description.values).toEqual({
    ...original.object.description.values, en: '**Homemade** food under the longan trees.',
  });
  expect(saved.object.adaptedDescription).toBe(original.object.adaptedDescription);
  expect(saved.orgOverlay).toBe(original.orgOverlay);
  expect(saved.places).toBe(original.places);
  expect(saved.availableLanguages).toBe(original.availableLanguages);
  expect(props.onDone).toHaveBeenCalledTimes(1);
  const proposal = buildContributorSubmission(editor.objectId, 'descriptions', editor.baseline, { ...editor.draft, descriptions: saved });
  expect(proposal).toMatchObject({ objectId: 'RES1', targetTable: 'object_description', action: 'update', payload: saved });
  expect(proposal.metadata).toMatchObject({ rpc: null, section: 'descriptions', manual_apply: true });
});

it('utilise le français en cours de saisie et retrouve toutes les traductions dans le cache après remontage', async () => {
  const cache = new Map<string, unknown>();
  cache.set('RES1:presentation', { chapo: 'Texte FR encore non validé.', description: 'Un **brouillon** à traduire.' });
  const first = setup({ formCache: cache });
  choose('English');
  fireEvent.click(translateButton());
  await waitFor(() => expect(screen.getByLabelText('En une phrase')).toHaveValue('A Creole table.'));
  expect(translate).toHaveBeenCalledWith({
    objectId: 'RES1', sourceLanguage: 'fr', targetLanguage: 'en',
    fields: { chapo: 'Texte FR encore non validé.', description: 'Un **brouillon** à traduire.' },
  }, expect.any(AbortSignal));
  first.view.unmount();
  setup({ formCache: cache });
  expect(screen.getByLabelText('En une phrase')).toHaveValue('Texte FR encore non validé.');
  choose('English');
  expect(screen.getByLabelText('En une phrase')).toHaveValue('A Creole table.');
  expect(screen.getByLabelText('Présentez votre établissement')).toHaveValue('**Homemade** food under the longan trees.');
});

it('une réponse tardive ne remplace pas un texte saisi pendant la traduction', async () => {
  let finish!: (result: Record<string, string>) => void;
  translate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  setup();
  choose('English');
  fireEvent.click(translateButton());
  fireEvent.change(screen.getByLabelText('En une phrase'), { target: { value: 'My own English text.' } });
  await act(async () => finish({ chapo: 'Late translation', description: 'Late description' }));
  expect(screen.getByLabelText('En une phrase')).toHaveValue('My own English text.');
  expect(screen.getByLabelText('Présentez votre établissement')).toHaveValue('');
  choose('Français');
  expect(screen.getByLabelText('En une phrase')).toHaveValue('Une table créole.');
});

it('conserve une traduction existante et traduit seulement le champ manquant', async () => {
  translate.mockResolvedValue({ description: 'Cocina casera.' });
  setup();
  choose('Español');
  fireEvent.click(translateButton());
  await waitFor(() => expect(screen.getByLabelText('Présentez votre établissement')).toHaveValue('Cocina casera.'));
  expect(screen.getByLabelText('En une phrase')).toHaveValue('Una mesa criolla.');
  expect(translate.mock.calls[0][0].fields).toEqual({ description: 'Cuisine **maison** sous les longanis.' });
  expect(translateButton()).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Remplacer les traductions existantes'));
  expect(translateButton()).toBeEnabled();
});
