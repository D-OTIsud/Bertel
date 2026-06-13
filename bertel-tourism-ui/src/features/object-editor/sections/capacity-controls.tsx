import { Chip, ChipSet, Field, Input, Select, Textarea, Toggle } from '../primitives';
import type {
  ObjectWorkspaceCapacityPoliciesModule,
  ObjectWorkspaceCharacteristicsModule,
} from '../../../services/object-workspace-parser';
import { ModuleUnavailableNotice } from './blocks/block-notes';

function toggleCode(values: string[], code: string) {
  return values.includes(code) ? values.filter((value) => value !== code) : [...values, code];
}

/**
 * Chips « Cadre / environnement » — rendu partagé §06 (HEB) / §07 (autres types).
 * Source d'état unique : editor.draft.characteristics (aucune désynchro même si deux mounts).
 */
export function EnvironmentChips({
  characteristics,
  onChange,
}: {
  characteristics: ObjectWorkspaceCharacteristicsModule;
  onChange: (next: ObjectWorkspaceCharacteristicsModule) => void;
}) {
  return (
    <>
      <div className="chip-group__label" style={{ marginTop: 16 }}>
        Cadre / environnement
      </div>
      {characteristics.unavailableReason ? (
        <ModuleUnavailableNotice reason={characteristics.unavailableReason} />
      ) : (
        <ChipSet>
          {characteristics.environmentOptions.map((option) => (
            <Chip
              key={option.code}
              label={option.label}
              on={characteristics.selectedEnvironmentCodes.includes(option.code)}
              onClick={() =>
                onChange({
                  ...characteristics,
                  selectedEnvironmentCodes: toggleCode(characteristics.selectedEnvironmentCodes, option.code),
                })
              }
            />
          ))}
        </ChipSet>
      )}
    </>
  );
}

/** Groupes + Politique d'accueil (animaux, tri-état) — rendu partagé §06 / §07. */
export function AccueilPolicies({
  capacity,
  onChange,
}: {
  capacity: ObjectWorkspaceCapacityPoliciesModule;
  onChange: (next: ObjectWorkspaceCapacityPoliciesModule) => void;
}) {
  return (
    <>
      <div style={{ marginTop: 16 }}>
        <Field label="Groupes">
          <div className="grid-2">
            <Input
              value={capacity.groupPolicy.minSize}
              placeholder="Min"
              mono
              onChange={(minSize) => onChange({ ...capacity, groupPolicy: { ...capacity.groupPolicy, minSize } })}
            />
            <Input
              value={capacity.groupPolicy.maxSize}
              placeholder="Max"
              mono
              onChange={(maxSize) => onChange({ ...capacity, groupPolicy: { ...capacity.groupPolicy, maxSize } })}
            />
          </div>
          <Toggle
            label="Groupes uniquement"
            on={capacity.groupPolicy.groupOnly}
            onChange={(groupOnly) => onChange({ ...capacity, groupPolicy: { ...capacity.groupPolicy, groupOnly } })}
          />
          <Textarea
            value={capacity.groupPolicy.notes}
            rows={3}
            onChange={(notes) => onChange({ ...capacity, groupPolicy: { ...capacity.groupPolicy, notes } })}
          />
        </Field>
      </div>

      <div className="chip-group__label" style={{ marginTop: 16 }}>
        Politique d'accueil
      </div>
      <div className="grid-3">
        <div>
          <Field label="Animaux">
            <Select
              value={capacity.petPolicy.accepted === null ? '' : capacity.petPolicy.accepted ? 'accepted' : 'refused'}
              options={[
                { v: '', l: '— Non renseigné —' },
                { v: 'accepted', l: 'Acceptés' },
                { v: 'refused', l: 'Non acceptés' },
              ]}
              aria-label="Animaux"
              onChange={(next) =>
                onChange({
                  ...capacity,
                  petPolicy: { ...capacity.petPolicy, accepted: next === '' ? null : next === 'accepted' },
                })
              }
            />
          </Field>
          {capacity.petPolicy.accepted !== null && (
            <Field label="Conditions d'accueil des animaux">
              <Textarea
                aria-label="Conditions d'accueil des animaux"
                value={capacity.petPolicy.conditions}
                rows={3}
                onChange={(conditions) => onChange({ ...capacity, petPolicy: { ...capacity.petPolicy, conditions } })}
              />
            </Field>
          )}
        </div>
      </div>
    </>
  );
}
