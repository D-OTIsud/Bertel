import { Chip, ChipSet, Field, Fs, Input, Toggle } from '../../primitives';
import type { SectionProps } from '../section-types';
import { addPricingRow, removePricingRow, updatePricingRow } from '../pricing-row';

const FORMULA_COLS = '14px 1.4fr 70px 110px 110px 70px 80px auto';

function toggle(values: string[], code: string) {
  return values.includes(code) ? values.filter((value) => value !== code) : [...values, code];
}

function repHeader(columns: string, labels: string[]) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns,
        gap: 8,
        padding: '6px 12px',
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--ink-4)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

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
      num="05"
      title="Formules, public & saison"
      sub="Sous-type d'activité, sessions/forfaits, niveau, public cible, fenêtre saisonnière, conditions"
      folded={folded}
      pill={{
        tone: activity.guideRequired ? 'ok' : 'warn',
        label: formulaCount > 0 ? `${formulaCount} formule(s)` : activity.guideRequired ? 'Encadrée' : 'Libre',
      }}
    >
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
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <Toggle
          label="Encadrement obligatoire"
          sub="Guide ou encadrant requis"
          on={activity.guideRequired}
          onChange={(guideRequired) => patch({ guideRequired })}
        />
        <Toggle
          label="Équipement fourni"
          sub={activity.equipmentProvided || 'Matériel disponible sur place'}
          on={Boolean(activity.equipmentProvided)}
          onChange={() => patch({ equipmentProvided: activity.equipmentProvided ? '' : 'Fourni sur place' })}
        />
      </div>

      {/* characteristics module — not type-gated; keep outside any activity.unavailableReason wrap (§46/§48) */}
      <div className="chip-group__label" style={{ marginTop: 14 }}>
        Prestations & équipements
      </div>
      <ChipSet>
        {characteristics.amenityGroups.flatMap((group) => group.options).slice(0, 18).map((option) => (
          <Chip
            key={option.code}
            label={option.label}
            on={characteristics.selectedAmenityCodes.includes(option.code)}
            onClick={() =>
              editor.replaceModule('characteristics', {
                ...characteristics,
                selectedAmenityCodes: toggle(characteristics.selectedAmenityCodes, option.code),
              })
            }
          />
        ))}
      </ChipSet>

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

      <div className="chip-group__label" style={{ marginTop: 18 }}>
        Formules & sessions
      </div>
      {repHeader(FORMULA_COLS, ['', 'Nom de la formule', 'Montant', 'Unité', 'Conditions', 'Saison', ''])}
      <div className="repeater">
        {pricing.prices.map((price, index) => (
          <div key={`${price.recordId ?? 'price'}-${index}`} className="rep-row" style={{ gridTemplateColumns: FORMULA_COLS }}>
            <span className="rep-row__handle" aria-hidden />
            <Input
              value={price.kindLabel}
              onChange={(kindLabel) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { kindLabel }))}
            />
            <Input
              value={price.amount}
              mono
              suffix="€"
              onChange={(amount) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { amount }))}
            />
            <Input
              value={price.unitLabel || price.unitCode}
              onChange={(unitLabel) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { unitLabel }))}
            />
            <Input
              value={price.conditions}
              onChange={(conditions) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { conditions }))}
            />
            <Input
              value={price.seasonCode}
              placeholder="—"
              onChange={(seasonCode) => editor.replaceModule('pricing', updatePricingRow(pricing, index, { seasonCode }))}
            />
            <div className="rep-row__act">
              <button type="button" className="del" onClick={() => editor.replaceModule('pricing', removePricingRow(pricing, index))}>
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="rep-add" onClick={() => editor.replaceModule('pricing', addPricingRow(pricing))}>
        + Ajouter une formule
      </button>

      {activity.equipmentProvided && (
        <>
          <div className="chip-group__label" style={{ marginTop: 18 }}>
            Équipement & sécurité fournis
          </div>
          <ChipSet>
            <Chip label={activity.equipmentProvided} on />
          </ChipSet>
        </>
      )}

      <div className="grid-3" style={{ marginTop: 14 }}>
        <Field label="Difficulté">
          <Input value={activity.difficultyLevel} placeholder="Débutant → Expert" onChange={(difficultyLevel) => patch({ difficultyLevel })} />
        </Field>
        <Field label="Équipement fourni (détail)">
          <Input value={activity.equipmentProvided} onChange={(equipmentProvided) => patch({ equipmentProvided })} />
        </Field>
        <Field label="Durée affichée">
          <Input value={activity.durationMin} mono suffix="min" onChange={(durationMin) => patch({ durationMin })} />
        </Field>
      </div>
    </Fs>
  );
}
