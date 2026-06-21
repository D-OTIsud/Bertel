import { render, screen } from '@testing-library/react';
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
});
