'use client';

/**
 * « Équipements et moyens de paiement ».
 *
 * En tête, une liste COURTE et curée (`PORTAL_AMENITY_CODES`) : douze cases au plus, celles
 * qu'un visiteur cherche vraiment. Le reste du catalogue vit sous un « Voir tous les
 * équipements » replié — présent dans le document, donc coché/décoché normalement, mais
 * qui n'écrase pas l'écran d'un téléphone.
 *
 * `visibleOptionCodes` = TOUS les codes rendus, repliés compris. `setAmenities` réinjecte
 * ce qui n'y figure pas — au premier rang l'accessibilité, saisie par l'office et jamais
 * montrée ici : sans cette garde, une validation effacerait les équipements PMR.
 */
import { useEffect, useMemo } from 'react';
import { PortalChoice, PortalRubricActions, useRubricForm } from './rubric-kit';
import { setAmenities, setPayments } from '../portal-bindings';
import { PORTAL_AMENITY_CODES } from '../portal-rubrics';
import { filterEstablishmentAmenityGroups } from '../../../services/object-workspace';
import type { PortalRubricFormProps } from './types';
import type {
  ObjectWorkspaceAmenityGroup,
  ObjectWorkspaceAmenityOption,
  ObjectWorkspaceCharacteristicsModule,
} from '../../../services/object-workspace-parser';

interface AmenitiesForm {
  amenities: string[];
  payments: string[];
}

function toggle(list: string[], code: string, checked: boolean): string[] {
  return checked ? Array.from(new Set([...list, code])) : list.filter((entry) => entry !== code);
}

export function AmenitiesRubric({ archetype, editor, formKey, onDone, onCancel, onDirtyChange }: PortalRubricFormProps) {
  const characteristics = editor.draft.characteristics as ObjectWorkspaceCharacteristicsModule;

  const { curated, rest } = useMemo(() => {
    const groups: ObjectWorkspaceAmenityGroup[] = filterEstablishmentAmenityGroups(characteristics.amenityGroups ?? []);
    const wanted = PORTAL_AMENITY_CODES[archetype] ?? [];
    const byCode = new Map<string, ObjectWorkspaceAmenityOption>();
    for (const group of groups) for (const option of group.options) byCode.set(option.code, option);
    // Un code absent du catalogue chargé n'est simplement pas rendu — sans erreur, et
    // sans jamais entrer dans `visibleOptionCodes` (le décocher effacerait un vrai choix).
    const selected = wanted.map((code) => byCode.get(code)).filter((option): option is ObjectWorkspaceAmenityOption => Boolean(option));
    const curatedCodes = new Set(selected.map((option) => option.code));
    const remaining = groups
      .map((group) => ({ ...group, options: group.options.filter((option) => !curatedCodes.has(option.code)) }))
      .filter((group) => group.options.length > 0);
    return { curated: selected, rest: remaining };
  }, [characteristics.amenityGroups, archetype]);

  const visibleCodes = useMemo(
    () => new Set<string>([...curated.map((option) => option.code), ...rest.flatMap((group) => group.options.map((option) => option.code))]),
    [curated, rest],
  );

  const { form, setForm, dirty } = useRubricForm<AmenitiesForm>(formKey, () => ({
    amenities: (characteristics.selectedAmenityCodes ?? []).filter((code) => visibleCodes.has(code)),
    payments: [...(characteristics.selectedPaymentCodes ?? [])],
  }));

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    let next = setAmenities(characteristics, form.amenities, visibleCodes);
    next = setPayments(next, form.payments);
    editor.replaceModule('characteristics', next);
    onDone();
  }

  return (
    <form className="portal-form" onSubmit={handleSubmit} noValidate>
      <fieldset className="portal-fieldset">
        <legend>Ce que vous proposez</legend>
        {curated.length === 0 ? <p className="muted">Aucun équipement n’est proposé pour ce type de fiche.</p> : null}
        {curated.map((option) => (
          <PortalChoice
            key={option.code}
            type="checkbox"
            checked={form.amenities.includes(option.code)}
            onChange={(checked) => setForm((previous) => ({ ...previous, amenities: toggle(previous.amenities, option.code, checked) }))}
          >
            {option.label}
          </PortalChoice>
        ))}
      </fieldset>

      {rest.length > 0 ? (
        <details className="help-qa portal-disclosure">
          <summary className="help-qa__question">Voir tous les équipements</summary>
          <div className="help-qa__answer">
            {rest.map((group) => (
              <fieldset className="portal-fieldset" key={group.familyCode}>
                <legend>{group.familyLabel}</legend>
                {group.options.map((option) => (
                  <PortalChoice
                    key={option.code}
                    type="checkbox"
                    checked={form.amenities.includes(option.code)}
                    onChange={(checked) =>
                      setForm((previous) => ({ ...previous, amenities: toggle(previous.amenities, option.code, checked) }))
                    }
                  >
                    {option.label}
                  </PortalChoice>
                ))}
              </fieldset>
            ))}
          </div>
        </details>
      ) : null}

      <fieldset className="portal-fieldset">
        <legend>Moyens de paiement acceptés</legend>
        {(characteristics.paymentOptions ?? []).length === 0 ? (
          <p className="muted">Aucun moyen de paiement à proposer pour le moment.</p>
        ) : null}
        {(characteristics.paymentOptions ?? []).map((option) => (
          <PortalChoice
            key={option.code}
            type="checkbox"
            checked={form.payments.includes(option.code)}
            onChange={(checked) => setForm((previous) => ({ ...previous, payments: toggle(previous.payments, option.code, checked) }))}
          >
            {option.label}
          </PortalChoice>
        ))}
      </fieldset>

      <PortalRubricActions onCancel={onCancel} />
    </form>
  );
}
