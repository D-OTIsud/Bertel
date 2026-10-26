'use client';

import { useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, Circle, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../../../components/ui/dialog';
import { Chip, ChipSet, Disclosure, Field, Input, ReferenceSelect, Select, Textarea } from '../primitives';
import { TYPE_LABEL, type ArchetypeCode } from '../archetypes';
import {
  ageBracketsFor,
  applyPriceMode,
  applyValidityMode,
  availablePresets,
  derivePriceMode,
  deriveValidityMode,
  describePriceLine,
  finalizePricingDraft,
  groupUnits,
  isQuoteLine,
  kindImpliesFree,
  MISSING_KEYS,
  presetPatch,
  pricingFieldErrors,
  pruneAges,
  type PriceMode,
  type PricingFieldErrors,
  type ValidityMode,
} from '../sections/pricing-presets';
import type {
  ObjectWorkspacePriceItem,
  ObjectWorkspacePricingModule,
} from '../../../services/object-workspace-parser';
import './pricing-line-modal.css';
import { EditorModalContext } from '../primitives/EditorModal';

interface PricingLineEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  /** Reference vocabularies (price_type / price_kind / season_type / price_unit) + the existing lines for the preview. */
  pricing: ObjectWorkspacePricingModule;
  draft: ObjectWorkspacePriceItem;
  /** Index of the line being edited (edit mode) — highlighted in place in the preview. */
  editIndex?: number;
  /** Object archetype: drives the shortcuts and the unit ordering. */
  archetype?: ArchetypeCode;
  /** Canonical type code (HOT, RES…) shown in the modal eyebrow. */
  typeCode?: string;
  onClose: () => void;
  onSave: (price: ObjectWorkspacePriceItem) => void;
}

const CURRENCY_OPTIONS = [
  { v: 'EUR', l: '€ EUR' },
  { v: 'USD', l: '$ USD' },
  { v: 'GBP', l: '£ GBP' },
];
const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };

const PRICE_MODES: ReadonlyArray<{ value: PriceMode; label: string }> = [
  { value: 'fixed', label: 'Prix fixe' },
  { value: 'range', label: 'Fourchette' },
  { value: 'free', label: 'Gratuit' },
];
const VALIDITY_MODES: ReadonlyArray<{ value: ValidityMode; label: string }> = [
  { value: 'year', label: 'Toute l’année' },
  { value: 'season', label: 'Une saison' },
  { value: 'dates', label: 'Dates précises' },
];

/** Full-width segmented control (radio semantics) — « Prix fixe / Fourchette / Gratuit ». */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="plm-seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={option.disabled}
          className={value === option.value ? 'is-on' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Unit select with the units usual for this kind of object first. */
function UnitSelect({
  value,
  archetype,
  pricing,
  onChange,
  id,
  'aria-describedby': describedBy,
}: {
  value: string;
  archetype?: ArchetypeCode;
  pricing: ObjectWorkspacePricingModule;
  onChange: (code: string) => void;
  id?: string;
  'aria-describedby'?: string;
}) {
  const { common, others } = groupUnits(archetype, pricing.priceUnitOptions);
  const known = pricing.priceUnitOptions.some((option) => option.code === value);
  const render = (options: typeof common) =>
    options.map((option) => (
      <option key={option.id || option.code} value={option.code}>{option.label}</option>
    ));
  return (
    <select id={id} className="select" aria-label="Unité" aria-describedby={describedBy} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Sans unité</option>
      {common.length > 0 && others.length > 0 ? (
        <>
          <optgroup label="Les plus utilisées">{render(common)}</optgroup>
          <optgroup label="Autres unités">{render(others)}</optgroup>
        </>
      ) : (
        render([...common, ...others])
      )}
      {!known && value !== '' && <option value={value}>{value}</option>}
    </select>
  );
}

function FormSection({ title, optional, children }: { title: string; optional?: boolean; children: ReactNode }) {
  return (
    <section className="plm-sec">
      <h3 className="plm-sec__title">
        {title}
        {optional && <span className="plm-opt"> facultatif</span>}
      </h3>
      {children}
    </section>
  );
}

type CheckState = 'ok' | 'todo' | 'error';

/**
 * Add/edit modal for one §13 tariff line — « C · Aperçu » of the Modales Edition mockups:
 * the form on the left, and on the right the tariff grid as it will read on the fiche (the
 * line being edited highlighted in place) plus an « Avant d'enregistrer » checklist.
 *
 * Shortcuts (« Quel tarif ? ») and unit ordering adapt to the object archetype. The raw
 * « Montant max. » field is replaced by a mode (Prix fixe / Fourchette / Gratuit), validity by
 * « Toute l'année / Une saison / Dates précises », and age brackets only appear for child /
 * youth publics. All of it maps onto the existing object_price columns (see pricing-presets.ts).
 * Errors sit under their field; missing values stay soft until the first save attempt.
 */
export function PricingLineEditModal({
  open,
  mode,
  pricing,
  draft: initialDraft,
  editIndex,
  archetype,
  typeCode,
  onClose,
  onSave,
}: PricingLineEditModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  const openerRef = useRef<HTMLElement | null>(null);
  const objectContext = useContext(EditorModalContext);
  const [priceMode, setPriceMode] = useState<PriceMode>(() => derivePriceMode(initialDraft));
  const [validityMode, setValidityMode] = useState<ValidityMode>(() => deriveValidityMode(initialDraft));
  const [presetId, setPresetId] = useState<string | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [touched, setTouched] = useState<Set<keyof PricingFieldErrors>>(() => new Set());

  const set = (patch: Partial<ObjectWorkspacePriceItem>, ...touchedKeys: Array<keyof PricingFieldErrors>) => {
    setDraft((current) => ({ ...current, ...patch }));
    if (touchedKeys.length) setTouched((current) => new Set([...current, ...touchedKeys]));
  };

  const presets = useMemo(() => availablePresets(archetype, pricing), [archetype, pricing]);
  const errors = pricingFieldErrors(draft, priceMode, validityMode);
  const errorCount = Object.keys(errors).length;
  /** A missing value is only flagged red once touched or after a save attempt; a wrong value always is. */
  const visibleError = (key: keyof PricingFieldErrors) =>
    errors[key] && (showAllErrors || touched.has(key) || !MISSING_KEYS.includes(key)) ? errors[key] : undefined;

  const brackets = ageBracketsFor(draft);
  const quote = isQuoteLine(draft);
  const symbol = CURRENCY_SYMBOL[draft.currency] ?? draft.currency ?? '€';
  const typeLabel = typeCode ? TYPE_LABEL[typeCode] ?? typeCode : '';

  const choosePriceMode = (next: PriceMode) => {
    setPriceMode(next);
    set(applyPriceMode(draft, next));
  };
  const chooseValidityMode = (next: ValidityMode) => {
    setValidityMode(next);
    set(applyValidityMode(next));
  };
  const applyPreset = (id: string) => {
    const preset = presets.find((candidate) => candidate.id === id);
    if (!preset) return;
    const patch = presetPatch(preset, pricing, draft);
    setPresetId(id);
    setDraft((current) => pruneAges({ ...current, ...patch }));
    if (preset.mode) setPriceMode(preset.mode);
    else if (priceMode === 'free') setPriceMode('fixed');
  };

  const handleSave = () => {
    if (errorCount > 0) {
      setShowAllErrors(true);
      return;
    }
    onSave(finalizePricingDraft(draft, priceMode, validityMode));
  };

  // Preview: the other lines as they are + this one, in place when editing, appended when adding.
  const previewLines = pricing.prices.map((price, index) => ({ price, current: index === editIndex }));
  if (editIndex === undefined || !pricing.prices[editIndex]) previewLines.push({ price: draft, current: true });
  const checks: Array<{ label: string; state: CheckState; note?: string }> = [
    { label: 'Public', state: errors.kind ? (showAllErrors || touched.has('kind') ? 'error' : 'todo') : 'ok' },
    {
      label: 'Montant',
      state: errors.amount || errors.amountMax
        ? (visibleError('amount') || visibleError('amountMax') ? 'error' : 'todo')
        : 'ok',
      note: priceMode === 'free' ? 'gratuit' : quote && !draft.amount.trim() ? 'sur devis' : undefined,
    },
    {
      label: 'Période de validité',
      state: errors.season || errors.dates ? (visibleError('season') || visibleError('dates') ? 'error' : 'todo') : 'ok',
    },
  ];
  if (brackets.length > 0) checks.push({ label: 'Tranche d’âge', state: errors.ageEnfant || errors.ageJunior ? 'error' : 'ok' });

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent
        showClose={false}
        overlayClassName="ed-record-modal-overlay"
        className="object-editor plm flex max-h-[calc(100vh-2rem)] max-w-[960px] flex-col gap-0 overflow-hidden p-0"
        onOpenAutoFocus={() => {
          openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (openerRef.current?.isConnected) {
            event.preventDefault();
            openerRef.current.focus();
          }
        }}
      >
        <header className="plm__head">
          <div className="plm__head-text">
            {(typeCode || objectContext) && (
              <div className="plm__eyebrow">
                {typeCode && <span className="plm__tag">{typeCode}</span>}
                {(objectContext || typeLabel) && <span>{objectContext || typeLabel}</span>}
              </div>
            )}
            <DialogTitle className="plm__title">{mode === 'edit' ? 'Modifier le tarif' : 'Ajouter un tarif'}</DialogTitle>
            <DialogDescription className="sr-only">
              Renseignez le public, le prix et la période de validité de cette ligne tarifaire.
            </DialogDescription>
          </div>
          <DialogClose className="plm__close" aria-label="Fermer">
            <X size={18} aria-hidden />
          </DialogClose>
        </header>

        <div className="plm__body">
          <div className="plm__form">
            {presets.length > 0 && (
              <FormSection title="Quel tarif ?">
                <ChipSet>
                  {presets.map((preset) => (
                    <Chip key={preset.id} label={preset.label} on={presetId === preset.id} onClick={() => applyPreset(preset.id)} />
                  ))}
                </ChipSet>
                <p className="plm-hint">Un raccourci pré-remplit le public, le type et l’unité — tout reste modifiable.</p>
              </FormSection>
            )}

            <div className="plm-grid-2">
              <Field label="Pour qui ?" required error={visibleError('kind')}>
                <ReferenceSelect
                  aria-label="Public / bénéficiaire"
                  value={draft.kindCode}
                  options={pricing.priceKindOptions}
                  placeholder="— Choisir un public —"
                  onChange={(code, option) => {
                    setPresetId(null);
                    setDraft((current) => pruneAges({ ...current, kindCode: code, kindId: option?.id ?? '', kindLabel: option?.label ?? '' }));
                    setTouched((current) => new Set([...current, 'kind']));
                    if (kindImpliesFree(code)) choosePriceMode('free');
                  }}
                />
              </Field>
              <Field label="Type de tarif">
                <ReferenceSelect
                  aria-label="Type de tarif"
                  value={draft.indicationCode}
                  options={pricing.priceTypeOptions}
                  allowEmpty
                  emptyLabel="— Type —"
                  onChange={(code) => { setPresetId(null); set({ indicationCode: code }); }}
                />
              </Field>
            </div>

            {brackets.map((bracket) => {
              const isChild = bracket === 'enfant';
              const min = isChild ? draft.ageMinEnfant : draft.ageMinJunior;
              const max = isChild ? draft.ageMaxEnfant : draft.ageMaxJunior;
              const errorKey = isChild ? 'ageEnfant' : 'ageJunior';
              return (
                <div key={bracket} className="plm-ages">
                  <span className="plm-ages__label">{isChild ? 'Âge enfant' : 'Âge jeune'}</span>
                  <span className="plm-ages__word">de</span>
                  <Input
                    type="number"
                    mono
                    aria-label={isChild ? 'Âge enfant minimum' : 'Âge junior minimum'}
                    value={min}
                    placeholder="0"
                    onChange={(value) => set(isChild ? { ageMinEnfant: value } : { ageMinJunior: value })}
                  />
                  <span className="plm-ages__word">à</span>
                  <Input
                    type="number"
                    mono
                    suffix="ans"
                    aria-label={isChild ? 'Âge enfant maximum' : 'Âge junior maximum'}
                    value={max}
                    placeholder="12"
                    onChange={(value) => set(isChild ? { ageMaxEnfant: value } : { ageMaxJunior: value })}
                  />
                  {visibleError(errorKey) && (
                    <p className="field__error plm-ages__error" role="alert">{visibleError(errorKey)}</p>
                  )}
                </div>
              );
            })}

            <FormSection title="Prix">
              <Segmented label="Forme du prix" value={priceMode} options={PRICE_MODES.map((option) => ({
                ...option, disabled: kindImpliesFree(draft.kindCode) && option.value !== 'free',
              }))} onChange={choosePriceMode} />
              {kindImpliesFree(draft.kindCode) && <p className="plm-note">Choisissez un public bénéficiaire pour saisir un prix payant.</p>}
              {priceMode === 'free' ? (
                <div className="plm-grid-2">
                  <p className="plm-note">Affiché « Gratuit » sur la fiche.</p>
                  <Field label="Par">
                    <UnitSelect value={draft.unitCode} archetype={archetype} pricing={pricing} onChange={(code) => {
                      const option = pricing.priceUnitOptions.find((candidate) => candidate.code === code);
                      set({ unitCode: code, unitId: option?.id ?? '', unitLabel: option?.label ?? '' });
                    }} />
                  </Field>
                </div>
              ) : (
                <div className={priceMode === 'range' ? 'plm-grid-3' : 'plm-grid-2'}>
                  <Field label={priceMode === 'range' ? 'De' : 'Montant'} error={visibleError('amount')}>
                    <Input
                      type="number"
                      mono
                      suffix={symbol}
                      aria-label="Montant"
                      value={draft.amount}
                      placeholder={quote ? 'sur devis' : '0,00'}
                      onChange={(amount) => set({ amount }, 'amount')}
                    />
                  </Field>
                  {priceMode === 'range' && (
                    <Field label="À" error={visibleError('amountMax')}>
                      <Input
                        type="number"
                        mono
                        suffix={symbol}
                        aria-label="Montant maximum"
                        value={draft.amountMax}
                        placeholder="0,00"
                        onChange={(amountMax) => set({ amountMax }, 'amountMax')}
                      />
                    </Field>
                  )}
                  <Field label="Par">
                    <UnitSelect value={draft.unitCode} archetype={archetype} pricing={pricing} onChange={(code) => {
                      const option = pricing.priceUnitOptions.find((candidate) => candidate.code === code);
                      set({ unitCode: code, unitId: option?.id ?? '', unitLabel: option?.label ?? '' });
                    }} />
                  </Field>
                </div>
              )}
              {quote && priceMode !== 'free' && (
                <p className="plm-hint">Ligne « sur devis » : le montant est facultatif.</p>
              )}
            </FormSection>

            <FormSection title="Valable">
              <Segmented label="Période de validité" value={validityMode} options={VALIDITY_MODES} onChange={chooseValidityMode} />
              {validityMode === 'season' && (
                <div className="plm-season">
                  {pricing.priceSeasonOptions.length > 0 ? (
                    <ChipSet>
                      {pricing.priceSeasonOptions.map((option) => (
                        <Chip
                          key={option.id || option.code}
                          label={option.label}
                          on={draft.seasonCode === option.code}
                          onClick={() => set({ seasonCode: draft.seasonCode === option.code ? '' : option.code }, 'season')}
                        />
                      ))}
                    </ChipSet>
                  ) : (
                    <p className="plm-hint">Aucune saison n’est définie dans les référentiels.</p>
                  )}
                  {visibleError('season') && <p className="field__error" role="alert">{visibleError('season')}</p>}
                </div>
              )}
              {validityMode === 'dates' && (
                <>
                  <div className="plm-grid-2">
                    <Field label="Du">
                      <Input type="date" aria-label="Début de validité" value={draft.validFrom} onChange={(validFrom) => set({ validFrom }, 'dates')} />
                    </Field>
                    <Field label="Au">
                      <Input type="date" aria-label="Fin de validité" value={draft.validTo} onChange={(validTo) => set({ validTo }, 'dates')} />
                    </Field>
                  </div>
                  {visibleError('dates') && <p className="field__error" role="alert">{visibleError('dates')}</p>}
                </>
              )}
            </FormSection>

            <Field label="Conditions">
              <Textarea
                aria-label="Conditions"
                rows={2}
                value={draft.conditions}
                placeholder="ex. Réservation 48 h à l’avance, sur présentation d’un justificatif…"
                onChange={(conditions) => set({ conditions })}
              />
            </Field>

            <Disclosure title="Plus d’options" summary={`Devise : ${draft.currency || 'EUR'}`}>
              <div className="plm-grid-2">
                <Field label="Devise">
                  <Select aria-label="Devise" value={draft.currency || 'EUR'} options={CURRENCY_OPTIONS} onChange={(currency) => set({ currency })} />
                </Field>
              </div>
            </Disclosure>
          </div>

          <aside className="plm__aside" aria-label="Aperçu">
            <h3 className="plm-aside__title">Grille tarifaire sur la fiche</h3>
            <ul className="plm-preview">
              {previewLines.map(({ price, current }, index) => {
                const row = describePriceLine(current ? draft : price, pricing);
                return (
                  <li key={`${price.recordId ?? 'new'}-${index}`} className={current ? 'is-current' : undefined} aria-current={current ? 'true' : undefined}>
                    <div className="plm-preview__text">
                      <span className="plm-preview__title">{row.title}</span>
                      {row.detail && <span className="plm-preview__detail">{row.detail}</span>}
                    </div>
                    <span className="plm-preview__amount">{row.amount}</span>
                  </li>
                );
              })}
            </ul>

            <h3 className="plm-aside__title">Avant d’enregistrer</h3>
            <ul className="plm-checks">
              {checks.map((check) => (
                <li key={check.label} className={`is-${check.state}`}>
                  {check.state === 'ok' ? <Check size={13} aria-hidden /> : check.state === 'error' ? <AlertCircle size={13} aria-hidden /> : <Circle size={13} aria-hidden />}
                  <span>{check.label}</span>
                  {check.note && <span className="plm-checks__note">{check.note}</span>}
                  <span className="sr-only">{check.state === 'ok' ? ' : complet' : check.state === 'error' ? ' : à corriger' : ' : à compléter'}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <footer className="plm__foot">
          <p className={`plm__status${errorCount > 0 && showAllErrors ? ' is-error' : ''}`} aria-live="polite">
            {errorCount === 0
              ? 'Prêt à appliquer au brouillon'
              : `${errorCount} point${errorCount > 1 ? 's' : ''} à ${showAllErrors ? 'corriger' : 'compléter'}`}
          </p>
          <div className="plm__actions">
            <button type="button" className="btn" onClick={onClose}>Annuler</button>
            <button type="button" className="btn primary" onClick={handleSave}>{mode === 'add' ? 'Ajouter' : 'Appliquer'}</button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
