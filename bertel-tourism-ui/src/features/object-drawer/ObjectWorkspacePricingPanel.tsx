import type { ObjectWorkspaceModuleAccess } from '../../services/object-workspace';
import type {
  ObjectWorkspaceDiscountItem,
  ObjectWorkspacePriceItem,
  ObjectWorkspacePricePeriod,
  ObjectWorkspacePricingModule,
} from '../../services/object-workspace-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

interface SaveActionState {
  label: string;
  disabled: boolean;
  hint: string | null;
}

interface ObjectWorkspacePricingPanelProps {
  value: ObjectWorkspacePricingModule;
  dirty: boolean;
  saving: boolean;
  statusMessage: string | null;
  saveAction: SaveActionState;
  access: ObjectWorkspaceModuleAccess;
  onChange: (nextValue: ObjectWorkspacePricingModule) => void;
  onSave: () => void;
}

function sortPrices(items: ObjectWorkspacePriceItem[]): ObjectWorkspacePriceItem[] {
  return [...items].sort((left, right) =>
    left.kindLabel.localeCompare(right.kindLabel, 'fr')
    || left.validFrom.localeCompare(right.validFrom, 'fr'),
  );
}

function sortDiscounts(items: ObjectWorkspaceDiscountItem[]): ObjectWorkspaceDiscountItem[] {
  return [...items].sort((left, right) => left.validFrom.localeCompare(right.validFrom, 'fr'));
}

function emptyPeriod(): ObjectWorkspacePricePeriod {
  return {
    recordId: null,
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    note: '',
  };
}

export function ObjectWorkspacePricingPanel({
  value,
  dirty,
  saving,
  statusMessage,
  saveAction,
  access,
  onChange,
  onSave,
}: ObjectWorkspacePricingPanelProps) {
  const disabled = !access.canDirectWrite;

  function patchPrices(nextPrices: ObjectWorkspacePriceItem[]) {
    onChange({
      ...value,
      prices: sortPrices(nextPrices),
    });
  }

  function patchDiscounts(nextDiscounts: ObjectWorkspaceDiscountItem[]) {
    onChange({
      ...value,
      discounts: sortDiscounts(nextDiscounts),
    });
  }

  function addPrice() {
    const fallbackKind = value.priceKindOptions[0];
    if (!fallbackKind) {
      return;
    }

    const fallbackUnit = value.priceUnitOptions[0];
    patchPrices([
      ...value.prices,
      {
        recordId: null,
        kindId: fallbackKind.id,
        kindCode: fallbackKind.code,
        kindLabel: fallbackKind.label,
        unitId: fallbackUnit?.id ?? '',
        unitCode: fallbackUnit?.code ?? '',
        unitLabel: fallbackUnit?.label ?? '',
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
      },
    ]);
  }

  function updatePrice(index: number, patch: Partial<ObjectWorkspacePriceItem>) {
    patchPrices(value.prices.map((price, priceIndex) => {
      if (priceIndex !== index) {
        return price;
      }

      const selectedKind = patch.kindCode
        ? value.priceKindOptions.find((option) => option.code === patch.kindCode)
        : null;
      const selectedUnit = patch.unitCode
        ? value.priceUnitOptions.find((option) => option.code === patch.unitCode)
        : patch.unitCode === ''
          ? { id: '', code: '', label: '' }
          : null;

      return {
        ...price,
        ...patch,
        kindId: selectedKind?.id ?? price.kindId,
        kindLabel: selectedKind?.label ?? price.kindLabel,
        unitId: selectedUnit?.id ?? price.unitId,
        unitLabel: selectedUnit?.label ?? price.unitLabel,
      };
    }));
  }

  function removePrice(index: number) {
    patchPrices(value.prices.filter((_, priceIndex) => priceIndex !== index));
  }

  function addPeriod(priceIndex: number) {
    patchPrices(value.prices.map((price, currentIndex) => (
      currentIndex === priceIndex
        ? { ...price, periods: [...price.periods, emptyPeriod()] }
        : price
    )));
  }

  function updatePeriod(priceIndex: number, periodIndex: number, patch: Partial<ObjectWorkspacePricePeriod>) {
    patchPrices(value.prices.map((price, currentIndex) => {
      if (currentIndex !== priceIndex) {
        return price;
      }

      return {
        ...price,
        periods: price.periods.map((period, currentPeriodIndex) => (
          currentPeriodIndex === periodIndex ? { ...period, ...patch } : period
        )),
      };
    }));
  }

  function removePeriod(priceIndex: number, periodIndex: number) {
    patchPrices(value.prices.map((price, currentIndex) => {
      if (currentIndex !== priceIndex) {
        return price;
      }

      return {
        ...price,
        periods: price.periods.filter((_, currentPeriodIndex) => currentPeriodIndex !== periodIndex),
      };
    }));
  }

  function addDiscount() {
    patchDiscounts([
      ...value.discounts,
      {
        recordId: null,
        conditions: '',
        discountPercent: '10',
        discountAmount: '',
        currency: 'EUR',
        minGroupSize: '',
        maxGroupSize: '',
        validFrom: '',
        validTo: '',
        source: '',
      },
    ]);
  }

  function updateDiscount(index: number, patch: Partial<ObjectWorkspaceDiscountItem>) {
    patchDiscounts(value.discounts.map((discount, discountIndex) => {
      if (discountIndex !== index) {
        return discount;
      }

      return {
        ...discount,
        ...patch,
      };
    }));
  }

  function removeDiscount(index: number) {
    patchDiscounts(value.discounts.filter((_, discountIndex) => discountIndex !== index));
  }

  return (
    <div className="drawer-form-stack">
      <article className="panel-card panel-card--nested">
        <div className="panel-heading">
          <div>
            <h2>Tarifs</h2>
          </div>
          <div className="stack-list text-right">
            <div className="inline-actions">
              <Button type="button" variant="ghost" onClick={addPrice} disabled={disabled || saving}>
                Ajouter un tarif
              </Button>
              <Button type="button" variant="ghost" onClick={addDiscount} disabled={disabled || saving}>
                Ajouter une remise
              </Button>
              <Button type="button" variant="outline" onClick={onSave} disabled={saveAction.disabled || saving || !dirty}>
                {saving ? 'Enregistrement...' : saveAction.label}
              </Button>
            </div>
            {saveAction.hint && <small className="text-muted-foreground">{saveAction.hint}</small>}
            {statusMessage && <small className="text-muted-foreground">{statusMessage}</small>}
          </div>
        </div>

        <div className="drawer-grid">
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Tarifs</span>
            <strong>{value.prices.length}</strong>
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Remises</span>
            <strong>{value.discounts.length}</strong>
            {value.unavailableReason && <p className="text-sm text-muted-foreground">{value.unavailableReason}</p>}
          </article>

          <article className="panel-card panel-card--nested">
            <span className="facet-title">Promotions liees</span>
            <strong>{value.promotions.length}</strong>
            {value.promotionsUnavailableReason && <p className="text-sm text-muted-foreground">{value.promotionsUnavailableReason}</p>}
          </article>
        </div>
      </article>

      <section className="drawer-form-stack">
        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Tarifs</span>
              <h3>Grille tarifaire</h3>
            </div>
          </div>

          <div className="stack-list">
            {value.prices.length > 0 ? value.prices.map((price, priceIndex) => (
              <article key={`${price.recordId ?? 'draft'}-${priceIndex}`} className="panel-card panel-card--nested">
                <div className="panel-heading">
                  <div>
                    <span className="facet-title">{price.kindLabel || 'Tarif'}</span>
                    <h3>{price.amount || 'Montant non renseigne'} {price.currency}</h3>
                  </div>
                  <div className="inline-actions">
                    <Button type="button" variant="ghost" onClick={() => addPeriod(priceIndex)} disabled={disabled}>
                      Ajouter une periode
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => removePrice(priceIndex)} disabled={disabled}>
                      Retirer
                    </Button>
                  </div>
                </div>

                <div className="drawer-grid">
                  <div className="field-block">
                    <Label htmlFor={`pricing-kind-${priceIndex}`}>Type de tarif</Label>
                    <Select
                      id={`pricing-kind-${priceIndex}`}
                      value={price.kindCode}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { kindCode: event.target.value })}
                    >
                      {value.priceKindOptions.map((option) => (
                        <option key={option.id} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-unit-${priceIndex}`}>Unite</Label>
                    <Select
                      id={`pricing-unit-${priceIndex}`}
                      value={price.unitCode}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { unitCode: event.target.value })}
                    >
                      <option value="">Sans unite</option>
                      {value.priceUnitOptions.map((option) => (
                        <option key={option.id} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-amount-${priceIndex}`}>Montant min</Label>
                    <Input
                      id={`pricing-amount-${priceIndex}`}
                      value={price.amount}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { amount: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-amount-max-${priceIndex}`}>Montant max</Label>
                    <Input
                      id={`pricing-amount-max-${priceIndex}`}
                      value={price.amountMax}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { amountMax: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-currency-${priceIndex}`}>Devise</Label>
                    <Input
                      id={`pricing-currency-${priceIndex}`}
                      value={price.currency}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { currency: event.target.value.toUpperCase() })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-season-${priceIndex}`}>Code saison</Label>
                    <Input
                      id={`pricing-season-${priceIndex}`}
                      value={price.seasonCode}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { seasonCode: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-indication-${priceIndex}`}>Code indication</Label>
                    <Input
                      id={`pricing-indication-${priceIndex}`}
                      value={price.indicationCode}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { indicationCode: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-valid-from-${priceIndex}`}>Valide du</Label>
                    <input
                      id={`pricing-valid-from-${priceIndex}`}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      type="date"
                      value={price.validFrom}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { validFrom: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-valid-to-${priceIndex}`}>Valide au</Label>
                    <input
                      id={`pricing-valid-to-${priceIndex}`}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      type="date"
                      value={price.validTo}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { validTo: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-age-child-min-${priceIndex}`}>Age enfant min</Label>
                    <Input
                      id={`pricing-age-child-min-${priceIndex}`}
                      value={price.ageMinEnfant}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { ageMinEnfant: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-age-child-max-${priceIndex}`}>Age enfant max</Label>
                    <Input
                      id={`pricing-age-child-max-${priceIndex}`}
                      value={price.ageMaxEnfant}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { ageMaxEnfant: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-age-junior-min-${priceIndex}`}>Age junior min</Label>
                    <Input
                      id={`pricing-age-junior-min-${priceIndex}`}
                      value={price.ageMinJunior}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { ageMinJunior: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-age-junior-max-${priceIndex}`}>Age junior max</Label>
                    <Input
                      id={`pricing-age-junior-max-${priceIndex}`}
                      value={price.ageMaxJunior}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { ageMaxJunior: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-source-${priceIndex}`}>Source</Label>
                    <Input
                      id={`pricing-source-${priceIndex}`}
                      value={price.source}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { source: event.target.value })}
                    />
                  </div>

                  <div className="field-block field-block--wide">
                    <Label htmlFor={`pricing-conditions-${priceIndex}`}>Conditions</Label>
                    <textarea
                      id={`pricing-conditions-${priceIndex}`}
                      className="min-h-24 rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                      value={price.conditions}
                      disabled={disabled}
                      onChange={(event) => updatePrice(priceIndex, { conditions: event.target.value })}
                    />
                  </div>
                </div>

                <div className="stack-list">
                  {price.periods.length > 0 ? price.periods.map((period, periodIndex) => (
                    <article key={`${period.recordId ?? 'period'}-${periodIndex}`} className="panel-card panel-card--nested">
                      <div className="panel-heading">
                        <div>
                          <span className="facet-title">Periode {periodIndex + 1}</span>
                          <h3>{period.startDate || 'Debut non precise'}{period.endDate ? ` -> ${period.endDate}` : ''}</h3>
                        </div>
                        <Button type="button" variant="ghost" onClick={() => removePeriod(priceIndex, periodIndex)} disabled={disabled}>
                          Retirer
                        </Button>
                      </div>
                      <div className="drawer-grid">
                        <div className="field-block">
                          <Label htmlFor={`pricing-period-start-${priceIndex}-${periodIndex}`}>Date debut</Label>
                          <input
                            id={`pricing-period-start-${priceIndex}-${periodIndex}`}
                            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                            type="date"
                            value={period.startDate}
                            disabled={disabled}
                            onChange={(event) => updatePeriod(priceIndex, periodIndex, { startDate: event.target.value })}
                          />
                        </div>
                        <div className="field-block">
                          <Label htmlFor={`pricing-period-end-${priceIndex}-${periodIndex}`}>Date fin</Label>
                          <input
                            id={`pricing-period-end-${priceIndex}-${periodIndex}`}
                            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                            type="date"
                            value={period.endDate}
                            disabled={disabled}
                            onChange={(event) => updatePeriod(priceIndex, periodIndex, { endDate: event.target.value })}
                          />
                        </div>
                        <div className="field-block">
                          <Label htmlFor={`pricing-period-start-time-${priceIndex}-${periodIndex}`}>Heure debut</Label>
                          <input
                            id={`pricing-period-start-time-${priceIndex}-${periodIndex}`}
                            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                            type="time"
                            value={period.startTime}
                            disabled={disabled}
                            onChange={(event) => updatePeriod(priceIndex, periodIndex, { startTime: event.target.value })}
                          />
                        </div>
                        <div className="field-block">
                          <Label htmlFor={`pricing-period-end-time-${priceIndex}-${periodIndex}`}>Heure fin</Label>
                          <input
                            id={`pricing-period-end-time-${priceIndex}-${periodIndex}`}
                            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                            type="time"
                            value={period.endTime}
                            disabled={disabled}
                            onChange={(event) => updatePeriod(priceIndex, periodIndex, { endTime: event.target.value })}
                          />
                        </div>
                        <div className="field-block field-block--wide">
                          <Label htmlFor={`pricing-period-note-${priceIndex}-${periodIndex}`}>Note</Label>
                          <textarea
                            id={`pricing-period-note-${priceIndex}-${periodIndex}`}
                            className="min-h-20 rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                            value={period.note}
                            disabled={disabled}
                            onChange={(event) => updatePeriod(priceIndex, periodIndex, { note: event.target.value })}
                          />
                        </div>
                      </div>
                    </article>
                  )) : (
                    <article className="panel-card panel-card--nested">
                      <span className="facet-title">Periodes</span>
                      <p>Aucune periode detaillee pour ce tarif.</p>
                    </article>
                  )}
                </div>
              </article>
            )) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Tarifs</span>
                <p>Aucun tarif n est actuellement renseigne.</p>
              </article>
            )}
          </div>
        </article>

        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Remises bornees</span>
              <h3>Promotions locales</h3>
            </div>
          </div>

          <div className="stack-list">
            {value.discounts.length > 0 ? value.discounts.map((discount, index) => (
              <article key={`${discount.recordId ?? 'discount'}-${index}`} className="panel-card panel-card--nested">
                <div className="panel-heading">
                  <div>
                    <span className="facet-title">Remise {index + 1}</span>
                    <h3>{discount.discountPercent ? `${discount.discountPercent}%` : `${discount.discountAmount} ${discount.currency}`}</h3>
                  </div>
                  <Button type="button" variant="ghost" onClick={() => removeDiscount(index)} disabled={disabled}>
                    Retirer
                  </Button>
                </div>

                <div className="drawer-grid">
                  <div className="field-block">
                    <Label htmlFor={`pricing-discount-percent-${index}`}>Pourcentage</Label>
                    <Input
                      id={`pricing-discount-percent-${index}`}
                      value={discount.discountPercent}
                      disabled={disabled}
                      onChange={(event) => updateDiscount(index, {
                        discountPercent: event.target.value,
                        discountAmount: event.target.value ? '' : discount.discountAmount,
                      })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-discount-amount-${index}`}>Montant</Label>
                    <Input
                      id={`pricing-discount-amount-${index}`}
                      value={discount.discountAmount}
                      disabled={disabled}
                      onChange={(event) => updateDiscount(index, {
                        discountAmount: event.target.value,
                        discountPercent: event.target.value ? '' : discount.discountPercent,
                      })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-discount-currency-${index}`}>Devise</Label>
                    <Input
                      id={`pricing-discount-currency-${index}`}
                      value={discount.currency}
                      disabled={disabled}
                      onChange={(event) => updateDiscount(index, { currency: event.target.value.toUpperCase() })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-discount-min-group-${index}`}>Groupe min</Label>
                    <Input
                      id={`pricing-discount-min-group-${index}`}
                      value={discount.minGroupSize}
                      disabled={disabled}
                      onChange={(event) => updateDiscount(index, { minGroupSize: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-discount-max-group-${index}`}>Groupe max</Label>
                    <Input
                      id={`pricing-discount-max-group-${index}`}
                      value={discount.maxGroupSize}
                      disabled={disabled}
                      onChange={(event) => updateDiscount(index, { maxGroupSize: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-discount-valid-from-${index}`}>Valide du</Label>
                    <input
                      id={`pricing-discount-valid-from-${index}`}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      type="date"
                      value={discount.validFrom}
                      disabled={disabled}
                      onChange={(event) => updateDiscount(index, { validFrom: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-discount-valid-to-${index}`}>Valide au</Label>
                    <input
                      id={`pricing-discount-valid-to-${index}`}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      type="date"
                      value={discount.validTo}
                      disabled={disabled}
                      onChange={(event) => updateDiscount(index, { validTo: event.target.value })}
                    />
                  </div>

                  <div className="field-block">
                    <Label htmlFor={`pricing-discount-source-${index}`}>Source</Label>
                    <Input
                      id={`pricing-discount-source-${index}`}
                      value={discount.source}
                      disabled={disabled}
                      onChange={(event) => updateDiscount(index, { source: event.target.value })}
                    />
                  </div>

                  <div className="field-block field-block--wide">
                    <Label htmlFor={`pricing-discount-conditions-${index}`}>Conditions</Label>
                    <textarea
                      id={`pricing-discount-conditions-${index}`}
                      className="min-h-24 rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                      value={discount.conditions}
                      disabled={disabled}
                      onChange={(event) => updateDiscount(index, { conditions: event.target.value })}
                    />
                  </div>
                </div>
              </article>
            )) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Remises</span>
                <p>Aucune remise bornee n est actuellement renseignee.</p>
              </article>
            )}
          </div>
        </article>

        <article className="panel-card panel-card--nested">
          <div className="panel-heading">
            <div>
              <span className="facet-title">Promotions liees</span>
              <h3>Campagnes rattachees</h3>
            </div>
          </div>

          <div className="stack-list">
            {value.promotions.length > 0 ? value.promotions.map((promotion) => (
              <article key={promotion.promotionId} className="panel-card panel-card--nested">
                <div className="panel-heading">
                  <div>
                    <span className="facet-title">{promotion.code || 'Promotion'}</span>
                    <h3>{promotion.name}</h3>
                  </div>
                  <strong>{promotion.isActive ? 'Active' : 'Inactive'}</strong>
                </div>
                <p className="text-sm text-muted-foreground">
                  {promotion.discountType} · {promotion.discountValue}{promotion.currency ? ` ${promotion.currency}` : ''}
                </p>
                <p className="text-sm text-muted-foreground">
                  {promotion.validFrom || 'sans debut'} {' -> '} {promotion.validTo || 'sans fin'} {' · '} {promotion.isPublic ? 'publique' : 'privee'}
                </p>
              </article>
            )) : (
              <article className="panel-card panel-card--nested">
                <span className="facet-title">Promotions</span>
                <p>{value.promotionsUnavailableReason ?? 'Aucune promotion liee n est actuellement visible.'}</p>
              </article>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
