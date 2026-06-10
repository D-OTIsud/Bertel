import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../../useObjectEditorState';
import { BlockFMA } from './BlockFMA';
import { allowAll, fullModulesFixture } from '../section-fixture.test-utils';

/** §48 — FMA events get a real dates/occurrences editor (object_fma + object_fma_occurrence)
 *  instead of inheriting the ITI trail editor. */
describe('BlockFMA — event dates & occurrences', () => {
  it('edits the start date and marks the event module dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockFMA editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.change(screen.getByLabelText('Date de début'), { target: { value: '2026-07-14' } });
    });
    view.rerender(<BlockFMA editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.event.startDate).toBe('2026-07-14');
    expect(result.current.dirtySections.event).toBe(true);
  });

  it('adds an occurrence with the scheduled default state', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockFMA editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Ajouter une occurrence/i }));
    });
    view.rerender(<BlockFMA editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.event.occurrences).toHaveLength(1);
    expect(result.current.draft.event.occurrences[0].state).toBe('scheduled');
    expect(result.current.dirtySections.event).toBe(true);
  });

  it('shows the recurrence rule input only when recurring is on', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<BlockFMA editor={result.current} permissions={allowAll} />);

    expect(screen.queryByText('Règle de récurrence')).not.toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByLabelText('Événement récurrent'));
    });
    view.rerender(<BlockFMA editor={result.current} permissions={allowAll} />);
    expect(screen.getByText('Règle de récurrence')).toBeInTheDocument();
  });

  it('renders the §46 notice instead of controls when the module is gated', () => {
    const modules = fullModulesFixture();
    modules.event.unavailableReason = 'Module non applicable au type HOT (référentiel ref_facet_applicability).';
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<BlockFMA editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Module non applicable au type HOT/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Date de début')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Module non applicable au type HOT/)).toHaveLength(1);
  });
});
