import { useState } from 'react';
import { Fs } from '../primitives';
import type { SectionProps } from './section-types';
import type {
  ObjectWorkspaceDiscountItem,
  ObjectWorkspacePriceItem,
} from '../../../services/object-workspace-parser';
import { DiscountList, PriceList } from './PricingLinesEditor';
import { PaymentChips } from './commercial-controls';
import { PricingLineEditModal } from '../widgets/PricingLineEditModal';
import { DiscountEditModal } from '../widgets/DiscountEditModal';
import { createPricingDraft } from './pricing-row';
import { createDiscountRow } from './discount-row';

/**
 * §13 Tarifs & extras — modal-driven (parallel to §14 openings / §08 classifications).
 * Two compact lists (tariff lines + discounts) are read-only presenters; all add/edit
 * happens in PricingLineEditModal / DiscountEditModal, which own the per-row detail
 * (type, public, amount range, unit, season, validity, age brackets, conditions). The
 * old "Politique & règles" block (acompte / délai annulation / TVA) was removed: it wrote
 * those values onto price[0]'s conditions/valid_from/source columns — a write-trap that
 * errored the whole save the moment a non-date string reached the valid_from date column.
 * Booking policy needs its own model (decision log §84). PaymentChips is the §83 payment
 * block (object_payment_method) the PO relocated into §13.
 */
export function SectionPricing({ editor, folded }: SectionProps) {
  const pricing = editor.draft.pricing;
  const [addingPrice, setAddingPrice] = useState(false);
  const [editingPriceIndex, setEditingPriceIndex] = useState<number | null>(null);
  const [addingDiscount, setAddingDiscount] = useState(false);
  const [editingDiscountIndex, setEditingDiscountIndex] = useState<number | null>(null);

  function replacePrices(next: ObjectWorkspacePriceItem[]) {
    editor.replaceModule('pricing', { ...pricing, prices: next });
  }
  function replaceDiscounts(next: ObjectWorkspaceDiscountItem[]) {
    editor.replaceModule('pricing', { ...pricing, discounts: next });
  }

  function deletePrice(index: number) {
    const label = pricing.prices[index]?.kindLabel || `la ligne ${index + 1}`;
    if (!window.confirm(`Supprimer ${label} ?`)) {
      return;
    }
    replacePrices(pricing.prices.filter((_, priceIndex) => priceIndex !== index));
  }
  function deleteDiscount(index: number) {
    const label = pricing.discounts[index]?.conditions || `la remise ${index + 1}`;
    if (!window.confirm(`Supprimer « ${label} » ?`)) {
      return;
    }
    replaceDiscounts(pricing.discounts.filter((_, discountIndex) => discountIndex !== index));
  }

  return (
    <Fs
      num="13"
      title="Tarifs, paiement & extras"
      sub="Tarifs, options, paiement, saisons, publics et conditions"
      folded={folded}
      pill={{ tone: 'ok', label: `${pricing.prices.length} ligne(s) · ${pricing.discounts.length} remise(s)` }}
    >
      <PriceList
        pricing={pricing}
        onAdd={() => setAddingPrice(true)}
        onEdit={(index) => setEditingPriceIndex(index)}
        onDelete={deletePrice}
      />

      <PaymentChips
        characteristics={editor.draft.characteristics}
        onChange={(next) => editor.replaceModule('characteristics', next)}
      />

      <div className="chip-group__label" style={{ marginTop: 16 }}>Remises &amp; réductions</div>
      <DiscountList
        discounts={pricing.discounts}
        onAdd={() => setAddingDiscount(true)}
        onEdit={(index) => setEditingDiscountIndex(index)}
        onDelete={deleteDiscount}
      />

      {addingPrice && (
        <PricingLineEditModal
          open
          mode="add"
          pricing={pricing}
          draft={createPricingDraft(pricing)}
          onClose={() => setAddingPrice(false)}
          onSave={(price) => {
            replacePrices([...pricing.prices, price]);
            setAddingPrice(false);
          }}
        />
      )}
      {editingPriceIndex !== null && pricing.prices[editingPriceIndex] && (
        <PricingLineEditModal
          open
          mode="edit"
          pricing={pricing}
          draft={pricing.prices[editingPriceIndex]}
          onClose={() => setEditingPriceIndex(null)}
          onSave={(price) => {
            replacePrices(pricing.prices.map((row, rowIndex) => (rowIndex === editingPriceIndex ? price : row)));
            setEditingPriceIndex(null);
          }}
        />
      )}

      {addingDiscount && (
        <DiscountEditModal
          open
          mode="add"
          draft={createDiscountRow()}
          onClose={() => setAddingDiscount(false)}
          onSave={(discount) => {
            replaceDiscounts([...pricing.discounts, discount]);
            setAddingDiscount(false);
          }}
        />
      )}
      {editingDiscountIndex !== null && pricing.discounts[editingDiscountIndex] && (
        <DiscountEditModal
          open
          mode="edit"
          draft={pricing.discounts[editingDiscountIndex]}
          onClose={() => setEditingDiscountIndex(null)}
          onSave={(discount) => {
            replaceDiscounts(pricing.discounts.map((row, rowIndex) => (rowIndex === editingDiscountIndex ? discount : row)));
            setEditingDiscountIndex(null);
          }}
        />
      )}
    </Fs>
  );
}
