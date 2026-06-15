import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { fullModulesFixture } from '../sections/section-fixture.test-utils';
import { AdaptedDescriptionField } from './AdaptedDescriptionField';

jest.mock('../../../components/markdown/MarkdownEditorLazy', () => ({
  MarkdownEditorLazy: ({
    value, onChange, ariaLabel,
  }: { value: string; onChange: (v: string) => void; ariaLabel: string }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

function setup(canEdit = true) {
  const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
  const descriptions = result.current.draft.descriptions;
  const view = render(
    <AdaptedDescriptionField
      editor={result.current}
      descriptions={descriptions}
      objectScope={descriptions.object}
      canEdit={canEdit}
    />,
  );
  return { result, view };
}

describe('AdaptedDescriptionField', () => {
  it('shows the rendered preview + Modifier when content exists and canEdit', () => {
    setup(true); // fixture adaptedDescription = "Adaptée"
    expect(screen.getByText('Adaptée')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Modifier/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter une description adaptée/i })).toBeNull();
  });

  it('shows the Ajouter button when empty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const descriptions = result.current.draft.descriptions;
    const emptyScope = {
      ...descriptions.object,
      adaptedDescription: { baseValue: '', values: {} },
    };
    render(
      <AdaptedDescriptionField editor={result.current} descriptions={descriptions} objectScope={emptyScope} canEdit />,
    );
    expect(screen.getByRole('button', { name: /Ajouter une description adaptée/i })).toBeInTheDocument();
  });

  it('hides the edit button and shows a read-only notice without canEdit', () => {
    setup(false);
    expect(screen.queryByRole('button', { name: /Modifier/i })).toBeNull();
    expect(screen.getByText(/droits ne permettent pas/i)).toBeInTheDocument();
    expect(screen.getByText('Adaptée')).toBeInTheDocument();
  });

  it('opens the modal and commits edited Markdown to the descriptions module on save', () => {
    const { result } = setup(true);
    fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
    const editorBox = screen.getByLabelText(/Description adaptée — FR/i);
    fireEvent.change(editorBox, { target: { value: '## Accès\n\n**PMR** ok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(result.current.draft.descriptions.object.adaptedDescription.baseValue).toBe('## Accès\n\n**PMR** ok');
    expect(result.current.dirtySections.descriptions).toBe(true);
  });

  it('discards edits on cancel (Annuler)', () => {
    const { result } = setup(true);
    fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
    fireEvent.change(screen.getByLabelText(/Description adaptée — FR/i), { target: { value: 'jeté' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(result.current.draft.descriptions.object.adaptedDescription.baseValue).toBe('Adaptée');
    expect(result.current.dirtySections.descriptions).toBeFalsy();
  });
});
