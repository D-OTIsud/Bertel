import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionRelations } from './SectionRelations';
import { useObjectEditorState } from '../useObjectEditorState';
import { useUnsavedDraftGuard } from '../useUnsavedDraftGuard';
import { useUiStore } from '../../../store/ui-store';
import { ObjectDrawer } from '../../../components/editor/ObjectDrawer';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

jest.mock('../../object-drawer/ObjectDrawerShell', () => ({
  ObjectDrawerShell: ({ objectId, onClose }: { objectId: string; onClose: () => void }) => (
    <><p>Consultation {objectId}</p><button onClick={onClose}>Fermer la consultation</button></>
  ),
}));

const modules = fullModulesFixture();
modules.relationships.relatedObjects.push(
  { ...modules.relationships.relatedObjects[0], id: 'incoming-a', name: 'Fiche entrante A', direction: 'in' },
  { ...modules.relationships.relatedObjects[0], id: 'incoming-b', name: 'Fiche entrante B', direction: 'in' },
);

function EditorWithDrawer() {
  const editor = useObjectEditorState('o1', modules);
  useUnsavedDraftGuard(editor.isDirty);
  const drawerObjectId = useUiStore((state) => state.drawerObjectId);
  return <>
    <SectionRelations editor={editor} permissions={allowAll} objectId="o1" />
    <output aria-label="État du brouillon">{editor.isDirty ? 'Modifié' : 'Enregistré'}</output>
    <ObjectDrawer objectId={drawerObjectId} />
  </>;
}

beforeEach(() => useUiStore.getState().closeDrawer());
afterEach(() => jest.restoreAllMocks());

it('ouvre la bonne fiche entrante au clavier et rend le focus sans perdre le brouillon', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<EditorWithDrawer />);
  fireEvent.change(screen.getByPlaceholderText('Note libre'), { target: { value: 'Note non enregistrée' } });
  expect(screen.getByLabelText('État du brouillon')).toHaveTextContent('Modifié');
  const row = screen.getByText('Fiche entrante B').closest('.rep-row') as HTMLElement;
  const opener = within(row).getByRole('button', { name: 'Ouvrir la fiche' });
  opener.focus();
  await userEvent.keyboard('{Enter}');
  expect(useUiStore.getState().drawerObjectId).toBe('incoming-b');
  expect(screen.getByRole('dialog')).toHaveTextContent('Consultation incoming-b');
  expect(confirm).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Fermer la consultation' }));
  await waitFor(() => expect(opener).toHaveFocus());
  expect(screen.getByPlaceholderText('Note libre')).toHaveValue('Note non enregistrée');
  expect(screen.getByLabelText('État du brouillon')).toHaveTextContent('Modifié');
});

it('ouvre une autre fiche par son identifiant sans modifier les liens', () => {
  render(<EditorWithDrawer />);
  const row = screen.getByText('Fiche entrante A').closest('.rep-row') as HTMLElement;
  fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir la fiche' }));
  expect(useUiStore.getState().drawerObjectId).toBe('incoming-a');
  expect(screen.getByLabelText('État du brouillon')).toHaveTextContent('Enregistré');
});
