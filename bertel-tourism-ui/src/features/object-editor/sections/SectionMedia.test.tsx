import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionMedia } from './SectionMedia';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

// Replace the heavy MediaEditModal with a tiny dialog that exposes cancel/save
// buttons. This lets the SectionMedia tests drive the cancel/save code paths
// without rendering the real form or pulling in Supabase / dialog primitives.
jest.mock('../widgets/MediaEditModal', () => ({
  MediaEditModal: ({ onClose, onSave, media: m }: { onClose: () => void; onSave: (m: any) => void; media: any }) => (
    <div role="dialog">
      <button type="button" onClick={onClose}>cancel-mock</button>
      <button type="button" onClick={() => onSave({ ...m, title: 'Sauvé' })}>save-mock</button>
    </div>
  ),
}));

/**
 * Render <SectionMedia> driven by a fresh editor state hook. Returns a `rerender`
 * helper that always passes the latest `result.current` so the section re-runs
 * with the updated editor snapshot — useObjectEditorState returns a NEW object
 * on every commit, so the harness must rerender between interactions.
 */
function setup() {
  const hook = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
  const view = render(<SectionMedia editor={hook.result.current} permissions={allowAll} objectId="o1" />);
  const rerender = () => view.rerender(<SectionMedia editor={hook.result.current} permissions={allowAll} objectId="o1" />);
  return { hook, view, rerender };
}

describe('SectionMedia', () => {
  it('opens the edit modal for an existing media and saves metadata changes', () => {
    const { hook, rerender } = setup();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier le média/i })); });
    rerender();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'save-mock' })); });
    rerender();
    expect(hook.result.current.draft.media.objectItems[0].title).toBe('Sauvé');
  });

  it('cancelling "+ Ajouter un média" does not add a phantom tile to the draft', () => {
    const { hook, rerender } = setup();
    const startingCount = hook.result.current.draft.media.objectItems.length;
    act(() => { fireEvent.click(screen.getByRole('button', { name: '+ Ajouter un média' })); });
    rerender();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'cancel-mock' })); });
    rerender();
    expect(hook.result.current.draft.media.objectItems).toHaveLength(startingCount);
  });

  it('saving a new media via "+ Ajouter un média" appends one item to the draft', () => {
    const { hook, rerender } = setup();
    const startingCount = hook.result.current.draft.media.objectItems.length;
    act(() => { fireEvent.click(screen.getByRole('button', { name: '+ Ajouter un média' })); });
    rerender();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'save-mock' })); });
    rerender();
    const items = hook.result.current.draft.media.objectItems;
    expect(items).toHaveLength(startingCount + 1);
    expect(items[items.length - 1].title).toBe('Sauvé');
  });
});
