import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionTags } from './SectionTags';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionTags', () => {
  it('renders the displayed tags from the fixture', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionTags editor={result.current} permissions={allowAll} />);

    expect(screen.getByText('Tags & étiquettes')).toBeInTheDocument();
    // Both the colored chip preview and the editable input value should appear.
    expect(screen.getAllByText('Hôtel 4★').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Cuisine')).toBeInTheDocument();
  });

  it('renames a tag and marks the tags module dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionTags editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.change(screen.getByDisplayValue('Cuisine'), { target: { value: 'Cuisine créole' } });
    });
    view.rerender(<SectionTags editor={result.current} permissions={allowAll} />);

    expect(result.current.dirtySections.tags).toBe(true);
    expect(result.current.draft.tags.displayed[1].label).toBe('Cuisine créole');
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
});
