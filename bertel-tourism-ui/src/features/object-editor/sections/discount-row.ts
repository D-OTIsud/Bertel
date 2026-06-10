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
    // XOR precedence: when both fields arrive non-empty in one patch, the amount wins
    // (the percent branch would otherwise clear the amount and leave BOTH empty).
    const amountPatched = patch.discountAmount !== undefined && patch.discountAmount !== '';
    if (!amountPatched && patch.discountPercent !== undefined && patch.discountPercent !== '') {
      next.discountAmount = '';
      next.currency = '';
    }
    if (amountPatched) {
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

/**
 * §48 — pre-save validation mirroring the DB constraints (chk_discount_xor,
 * chk_discount_currency_amount, group-size and validity-window CHECKs, percent ≤ 100).
 * Returns the rows to persist (fully-blank rows silently dropped — same pattern as the
 * FMA occurrence saver) or throws a French, user-actionable error BEFORE the RPC call.
 */
export function validateDiscountRowsForSave(discounts: ObjectWorkspaceDiscountItem[]): ObjectWorkspaceDiscountItem[] {
  const isBlank = (discount: ObjectWorkspaceDiscountItem) =>
    !discount.conditions.trim() && !discount.discountPercent && !discount.discountAmount
    && !discount.minGroupSize && !discount.maxGroupSize && !discount.validFrom && !discount.validTo;
  const rows = discounts.filter((discount) => !isBlank(discount));
  for (const discount of rows) {
    if (!discount.discountPercent && !discount.discountAmount) {
      throw new Error('Chaque remise doit avoir un pourcentage ou un montant.');
    }
    if (discount.discountPercent && Number(discount.discountPercent) > 100) {
      throw new Error('Une remise en pourcentage ne peut pas dépasser 100 %.');
    }
    if (discount.minGroupSize && discount.maxGroupSize
      && Number(discount.maxGroupSize) < Number(discount.minGroupSize)) {
      throw new Error('La taille de groupe maximale doit être supérieure ou égale à la minimale.');
    }
    if (discount.validFrom && discount.validTo && discount.validTo < discount.validFrom) {
      throw new Error("La fin de validité d'une remise doit être postérieure à son début.");
    }
  }
  return rows;
}
