/**
 * « Vos coordonnées » — le formulaire le plus simple du portail, et le plus révélateur.
 *
 * Trois choses s'y jouent : la tranche écrite est COMPLÈTE (le fax interne de l'office
 * survit), l'erreur est un TEXTE sous le champ (jamais une bordure rouge seule), et l'état
 * local se resynchronise quand la rubrique affichée change (§212).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactsRubric } from './ContactsRubric';
import type { ObjectEditorState } from '../../object-editor/useObjectEditorState';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';
import type { BuiltPortalRubric } from '../portal-rubrics';
import { PORTAL_RUBRICS } from '../portal-rubrics';

const KIND_OPTIONS = [
  { id: 'k-phone', code: 'phone', label: 'Téléphone' },
  { id: 'k-email', code: 'email', label: 'E-mail' },
  { id: 'k-web', code: 'website', label: 'Site internet' },
  { id: 'k-fax', code: 'fax', label: 'Fax' },
];

const contactRow = (over: Record<string, unknown>) => ({
  id: 'x',
  kindId: 'k',
  kindCode: 'phone',
  kindLabel: 'Téléphone',
  roleId: '',
  roleCode: '',
  roleLabel: '',
  value: '',
  isPublic: true,
  isPrimary: false,
  ...over,
});

function modules(over: Record<string, unknown> = {}): ObjectWorkspaceModules {
  return {
    contacts: {
      objectItems: [
        contactRow({ id: 'c-phone', kindId: 'k-phone', kindCode: 'phone', value: '0262 00 00 00' }),
        // La ligne que l'écran ne montre PAS : le saver remplace tout le bloc, une tranche
        // reconstruite depuis l'affichage la ferait disparaître à l'approbation.
        contactRow({ id: 'c-fax', kindId: 'k-fax', kindCode: 'fax', kindLabel: 'Fax', value: '0262 99 99 99', isPublic: false }),
      ],
      webItems: [],
      kindOptions: KIND_OPTIONS,
      roleOptions: [],
    },
    descriptions: { object: { chapo: { baseValue: '', values: {} }, description: { baseValue: '', values: {} } } },
    ...over,
  } as unknown as ObjectWorkspaceModules;
}

function fakeEditor(draft: ObjectWorkspaceModules): ObjectEditorState {
  return {
    objectId: 'RES1',
    draft,
    baseline: draft,
    dirtySections: {},
    isDirty: false,
    patchModule: jest.fn(),
    replaceModule: jest.fn(),
    resetModule: jest.fn(),
    commitModules: jest.fn(),
    setSavedStatus: jest.fn(),
  } as unknown as ObjectEditorState;
}

const rubric = (): BuiltPortalRubric => ({
  ...PORTAL_RUBRICS.find((entry) => entry.id === 'contacts')!,
  state: 'todo',
  readOnlyReason: null,
});

function setup(draft = modules()) {
  const editor = fakeEditor(draft);
  const onDone = jest.fn();
  render(
    <ContactsRubric
      rubric={rubric()}
      archetype="RES"
      editor={editor}
      formKey="contacts"
      onDone={onDone}
      onCancel={jest.fn()}
      onDirtyChange={jest.fn()}
    />,
  );
  return { editor, onDone };
}

describe('ContactsRubric', () => {
  it('Valider écrit la tranche COMPLÈTE via replaceModule (le fax interne survit) puis revient au hub', async () => {
    const { editor, onDone } = setup();

    await userEvent.clear(screen.getByLabelText('Téléphone'));
    await userEvent.type(screen.getByLabelText('Téléphone'), '0692 45 12 30');
    await userEvent.type(screen.getByLabelText('E-mail'), 'contact@lelonganis.re');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    expect(editor.replaceModule).toHaveBeenCalledTimes(1);
    const [key, value] = (editor.replaceModule as jest.Mock).mock.calls[0];
    expect(key).toBe('contacts');
    const items = (value as { objectItems: { kindCode: string; value: string }[] }).objectItems;
    expect(items.find((item) => item.kindCode === 'phone')?.value).toBe('0692 45 12 30');
    expect(items.find((item) => item.kindCode === 'email')?.value).toBe('contact@lelonganis.re');
    expect(items.find((item) => item.kindCode === 'fax')?.value).toBe('0262 99 99 99');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('un e-mail invalide affiche l’erreur SOUS le champ, marque aria-invalid, et NE valide PAS', async () => {
    const { editor, onDone } = setup();

    await userEvent.type(screen.getByLabelText('E-mail'), 'contact@');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    const field = screen.getByLabelText('E-mail');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    // Un texte, pas une couleur : au soleil, sur un téléphone, la bordure ne se voit pas.
    const error = screen.getByText('Vérifiez cette adresse e-mail (exemple : contact@exemple.re).');
    expect(field.getAttribute('aria-describedby') ?? '').toContain(error.id);
    expect(editor.replaceModule).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('changer de rubrique resynchronise le formulaire — pas les valeurs de la précédente (§212)', () => {
    const first = modules();
    const editor = fakeEditor(first);
    const props = {
      rubric: rubric(),
      archetype: 'RES' as const,
      editor,
      onDone: jest.fn(),
      onCancel: jest.fn(),
      onDirtyChange: jest.fn(),
    };
    const { rerender } = render(<ContactsRubric {...props} formKey="contacts" />);
    expect(screen.getByLabelText('Téléphone')).toHaveValue('0262 00 00 00');

    const second = modules({
      contacts: {
        objectItems: [contactRow({ id: 'c9', kindId: 'k-phone', kindCode: 'phone', value: '0692 11 22 33' })],
        webItems: [],
        kindOptions: KIND_OPTIONS,
        roleOptions: [],
      },
    });
    rerender(<ContactsRubric {...props} editor={fakeEditor(second)} formKey="contacts:2" />);

    expect(screen.getByLabelText('Téléphone')).toHaveValue('0692 11 22 33');
  });

  it('vider un champ retire la ligne au lieu d’écrire une valeur vide', async () => {
    const { editor } = setup();

    await userEvent.clear(screen.getByLabelText('Téléphone'));
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    const [, value] = (editor.replaceModule as jest.Mock).mock.calls[0];
    const items = (value as { objectItems: { kindCode: string }[] }).objectItems;
    expect(items.some((item) => item.kindCode === 'phone')).toBe(false);
    expect(items.some((item) => item.kindCode === 'fax')).toBe(true);
  });
});
