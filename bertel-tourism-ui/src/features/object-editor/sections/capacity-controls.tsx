import { ChipMultiSelect, Field, Input, Select, Textarea, Toggle } from '../primitives';
import type {
  ObjectWorkspaceCapacityPoliciesModule,
  ObjectWorkspaceCharacteristicsModule,
} from '../../../services/object-workspace-parser';
import { ModuleUnavailableNotice } from './blocks/block-notes';

/**
 * « Cadre / environnement » — rendu partagé §06 (HEB) / §07 (autres types).
 * Catalogue large (~60 codes ref_environment_tag) ⇒ sélection par MODAL (recherche +
 * Sélectionnés/Disponibles). Source d'état unique : editor.draft.characteristics.
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
        <ChipMultiSelect
          options={characteristics.environmentOptions}
          selected={characteristics.selectedEnvironmentCodes}
          modalTitle="Choisir un cadre / environnement"
          searchPlaceholder="Rechercher un environnement…"
          onChange={(codes) => onChange({ ...characteristics, selectedEnvironmentCodes: codes })}
        />
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
