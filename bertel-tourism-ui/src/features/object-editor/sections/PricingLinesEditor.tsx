import { Pencil, Trash2 } from 'lucide-react';
import type {
  ObjectWorkspaceDiscountItem,
  ObjectWorkspacePricingModule,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';
import { formatPriceAmount, summarizePricingLine } from './pricing-row';

const labelByCode = (options: WorkspaceReferenceOption[], code: string): string =>
  code ? options.find((option) => option.code === code)?.label ?? code : '';

interface PriceListProps {
  pricing: ObjectWorkspacePricingModule;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}

const ROW_COLS = 'minmax(0, 1.6fr) minmax(0, 1fr) auto';

/** Compact read-only list of tariff lines; all add/edit happens in PricingLineEditModal. */
export function PriceList({ pricing, onAdd, onEdit, onDelete }: PriceListProps) {
  const prices = pricing.prices;

  if (prices.length === 0) {
    return (
      <div className="op__empty">
        <h4>Aucune ligne tarifaire</h4>
        <p className="muted">Ajoutez un tarif (public, montant, unité) pour décrire votre grille.</p>
        <button type="button" className="rep-add" onClick={onAdd}>+ Ajouter une ligne tarifaire</button>
      </div>
    );
  }

  return (
    <>
      <div className="repeater">
        {prices.map((price, index) => {
          const typeLabel = labelByCode(pricing.priceTypeOptions, price.indicationCode);
          const publicLabel = price.kindLabel || labelByCode(pricing.priceKindOptions, price.kindCode);
          const unitLabel = price.unitLabel || labelByCode(pricing.priceUnitOptions, price.unitCode);
          const seasonLabel = labelByCode(pricing.priceSeasonOptions, price.seasonCode);
          const amount = formatPriceAmount(price);
          const detail = [seasonLabel, summarizePricingLine(price)].filter(Boolean).join(' · ');
          const rowLabel = publicLabel || `Ligne ${index + 1}`;
          return (
            <div
              key={`${price.recordId ?? 'price'}-${index}`}
              className="rep-row"
              style={{ gridTemplateColumns: ROW_COLS, alignItems: 'center' }}
            >
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{rowLabel}</span>
                {typeLabel && <span className="pill" style={{ marginLeft: 8, fontSize: 10 }}>{typeLabel}</span>}
                {detail && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{detail}</div>
                )}
              </div>
              <div className="mono" style={{ fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {amount || '—'}
                {unitLabel && <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>{unitLabel}</span>}
              </div>
              <div className="rep-row__act">
                <button type="button" aria-label={`Modifier ${rowLabel}`} onClick={() => onEdit(index)} style={{ fontSize: 12, padding: '2px 6px', cursor: 'pointer' }}>
                  <Pencil size={14} aria-hidden />
                </button>
                <button type="button" className="del" aria-label={`Supprimer ${rowLabel}`} onClick={() => onDelete(index)}>
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="rep-add" onClick={onAdd}>+ Ajouter une ligne tarifaire</button>
    </>
  );
}

interface DiscountListProps {
  discounts: ObjectWorkspaceDiscountItem[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}

function discountValue(discount: ObjectWorkspaceDiscountItem): string {
  if (discount.discountPercent) return `−${discount.discountPercent} %`;
  if (discount.discountAmount) {
    const symbol = discount.currency === 'USD' ? '$' : discount.currency === 'GBP' ? '£' : '€';
    return `−${discount.discountAmount} ${symbol}`;
  }
  return '—';
}

function discountDetail(discount: ObjectWorkspaceDiscountItem): string {
  const parts: string[] = [];
  if (discount.minGroupSize || discount.maxGroupSize) {
    parts.push(`groupe ${discount.minGroupSize || '?'}–${discount.maxGroupSize || '?'}`);
  }
  if (discount.validFrom || discount.validTo) {
    parts.push(`${discount.validFrom || '…'} → ${discount.validTo || '…'}`);
  }
  return parts.join(' · ');
}

/** Compact read-only list of discounts; all add/edit happens in DiscountEditModal. */
export function DiscountList({ discounts, onAdd, onEdit, onDelete }: DiscountListProps) {
  if (discounts.length === 0) {
    return (
      <button type="button" className="rep-add" onClick={onAdd}>+ Ajouter une remise</button>
    );
  }

  return (
    <>
      <div className="repeater">
        {discounts.map((discount, index) => {
          const rowLabel = discount.conditions.trim() || `Remise ${index + 1}`;
          const detail = discountDetail(discount);
          return (
            <div
              key={`${discount.recordId ?? 'discount'}-${index}`}
              className="rep-row"
              style={{ gridTemplateColumns: ROW_COLS, alignItems: 'center' }}
            >
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{rowLabel}</span>
                {detail && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{detail}</div>}
              </div>
              <div className="mono" style={{ fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {discountValue(discount)}
              </div>
              <div className="rep-row__act">
                <button type="button" aria-label={`Modifier ${rowLabel}`} onClick={() => onEdit(index)} style={{ fontSize: 12, padding: '2px 6px', cursor: 'pointer' }}>
                  <Pencil size={14} aria-hidden />
                </button>
                <button type="button" className="del" aria-label={`Supprimer ${rowLabel}`} onClick={() => onDelete(index)}>
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="rep-add" onClick={onAdd}>+ Ajouter une remise</button>
    </>
  );
}
