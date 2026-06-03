import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionPublication } from './SectionPublication';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import type { ObjectWorkspacePermissions } from '../../../services/object-workspace';

/** Like `allowAll` but the `publication` module is read-only (no publish_object). */
const denyPublication = new Proxy(
  {},
  {
    get: (_t, prop) =>
      prop === 'publication'
        ? { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: 'Lecture seule — publication.' }
        : { canDirectWrite: true, canPrepareProposal: true, canSubmitProposal: true, disabledReason: null },
  },
) as ObjectWorkspacePermissions;

/** §21 mounts a mutation hook, so it must render inside a QueryClientProvider. */
function renderSection(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('SectionPublication (§21)', () => {
  it('shows the status as a read-only chip — not an editable select', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);

    // The status courant value is rendered as a static chip (also echoed in the résumé)…
    expect(screen.getAllByText('Publié — en ligne').length).toBeGreaterThan(0);
    // …and the only <select> left in the section is the commercial visibility one
    // (the editable status <select> with its 4 status options is gone).
    expect(screen.queryByRole('option', { name: 'Brouillon' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Hors ligne' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Archivé' })).not.toBeInTheDocument();
  });

  it('keeps commercial_visibility editable', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const { rerender } = renderSection(
      <SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />,
    );

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'private' } });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />
      </QueryClientProvider>,
    );
    expect(result.current.draft.generalInfo.commercialVisibility).toBe('private');
    // commercial_visibility persists via the publication module dirty path
    // (see editor-state.isPublicationSettingsDirty).
    expect(result.current.dirtySections.publication).toBe(true);
  });

  it('renders lifecycle action buttons when publication.canDirectWrite is true', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);

    // Fixture status is "published" → Dépublier + Archiver are the valid actions.
    expect(screen.getByRole('button', { name: 'Dépublier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archiver' })).toBeInTheDocument();
  });

  it('hides the lifecycle buttons and shows a read-only note when canDirectWrite is false', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={denyPublication} objectId="o1" />);

    expect(screen.queryByRole('button', { name: 'Dépublier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archiver' })).not.toBeInTheDocument();
    expect(screen.getByText('Lecture seule — publication.')).toBeInTheDocument();
  });

  it('does not render the removed inert controls (adhésion select / motif hors ligne / workflow toggles)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    renderSection(<SectionPublication editor={result.current} permissions={allowAll} objectId="o1" />);

    expect(screen.queryByText("Aire d'adhésion")).not.toBeInTheDocument();
    expect(screen.queryByText('Motif hors ligne')).not.toBeInTheDocument();
    expect(screen.queryByText('Demande de validation')).not.toBeInTheDocument();
    expect(screen.queryByText('Publication différée')).not.toBeInTheDocument();
  });
});
