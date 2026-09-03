'use client';

/**
 * « Vos tarifs » — le TARIF D'APPEL, et lui seul.
 *
 * Une fiche porte souvent des lignes que le portail ne montre pas (enfant, options, menus,
 * remises). Elles restent affichées en lecture, en toutes lettres, pour que le partenaire
 * comprenne qu'il ne les efface pas — et `setStartingPrice` ne touche effectivement que la
 * ligne principale.
 */
import { useEffect } from 'react';
import { PortalChoice, PortalField, PortalRubricActions, useRubricForm } from './rubric-kit';
import { readStartingPrice, setStartingPrice, type StartingPriceInput } from '../portal-bindings';
import { PORTAL_PRICE_UNIT } from '../portal-rubrics';
import { formatPriceAmount, summarizePricingLine, validatePricingDraft } from '../../object-editor/sections/pricing-row';
import type { PortalRubricFormProps } from './types';
import type { ObjectWorkspacePricingModule } from '../../../services/object-workspace-parser';

interface PricingForm extends StartingPriceInput {
  error: string | null;
}

/** Le suffixe lisible, en français courant. « Par couvert » est du vocabulaire métier :
 *  le visiteur — et le partenaire — lisent « par personne ». */
const UNIT_LABEL: Record<string, string> = {
  par_nuit: '€ par nuit',
  par_personne: '€ par personne',
  par_sejour: '€ par séjour',
};

export function PricingRubric({ archetype, editor, formKey, onDone, onCancel, onDirtyChange }: PortalRubricFormProps) {
  const pricing = editor.draft.pricing as ObjectWorkspacePricingModule;
  const unitCode = PORTAL_PRICE_UNIT[archetype] ?? '';
  const suffix = UNIT_LABEL[unitCode] ?? '€';
  const offersFree = archetype === 'VIS' || archetype === 'ASC';

  const { form, setForm, dirty } = useRubricForm<PricingForm>(formKey, () => {
    const read = readStartingPrice(pricing);
    return { ...read, unitCode: read.unitCode || unitCode, error: null };
  });

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const others = (pricing.prices ?? []).filter((price) => price.indicationCode !== 'principal');

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next = setStartingPrice(pricing, {
      free: form.free,
      amount: form.amount,
      amountMax: form.amountMax,
      unitCode: form.unitCode,
    });
    const main = next.prices.find((price) => price.indicationCode === 'principal');
    if (main) {
      const check = validatePricingDraft(main);
      if (!check.canSave) {
        setForm((previous) => ({ ...previous, error: check.error ?? 'Vérifiez le montant indiqué.' }));
        return;
      }
    }
    editor.replaceModule('pricing', next);
    onDone();
  }

  return (
    <form className="portal-form" onSubmit={handleSubmit} noValidate>
      {offersFree ? (
        <fieldset className="portal-fieldset">
          <legend>L’accès est-il payant ?</legend>
          <PortalChoice
            type="checkbox"
            checked={form.free}
            onChange={(checked) => setForm((previous) => ({ ...previous, free: checked, error: null }))}
          >
            L’accès est gratuit
          </PortalChoice>
        </fieldset>
      ) : null}

      {form.free ? null : (
        <>
          <PortalField id="portal-price-min" label="À partir de" error={form.error}>
            {(slots) => (
              <span className="portal-suffixed">
                <input
                  {...slots}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm((previous) => ({ ...previous, amount: event.target.value, error: null }))}
                />
                <span aria-hidden>{suffix}</span>
              </span>
            )}
          </PortalField>

          <PortalField id="portal-price-max" label="Jusqu’à (facultatif)">
            {(slots) => (
              <span className="portal-suffixed">
                <input
                  {...slots}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.amountMax}
                  onChange={(event) => setForm((previous) => ({ ...previous, amountMax: event.target.value, error: null }))}
                />
                <span aria-hidden>{suffix}</span>
              </span>
            )}
          </PortalField>
        </>
      )}

      {others.length > 0 ? (
        <section className="portal-readonly-list">
          <h2>Autres tarifs déjà enregistrés par l’office</h2>
          <ul>
            {others.map((price, index) => (
              <li key={price.recordId ?? `price-${index}`}>
                <span>{price.kindLabel || price.kindCode}</span>{' '}
                <span className="muted">
                  {[formatPriceAmount(price), summarizePricingLine(price)].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted">Vous ne pouvez pas les modifier ici. Contactez l’office si l’un d’eux a changé.</p>
        </section>
      ) : null}

      <PortalRubricActions onCancel={onCancel} />
    </form>
  );
}
