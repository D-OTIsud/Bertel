import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionAccessibility } from './SectionAccessibility';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

jest.mock('../../../components/markdown/MarkdownEditorLazy', () => ({
  MarkdownEditorLazy: ({ ariaLabel }: { ariaLabel: string }) => <textarea aria-label={ariaLabel} />,
}));

describe('SectionAccessibility — description adaptée (single owner since the §04 hand-off)', () => {
  it('shows a read-only notice and no edit button without canonical rights', () => {
    const noCanonical = {
      descriptions: { canEditCanonical: false, canDirectWrite: false, canEditOrgEnrichment: true },
    } as unknown as ObjectWorkspacePermissions;
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAccessibility editor={result.current} permissions={noCanonical} />);

    expect(screen.queryByRole('button', { name: /Modifier/i })).toBeNull();
    expect(screen.getByText(/droits ne permettent pas/i)).toBeInTheDocument();
  });

  it('exposes the edit button (Modifier) with canonical rights', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    expect(screen.getByRole('button', { name: /Modifier/i })).toBeInTheDocument();
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

  it('gates the T&H label controls behind a notice when the shared distinctions module is degraded', () => {
    // §08 and §10 share the distinctions saver; a degraded load must not be editable
    // (editing would dirty it and a save would mass-delete real rows). §71 E review.
    const m = fullModulesFixture();
    m.distinctions.unavailableReason = 'Distinctions indisponibles dans le live actuel.';
    const { result } = renderHook(() => useObjectEditorState('o1', m));
    render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    expect(screen.getByText(/Module indisponible/i)).toBeInTheDocument();
    // The held-label disability-type chips must NOT render (the equipment panels below are
    // a different module and keep their own "Équipements moteur" headers).
    expect(screen.queryByRole('button', { name: 'Moteur' })).not.toBeInTheDocument();
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

  it('hides the T&H label block (no opt-in toggle) when the label is not held — it is added in §08', () => {
    // §71 F: the label is held/added in §08 Classifications. §10 no longer offers an opt-in.
    const mods = fullModulesFixture();
    mods.distinctions = { ...mods.distinctions, accessibilityLabels: [] };
    const { result } = renderHook(() => useObjectEditorState('o1', mods));
    render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    expect(
      screen.queryByRole('button', { name: 'Établissement labellisé Tourisme & Handicap' }),
    ).not.toBeInTheDocument();
    // The whole "Label Tourisme & Handicap" block is hidden when the label is not held.
    expect(screen.queryByText('Label Tourisme & Handicap')).not.toBeInTheDocument();
    // The equipment panels (a different module) still render.
    expect(screen.getByRole('button', { name: /Équipements moteur/i })).toBeInTheDocument();
  });

  it('offers canonical label-status options (granted), not the legacy "active" vocabulary', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionAccessibility editor={result.current} permissions={allowAll} />);
    const statusValues = screen.getAllByRole('option').map((opt) => opt.getAttribute('value'));
    expect(statusValues).toContain('granted');
    expect(statusValues).not.toContain('active');
  });
});
