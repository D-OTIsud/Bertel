'use client';

/**
 * « Votre activité » — durée, nombre de personnes, âge minimum.
 *
 * La durée est stockée en MINUTES ; l'écran laisse choisir « minutes » ou « heures » parce
 * qu'un prestataire de kayak pense « 3 heures », pas « 180 ». La conversion est faite ici,
 * une seule fois, à la validation.
 */
import { useEffect } from 'react';
import { PortalField, PortalRubricActions, useRubricForm } from './rubric-kit';
import { setActivityBasics } from '../portal-bindings';
import type { PortalRubricFormProps } from './types';
import type { ObjectWorkspaceActivityModule } from '../../../services/object-workspace-parser';

interface ActivityForm {
  duration: string;
  durationUnit: 'minutes' | 'hours';
  minParticipants: string;
  maxParticipants: string;
  minAge: string;
  error: string | null;
}

const PARTICIPANTS_ERROR = 'Le maximum doit être supérieur ou égal au minimum.';

/** 180 min se lit « 3 heures » ; 90 min reste en minutes (1,5 h serait une saisie fragile). */
function readDuration(minutes: string): { duration: string; durationUnit: 'minutes' | 'hours' } {
  const value = Number(String(minutes).trim());
  if (!Number.isFinite(value) || value <= 0) return { duration: String(minutes ?? '').trim(), durationUnit: 'minutes' };
  if (value % 60 === 0) return { duration: String(value / 60), durationUnit: 'hours' };
  return { duration: String(value), durationUnit: 'minutes' };
}

export function ActivityRubric({ editor, formKey, onDone, onCancel, onDirtyChange, formCache }: PortalRubricFormProps) {
  const activity = editor.draft.activity as ObjectWorkspaceActivityModule;
  const { form, setForm, dirty } = useRubricForm<ActivityForm>(formKey, () => ({
    ...readDuration(activity.durationMin ?? ''),
    minParticipants: activity.minParticipants ?? '',
    maxParticipants: activity.maxParticipants ?? '',
    minAge: activity.minAge ?? '',
    error: null,
  }), formCache);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const min = Number(form.minParticipants.trim());
    const max = Number(form.maxParticipants.trim());
    if (form.minParticipants.trim() && form.maxParticipants.trim() && Number.isFinite(min) && Number.isFinite(max) && max < min) {
      setForm((previous) => ({ ...previous, error: PARTICIPANTS_ERROR }));
      return;
    }
    const raw = Number(form.duration.trim());
    const durationMin =
      form.duration.trim() && Number.isFinite(raw) ? String(form.durationUnit === 'hours' ? raw * 60 : raw) : '';
    editor.replaceModule(
      'activity',
      setActivityBasics(activity, {
        durationMin,
        minParticipants: form.minParticipants.trim(),
        maxParticipants: form.maxParticipants.trim(),
        minAge: form.minAge.trim(),
      }),
    );
    onDone();
  }

  return (
    <form className="portal-form" onSubmit={handleSubmit} noValidate>
      <PortalField id="portal-duration" label="Combien de temps dure votre activité ?">
        {(slots) => (
          <span className="portal-suffixed">
            <input
              {...slots}
              type="number"
              inputMode="numeric"
              min={0}
              value={form.duration}
              onChange={(event) => setForm((previous) => ({ ...previous, duration: event.target.value }))}
            />
            <select
              className="portal-input portal-input--unit"
              aria-label="Unité de la durée"
              value={form.durationUnit}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, durationUnit: event.target.value as 'minutes' | 'hours' }))
              }
            >
              <option value="minutes">minutes</option>
              <option value="hours">heures</option>
            </select>
          </span>
        )}
      </PortalField>

      <PortalField id="portal-min-participants" label="Nombre de personnes : minimum">
        {(slots) => (
          <input
            {...slots}
            type="number"
            inputMode="numeric"
            min={0}
            value={form.minParticipants}
            onChange={(event) => setForm((previous) => ({ ...previous, minParticipants: event.target.value, error: null }))}
          />
        )}
      </PortalField>

      <PortalField id="portal-max-participants" label="Nombre de personnes : maximum" error={form.error}>
        {(slots) => (
          <input
            {...slots}
            type="number"
            inputMode="numeric"
            min={0}
            value={form.maxParticipants}
            onChange={(event) => setForm((previous) => ({ ...previous, maxParticipants: event.target.value, error: null }))}
          />
        )}
      </PortalField>

      <PortalField id="portal-min-age" label="Âge minimum">
        {(slots) => (
          <span className="portal-suffixed">
            <input
              {...slots}
              type="number"
              inputMode="numeric"
              min={0}
              value={form.minAge}
              onChange={(event) => setForm((previous) => ({ ...previous, minAge: event.target.value }))}
            />
            <span aria-hidden>ans</span>
          </span>
        )}
      </PortalField>

      <PortalRubricActions onCancel={onCancel} />
    </form>
  );
}
