import { act, fireEvent, render, screen } from '@testing-library/react';
import { DiscountEditModal } from './DiscountEditModal';
import { createDiscountRow } from '../sections/discount-row';

describe('DiscountEditModal', () => {
  it('disables Enregistrer until a percent or amount is set', () => {
    render(<DiscountEditModal open mode="add" draft={createDiscountRow()} onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/pourcentage ou un montant/i);
  });

  it('typing an amount clears the percent and defaults the currency (chk_discount_xor)', () => {
    const onSave = jest.fn();
    const draft = { ...createDiscountRow(), discountPercent: '10' };
    render(<DiscountEditModal open mode="edit" draft={draft} onClose={jest.fn()} onSave={onSave} />);

    act(() => { fireEvent.change(screen.getByLabelText('Remise en montant'), { target: { value: '15' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ discountAmount: '15', discountPercent: '', currency: 'EUR' }));
  });

  it('blocks a percent above 100', () => {
    const draft = { ...createDiscountRow(), discountPercent: '120' };
    render(<DiscountEditModal open mode="edit" draft={draft} onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/100/);
  });
});
