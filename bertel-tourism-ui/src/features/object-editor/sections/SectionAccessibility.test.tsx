import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionAccessibility } from './SectionAccessibility';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

describe('SectionAccessibility — description adaptée (single owner since the §04 hand-off)', () => {
  it('disables the adapted-description textarea without canonical rights (no silent drop)', () => {
    const noCanonical = {
      descriptions: { canEditCanonical: false, canDirectWrite: false, canEditOrgEnrichment: true },
    } as unknown as ObjectWorkspacePermissions;
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAccessibility editor={result.current} permissions={noCanonical} />);

    const textarea = screen.getByTestId('adapted-description-textarea');
    expect(textarea).toBeDisabled();
    expect(screen.getByText(/droits ne permettent pas/i)).toBeInTheDocument();
  });

  it('keeps the adapted-description textarea editable with canonical rights', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    expect(screen.getByTestId('adapted-description-textarea')).toBeEnabled();
  });
});

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

  it('shows a §11-style stat header and keeps the adapted multilingual description', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    expect(screen.getByText(/Label T&H/i)).toBeInTheDocument();
    expect(screen.getByText(/Description adapt/i)).toBeInTheDocument();
  });

  it('toggles on a Tourisme & Handicap label with canonical status "granted" (not "active")', () => {
    // Empty accessibilityLabels + an isAccessibility scheme option exposes the opt-in Toggle branch.
    const mods = fullModulesFixture();
    mods.distinctions = {
      ...mods.distinctions,
      accessibilityLabels: [],
      schemeOptions: [
        { id: 'th', code: 'LBL_TOURISME_HANDICAP', label: 'Tourisme & Handicap', selectionMode: 'single', isAccessibility: true, valueOptions: [] },
      ],
    };
    const { result } = renderHook(() => useObjectEditorState('o1', mods));
    const view = render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Établissement labellisé Tourisme & Handicap' }));
    });
    view.rerender(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    // Backend label reads/filters gate on status='granted'; the editor must write the canonical value.
    expect(result.current.draft.distinctions.accessibilityLabels[0].status).toBe('granted');
  });

  it('offers canonical label-status options (granted), not the legacy "active" vocabulary', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    const statusValues = screen.getAllByRole('option').map((opt) => opt.getAttribute('value'));
    expect(statusValues).toContain('granted');
    expect(statusValues).not.toContain('active');
  });
});
