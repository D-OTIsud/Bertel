import { render, screen } from '@testing-library/react';
import { mergeAttributes } from '@tiptap/core';
import { MarkdownEditor } from './MarkdownEditor';

// jsdom render-smoke only: assert the toolbar + editable region mount with the right
// accessible names. Real editing / Markdown round-trip is verified in the browser preview —
// ProseMirror content editing is unreliable under jsdom.
describe('MarkdownEditor (render smoke)', () => {
  it('mounts the toolbar controls and an editable region with an accessible name', async () => {
    render(<MarkdownEditor value={'## Titre\n\nTexte'} ariaLabel="Description adaptée — FR" onChange={() => {}} />);
    expect(await screen.findByRole('button', { name: 'Gras' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Titre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Liste à puces' })).toBeInTheDocument();
    expect(screen.getByLabelText('Description adaptée — FR')).toBeInTheDocument();
  });

  it('inline variant hides heading and list controls but keeps inline marks', async () => {
    render(<MarkdownEditor value="" ariaLabel="Accroche — FR" onChange={() => {}} variant="inline" />);
    // editor mounts async (immediatelyRender:false) — await the toolbar before asserting absence
    expect(await screen.findByRole('button', { name: 'Gras' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lien' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Titre' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Liste à puces' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Citation' })).toBeNull();
  });

  it('resets to an external value change without invoking onChange', async () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <MarkdownEditor value="Texte initial" ariaLabel="Description" onChange={onChange} />,
    );
    await screen.findByLabelText('Description');
    rerender(<MarkdownEditor value="Texte remplacé" ariaLabel="Description" onChange={onChange} />);
    expect(await screen.findByText('Texte remplacé')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders a non-editable region when disabled', async () => {
    render(<MarkdownEditor value="Texte" ariaLabel="Description" onChange={() => {}} disabled />);
    const region = await screen.findByLabelText('Description');
    expect(region).toHaveAttribute('contenteditable', 'false');
  });

  it('registers extensions without duplicate-extension warnings', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    render(<MarkdownEditor value="" ariaLabel="Description" onChange={() => {}} />);
    await screen.findByLabelText('Description');
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Duplicate extension names found'));
    warnSpy.mockRestore();
  });

  it('renders the controlled markdown value into its allowed-subset HTML (bold)', async () => {
    render(<MarkdownEditor value="**gras**" ariaLabel="Description" onChange={() => {}} />);
    const region = await screen.findByLabelText('Description');
    expect(region.querySelector('strong')).toHaveTextContent('gras');
  });
});

// Regression test for GHSA-cp6q-959q-f8rh (mergeAttributes prototype pollution via a crafted
// `__proto__` attribute key), fixed upstream in @tiptap/core 3.30.4. MarkdownEditor's extensions
// all render through `mergeAttributes` (e.g. the Link HTMLAttributes merge), so this asserts the
// installed dependency actually enforces the boundary rather than trusting the changelog.
describe('mergeAttributes (installed @tiptap/core security boundary)', () => {
  it('does not let a crafted __proto__ attribute pollute Object.prototype', () => {
    const malicious = JSON.parse('{"__proto__": {"onerror": "alert(1)"}}') as Record<string, unknown>;
    try {
      mergeAttributes({ href: 'https://example.com' }, malicious);
      expect(({} as Record<string, unknown>).onerror).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'onerror')).toBe(false);
    } finally {
      delete (Object.prototype as Record<string, unknown>).onerror;
    }
  });
});
