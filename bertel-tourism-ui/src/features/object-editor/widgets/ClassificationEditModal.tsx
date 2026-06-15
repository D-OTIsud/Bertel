import { useState } from 'react';
import { EditorModal, Field, Input, Readout, ReferenceSelect, Select } from '../primitives';
import {
  CLASSIFICATION_STATUS_OPTIONS,
  availableValueOptions,
  isSchemeFullyUsed,
} from '../sections/classification-edit';
import type {
  ObjectWorkspaceDistinctionItem,
  ObjectWorkspaceDistinctionSchemeOption,
} from '../../../services/object-workspace-parser';

const DISPLAY_GROUP_ORDER = ['official_classification', 'quality_label'];
const DISPLAY_GROUP_LABELS: Record<string, string> = {
  official_classification: 'Classements officiels',
  quality_label: 'Labels qualité',
  '': 'Autres',
};

interface ClassificationEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  /** §08 schemes only (caller filters out accessibility — that lives in §10). */
  schemes: ObjectWorkspaceDistinctionSchemeOption[];
  /** Held rows — drives add-picker disabling (single scheme held / multi value taken). */
  existingItems: ObjectWorkspaceDistinctionItem[];
  draft: ObjectWorkspaceDistinctionItem;
  onClose: () => void;
  onSave: (item: ObjectWorkspaceDistinctionItem) => void;
}

interface SchemeGroup {
  group: string;
  label: string;
  schemes: ObjectWorkspaceDistinctionSchemeOption[];
}

function groupSchemes(schemes: ObjectWorkspaceDistinctionSchemeOption[]): SchemeGroup[] {
  const order = [...DISPLAY_GROUP_ORDER];
  for (const scheme of schemes) {
    if (!order.includes(scheme.displayGroup)) {
      order.push(scheme.displayGroup);
    }
  }
  return order
    .map((group) => ({
      group,
      label: DISPLAY_GROUP_LABELS[group] ?? group,
      schemes: schemes.filter((scheme) => scheme.displayGroup === group),
    }))
    .filter((entry) => entry.schemes.length > 0);
}

/**
 * Focused add/edit modal for one §08 classification/label row. Adaptive value control:
 * a star scheme picks a level; a single-value "accordé" label resolves the value
 * automatically and shows it read-only; a multi-value label picks one activity per row.
 */
export function ClassificationEditModal({
  open,
  mode,
  schemes,
  existingItems,
  draft: initialDraft,
  onClose,
  onSave,
}: ClassificationEditModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  // The value already on the row when the modal opened — kept selectable while editing.
  const [originalValueCode] = useState(initialDraft.valueCode);
  const set = (patch: Partial<ObjectWorkspaceDistinctionItem>) => setDraft((current) => ({ ...current, ...patch }));

  const currentScheme = schemes.find((scheme) => scheme.code === draft.schemeCode) ?? null;
  const valueChoices = currentScheme ? availableValueOptions(currentScheme, existingItems, originalValueCode) : [];
  const hasValueChoice = (currentScheme?.valueOptions.length ?? 0) > 1;

  function selectScheme(code: string) {
    const scheme = schemes.find((candidate) => candidate.code === code);
    if (!scheme) {
      set({ schemeId: '', schemeCode: '', schemeLabel: '', valueId: '', valueCode: '', valueLabel: '' });
      return;
    }
    // Auto-resolve the first still-available value so save is enabled immediately;
    // for single-value labels this is the only ("accordé") value.
    const firstValue = availableValueOptions(scheme, existingItems, '')[0] ?? scheme.valueOptions[0] ?? null;
    set({
      schemeId: scheme.id,
      schemeCode: scheme.code,
      schemeLabel: scheme.label,
      valueId: firstValue?.id ?? '',
      valueCode: firstValue?.code ?? '',
      valueLabel: firstValue?.label ?? '',
    });
  }

  // A granted label must carry an acquisition date; "en cours/demande" (not yet
  // obtained) and the validity date stay optional. See decision log §70.
  const awardedRequired = draft.status === 'granted';
  const saveDisabled = !draft.schemeCode || !draft.valueCode || (awardedRequired && !draft.awardedAt);

  return (
    <EditorModal
      open={open}
      title={mode === 'edit' ? 'Modifier la classification' : 'Ajouter une classification'}
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={saveDisabled}
    >
      <Field label="Référentiel">
        {mode === 'edit' ? (
          <Readout value={draft.schemeLabel} />
        ) : (
          <select
            className="select"
            aria-label="Référentiel"
            value={draft.schemeCode}
            onChange={(event) => selectScheme(event.target.value)}
          >
            <option value="" disabled>
              — Choisir un référentiel —
            </option>
            {groupSchemes(schemes).map((entry) => (
              <optgroup key={entry.group} label={entry.label}>
                {entry.schemes.map((scheme) => (
                  <option key={scheme.code} value={scheme.code} disabled={isSchemeFullyUsed(scheme, existingItems)}>
                    {scheme.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </Field>

      {currentScheme && (
        <Field label="Valeur attribuée">
          {hasValueChoice ? (
            <ReferenceSelect
              aria-label="Valeur attribuée"
              value={draft.valueCode}
              options={valueChoices}
              onChange={(code, option) =>
                set({ valueId: option?.id ?? '', valueCode: code, valueLabel: option?.label ?? '' })
              }
            />
          ) : (
            <Readout value={draft.valueLabel || currentScheme.valueOptions[0]?.label || 'Marque accordée'} />
          )}
        </Field>
      )}

      <Field label="Statut">
        <Select
          aria-label="Statut"
          value={draft.status || 'granted'}
          options={CLASSIFICATION_STATUS_OPTIONS.map((option) => ({ v: option.v, l: option.l }))}
          onChange={(status) => set({ status })}
        />
      </Field>

      <Field label="Acquis le" required={awardedRequired}>
        <Input type="date" aria-label="Acquis le" value={draft.awardedAt} onChange={(awardedAt) => set({ awardedAt })} />
      </Field>
      <Field label="Valable jusqu'au">
        <Input
          type="date"
          aria-label="Valable jusqu'au"
          value={draft.validUntil}
          onChange={(validUntil) => set({ validUntil })}
        />
      </Field>
    </EditorModal>
  );
}
