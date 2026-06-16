import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionOpenings } from './SectionOpenings';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';

// Replace the heavy modal (ScheduleEditor + Radix dialog) with a stub that exposes
// cancel/save and tags itself with the mode + incoming draft label, so the section's
// add/edit/commit code paths run without the full form.
jest.mock('../widgets/OpeningPeriodEditModal', () => ({
  OpeningPeriodEditModal: ({ mode, draft, onClose, onSave }: any) => (
    <div role="dialog">
      <span>modal-{mode}</span>
      <button type="button" onClick={onClose}>cancel-mock</button>
      <button type="button" onClick={() => onSave({ ...draft, label: mode === 'add' ? 'Nouvelle' : 'Renommée' })}>
        save-mock
      </button>
    </div>
  ),
}));

function setup(modules: ObjectWorkspaceModules = fullModulesFixture()) {
  const hook = renderHook(() => useObjectEditorState('o1', modules));
  const view = render(<SectionOpenings editor={hook.result.current} permissions={allowAll} objectId="o1" />);
  const rerender = () => view.rerender(<SectionOpenings editor={hook.result.current} permissions={allowAll} objectId="o1" />);
  return { hook, rerender };
}

describe('SectionOpenings', () => {
  it('opens the add modal and appends a period on save', () => {
    const { hook, rerender } = setup();
    const before = hook.result.current.draft.openings.periods.length;
    act(() => { fireEvent.click(screen.getByRole('button', { name: '+ Ajouter une période' })); });
    rerender();
    expect(screen.getByText('modal-add')).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'save-mock' })); });
    rerender();
    const periods = hook.result.current.draft.openings.periods;
    expect(periods).toHaveLength(before + 1);
    expect(periods[periods.length - 1].label).toBe('Nouvelle');
  });

  it('cancelling the add modal adds no period', () => {
    const { hook, rerender } = setup();
    const before = hook.result.current.draft.openings.periods.length;
    act(() => { fireEvent.click(screen.getByRole('button', { name: '+ Ajouter une période' })); });
    rerender();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'cancel-mock' })); });
    rerender();
    expect(hook.result.current.draft.openings.periods).toHaveLength(before);
  });

  it('opens the edit modal from a row pencil and replaces in place (recordId preserved)', () => {
    const { hook, rerender } = setup();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Modifier Standard' })); });
    rerender();
    expect(screen.getByText('modal-edit')).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'save-mock' })); });
    rerender();
    const periods = hook.result.current.draft.openings.periods;
    expect(periods).toHaveLength(1);
    expect(periods[0].label).toBe('Renommée');
    expect(periods[0].recordId).toBe('op1');
  });

  it('deletes a period after confirmation', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { hook, rerender } = setup();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Supprimer Standard' })); });
    rerender();
    expect(hook.result.current.draft.openings.periods).toHaveLength(0);
    confirmSpy.mockRestore();
  });

  it('keeps the period when the delete confirmation is declined', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { hook, rerender } = setup();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Supprimer Standard' })); });
    rerender();
    expect(hook.result.current.draft.openings.periods).toHaveLength(1);
    confirmSpy.mockRestore();
  });

  it('shows the compact row summary (range + week summary) without expanding', () => {
    setup();
    expect(screen.getByText('Toute l’année')).toBeInTheDocument();
    expect(screen.getByText('1/7 j. · continu')).toBeInTheDocument();
  });

  it('expands a period row to reveal its weekly hours read-only, without opening the modal', () => {
    setup();
    expect(screen.queryByText(/09:00/)).not.toBeInTheDocument(); // collapsed: hours hidden
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Détails de Standard' })); });
    expect(screen.getByText(/09:00/)).toBeInTheDocument(); // expanded: weekly hours shown
    expect(screen.queryByText('modal-edit')).not.toBeInTheDocument(); // viewing ≠ editing
  });

  it('renders an empty-state add button when there are no periods', () => {
    const modules = fullModulesFixture();
    modules.openings = { ...modules.openings, periods: [] };
    setup(modules);
    expect(screen.getByRole('button', { name: '+ Ajouter une période' })).toBeInTheDocument();
    expect(screen.getByText(/Aucune période/i)).toBeInTheDocument();
  });
});
