import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionTags } from './SectionTags';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

const denyTags = new Proxy(
  {},
  { get: () => ({ canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: 'Lecture seule pour les tags.' }) },
) as unknown as ObjectWorkspacePermissions;

describe('SectionTags', () => {
  it('renders the displayed tags as colored chips, never as editable label inputs or selects', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionTags editor={result.current} permissions={allowAll} />);

    expect(screen.getByText('Tags & étiquettes')).toBeInTheDocument();
    expect(screen.getAllByText('Hôtel 4★').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cuisine').length).toBeGreaterThan(0);
    // No editable label input and no inline colour/source <select> (the T1a write-traps are gone).
    expect(screen.queryByDisplayValue('Cuisine')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Hôtel 4★')).not.toBeInTheDocument();
    expect(document.querySelector('select')).toBeNull();
  });

  it('renders the live Explorer card preview (shared ResultCardView)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionTags editor={result.current} permissions={allowAll} />);
    // The preview is built from the draft (§01 name) and rendered as the REAL result card.
    expect(screen.getByText('Aperçu carte')).toBeInTheDocument();
    expect(screen.getByText('Domaine du Bel Air')).toBeInTheDocument();
  });

  it('adds an existing tag from the library via the "Ajouter un tag" modal', () => {
    const modules = fullModulesFixture();
    modules.tags.library = [{ tagId: 't9', slug: 'famille', label: 'Famille', color: '#22c55e' }];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionTags editor={result.current} permissions={allowAll} objectId="o1" />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter un tag/i })); });
    // Modal open: the library tag is offered as a clickable chip.
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Famille' })); });
    view.rerender(<SectionTags editor={result.current} permissions={allowAll} objectId="o1" />);

    expect(result.current.draft.tags.displayed.some((t) => t.slug === 'famille')).toBe(true);
    expect(result.current.dirtySections.tags).toBe(true);
  });

  it('renders "Ajouter un tag" as a real add button (rep-add affordance), not bare text', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionTags editor={result.current} permissions={allowAll} objectId="o1" />);
    const addBtn = screen.getByRole('button', { name: /Ajouter un tag/i });
    expect(addBtn).toHaveClass('rep-add');
  });

  it('places the add button alongside the "Aperçu carte" preview (after it in DOM order)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionTags editor={result.current} permissions={allowAll} objectId="o1" />);
    const preview = screen.getByText('Aperçu carte');
    const addBtn = screen.getByRole('button', { name: /Ajouter un tag/i });
    // The button now lives in the preview column, rendered after the preview heading.
    expect(preview.compareDocumentPosition(addBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('reorders displayed tags via drag handles (no up/down arrow buttons)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionTags editor={result.current} permissions={allowAll} />);
    expect(screen.queryByRole('button', { name: 'Monter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descendre' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Déplacer/i }).length).toBeGreaterThan(0);
  });

  it('is read-only (no add control) when the user cannot write tags', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionTags editor={result.current} permissions={denyTags} />);
    expect(screen.queryByRole('button', { name: /Ajouter un tag/i })).not.toBeInTheDocument();
    expect(screen.getByText('Lecture seule pour les tags.')).toBeInTheDocument();
  });
});
