import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionAccessibility } from './SectionAccessibility';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionAccessibility — Tourisme & Handicap label', () => {
  it('shows disability-type toggles for a held label, no free-text value input', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    // The fixture's accessibilityLabels[0] covers 'motor'.
    expect(screen.getByRole('button', { name: 'Moteur' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Auditif' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByDisplayValue('Tourisme Handicap')).not.toBeInTheDocument(); // no free-text value Input
  });

  it('toggles a covered disability type and marks the module dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Auditif' })); });
    view.rerender(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    expect(result.current.dirtySections.distinctions).toBe(true);
    expect(result.current.draft.distinctions.accessibilityLabels[0].disabilityTypesCovered).toContain('hearing');
  });

  it('groups accessible amenities into disability-type panels and toggles selection', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    // Expand the moteur equipment panel — its header name is deliberately distinct from the
    // T&H label block's bare "Moteur" chip (built in Task 5.2), to avoid a getByRole collision.
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Équipements moteur/i })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Accès PMR' })); });
    view.rerender(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    expect(result.current.draft.characteristics.selectedAmenityCodes).toContain('pmr_access');
  });
});
