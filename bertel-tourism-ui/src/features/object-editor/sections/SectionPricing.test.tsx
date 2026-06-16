import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionPricing } from './SectionPricing';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

/** §84 — §13 redesigned: modal-driven tariff lines + discounts, no inline grid, no write-trap policy block. */
describe('SectionPricing (§84 modal redesign)', () => {
  it('opens the add modal and appends a tariff line on save', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionPricing editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter une ligne tarifaire/i })); });
    view.rerender(<SectionPricing editor={result.current} permissions={allowAll} />);

    // The default draft already carries a public (first kind) → Enregistrer is enabled.
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<SectionPricing editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.pricing.prices).toHaveLength(2);
    expect(result.current.dirtySections.pricing).toBe(true);
  });

  it('no longer renders the redundant read-only Libellé column', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionPricing editor={result.current} permissions={allowAll} />);
    expect(screen.queryByPlaceholderText('Libellé tarif')).toBeNull();
  });

  it('removed the write-trap "Politique & règles" block (acompte / délai annulation / TVA)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionPricing editor={result.current} permissions={allowAll} />);
    expect(screen.queryByText(/Délai annulation/i)).toBeNull();
    expect(screen.queryByText(/Acompte demandé/i)).toBeNull();
  });

  it('adds a discount via the modal and keeps the percent-XOR-amount contract', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionPricing editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter une remise/i })); });
    view.rerender(<SectionPricing editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.change(screen.getByLabelText('Remise en pourcentage'), { target: { value: '15' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });
    view.rerender(<SectionPricing editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.pricing.discounts).toHaveLength(1);
    expect(result.current.draft.pricing.discounts[0]).toMatchObject({ discountPercent: '15', discountAmount: '' });
  });

  it('deletes the seeded tariff line after confirmation', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionPricing editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Supprimer Adulte/i })); });
    view.rerender(<SectionPricing editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.pricing.prices).toHaveLength(0);
    confirmSpy.mockRestore();
  });

  it('renders the payment block and marks characteristics dirty on change', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionPricing editor={result.current} permissions={allowAll} />);

    expect(screen.getByText('Modes de paiement acceptés')).toBeInTheDocument();
    // The selected payment ('CB') is shown as a removable chip; removing it writes characteristics.
    act(() => { fireEvent.click(screen.getByTitle('Retirer')); });

    expect(result.current.draft.characteristics.selectedPaymentCodes).toEqual([]);
    expect(result.current.dirtySections.characteristics).toBe(true);
  });
});
