import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionMedia } from './SectionMedia';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionMedia', () => {
  it('opens the edit modal for an existing media and saves metadata changes', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionMedia editor={result.current} permissions={allowAll} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Modifier le média/i })); });
    act(() => { fireEvent.change(screen.getByLabelText('Crédit / auteur'), { target: { value: 'OTI' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<SectionMedia editor={result.current} permissions={allowAll} />);
    expect(result.current.draft.media.objectItems[0].credit).toBe('OTI');
  });
});
