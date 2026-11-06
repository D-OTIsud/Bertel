import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { flushSync } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { MarkdownEditor } from './MarkdownEditor';

async function mountEditor(disabled = false, variant: 'block' | 'inline' = 'block') {
  const onChange = jest.fn();
  const rendered = render(<MarkdownEditor value="Texte" onChange={onChange} ariaLabel="Description" disabled={disabled} variant={variant} />);
  const region = await screen.findByLabelText('Description');
  // Tiptap itself attaches its live Editor to view.dom. No editor/command mocks.
  const editor = (region as HTMLElement & { editor: Editor }).editor;
  expect(editor).toBeDefined();
  return { ...rendered, editor, region, onChange };
}

function selectText(editor: Editor) {
  act(() => { editor.commands.setTextSelection({ from: 1, to: 6 }); });
}

describe('MarkdownEditor read-only interactions with real Tiptap', () => {
  it.each(['block', 'inline'] as const)('disables every %s toolbar action without changing the document', async (variant) => {
    const { editor, onChange } = await mountEditor(true, variant);
    selectText(editor);
    const before = editor.getJSON();
    const prompt = jest.spyOn(window, 'prompt').mockReturnValue('https://example.com');
    try {
      for (const button of within(screen.getByRole('toolbar')).getAllByRole('button')) {
        expect(button).toBeDisabled();
        fireEvent.click(button);
        expect(editor.getJSON()).toEqual(before);
      }
      expect(prompt).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      prompt.mockRestore();
    }
  });

  it.each([
    ['bold', { key: 'b', code: 'KeyB', ctrlKey: true }],
    ['italic', { key: 'i', code: 'KeyI', ctrlKey: true }],
    ['heading', { key: '2', code: 'Digit2', ctrlKey: true, altKey: true }],
    ['bullet list', { key: '8', code: 'Digit8', ctrlKey: true, shiftKey: true }],
  ] as const)('ignores the %s keyboard command in read-only mode', async (_name, key) => {
    const { editor, region, onChange } = await mountEditor(true);
    selectText(editor);
    const before = editor.getJSON();
    fireEvent.keyDown(region, key);
    expect(editor.getJSON()).toEqual(before);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a formatting mouse click while read-only', async () => {
    const { editor, region, onChange } = await mountEditor(true);
    selectText(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Gras' }));
    expect(region.querySelector('strong')).toBeNull();
    expect(editor.storage.markdown.getMarkdown()).toBe('Texte');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the matching keyboard command functional when editing is allowed', async () => {
    const { editor, region, onChange } = await mountEditor();
    selectText(editor);
    fireEvent.keyDown(region, { key: 'b', code: 'KeyB', ctrlKey: true });
    expect(region.querySelector('strong')).toHaveTextContent('Texte');
    expect(onChange).toHaveBeenLastCalledWith('**Texte**');
  });

  it('blocks undo and further keyboard edits when permission is revoked without losing the edited text', async () => {
    const { editor, region, onChange, rerender } = await mountEditor();
    selectText(editor);
    fireEvent.keyDown(region, { key: 'b', code: 'KeyB', ctrlKey: true });
    expect(editor.can().undo()).toBe(true);
    const savedValue = editor.storage.markdown.getMarkdown();
    onChange.mockClear();
    rerender(<MarkdownEditor value={savedValue} onChange={onChange} ariaLabel="Description" disabled />);
    expect(region).toHaveAttribute('contenteditable', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    fireEvent.keyDown(region, { key: 'z', code: 'KeyZ', ctrlKey: true });
    fireEvent.keyDown(region, { key: 'i', code: 'KeyI', ctrlKey: true });
    expect(editor.storage.markdown.getMarkdown()).toBe(savedValue);
    expect(onChange).not.toHaveBeenCalled();
    rerender(<MarkdownEditor value={savedValue} onChange={onChange} ariaLabel="Description" />);
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(editor.storage.markdown.getMarkdown()).toBe('Texte');
    expect(onChange).toHaveBeenLastCalledWith('Texte');
  });

  it('does not leave a hidden stored mark for later typing while read-only', async () => {
    const { editor, region, onChange, rerender } = await mountEditor(true);
    act(() => { editor.commands.setTextSelection(1); });
    fireEvent.keyDown(region, { key: 'b', code: 'KeyB', ctrlKey: true });
    expect(editor.state.storedMarks ?? []).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
    rerender(<MarkdownEditor value="Texte" onChange={onChange} ariaLabel="Description" />);
    expect(screen.getByRole('button', { name: 'Gras' })).toBeEnabled();
    expect(region).toHaveAttribute('aria-readonly', 'false');
    act(() => { editor.commands.insertContent('Suite '); });
    expect(editor.storage.markdown.getMarkdown()).toBe('Suite Texte');
    expect(onChange).toHaveBeenLastCalledWith('Suite Texte');
  });

  it('keeps text selectable and receives an external replacement while read-only', async () => {
    const { editor, region, onChange, rerender } = await mountEditor(true);
    fireEvent.keyDown(region, { key: 'a', code: 'KeyA', ctrlKey: true });
    // ProseMirror deliberately leaves Ctrl+A to the native browser in read-only
    // mode. jsdom has no native selection default, so select the actual DOM text.
    expect(editor.storage.markdown.getMarkdown()).toBe('Texte');
    const range = document.createRange();
    range.selectNodeContents(region);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    expect(window.getSelection()?.toString()).toBe('Texte');
    rerender(<MarkdownEditor value="Texte remplacé" onChange={onChange} ariaLabel="Description" disabled />);
    expect(await screen.findByText('Texte remplacé')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not report a canonical edit for a read-only Tiptap editability notification', async () => {
    const { editor, onChange } = await mountEditor(true);
    act(() => { editor.setEditable(false); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('discards a link command when permission is revoked before the prompt returns', async () => {
    const { editor, region, onChange, rerender } = await mountEditor();
    selectText(editor);
    const prompt = jest.spyOn(window, 'prompt').mockImplementation(() => {
      flushSync(() => rerender(<MarkdownEditor value="Texte" onChange={onChange} ariaLabel="Description" disabled />));
      return 'https://example.com';
    });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Lien' }));
      expect(prompt).toHaveBeenCalledTimes(1);
      expect(region).toHaveAttribute('contenteditable', 'false');
      expect(region.querySelector('a')).toBeNull();
      expect(editor.storage.markdown.getMarkdown()).toBe('Texte');
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      prompt.mockRestore();
    }
  });
});
