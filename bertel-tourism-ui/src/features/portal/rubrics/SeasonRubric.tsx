'use client';

/**
 * « Ouverture et fermetures » — le huitième écran, pour les hébergements.
 *
 * Un gîte n'a pas d'heures d'ouverture, il a une SAISON et des fermetures. Le modèle
 * dessous reste `openings` (mêmes périodes, même writer de l'office) : c'est la question
 * posée qui change.
 *
 * « Ouvert toute l'année ? » est un TRI-ÉTAT en lecture (`null` = pas encore répondu) mais
 * l'écran ne propose que deux réponses : on n'invite pas quelqu'un à « ne pas répondre » à
 * la seule question qui décide si sa fiche s'affiche en basse saison.
 */
import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { PortalChoice, PortalField, PortalRubricActions, useRubricForm } from './rubric-kit';
import { readStayOpening, setStayClosures, setStayOpening, type StayClosure, type StayOpening } from '../portal-bindings';
import type { PortalRubricFormProps } from './types';
import type { ObjectWorkspaceOpeningsModule } from '../../../services/object-workspace-parser';

interface SeasonForm {
  opening: StayOpening;
  closures: StayClosure[];
  error: string | null;
}

const RANGE_ERROR = 'Indiquez une date de fin après la date de début.';

function badRange(start: string, end: string): boolean {
  return Boolean(start && end && end < start);
}

export function SeasonRubric({ rubric, editor, formKey, onDone, onCancel, onDirtyChange }: PortalRubricFormProps) {
  const openings = editor.draft.openings as ObjectWorkspaceOpeningsModule;
  const { form, setForm, dirty } = useRubricForm<SeasonForm>(formKey, () => {
    const read = readStayOpening(openings);
    return { opening: read.opening, closures: read.closures, error: null };
  });

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const broken =
      badRange(form.opening.startDate, form.opening.endDate) ||
      form.closures.some((closure) => badRange(closure.startDate, closure.endDate));
    if (broken) {
      setForm((previous) => ({ ...previous, error: RANGE_ERROR }));
      return;
    }
    // Deux écritures CHAÎNÉES sur la même tranche : partir deux fois du brouillon ne
    // garderait que la seconde.
    let next = setStayOpening(openings, form.opening);
    next = setStayClosures(next, form.closures);
    editor.replaceModule('openings', next);
    onDone();
  }

  if (rubric.readOnlyReason) {
    return (
      <div className="portal-form">
        <p className="notice">{rubric.readOnlyReason}</p>
        <button type="button" className="ghost-button" onClick={onCancel}>
          Retour à la fiche
        </button>
      </div>
    );
  }

  return (
    <form className="portal-form" onSubmit={handleSubmit} noValidate>
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

      {form.error ? (
        <p className="field-error" role="alert">
          {form.error}
        </p>
      ) : null}

      <PortalRubricActions onCancel={onCancel} />
    </form>
  );
}
