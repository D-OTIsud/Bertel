import { ChipMultiSelect, Field, Fs, Input, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import { ModuleUnavailableNotice, OwnedElsewhereNote } from './block-notes';

export function BlockASC({ editor, folded }: SectionProps) {
  const activity = editor.draft.activity;
  const pricing = editor.draft.pricing;
  const relationships = editor.draft.relationships;
  const characteristics = editor.draft.characteristics;
  const formulaCount = pricing.prices.length;

  function patch(patchValue: Partial<typeof activity>) {
    editor.patchModule('activity', patchValue);
  }

  return (
    <Fs
      num="06"
      title="Fiche activité & encadrement"
      sub="Durée, participants, âge, niveau, encadrement et équipements de l'activité"
      folded={folded}
      pill={
        activity.unavailableReason
          ? { tone: 'warn', label: 'Non applicable' }
          : {
              tone: activity.guideRequired ? 'ok' : 'warn',
              label: formulaCount > 0 ? `${formulaCount} formule(s)` : activity.guideRequired ? 'Encadrée' : 'Libre',
            }
      }
    >
      {/* §46 type-gated activity module — notice INSTEAD of controls when gated.
          The notice renders only here; the other activity sites below are suppressed. */}
      {activity.unavailableReason ? (
        <ModuleUnavailableNotice reason={activity.unavailableReason} />
      ) : (
        <>
          <div className="chip-group__label" style={{ marginTop: 0 }}>
            Caractéristiques métier
          </div>
          <div className="grid-4" style={{ marginBottom: 10 }}>
            <Field label="Durée minimale" hint="Durée minimale de la séance">
              <Input value={activity.durationMin} mono suffix="min" onChange={(durationMin) => patch({ durationMin })} />
            </Field>
            <Field label="Participants min.">
              <Input value={activity.minParticipants} mono suffix="pers." onChange={(minParticipants) => patch({ minParticipants })} />
            </Field>
            <Field label="Participants max.">
              <Input value={activity.maxParticipants} mono suffix="pers." onChange={(maxParticipants) => patch({ maxParticipants })} />
            </Field>
            <Field label="Âge minimum">
              <Input value={activity.minAge} mono suffix="ans" onChange={(minAge) => patch({ minAge })} />
            </Field>
          </div>
          {/* 6.2 : un seul contrôle par champ. `equipmentProvided` (string) est édité
              ICI uniquement en texte libre (vide = non fourni) — fin du clobber
              toggle-sentinelle ↔ input-détail. `difficultyLevel` remonté ici aussi. */}
          <div className="grid-3" style={{ marginBottom: 14 }}>
            <Toggle
              label="Encadrement obligatoire"
              sub="Guide ou encadrant requis"
              on={activity.guideRequired}
              onChange={(guideRequired) => patch({ guideRequired })}
            />
            <Field label="Difficulté">
              <Input value={activity.difficultyLevel} placeholder="Débutant → Expert" onChange={(difficultyLevel) => patch({ difficultyLevel })} />
            </Field>
            <Field label="Équipement fourni" hint="Vide = non fourni ; sinon précisez le matériel">
              <Input value={activity.equipmentProvided} placeholder="ex. casque, baudrier fournis" onChange={(equipmentProvided) => patch({ equipmentProvided })} />
            </Field>
          </div>
        </>
      )}

      {/* characteristics module — not type-gated; keep outside any activity.unavailableReason wrap (§46/§48) */}
      <div className="chip-group__label" style={{ marginTop: 14 }}>
        Prestations & équipements
      </div>
      <ChipMultiSelect
        options={characteristics.amenityGroups.flatMap((group) => group.options)}
        selected={characteristics.selectedAmenityCodes}
        modalTitle="Choisir les prestations & équipements"
        searchPlaceholder="Rechercher un équipement…"
        onChange={(codes) =>
          editor.replaceModule('characteristics', { ...characteristics, selectedAmenityCodes: codes })
        }
      />

      {relationships.actors.length > 0 && (
        <>
          <div className="chip-group__label" style={{ marginTop: 14 }}>
            Opérateur & encadrants
          </div>
          <div className="repeater" style={{ marginBottom: 8 }}>
            {relationships.actors.map((actor) => (
              <div
                key={actor.id}
                className="rep-row"
                style={{ gridTemplateColumns: '14px 110px 1.4fr 1fr 90px auto', alignItems: 'center' }}
              >
                <span className="rep-row__handle" aria-hidden />
                <span className="pill-mini">{actor.roleLabel || actor.roleCode}</span>
                <Input value={actor.displayName} readOnly onChange={() => undefined} />
                <Input value={actor.id} mono readOnly onChange={() => undefined} />
                <span className="pill-mini">{actor.isPrimary ? 'Principal' : '—'}</span>
                <span className="pill-mini" style={{ color: 'var(--ink-4)' }}>
                  § Rattachements
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* §48 single-owner: pricing formulas are edited in §13 only (last-edit-wins trap otherwise) */}
      <OwnedElsewhereNote num="13" label="Tarifs & extras" summary={`${formulaCount} formule(s)`} />

      {/* 6.2 : les anciens « sites secondaires » (grid-3 du bas + écho ChipSet) qui
          ré-écrivaient durationMin / equipmentProvided / difficultyLevel ont été
          retirés — ces champs ont désormais un contrôle unique dans le bloc primaire. */}
    </Fs>
  );
}
