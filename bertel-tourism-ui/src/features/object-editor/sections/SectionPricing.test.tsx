import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionPricing } from './SectionPricing';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

/** §48 — §13 discounts repeater (object_discount; XOR percent/amount enforced by discount-row helpers). */
describe('SectionPricing — discounts (§48)', () => {
  it('adds a discount row and marks pricing dirty', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const view = render(<SectionPricing editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Ajouter une remise/i })); });
    view.rerender(<SectionPricing editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.pricing.discounts).toHaveLength(1);
    expect(result.current.dirtySections.pricing).toBe(true);
  });

  it('renders the price label read-only (kindLabel is derived from the kind ref — §48)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionPricing editor={result.current} permissions={allowAll} />);

    // getByDisplayValue('Adulte') is ambiguous here: the Catégorie <select>'s
    // selected option also displays 'Adulte' — target the label input by placeholder.
    const labelInput = screen.getByPlaceholderText('Libellé tarif');
    expect(labelInput).toHaveDisplayValue('Adulte');
    expect(labelInput).toHaveAttribute('readonly');
  });

  it('typing a percent clears any amount on the same row (chk_discount_xor)', () => {
    const modules = fullModulesFixture();
    modules.pricing.discounts = [{ recordId: 'd1', conditions: 'Groupes', discountPercent: '', discountAmount: '15', currency: 'EUR', minGroupSize: '', maxGroupSize: '', validFrom: '', validTo: '', source: '' }];
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    const view = render(<SectionPricing editor={result.current} permissions={allowAll} />);

    act(() => { fireEvent.change(screen.getByLabelText('Remise en pourcentage'), { target: { value: '10' } }); });
    view.rerender(<SectionPricing editor={result.current} permissions={allowAll} />);

    expect(result.current.draft.pricing.discounts[0]).toMatchObject({ discountPercent: '10', discountAmount: '', currency: '' });
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
