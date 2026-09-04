'use client';

/**
 * « Vos horaires » — DEUX écrans dans la rubrique, jamais une grille 7 × 5 sur un téléphone.
 *
 *   1. « Quels jours êtes-vous ouvert ? » — sept cases et trois raccourcis.
 *   2. « À quelles heures ? » — un choix entre « les mêmes heures », « ça dépend du jour »
 *      et « sans horaires fixes ».
 *
 * « Sans horaires fixes » écrit la SENTINELLE `[{ start: '', end: '' }]`, jamais `slots: []`
 * qui se relit FERMÉ : c'est le cas de 26 % des tranches ouvertes en production. Tout ça vit
 * dans `portal-bindings` (`desiredSlots`) — l'écran n'a qu'à dire `fixedHours: false`.
 */
import { useEffect } from 'react';
import { PortalChoice, PortalRubricActions, useRubricForm } from './rubric-kit';
import { readWeekHours, setWeekHours, type WeekDayHours, type WeekHours } from '../portal-bindings';
import { OPENING_WEEKDAYS } from '../../object-editor/sections/opening-period-edit';
import type { PortalRubricFormProps } from './types';
import type { ObjectWorkspaceOpeningsModule, ObjectWorkspaceOpeningSlot } from '../../../services/object-workspace-parser';

type HoursMode = 'same' | 'per-day' | 'none';

interface HoursForm {
  step: 1 | 2;
  open: Record<string, boolean>;
  mode: HoursMode;
  /** Les créneaux appliqués à TOUS les jours ouverts en mode « les mêmes heures ». */
  same: ObjectWorkspaceOpeningSlot[];
  perDay: Record<string, ObjectWorkspaceOpeningSlot[]>;
  error: string | null;
}

const EMPTY_SLOT: ObjectWorkspaceOpeningSlot = { start: '', end: '' };
const RANGE_ERROR = 'Indiquez une heure de fin après l’heure de début.';

const SHORTCUTS: { label: string; codes: string[] }[] = [
  { label: 'Tous les jours', codes: OPENING_WEEKDAYS.map((day) => day.code) },
  { label: 'Du lundi au vendredi', codes: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
  { label: 'Le week-end', codes: ['saturday', 'sunday'] },
];

function filled(slots: readonly ObjectWorkspaceOpeningSlot[]): ObjectWorkspaceOpeningSlot[] {
  return slots.filter((slot) => slot.start.trim() && slot.end.trim());
}

function signature(slots: readonly ObjectWorkspaceOpeningSlot[]): string {
  return filled(slots)
    .map((slot) => `${slot.start}-${slot.end}`)
    .join('|');
}

function readForm(openings: ObjectWorkspaceOpeningsModule): HoursForm {
  const { hours } = readWeekHours(openings);
  const open: Record<string, boolean> = {};
  const perDay: Record<string, ObjectWorkspaceOpeningSlot[]> = {};
  for (const { code } of OPENING_WEEKDAYS) {
    const entry: WeekDayHours | undefined = hours[code];
    open[code] = Boolean(entry?.open);
    const slots = filled(entry?.slots ?? []);
    perDay[code] = slots.length > 0 ? slots : [EMPTY_SLOT];
  }

  const openCodes = OPENING_WEEKDAYS.map((day) => day.code).filter((code) => open[code]);
  const withHours = openCodes.filter((code) => signature(perDay[code]) !== '');
  const signatures = new Set(openCodes.map((code) => signature(perDay[code])));
  const mode: HoursMode =
    openCodes.length === 0 ? 'same' : withHours.length === 0 ? 'none' : signatures.size === 1 ? 'same' : 'per-day';
  const same = mode === 'same' && openCodes.length > 0 ? perDay[openCodes[0]] : [EMPTY_SLOT];

  return { step: 1, open, mode, same: same.length > 0 ? same : [EMPTY_SLOT], perDay, error: null };
}

/** Ce que l'écran annonce, traduit en `WeekHours`. Un jour ouvert n'obtient jamais
 *  `slots: []` — `desiredSlots` pose la sentinelle pour lui. */
function toWeekHours(form: HoursForm): WeekHours {
  const hours: WeekHours = {};
  for (const { code } of OPENING_WEEKDAYS) {
    const isOpen = Boolean(form.open[code]);
    const slots = form.mode === 'same' ? form.same : form.perDay[code] ?? [EMPTY_SLOT];
    hours[code] = {
      open: isOpen,
      fixedHours: form.mode !== 'none' && filled(slots).length > 0,
      slots: form.mode === 'none' ? [EMPTY_SLOT] : slots,
    };
  }
  return hours;
}

/** Un créneau à moitié saisi n'est pas une erreur (l'écran l'ignore) ; une fin avant le
 *  début en est une, et elle se dit sous le champ. */
function rangeError(form: HoursForm): string | null {
  const sources =
    form.mode === 'same'
      ? [form.same]
      : form.mode === 'per-day'
        ? OPENING_WEEKDAYS.filter((day) => form.open[day.code]).map((day) => form.perDay[day.code] ?? [])
        : [];
  for (const slots of sources) {
    for (const slot of slots) {
      if (slot.start.trim() && slot.end.trim() && slot.end <= slot.start) return RANGE_ERROR;
    }
  }
  return null;
}

// `rubric` n'est pas lu : la lecture seule (calendrier saisonnier, motif de tranche) est
// portée par `PortalRubricScreen`, qui remplace le formulaire par la phrase AVANT de le
// monter. Une seconde garde ici serait du code mort — et deux endroits à tenir.
export function HoursRubric({ editor, formKey, onDone, onCancel, onDirtyChange, formCache }: PortalRubricFormProps) {
  const openings = editor.draft.openings as ObjectWorkspaceOpeningsModule;
  const { form, setForm, dirty } = useRubricForm<HoursForm>(formKey, () => readForm(openings), formCache);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const openCodes = OPENING_WEEKDAYS.filter((day) => form.open[day.code]);

  function setSlot(list: ObjectWorkspaceOpeningSlot[], index: number, patch: Partial<ObjectWorkspaceOpeningSlot>) {
    return list.map((slot, position) => (position === index ? { ...slot, ...patch } : slot));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (form.step === 1) {
      setForm((previous) => ({ ...previous, step: 2 }));
      return;
    }
    const error = rangeError(form);
    if (error) {
      setForm((previous) => ({ ...previous, error }));
      return;
    }
    editor.replaceModule('openings', setWeekHours(openings, toWeekHours(form)));
    onDone();
  }

  return (
    <form className="portal-form" onSubmit={handleSubmit} noValidate>
      {form.step === 1 ? (
        <fieldset className="portal-fieldset">
          <legend>Quels jours êtes-vous ouvert ?</legend>
          <div className="portal-shortcuts">
            {SHORTCUTS.map((shortcut) => (
              <button
                key={shortcut.label}
                type="button"
                className="portal-pill"
                onClick={() =>
                  setForm((previous) => ({
                    ...previous,
                    open: Object.fromEntries(OPENING_WEEKDAYS.map((day) => [day.code, shortcut.codes.includes(day.code)])),
                  }))
                }
              >
                {shortcut.label}
              </button>
            ))}
          </div>
          {OPENING_WEEKDAYS.map((day) => (
            <PortalChoice
              key={day.code}
              type="checkbox"
              checked={Boolean(form.open[day.code])}
              onChange={(checked) => setForm((previous) => ({ ...previous, open: { ...previous.open, [day.code]: checked } }))}
            >
              {day.label}
            </PortalChoice>
          ))}
          <div className="portal-rubric-actions">
            <button type="submit" className="primary-button">
              Suivant
            </button>
            <button type="button" className="ghost-button" onClick={onCancel}>
              Retour sans changer
            </button>
          </div>
        </fieldset>
      ) : (
        <>
          <fieldset className="portal-fieldset">
            <legend>À quelles heures ?</legend>
            <PortalChoice
              type="radio"
              name="portal-hours-mode"
              checked={form.mode === 'same'}
              onChange={() => setForm((previous) => ({ ...previous, mode: 'same', error: null }))}
            >
              Les mêmes heures tous les jours ouverts
            </PortalChoice>
            <PortalChoice
              type="radio"
              name="portal-hours-mode"
              checked={form.mode === 'per-day'}
              onChange={() => setForm((previous) => ({ ...previous, mode: 'per-day', error: null }))}
            >
              Ça dépend du jour
            </PortalChoice>
            <PortalChoice
              type="radio"
              name="portal-hours-mode"
              checked={form.mode === 'none'}
              onChange={() => setForm((previous) => ({ ...previous, mode: 'none', error: null }))}
            >
              Sans horaires fixes (sur rendez-vous)
            </PortalChoice>
          </fieldset>

          {form.mode === 'same' ? (
            <div className="portal-week">
              {form.same.map((slot, index) => (
                <SlotPair
                  key={index}
                  idPrefix={`portal-same-${index}`}
                  context={form.same.length > 1 ? `, créneau ${index + 1}` : ''}
                  slot={slot}
                  onChange={(patch) => setForm((previous) => ({ ...previous, same: setSlot(previous.same, index, patch), error: null }))}
                />
              ))}
              {form.same.length < 2 ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setForm((previous) => ({ ...previous, same: [...previous.same, EMPTY_SLOT] }))}
                >
                  Ajouter une pause (fermeture le midi)
                </button>
              ) : null}
            </div>
          ) : null}

          {form.mode === 'per-day' ? (
            <div className="portal-week">
              {openCodes.map((day) => (
                <div className="portal-week__day" key={day.code}>
                  <p className="portal-week__name">{day.label}</p>
                  {(form.perDay[day.code] ?? [EMPTY_SLOT]).map((slot, index) => (
                    <SlotPair
                      key={index}
                      idPrefix={`portal-${day.code}-${index}`}
                      context={`, ${day.label}`}
                      slot={slot}
                      onChange={(patch) =>
                        setForm((previous) => ({
                          ...previous,
                          perDay: { ...previous.perDay, [day.code]: setSlot(previous.perDay[day.code] ?? [EMPTY_SLOT], index, patch) },
                          error: null,
                        }))
                      }
                    />
                  ))}
                </div>
              ))}
              {openCodes.length === 0 ? <p className="muted">Vous n’avez coché aucun jour d’ouverture.</p> : null}
            </div>
          ) : null}

          {form.error ? (
            <p className="field-error" role="alert">
              {form.error}
            </p>
          ) : null}

          <button type="button" className="ghost-button" onClick={() => setForm((previous) => ({ ...previous, step: 1 }))}>
            Revenir aux jours
          </button>
          <PortalRubricActions onCancel={onCancel} />
        </>
      )}
    </form>
  );
}

/**
 * Une paire d'heures. Le libellé VISIBLE reste « de » / « à » — c'est ce qui se lit le
 * mieux —, mais le nom ACCESSIBLE porte le contexte : sept paires « de »/« à » identiques
 * ne se distinguent pas au lecteur d'écran, qui annonce sept fois le même champ.
 */
function SlotPair({
  idPrefix,
  context,
  slot,
  onChange,
}: {
  idPrefix: string;
  context: string;
  slot: ObjectWorkspaceOpeningSlot;
  onChange: (patch: Partial<ObjectWorkspaceOpeningSlot>) => void;
}) {
  return (
    <div className="portal-slot">
      <label htmlFor={`${idPrefix}-start`}>
        de<span className="sr-only"> quelle heure{context}</span>
      </label>
      <input
        id={`${idPrefix}-start`}
        className="portal-input portal-input--time"
        type="time"
        value={slot.start}
        onChange={(event) => onChange({ start: event.target.value })}
      />
      <label htmlFor={`${idPrefix}-end`}>
        à<span className="sr-only"> quelle heure{context}</span>
      </label>
      <input
        id={`${idPrefix}-end`}
        className="portal-input portal-input--time"
        type="time"
        value={slot.end}
        onChange={(event) => onChange({ end: event.target.value })}
      />
    </div>
  );
}
