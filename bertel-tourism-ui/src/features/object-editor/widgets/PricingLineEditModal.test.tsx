import { act, fireEvent, render, screen } from '@testing-library/react';
import { PricingLineEditModal } from './PricingLineEditModal';
import { createPricingDraft } from '../sections/pricing-row';
import { fullModulesFixture } from '../sections/section-fixture.test-utils';

const pricing = () => fullModulesFixture().pricing;

describe('PricingLineEditModal', () => {
  it('surfaces the two-axis selects (Type de tarif + Public) and the unit', () => {
    render(
      <PricingLineEditModal open mode="add" pricing={pricing()} draft={createPricingDraft(pricing())} onClose={jest.fn()} onSave={jest.fn()} />,
    );
    expect(screen.getByLabelText('Type de tarif')).toBeInTheDocument();
    expect(screen.getByLabelText('Public / bénéficiaire')).toBeInTheDocument();
    expect(screen.getByLabelText('Unité')).toBeInTheDocument();
  });

  it('disables Enregistrer until a public is chosen', () => {
    const draft = { ...createPricingDraft(pricing()), kindCode: '', kindId: '', kindLabel: '' };
    render(<PricingLineEditModal open mode="add" pricing={pricing()} draft={draft} onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('passes the edited amount and type back through onSave', () => {
    const onSave = jest.fn();
    render(<PricingLineEditModal open mode="add" pricing={pricing()} draft={createPricingDraft(pricing())} onClose={jest.fn()} onSave={onSave} />);

    act(() => { fireEvent.change(screen.getByLabelText('Montant'), { target: { value: '25' } }); });
    act(() => { fireEvent.change(screen.getByLabelText('Type de tarif'), { target: { value: 'option' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' })); });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: '25', indicationCode: 'option' }));
  });

  it('blocks save and shows a reason when the max amount is below the amount', () => {
    const draft = { ...createPricingDraft(pricing()), amount: '20', amountMax: '12' };
    render(<PricingLineEditModal open mode="edit" pricing={pricing()} draft={draft} onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/maximum/i);
  });
});
