import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionClassification } from './SectionClassification';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

function modulesWithStarsScheme() {
  const m = fullModulesFixture();
  m.distinctions.schemeOptions = [{
    id: 'stars', code: 'stars', label: 'Étoiles', selectionMode: 'single', isAccessibility: false,
    valueOptions: [{ id: '3', code: '3', label: '3 étoiles' }, { id: '4', code: '4', label: '4 étoiles' }],
  }];
  return m;
}

describe('SectionClassification', () => {
  it('edits a distinction value via a reference selector, not free text', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithStarsScheme()));
    const view = render(<SectionClassification editor={result.current} permissions={allowAll} />);
    const valueSelect = screen.getByLabelText(/Valeur attribuée/i);
    expect(valueSelect.tagName).toBe('SELECT');
    act(() => { fireEvent.change(valueSelect, { target: { value: '3' } }); });
    view.rerender(<SectionClassification editor={result.current} permissions={allowAll} />);
    expect(result.current.draft.distinctions.distinctionGroups[0].items[0].valueCode).toBe('3');
  });

  it('offers canonical classification-status options (granted), not the legacy "active" alias', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithStarsScheme()));
    render(<SectionClassification editor={result.current} permissions={allowAll} />);
    // Canonical object_classification.status lifecycle is granted/requested/suspended/expired;
    // the editor must not offer the non-canonical 'active' alias (invisible to every label read/filter).
    const statusValues = screen.getAllByRole('option').map((opt) => opt.getAttribute('value'));
    expect(statusValues).toContain('granted');
    expect(statusValues).not.toContain('active');
  });
});
