import { addDiscountRow, removeDiscountRow, updateDiscountRow } from './discount-row';
import type { ObjectWorkspacePricingModule } from '../../../services/object-workspace-parser';

const base = (): ObjectWorkspacePricingModule => ({
  priceKindOptions: [], priceUnitOptions: [], prices: [],
  discounts: [{ recordId: 'd1', conditions: 'Groupes', discountPercent: '10', discountAmount: '', currency: '', minGroupSize: '8', maxGroupSize: '', validFrom: '', validTo: '', source: '' }],
  promotions: [], promotionsUnavailableReason: null, unavailableReason: null,
});

describe('discount-row helpers (§48 — object_discount XOR contract)', () => {
  it('adds an empty percent-mode row', () => {
    const next = addDiscountRow(base());
    expect(next.discounts).toHaveLength(2);
    expect(next.discounts[1].recordId).toBeNull();
  });

  it('typing a percent clears the amount and its currency (chk_discount_xor)', () => {
    const withAmount = updateDiscountRow(base(), 0, { discountAmount: '15', currency: 'EUR' });
    const next = updateDiscountRow(withAmount, 0, { discountPercent: '20' });
    expect(next.discounts[0]).toMatchObject({ discountPercent: '20', discountAmount: '', currency: '' });
  });

  it('typing an amount clears the percent and defaults currency to EUR (chk_discount_currency_amount)', () => {
    const next = updateDiscountRow(base(), 0, { discountAmount: '15' });
    expect(next.discounts[0]).toMatchObject({ discountPercent: '', discountAmount: '15', currency: 'EUR' });
  });

  it('removes a row', () => {
    expect(removeDiscountRow(base(), 0).discounts).toHaveLength(0);
  });
});
