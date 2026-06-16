import { useState } from 'react';
import { EditorModal, Field, Input, Select } from '../primitives';
import { validateDiscountDraft, withDiscountXor } from '../sections/discount-row';
import type { ObjectWorkspaceDiscountItem } from '../../../services/object-workspace-parser';

interface DiscountEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  draft: ObjectWorkspaceDiscountItem;
  onClose: () => void;
  onSave: (discount: ObjectWorkspaceDiscountItem) => void;
}

const CURRENCY_OPTIONS = [
  { v: 'EUR', l: '€ EUR' },
  { v: 'USD', l: '$ USD' },
  { v: 'GBP', l: '£ GBP' },
];

/**
 * Focused add/edit modal for one §13 discount (object_discount). The percent-XOR-amount
 * contract is enforced live via withDiscountXor, and the save gate mirrors the DB CHECKs
 * (validateDiscountDraft) so Enregistrer is disabled with a reason rather than failing in
 * the batch saver.
 */
export function DiscountEditModal({ open, mode, draft: initialDraft, onClose, onSave }: DiscountEditModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  const set = (patch: Partial<ObjectWorkspaceDiscountItem>) => setDraft((current) => withDiscountXor(current, patch));
  const validation = validateDiscountDraft(draft);

  return (
    <EditorModal
      open={open}
      title={mode === 'edit' ? 'Modifier la remise' : 'Ajouter une remise'}
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={!validation.canSave}
    >
      <Field label="Conditions" hint="À qui / quand s'applique la remise (ex. groupes, scolaires, basse saison).">
        <Input
          aria-label="Conditions"
          value={draft.conditions}
          placeholder="ex. groupes (8+), scolaires…"
          onChange={(conditions) => set({ conditions })}
        />
      </Field>

      <div className="grid-3" style={{ gap: 10 }}>
        <Field label="Remise (%)">
          <Input type="number" mono suffix="%" aria-label="Remise en pourcentage" value={draft.discountPercent} placeholder="—" onChange={(discountPercent) => set({ discountPercent })} />
        </Field>
        <Field label="ou montant">
          <Input type="number" mono suffix="€" aria-label="Remise en montant" value={draft.discountAmount} placeholder="—" onChange={(discountAmount) => set({ discountAmount })} />
        </Field>
        <Field label="Devise">
          <Select aria-label="Devise" value={draft.currency || 'EUR'} options={CURRENCY_OPTIONS} onChange={(currency) => set({ currency })} />
        </Field>
      </div>

      <div className="grid-2" style={{ gap: 10 }}>
        <Field label="Taille de groupe — min">
          <Input type="number" mono aria-label="Taille de groupe minimale" value={draft.minGroupSize} placeholder="—" onChange={(minGroupSize) => set({ minGroupSize })} />
        </Field>
        <Field label="Taille de groupe — max">
          <Input type="number" mono aria-label="Taille de groupe maximale" value={draft.maxGroupSize} placeholder="—" onChange={(maxGroupSize) => set({ maxGroupSize })} />
        </Field>
      </div>

      <div className="grid-2" style={{ gap: 10 }}>
        <Field label="Validité — du">
          <Input type="date" aria-label="Début de validité de la remise" value={draft.validFrom} onChange={(validFrom) => set({ validFrom })} />
        </Field>
        <Field label="Validité — au">
          <Input type="date" aria-label="Fin de validité de la remise" value={draft.validTo} onChange={(validTo) => set({ validTo })} />
        </Field>
      </div>

      {!validation.canSave && validation.error && (
        <p role="alert" className="muted" style={{ marginTop: 4, color: 'var(--red, #93392a)' }}>
          {validation.error}
        </p>
      )}
    </EditorModal>
  );
}
