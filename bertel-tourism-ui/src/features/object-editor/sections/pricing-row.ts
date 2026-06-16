import type {
  ObjectWorkspacePriceItem,
  ObjectWorkspacePricingModule,
} from '../../../services/object-workspace-parser';

/**
 * Pure helpers for the §13 Tarifs & extras add/edit modal (parallel to
 * opening-period-edit.ts). The pricing module stores one row per tariff line;
 * the editor manipulates the prices array via PricingLineEditModal and commits it
 * back whole (the `save_object_commercial` contract — see object-workspace.ts).
 *
 * Two-axis model (§13): a line carries a PUBLIC (price_kind → kindCode), a TYPE
 * (price_type → indicationCode), and a UNIT (price_unit → unitCode).
 */

const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };

/** A blank tariff-line draft for the "add" modal. Defaults: first public, type "principal", first unit. */
export function createPricingDraft(pricing: ObjectWorkspacePricingModule): ObjectWorkspacePriceItem {
  const firstKind = pricing.priceKindOptions[0];
  const firstUnit = pricing.priceUnitOptions[0];
  const defaultType =
    pricing.priceTypeOptions.find((option) => option.code === 'principal') ?? pricing.priceTypeOptions[0];
  return {
    recordId: null,
    kindId: firstKind?.id ?? '',
    kindCode: firstKind?.code ?? '',
    kindLabel: firstKind?.label ?? '',
    unitId: firstUnit?.id ?? '',
    unitCode: firstUnit?.code ?? '',
    unitLabel: firstUnit?.label ?? '',
    amount: '',
    amountMax: '',
    currency: 'EUR',
    seasonCode: '',
    indicationCode: defaultType?.code ?? '',
    ageMinEnfant: '',
    ageMaxEnfant: '',
    ageMinJunior: '',
    ageMaxJunior: '',
    validFrom: '',
    validTo: '',
    conditions: '',
    source: '',
    periods: [],
  };
}

export interface PricingValidation {
  canSave: boolean;
  error: string | null;
}

const isNumeric = (value: string) => value.trim() !== '' && !Number.isNaN(Number(value));

function ageRangeError(price: ObjectWorkspacePriceItem): string | null {
  const pairs: ReadonlyArray<[string, string, string]> = [
    [price.ageMinEnfant, price.ageMaxEnfant, 'enfant'],
    [price.ageMinJunior, price.ageMaxJunior, 'junior'],
  ];
  for (const [min, max, label] of pairs) {
    if (min.trim() && max.trim() && Number(max) < Number(min)) {
      return `La tranche d'âge ${label} est incohérente (max < min).`;
    }
  }
  return null;
}

/**
 * Save gate for the modal. The PUBLIC (kind) is the line identity and is required;
 * the amount is optional (a "Sur devis" / "Gratuit" line carries none). Coherence
 * checks mirror what the saver/DB would reject (amount range, validity window, age ranges).
 */
export function validatePricingDraft(price: ObjectWorkspacePriceItem): PricingValidation {
  if (!price.kindCode.trim()) {
    return { canSave: false, error: 'Choisissez un public (catégorie).' };
  }
  if (price.amount.trim() && !isNumeric(price.amount)) {
    return { canSave: false, error: 'Le montant doit être un nombre.' };
  }
  if (price.amountMax.trim() && !isNumeric(price.amountMax)) {
    return { canSave: false, error: 'Le montant maximum doit être un nombre.' };
  }
  if (isNumeric(price.amount) && isNumeric(price.amountMax) && Number(price.amountMax) < Number(price.amount)) {
    return { canSave: false, error: 'Le montant maximum doit être supérieur ou égal au montant.' };
  }
  if (price.validFrom && price.validTo && price.validTo < price.validFrom) {
    return { canSave: false, error: 'La date de fin de validité doit être postérieure au début.' };
  }
  const ageError = ageRangeError(price);
  if (ageError) {
    return { canSave: false, error: ageError };
  }
  return { canSave: true, error: null };
}

/** "12 €" / "12 – 18 €" / "" — the amount cell of the compact list. */
export function formatPriceAmount(price: ObjectWorkspacePriceItem): string {
  const symbol = CURRENCY_SYMBOL[price.currency] ?? price.currency ?? '';
  const amount = price.amount.trim();
  const amountMax = price.amountMax.trim();
  if (!amount && !amountMax) {
    return '';
  }
  if (amount && amountMax && amount !== amountMax) {
    return `${amount} – ${amountMax} ${symbol}`.trim();
  }
  return `${amount || amountMax} ${symbol}`.trim();
}

/** Muted secondary line of the compact list: validity window, age ranges, conditions. Season is resolved by the caller (needs the label). */
export function summarizePricingLine(price: ObjectWorkspacePriceItem): string {
  const parts: string[] = [];
  if (price.validFrom || price.validTo) {
    parts.push(`valide ${price.validFrom || '…'} → ${price.validTo || '…'}`);
  }
  const ageBits: string[] = [];
  if (price.ageMinEnfant || price.ageMaxEnfant) {
    ageBits.push(`enfant ${price.ageMinEnfant || '?'}–${price.ageMaxEnfant || '?'} ans`);
  }
  if (price.ageMinJunior || price.ageMaxJunior) {
    ageBits.push(`junior ${price.ageMinJunior || '?'}–${price.ageMaxJunior || '?'} ans`);
  }
  if (ageBits.length > 0) {
    parts.push(ageBits.join(', '));
  }
  if (price.conditions.trim()) {
    parts.push(price.conditions.trim());
  }
  return parts.join(' · ');
}
