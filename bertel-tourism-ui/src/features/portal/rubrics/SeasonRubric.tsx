'use client';

/**
 * « Ouverture, arrivée et départ » — pour les hébergements.
 *
 * Un gîte n'a pas d'heures d'ouverture, il a une SAISON et des fermetures. Le modèle
 * dessous reste `openings` (mêmes périodes, même writer de l'office) : c'est la question
 * posée qui change.
 *
 * « Ouvert toute l'année ? » est un TRI-ÉTAT en lecture (`null` = pas encore répondu) mais
 * l'écran ne propose que deux réponses : on n'invite pas quelqu'un à « ne pas répondre » à
 * la seule question qui décide si sa fiche s'affiche en basse saison.
 */
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { PortalChoice, PortalField, PortalRubricActions, useRubricForm } from './rubric-kit';
import { readStayOpening, setStayClosures, setStayOpening, setStayPolicy, type StayClosure, type StayOpening } from '../portal-bindings';
import { savePortalStayTimes, type PortalStayTimes } from '../../../services/portal';
import { isClockTime } from '../../../lib/clock-time';
import { strictErrorMessage } from '../../../lib/strict-error-message';
import type { PortalRubricFormProps } from './types';
import type { ObjectWorkspaceOpeningsModule } from '../../../services/object-workspace-parser';

interface SeasonForm {
  opening: StayOpening;
  closures: StayClosure[];
  error: string | null;
  times?: PortalStayTimes;
  showUntil?: boolean;
}

const RANGE_ERROR = 'Indiquez une date de fin après la date de début.';

function badRange(start: string, end: string): boolean {
  return Boolean(start && end && end < start);
}

// Une période complexe reste gérée par l’office ; ses heures de séjour sont indépendantes.
export function SeasonRubric({ rubric, archetype, editor, formKey, onDone, onCancel, onDirtyChange, formCache, onBusyChange }: PortalRubricFormProps) {
  const openings = editor.draft.openings as ObjectWorkspaceOpeningsModule;
  const stay = editor.draft.capacityPolicies.stayPolicy;
  const initialTimes = { checkInFrom: (stay?.checkInFrom ?? '').slice(0, 5), checkInUntil: (stay?.checkInUntil ?? '').slice(0, 5), checkOutUntil: (stay?.checkOutUntil ?? '').slice(0, 5) };
  const canEditTimes = archetype === 'HEB' && rubric.editableRelatedModules?.includes('capacity-policies');
  const openingReadOnly = Boolean(rubric.readOnlyReason || rubric.state === 'unavailable');
  const [busy, setBusy] = useState(false);
  const { form, setForm, dirty } = useRubricForm<SeasonForm>(formKey, () => {
    const read = readStayOpening(openings);
    return { opening: read.opening, closures: read.closures, error: null, times: initialTimes, showUntil: !!initialTimes.checkInUntil };
  }, formCache);
  const times = form.times ?? initialTimes;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const broken =
      !openingReadOnly && (badRange(form.opening.startDate, form.opening.endDate) ||
      form.closures.some((closure) => badRange(closure.startDate, closure.endDate)));
    if (broken) {
      setForm((previous) => ({ ...previous, error: RANGE_ERROR }));
      return;
    }
    if (canEditTimes && !Object.values(times).every(isClockTime)) {
      setForm((previous) => ({ ...previous, error: 'Saisissez une heure valide entre 00:00 et 23:59.' })); return;
    }
    const read = readStayOpening(openings);
    const openingChanged = !openingReadOnly && JSON.stringify([form.opening, form.closures]) !== JSON.stringify([read.opening, read.closures]);
    try {
      let next = openings;
      if (openingChanged) next = setStayClosures(setStayOpening(openings, form.opening), form.closures);
      if (canEditTimes && JSON.stringify(times) !== JSON.stringify(initialTimes)) {
        setBusy(true);
        const saved = await savePortalStayTimes(editor.objectId, times);
        editor.mergeSavedModule('capacityPolicies', (current) => setStayPolicy(current, saved));
      }
      if (openingChanged) editor.replaceModule('openings', next);
      onDone();
    } catch (error) {
      setForm((previous) => ({ ...previous, error: strictErrorMessage(error, 'Les heures n’ont pas pu être enregistrées. Votre saisie est conservée.') }));
    } finally { setBusy(false); }
  }

  return (
    <form className="portal-form" onSubmit={handleSubmit} noValidate>
      {openingReadOnly ? <p className="notice">{rubric.readOnlyReason}</p> : null}
      <fieldset className="portal-fieldset" disabled={openingReadOnly || busy}>
      <fieldset className="portal-fieldset">
        <legend>Ouvrez-vous toute l’année ?</legend>
        <PortalChoice
          type="radio"
          name="portal-all-year"
          checked={form.opening.openAllYear === true}
          onChange={() =>
            setForm((previous) => ({
              ...previous,
              opening: { ...previous.opening, openAllYear: true },
              error: null,
            }))
          }
        >
          Oui, toute l’année
        </PortalChoice>
        <PortalChoice
          type="radio"
          name="portal-all-year"
          checked={form.opening.openAllYear === false}
          onChange={() =>
            setForm((previous) => ({
              ...previous,
              opening: { ...previous.opening, openAllYear: false },
              error: null,
            }))
          }
        >
          Non, sur une partie de l’année
        </PortalChoice>
      </fieldset>

      {form.opening.openAllYear === false ? (
        <div className="portal-dates">
          <PortalField id="portal-season-start" label="Ouvert à partir du">
            {(slots) => (
              <input
                {...slots}
                type="date"
                value={form.opening.startDate}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    opening: { ...previous.opening, startDate: event.target.value },
                    error: null,
                  }))
                }
              />
            )}
          </PortalField>
          <PortalField id="portal-season-end" label="Jusqu’au">
            {(slots) => (
              <input
                {...slots}
                type="date"
                value={form.opening.endDate}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    opening: { ...previous.opening, endDate: event.target.value },
                    error: null,
                  }))
                }
              />
            )}
          </PortalField>
        </div>
      ) : null}

      <fieldset className="portal-fieldset">
        <legend>Vos fermetures (facultatif)</legend>
        <p className="auth-field__hint">Par exemple : les congés, ou des travaux.</p>
        {form.closures.map((closure, index) => (
          <div className="portal-closure" key={closure.key}>
            <PortalField id={`portal-closure-start-${index}`} label="Fermé à partir du">
              {(slots) => (
                <input
                  {...slots}
                  type="date"
                  value={closure.startDate}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      closures: previous.closures.map((entry, position) =>
                        position === index ? { ...entry, startDate: event.target.value } : entry,
                      ),
                      error: null,
                    }))
                  }
                />
              )}
            </PortalField>
            <PortalField id={`portal-closure-end-${index}`} label="Jusqu’au">
              {(slots) => (
                <input
                  {...slots}
                  type="date"
                  value={closure.endDate}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      closures: previous.closures.map((entry, position) =>
                        position === index ? { ...entry, endDate: event.target.value } : entry,
                      ),
                      error: null,
                    }))
                  }
                />
              )}
            </PortalField>
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                setForm((previous) => ({
                  ...previous,
                  closures: previous.closures.filter((_, position) => position !== index),
                }))
              }
            >
              <Trash2 size={16} aria-hidden /> Retirer cette fermeture
            </button>
          </div>
        ))}
        <button
          type="button"
          className="ghost-button"
          onClick={() =>
            setForm((previous) => ({
              ...previous,
              closures: [
                ...previous.closures,
                { key: `nouvelle-${previous.closures.length}-${Date.now()}`, startDate: '', endDate: '', label: 'Fermeture' },
              ],
            }))
          }
        >
          Ajouter une fermeture
        </button>
      </fieldset>

      </fieldset>
      {canEditTimes ? <fieldset className="portal-fieldset" disabled={busy}>
        <legend>Arrivée et départ</legend>
        <p className="notice">Ces heures sont enregistrées directement quand vous validez. L’office n’a pas besoin de les relire.</p>
        <div className="portal-dates">
          <PortalField id="portal-checkin" label="Arrivée à partir de">{(slots) => <input {...slots} type="time" step={60} value={times.checkInFrom} onChange={(event) => setForm((previous) => ({ ...previous, times: { ...(previous.times ?? initialTimes), checkInFrom: event.target.value }, error: null }))} />}</PortalField>
          <PortalField id="portal-checkout" label="Départ jusqu’à">{(slots) => <input {...slots} type="time" step={60} value={times.checkOutUntil} onChange={(event) => setForm((previous) => ({ ...previous, times: { ...(previous.times ?? initialTimes), checkOutUntil: event.target.value }, error: null }))} />}</PortalField>
        </div>
        <PortalChoice type="checkbox" checked={form.showUntil ?? !!times.checkInUntil} onChange={(checked) => setForm((previous) => ({ ...previous, showUntil: checked, times: { ...(previous.times ?? initialTimes), checkInUntil: checked ? times.checkInUntil : '' }, error: null }))}>Préciser une heure limite d’arrivée</PortalChoice>
        {(form.showUntil ?? !!times.checkInUntil) ? <PortalField id="portal-checkin-until" label="Arrivée jusqu’à">{(slots) => <input {...slots} type="time" step={60} value={times.checkInUntil} onChange={(event) => setForm((previous) => ({ ...previous, times: { ...(previous.times ?? initialTimes), checkInUntil: event.target.value }, error: null }))} />}</PortalField> : null}
      </fieldset> : null}
      {form.error ? (
        <p className="field-error" role="alert">
          {form.error}
        </p>
      ) : null}

      <PortalRubricActions onCancel={onCancel} busy={busy} note={canEditTimes ? 'Les heures sont enregistrées directement. Les périodes et fermetures restent à envoyer à l’office depuis la page de la fiche.' : undefined} />
    </form>
  );
}
