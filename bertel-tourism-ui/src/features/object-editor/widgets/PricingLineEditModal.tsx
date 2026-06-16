import { useState } from 'react';
import { EditorModal, Field, Input, ReferenceSelect, Select, Textarea } from '../primitives';
import { validatePricingDraft } from '../sections/pricing-row';
import type {
  ObjectWorkspacePriceItem,
  ObjectWorkspacePricingModule,
} from '../../../services/object-workspace-parser';

interface PricingLineEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  /** Reference vocabularies (price_type / price_kind / season_type / price_unit). */
  pricing: ObjectWorkspacePricingModule;
  draft: ObjectWorkspacePriceItem;
  onClose: () => void;
  onSave: (price: ObjectWorkspacePriceItem) => void;
}

const CURRENCY_OPTIONS = [
  { v: 'EUR', l: '€ EUR' },
  { v: 'USD', l: '$ USD' },
  { v: 'GBP', l: '£ GBP' },
];

/**
 * Focused add/edit modal for one §13 tariff line (parallel to OpeningPeriodEditModal).
 * Holds a local draft; the section commits the whole prices array on save. The
 * two-axis model surfaces as two reference selects — Type de tarif (price_type) and
 * Public (price_kind) — plus the unit, the amount/range, validity, season, age
 * brackets and free conditions. recordId is carried by spreading the edited row.
 */
export function PricingLineEditModal({ open, mode, pricing, draft: initialDraft, onClose, onSave }: PricingLineEditModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  const set = (patch: Partial<ObjectWorkspacePriceItem>) => setDraft((current) => ({ ...current, ...patch }));
  const validation = validatePricingDraft(draft);

  return (
    <EditorModal
      open={open}
      title={mode === 'edit' ? 'Modifier la ligne tarifaire' : 'Ajouter une ligne tarifaire'}
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={!validation.canSave}
      size="lg"
    >
      <div className="grid-2" style={{ gap: 10 }}>
        <Field label="Type de tarif">
          <ReferenceSelect
            aria-label="Type de tarif"
            value={draft.indicationCode}
            options={pricing.priceTypeOptions}
            allowEmpty
            emptyLabel="— Type —"
            onChange={(code) => set({ indicationCode: code })}
          />
        </Field>
        <Field label="Public / bénéficiaire" required>
          <ReferenceSelect
            aria-label="Public / bénéficiaire"
            value={draft.kindCode}
            options={pricing.priceKindOptions}
            placeholder="— Choisir un public —"
            onChange={(code, option) => set({ kindCode: code, kindId: option?.id ?? '', kindLabel: option?.label ?? '' })}
          />
        </Field>
      </div>

      <div className="grid-3" style={{ gap: 10 }}>
        <Field label="Montant">
          <Input type="number" mono aria-label="Montant" value={draft.amount} placeholder="0" onChange={(amount) => set({ amount })} />
        </Field>
        <Field label="Montant max." hint="Pour une fourchette ou un « à partir de » — laissez vide sinon.">
          <Input type="number" mono aria-label="Montant maximum" value={draft.amountMax} placeholder="—" onChange={(amountMax) => set({ amountMax })} />
        </Field>
        <Field label="Devise">
          <Select aria-label="Devise" value={draft.currency || 'EUR'} options={CURRENCY_OPTIONS} onChange={(currency) => set({ currency })} />
        </Field>
      </div>

      <div className="grid-2" style={{ gap: 10 }}>
        <Field label="Unité">
          <ReferenceSelect
            aria-label="Unité"
            value={draft.unitCode}
            options={pricing.priceUnitOptions}
            allowEmpty
            emptyLabel="Sans unité"
            onChange={(code, option) => set({ unitCode: code, unitId: option?.id ?? '', unitLabel: option?.label ?? '' })}
          />
        </Field>
        <Field label="Saison">
          <ReferenceSelect
            aria-label="Saison"
            value={draft.seasonCode}
            options={pricing.priceSeasonOptions}
            allowEmpty
            emptyLabel="Toutes saisons"
            onChange={(code) => set({ seasonCode: code })}
          />
        </Field>
      </div>

      <div className="grid-2" style={{ gap: 10 }}>
        <Field label="Validité — du">
          <Input type="date" aria-label="Début de validité" value={draft.validFrom} onChange={(validFrom) => set({ validFrom })} />
        </Field>
        <Field label="Validité — au">
          <Input type="date" aria-label="Fin de validité" value={draft.validTo} onChange={(validTo) => set({ validTo })} />
        </Field>
      </div>

      <div className="chip-group__label" style={{ marginTop: 6 }}>Tranches d&apos;âge (optionnel)</div>
      <div className="grid-2" style={{ gap: 10 }}>
        <Field label="Enfant — de / à (ans)">
          <div style={{ display: 'flex', gap: 6 }}>
            <Input type="number" mono aria-label="Âge enfant minimum" value={draft.ageMinEnfant} placeholder="min" onChange={(ageMinEnfant) => set({ ageMinEnfant })} />
            <Input type="number" mono aria-label="Âge enfant maximum" value={draft.ageMaxEnfant} placeholder="max" onChange={(ageMaxEnfant) => set({ ageMaxEnfant })} />
          </div>
        </Field>
        <Field label="Junior — de / à (ans)">
          <div style={{ display: 'flex', gap: 6 }}>
            <Input type="number" mono aria-label="Âge junior minimum" value={draft.ageMinJunior} placeholder="min" onChange={(ageMinJunior) => set({ ageMinJunior })} />
            <Input type="number" mono aria-label="Âge junior maximum" value={draft.ageMaxJunior} placeholder="max" onChange={(ageMaxJunior) => set({ ageMaxJunior })} />
          </div>
        </Field>
      </div>

      <Field label="Conditions / notes">
        <Textarea
          aria-label="Conditions"
          rows={2}
          value={draft.conditions}
          placeholder="ex. réservation conseillée, sur présentation d'un justificatif…"
          onChange={(conditions) => set({ conditions })}
        />
      </Field>

      {!validation.canSave && validation.error && (
        <p role="alert" className="muted" style={{ marginTop: 4, color: 'var(--red, #93392a)' }}>
          {validation.error}
        </p>
      )}
    </EditorModal>
  );
}
