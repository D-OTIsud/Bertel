import type {
  ObjectWorkspaceDiscountItem,
  ObjectWorkspacePricingModule,
} from '../../../services/object-workspace-parser';

/**
 * §48 — pure helpers for the §13 discounts repeater (object_discount).
 * DB contract: discount_percent XOR discount_amount (chk_discount_xor) and
 * amount ⇒ currency (chk_discount_currency_amount) — enforced here at edit
 * time so the RPC never receives an invalid row.
 */
export function createDiscountRow(): ObjectWorkspaceDiscountItem {
  return {
    recordId: null,
    conditions: '',
    discountPercent: '',
    discountAmount: '',
    currency: '',
    minGroupSize: '',
    maxGroupSize: '',
    validFrom: '',
    validTo: '',
    source: '',
  };
}

export function addDiscountRow(pricing: ObjectWorkspacePricingModule): ObjectWorkspacePricingModule {
  return { ...pricing, discounts: [...pricing.discounts, createDiscountRow()] };
}

export function updateDiscountRow(
  pricing: ObjectWorkspacePricingModule,
  index: number,
  patch: Partial<ObjectWorkspaceDiscountItem>,
): ObjectWorkspacePricingModule {
  const discounts = pricing.discounts.map((discount, discountIndex) => {
    if (discountIndex !== index) {
      return discount;
    }
    const next = { ...discount, ...patch };
    if (patch.discountPercent !== undefined && patch.discountPercent !== '') {
      next.discountAmount = '';
      next.currency = '';
    }
    if (patch.discountAmount !== undefined && patch.discountAmount !== '') {
      next.discountPercent = '';
      if (!next.currency) {
        next.currency = 'EUR';
      }
    }
    return next;
  });
  return { ...pricing, discounts };
}

export function removeDiscountRow(pricing: ObjectWorkspacePricingModule, index: number): ObjectWorkspacePricingModule {
  return { ...pricing, discounts: pricing.discounts.filter((_, discountIndex) => discountIndex !== index) };
}
