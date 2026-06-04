import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionTags } from './SectionTags';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionTags', () => {
  it('renders the displayed tags as colored chips, not as editable label inputs', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionTags editor={result.current} permissions={allowAll} />);

    expect(screen.getByText('Tags & étiquettes')).toBeInTheDocument();
    // The label shows as a colored chip (row + preview card), never an editable text input —
    // the saver deliberately omits the label (it must not diverge from ref_tag.name).
    expect(screen.getAllByText('Hôtel 4★').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cuisine').length).toBeGreaterThan(0);
    expect(screen.queryByDisplayValue('Cuisine')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Hôtel 4★')).not.toBeInTheDocument();
  });

  it('renders no editable tag-label input but keeps the colour Select persisting', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionTags editor={result.current} permissions={allowAll} />);

    // T1a: the label write-trap (editable input that was never saved) is removed.
    expect(screen.queryByDisplayValue('Cuisine')).not.toBeInTheDocument();

    // The per-row colour variant remains editable and still marks the module dirty.
    act(() => {
      fireEvent.change(screen.getByDisplayValue('Orange · accroche'), { target: { value: 'green' } });
    });
    view.rerender(<SectionTags editor={result.current} permissions={allowAll} />);

    expect(result.current.dirtySections.tags).toBe(true);
    expect(result.current.draft.tags.displayed[1].colorVariant).toBe('green');
  });

  it('adds a tag from the library via the Ajouter un tag button', () => {
    const modules = fullModulesFixture();
    modules.tags.library = [{ tagId: 't9', slug: 'famille', label: 'Famille', colorVariant: 'neutral', source: 'audience' }];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionTags editor={result.current} permissions={allowAll} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter un tag/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Famille' })); });
    view.rerender(<SectionTags editor={result.current} permissions={allowAll} />);
    expect(result.current.draft.tags.displayed.some((t) => t.slug === 'famille')).toBe(true);
  });

  it('reorders displayed tags and marks the module dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionTags editor={result.current} permissions={allowAll} />);
    // Arrow buttons are replaced by drag handles.
    expect(screen.queryByRole('button', { name: 'Monter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descendre' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Déplacer/i }).length).toBeGreaterThan(0);
  });
});
