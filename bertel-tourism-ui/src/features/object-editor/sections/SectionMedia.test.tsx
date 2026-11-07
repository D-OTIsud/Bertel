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

  it('sets a tile as cover from the grid star (exclusive)', () => {
    const modules = fullModulesFixture();
    modules.media.objectItems = [
      modules.media.objectItems[0],
      { ...modules.media.objectItems[0], id: 'm2', title: 'Seconde photo', isMain: false, position: '1' },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionMedia editor={result.current} permissions={allowAll} objectId="o1" />);
    const stars = screen.getAllByRole('button', { name: /photo de couverture/i });
    expect(stars).toHaveLength(2);
    act(() => { fireEvent.click(stars[1]); });
    view.rerender(<SectionMedia editor={result.current} permissions={allowAll} objectId="o1" />);
    const items = result.current.draft.media.objectItems;
    expect(items.find((m) => m.id === 'm2')?.isMain).toBe(true);
    expect(items.find((m) => m.id === 'm1')?.isMain).toBe(false);
  });

  it('disables the cover star on a video tile (the cover feeds the photo card image)', () => {
    const modules = fullModulesFixture();
    modules.media.objectItems = [
      modules.media.objectItems[0],
      {
        ...modules.media.objectItems[0],
        id: 'm-video', title: 'Visite vidéo', typeCode: 'video', typeLabel: 'Vidéo',
        isMain: false, position: '1',
      },
    ];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<SectionMedia editor={result.current} permissions={allowAll} objectId="o1" />);
    const stars = screen.getAllByRole('button', { name: /photo de couverture/i });
    expect(stars[1]).toBeDisabled();
  });

  it('renders a drag handle per tile (position is a real public ordering)', () => {
    setup();
    expect(screen.getAllByRole('button', { name: /déplacer/i })).toHaveLength(1);
  });

  it('renders the unavailable notice instead of the grid when the media load failed (R1 no-clobber)', () => {
    const modules = fullModulesFixture();
    modules.media = { ...modules.media, unavailableReason: 'Lecture des médias indisponible.' };
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<SectionMedia editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByText(/Module indisponible/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Ajouter un média' })).not.toBeInTheDocument();
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
