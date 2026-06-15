import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionPayLangs } from './SectionPayLangs';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

describe('SectionPayLangs', () => {
  it('renders payment methods through the modal picker (selected chip + trigger), not as a full inline chip list', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionPayLangs editor={result.current} permissions={allowAll} />);

    // The selected payment ('CB') shows in the trigger…
    expect(screen.getByText('CB')).toBeInTheDocument();
    // …but the unselected option ('Espèces') lives behind the modal, not inline.
    expect(screen.queryByText('Espèces')).not.toBeInTheDocument();
  });

  it('replaces the whole payment selection from the modal (staged « Valider »)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionPayLangs editor={result.current} permissions={allowAll} />);

    // Payments render before languages, so its « Choisir / modifier » trigger is the first one.
    const triggers = screen.getAllByRole('button', { name: 'Choisir / modifier' });
    act(() => { fireEvent.click(triggers[0]); });

    // The payments modal is open and offers the unselected option.
    expect(screen.getByText('Choisir les modes de paiement')).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Espèces' })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Valider' })); });
    view.rerender(<SectionPayLangs editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.characteristics.selectedPaymentCodes).toEqual(['card', 'cash']);
    expect(result.current.dirtySections.characteristics).toBe(true);
  });
});
