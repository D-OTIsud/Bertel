import { useEffect, useState } from 'react';
import { EditorModal, Field, Input, Readout, ReferenceSelect, Select } from '../primitives';
import { SearchSelect } from '../../../components/ui/pickers/SearchSelect';
import { DocumentUploadField } from './DocumentUploadField';
import { getSupabaseClient } from '../../../lib/supabase';
import {
  CLASSIFICATION_STATUS_OPTIONS,
  availableValueOptions,
  isSchemeFullyUsed,
} from '../sections/classification-edit';
import type {
  ObjectWorkspaceDistinctionItem,
  ObjectWorkspaceDistinctionSchemeOption,
} from '../../../services/object-workspace-parser';

// Category labels for the collapsible référentiel picker (SearchSelect groups).
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
  /** Held rows — fully-used schemes are dropped from the add picker (single held / multi all-taken). */
  existingItems: ObjectWorkspaceDistinctionItem[];
  draft: ObjectWorkspaceDistinctionItem;
  /** Canonical object id — needed by the justificatif upload route. */
  objectId: string;
  onClose: () => void;
  onSave: (item: ObjectWorkspaceDistinctionItem) => void;
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
  objectId,
  onClose,
  onSave,
}: ClassificationEditModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  // The value already on the row when the modal opened — kept selectable while editing.
  const [originalValueCode] = useState(initialDraft.valueCode);
  const set = (patch: Partial<ObjectWorkspaceDistinctionItem>) => setDraft((current) => ({ ...current, ...patch }));

  // Resolve the Supabase access token so the justificatif upload can authenticate
  // against /api/document/upload (mirrors MediaEditModal). Null until resolved →
  // the upload field renders only once a token is available.
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    client.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
  }, []);

  const currentScheme = schemes.find((scheme) => scheme.code === draft.schemeCode) ?? null;
  const valueChoices = currentScheme ? availableValueOptions(currentScheme, existingItems, originalValueCode) : [];
  const hasValueChoice = (currentScheme?.valueOptions.length ?? 0) > 1;

  // Searchable + collapsible-by-category référentiel picker. Fully-used schemes
  // (single already held / multi all-taken) are dropped — only addable ones show.
  const referentialOptions = schemes
    .filter((scheme) => !isSchemeFullyUsed(scheme, existingItems))
    .map((scheme) => ({
      code: scheme.code,
      label: scheme.label,
      group: DISPLAY_GROUP_LABELS[scheme.displayGroup] ?? scheme.displayGroup,
    }));

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
          <SearchSelect
            aria-label="Référentiel"
            value={draft.schemeCode}
            options={referentialOptions}
            onChange={selectScheme}
            placeholder="— Choisir un référentiel —"
            searchPlaceholder="Rechercher un référentiel…"
          />
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

      {/* Justificatif (ref_document) — optional. Shows the attached document with a remove
          action, or the upload field once an access token is resolved. §71 C. */}
      {draft.documentUrl ? (
        <Field label="Justificatif">
          <div className="doc-attached">
            <a href={draft.documentUrl} target="_blank" rel="noopener noreferrer">
              {draft.documentTitle || 'Document joint'}
            </a>
            <button
              type="button"
              className="btn"
              onClick={() => set({ documentId: '', documentUrl: '', documentTitle: '' })}
            >
              Retirer
            </button>
          </div>
        </Field>
      ) : (
        accessToken && (
          <DocumentUploadField
            objectId={objectId}
            accessToken={accessToken}
            onUploaded={(document) =>
              set({ documentId: document.documentId, documentUrl: document.url, documentTitle: document.title })
            }
          />
        )
      )}
    </EditorModal>
  );
}
