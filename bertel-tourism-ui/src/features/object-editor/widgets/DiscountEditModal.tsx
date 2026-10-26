import { useState } from 'react';
import { Chip, ChipSet, Disclosure, EditorModal, Field, Input, Select } from '../primitives';
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
export function DiscountEditModal({
  open,
  mode,
  draft: initialDraft,
  onClose,
  onSave,
}: DiscountEditModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [amountMode, setAmountMode] = useState(Boolean(initialDraft.discountAmount));
  const [dated, setDated] = useState(Boolean(initialDraft.validFrom || initialDraft.validTo));
  const set = (patch: Partial<ObjectWorkspaceDiscountItem>) =>
    setDraft((current) => withDiscountXor(current, patch));
  const validation = validateDiscountDraft(draft);
  const missingName = !draft.conditions.trim();
  const canSave = validation.canSave && (mode === 'edit' || !missingName);
  const amount = draft.discountPercent
    ? `−${draft.discountPercent} %`
    : draft.discountAmount
      ? `−${draft.discountAmount} ${draft.currency || 'EUR'}`
      : 'À renseigner';

  return (
    <EditorModal
      className="ed-record-modal--discount"
      open={open}
      title={mode === 'edit' ? 'Modifier la remise' : 'Ajouter une remise'}
      eyebrow="Tarifs · Remise"
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveLabel={mode === 'add' ? 'Ajouter' : 'Appliquer'}
      saveDisabled={!canSave}
      aside={
        <>
          <h3>Sur la fiche</h3>
          <div className="ed-record-modal__preview">
            <strong>{draft.conditions || 'Nouvelle remise'}</strong>
            <p>{amount}</p>
            <p>{dated ? `${draft.validFrom || '…'} → ${draft.validTo || '…'}` : 'Toute l’année'}</p>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            La remise est affichée à côté des tarifs ; les prix ne sont pas modifiés.
          </p>
          <h3>Avant d’appliquer</h3>
          <ul className="ed-record-modal__checks">
            <li data-complete={!missingName}>
              {missingName ? '○' : '✓'} Nom de la remise
              {mode === 'edit' && missingName ? ' · À compléter' : ''}
            </li>
            <li data-complete={validation.canSave}>{validation.canSave ? '✓' : '○'} Montant et validité</li>
          </ul>
        </>
      }
      footerNote={canSave ? 'Prêt à appliquer au brouillon' : 'Remise à compléter'}
    >
      <section className="ed-modal__section">
        <h3>Pour qui, quand ?</h3>
        <ChipSet>
          {['Groupes', 'Scolaires', 'Basse saison', 'Réservation anticipée', 'Familles'].map((label) => (
            <Chip
              key={label}
              label={label}
              on={draft.conditions === label}
              onClick={() => set({ conditions: label })}
            />
          ))}
        </ChipSet>
        <Field label="Nom de la remise" hint="Le nom et les conditions affichés sur la fiche.">
          <Input
            aria-label="Conditions"
            value={draft.conditions}
            placeholder="ex. groupes (8+), scolaires…"
            onChange={(conditions) => set({ conditions })}
          />
        </Field>
      </section>

      <section className="ed-modal__section">
        <h3>Combien ?</h3>
        <div className="ed-modal__segmented" role="group" aria-label="Type de remise">
          <button
            type="button"
            aria-pressed={!amountMode}
            onClick={() => {
              setAmountMode(false);
              set({ discountAmount: '', currency: '' });
            }}
          >
            En pourcentage
          </button>
          <button
            type="button"
            aria-pressed={amountMode}
            onClick={() => {
              setAmountMode(true);
              set({ discountPercent: '', currency: draft.currency || 'EUR' });
            }}
          >
            En montant fixe
          </button>
        </div>
        <div className="grid-2" style={{ gap: 10, marginTop: 12 }}>
          {!amountMode ? (
            <Field label="Remise (%)">
              <Input
                type="number"
                mono
                suffix="%"
                aria-label="Remise en pourcentage"
                value={draft.discountPercent}
                placeholder="—"
                onChange={(discountPercent) => set({ discountPercent })}
              />
            </Field>
          ) : (
            <>
              <Field label="ou montant">
                <Input
                  type="number"
                  mono
                  suffix="€"
                  aria-label="Remise en montant"
                  value={draft.discountAmount}
                  placeholder="—"
                  onChange={(discountAmount) => set({ discountAmount })}
                />
              </Field>
              <Field label="Devise">
                <Select
                  aria-label="Devise"
                  value={draft.currency || 'EUR'}
                  options={CURRENCY_OPTIONS}
                  onChange={(currency) => set({ currency })}
                />
              </Field>
            </>
          )}
        </div>
      </section>

      <section className="ed-modal__section">
        <h3>Valable</h3>
        <div className="ed-modal__segmented" role="group" aria-label="Validité de la remise">
          <button
            type="button"
            aria-pressed={!dated}
            onClick={() => {
              setDated(false);
              set({ validFrom: '', validTo: '' });
            }}
          >
            Toute l’année
          </button>
          <button type="button" aria-pressed={dated} onClick={() => setDated(true)}>
            Dates précises
          </button>
        </div>
        {dated && (
          <div className="grid-2" style={{ gap: 10 }}>
            <Field label="Validité — du">
              <Input
                type="date"
                aria-label="Début de validité de la remise"
                value={draft.validFrom}
                onChange={(validFrom) => set({ validFrom })}
              />
            </Field>
            <Field label="Validité — au">
              <Input
                type="date"
                aria-label="Fin de validité de la remise"
                value={draft.validTo}
                onChange={(validTo) => set({ validTo })}
              />
            </Field>
          </div>
        )}
      </section>

      <Disclosure
        title="Réserver à une taille de groupe"
        defaultOpen={Boolean(draft.minGroupSize || draft.maxGroupSize)}
      >
        <div className="grid-2" style={{ gap: 10 }}>
          <Field label="Taille de groupe — min">
            <Input
              type="number"
              mono
              aria-label="Taille de groupe minimale"
              value={draft.minGroupSize}
              placeholder="—"
              onChange={(minGroupSize) => set({ minGroupSize })}
            />
          </Field>
          <Field label="Taille de groupe — max">
            <Input
              type="number"
              mono
              aria-label="Taille de groupe maximale"
              value={draft.maxGroupSize}
              placeholder="—"
              onChange={(maxGroupSize) => set({ maxGroupSize })}
            />
          </Field>
        </div>
      </Disclosure>

      {!validation.canSave && validation.error && (
        <p role="alert" className="muted" style={{ marginTop: 4, color: 'var(--red, #93392a)' }}>
          {validation.error}
        </p>
      )}
    </EditorModal>
  );
}
