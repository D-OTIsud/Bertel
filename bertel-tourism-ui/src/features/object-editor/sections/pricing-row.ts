import type {
  ObjectWorkspacePriceItem,
  ObjectWorkspacePricingModule,
} from '../../../services/object-workspace-parser';

export function createPricingRow(pricing: ObjectWorkspacePricingModule): ObjectWorkspacePriceItem {
  const firstKind = pricing.priceKindOptions[0];
  const firstUnit = pricing.priceUnitOptions[0];
  return {
    recordId: null,
    kindId: firstKind?.id ?? '',
    kindCode: firstKind?.code ?? '',
    kindLabel: firstKind?.label ?? 'Tarif',
    unitId: firstUnit?.id ?? '',
    unitCode: firstUnit?.code ?? '',
    unitLabel: firstUnit?.label ?? '',
    amount: '',
    amountMax: '',
    currency: 'EUR',
    seasonCode: '',
    indicationCode: '',
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

export function addPricingRow(pricing: ObjectWorkspacePricingModule): ObjectWorkspacePricingModule {
  return { ...pricing, prices: [...pricing.prices, createPricingRow(pricing)] };
}

export function updatePricingRow(
  pricing: ObjectWorkspacePricingModule,
  index: number,
  patch: Partial<ObjectWorkspacePriceItem>,
): ObjectWorkspacePricingModule {
  const prices = pricing.prices.map((price, priceIndex) => {
    if (priceIndex !== index) {
      return price;
    }
    const selectedKind = patch.kindCode
      ? pricing.priceKindOptions.find((option) => option.code === patch.kindCode)
      : null;
    const selectedUnit = patch.unitCode
      ? pricing.priceUnitOptions.find((option) => option.code === patch.unitCode)
      : patch.unitCode === ''
        ? { id: '', code: '', label: '' }
        : null;
    return {
      ...price,
      ...patch,
      kindId: selectedKind?.id ?? patch.kindId ?? price.kindId,
      kindLabel: selectedKind?.label ?? patch.kindLabel ?? price.kindLabel,
      unitId: selectedUnit?.id ?? patch.unitId ?? price.unitId,
      unitLabel: selectedUnit?.label ?? patch.unitLabel ?? price.unitLabel,
    };
  });
  return { ...pricing, prices };
}

export function removePricingRow(pricing: ObjectWorkspacePricingModule, index: number): ObjectWorkspacePricingModule {
  return { ...pricing, prices: pricing.prices.filter((_, priceIndex) => priceIndex !== index) };
}
