import { render, screen, fireEvent } from '@testing-library/react';
import { MarkdownCellField } from './MarkdownCellField';

// MarkdownEditorLazy is dynamic/SSR-false + TipTap — mock it to a plain textarea
// (same pattern as SectionAccessibility.test.tsx which mocks MarkdownEditorLazy).
jest.mock('./MarkdownEditorLazy', () => ({
  MarkdownEditorLazy: ({ value, onChange, ariaLabel }: { value: string; onChange: (md: string) => void; ariaLabel: string }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

describe('MarkdownCellField', () => {
  it('shows the empty label and opens the modal to add content', () => {
    const onChange = jest.fn();
    render(<MarkdownCellField value="" onChange={onChange} ariaLabel="Description test" emptyLabel="Aucune description" />);
    expect(screen.getByText('Aucune description')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ajouter/i }));
    const editor = screen.getByLabelText('Description test');
    fireEvent.change(editor, { target: { value: 'Texte **gras**' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(onChange).toHaveBeenCalledWith('Texte **gras**');
  });

  it('renders a preview when a value is present and edits it', () => {
    const onChange = jest.fn();
    render(<MarkdownCellField value="Déjà **là**" onChange={onChange} ariaLabel="Description test" />);
    expect(screen.getByRole('button', { name: /modifier/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /modifier/i }));
    expect(screen.getByLabelText('Description test')).toHaveValue('Déjà **là**');
  });

  it('does not show an edit affordance when disabled', () => {
    render(<MarkdownCellField value="x" onChange={jest.fn()} ariaLabel="Description test" disabled />);
    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument();
  });
});
