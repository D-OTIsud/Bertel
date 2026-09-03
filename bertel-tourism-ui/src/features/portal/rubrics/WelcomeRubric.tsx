'use client';

/**
 * « Capacité et animaux ».
 *
 * Les animaux sont un TRI-ÉTAT et l'écran le dit en toutes lettres : « Je préfère ne pas
 * l'indiquer ». Publier « animaux non acceptés » par défaut coûterait des réservations à
 * un partenaire qui n'a simplement rien répondu — `false` n'est jamais un défaut.
 */
import { useEffect } from 'react';
import { PortalChoice, PortalField, PortalRubricActions, useRubricForm } from './rubric-kit';
import { readHeadlineCapacity, setHeadlineCapacity, setPetPolicy, setStayPolicy } from '../portal-bindings';
import { PORTAL_HEADLINE_METRIC } from '../portal-rubrics';
import type { PortalRubricFormProps } from './types';
import type { ObjectWorkspaceCapacityPoliciesModule } from '../../../services/object-workspace-parser';

interface WelcomeForm {
  capacity: string;
  pets: 'yes' | 'no' | 'unset';
  petConditions: string;
  checkInFrom: string;
  checkOutUntil: string;
  writeError: string | null;
}

export function WelcomeRubric({ archetype, editor, formKey, onDone, onCancel, onDirtyChange }: PortalRubricFormProps) {
  const capacity = editor.draft.capacityPolicies as ObjectWorkspaceCapacityPoliciesModule;
  const metric = PORTAL_HEADLINE_METRIC[archetype] ?? 'max_capacity';
  const isStay = archetype === 'HEB';

  const { form, setForm, dirty } = useRubricForm<WelcomeForm>(formKey, () => ({
    capacity: readHeadlineCapacity(capacity, metric),
    pets: capacity.petPolicy?.accepted === true ? 'yes' : capacity.petPolicy?.accepted === false ? 'no' : 'unset',
    petConditions: capacity.petPolicy?.conditions ?? '',
    checkInFrom: capacity.stayPolicy?.checkInFrom ?? '',
    checkOutUntil: capacity.stayPolicy?.checkOutUntil ?? '',
    writeError: null,
  }));

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      let next = setHeadlineCapacity(capacity, metric, form.capacity);
      next = setPetPolicy(next, form.pets === 'yes' ? true : form.pets === 'no' ? false : null, form.petConditions);
      if (isStay) next = setStayPolicy(next, { checkInFrom: form.checkInFrom, checkOutUntil: form.checkOutUntil });
      // La CLÉ de module (`capacityPolicies`), pas l'id de module (`capacity-policies`) :
      // `replaceModule` indexe la tranche, pas le registre.
      editor.replaceModule('capacityPolicies', next);
    } catch {
      setForm((previous) => ({
        ...previous,
        writeError: 'Nous n’avons pas pu enregistrer la capacité. Contactez votre office de tourisme.',
      }));
      return;
    }
    onDone();
  }

  return (
    <form className="portal-form" onSubmit={handleSubmit} noValidate>
      <PortalField
        id="portal-capacity"
        label={isStay ? 'Combien de personnes pouvez-vous accueillir au maximum ?' : 'Combien de couverts au maximum ?'}
      >
        {(slots) => (
          <span className="portal-suffixed">
            <input
              {...slots}
              type="number"
              inputMode="numeric"
              min={0}
              value={form.capacity}
              onChange={(event) => setForm((previous) => ({ ...previous, capacity: event.target.value }))}
            />
            <span aria-hidden>{isStay ? 'personnes' : 'couverts'}</span>
          </span>
        )}
      </PortalField>

      <fieldset className="portal-fieldset">
        <legend>Acceptez-vous les animaux ?</legend>
        <PortalChoice
          type="radio"
          name="portal-pets"
          checked={form.pets === 'yes'}
          onChange={() => setForm((previous) => ({ ...previous, pets: 'yes' }))}
        >
          Oui
        </PortalChoice>
        <PortalChoice
          type="radio"
          name="portal-pets"
          checked={form.pets === 'no'}
          onChange={() => setForm((previous) => ({ ...previous, pets: 'no' }))}
        >
          Non
        </PortalChoice>
        <PortalChoice
          type="radio"
          name="portal-pets"
          checked={form.pets === 'unset'}
          onChange={() => setForm((previous) => ({ ...previous, pets: 'unset' }))}
        >
          Je préfère ne pas l’indiquer
        </PortalChoice>
      </fieldset>

      {form.pets === 'yes' ? (
        <PortalField id="portal-pet-conditions" label="Sous quelles conditions ? (facultatif)">
          {(slots) => (
            <input
              {...slots}
              type="text"
              value={form.petConditions}
              onChange={(event) => setForm((previous) => ({ ...previous, petConditions: event.target.value }))}
            />
          )}
        </PortalField>
      ) : null}

      {isStay ? (
        <div className="portal-dates">
          <PortalField id="portal-checkin" label="Arrivée à partir de">
            {(slots) => (
              <input
                {...slots}
                type="time"
                value={form.checkInFrom}
                onChange={(event) => setForm((previous) => ({ ...previous, checkInFrom: event.target.value }))}
              />
            )}
          </PortalField>
          <PortalField id="portal-checkout" label="Départ avant">
            {(slots) => (
              <input
                {...slots}
                type="time"
                value={form.checkOutUntil}
                onChange={(event) => setForm((previous) => ({ ...previous, checkOutUntil: event.target.value }))}
              />
            )}
          </PortalField>
        </div>
      ) : null}

      {form.writeError ? (
        <p className="field-error" role="alert">
          {form.writeError}
        </p>
      ) : null}

      <PortalRubricActions onCancel={onCancel} />
    </form>
  );
}
