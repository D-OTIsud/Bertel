import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { MarkdownCellField } from './MarkdownCellField';
import { AdaptedDescriptionField } from '../../features/object-editor/widgets/AdaptedDescriptionField';
import { useObjectEditorState } from '../../features/object-editor/useObjectEditorState';
import { fullModulesFixture } from '../../features/object-editor/sections/section-fixture.test-utils';

// Bypass only Next's dynamic loading; the mounted editor and commands are real.
jest.mock('./MarkdownEditorLazy', () => ({
  MarkdownEditorLazy: jest.requireActual('./MarkdownEditor').MarkdownEditor,
}));

async function italicize(label: string) {
  const region = await screen.findByLabelText(label);
  const editor = (region as HTMLElement & { editor: Editor }).editor;
  act(() => { editor.commands.selectAll(); });
  fireEvent.keyDown(region, { key: 'i', code: 'KeyI', ctrlKey: true });
  return { region, markdown: editor.storage.markdown.getMarkdown() };
}

it('keeps a cell draft and prevents its modal from saving after permission is revoked', async () => {
  const onChange = jest.fn();
  const { rerender } = render(<MarkdownCellField value="Texte" onChange={onChange} ariaLabel="Description" />);
  fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
  const { region, markdown } = await italicize('Description');
  expect(markdown).toBe('*Texte*');
  rerender(<MarkdownCellField value="Texte" onChange={onChange} ariaLabel="Description" disabled />);
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(region).toHaveAttribute('contenteditable', 'false');
  expect(region.querySelector('em')).toHaveTextContent('Texte');
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  rerender(<MarkdownCellField value="Texte" onChange={onChange} ariaLabel="Description" />);
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(markdown);
});

it('keeps the canonical adapted draft read-only without replacing its module after revocation', async () => {
  const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
  const descriptions = result.current.draft.descriptions;
  const renderField = (canEdit: boolean) => (
    <AdaptedDescriptionField editor={result.current} descriptions={descriptions} objectScope={descriptions.object} canEdit={canEdit} />
  );
  const { rerender } = render(renderField(true));
  fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
  const { region, markdown } = await italicize('Description adaptée — FR');
  expect(markdown).toBe('*Adaptée*');
  rerender(renderField(false));
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(result.current.dirtySections.descriptions).toBeFalsy();
  expect(result.current.draft.descriptions.object.adaptedDescription.baseValue).toBe('Adaptée');
  expect(region).toHaveAttribute('contenteditable', 'false');
  expect(region.querySelector('em')).toHaveTextContent('Adaptée');
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  rerender(renderField(true));
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(result.current.dirtySections.descriptions).toBe(true);
  expect(result.current.draft.descriptions.object.adaptedDescription.baseValue).toBe(markdown);
});
