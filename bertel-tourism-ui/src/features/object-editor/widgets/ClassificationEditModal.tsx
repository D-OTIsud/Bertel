import { useEffect, useState } from 'react';
import { EditorModal, Field, Input, Readout, Chip, ChipSet } from '../primitives';
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
import './catalog-modals.css';
import { EDITOR_SECTION_REFERENCES } from '../section-config';

// Category labels for the collapsible référentiel picker (SearchSelect groups).
const DISPLAY_GROUP_LABELS: Record<string, string> = {
  official_classification: 'Classements officiels',
  graded_label: 'Labels de réseau',
  quality_label: 'Labels qualité',
  sustainability_labels: 'Durabilité / environnement',
  accessibility_labels: 'Accessibilité',
  '': 'Autres',
};
const STATUS_LABELS: Record<string, string> = {
  granted: 'Accordé',
  requested: 'En cours',
  suspended: 'Retiré',
  expired: 'Expiré',
};

interface ClassificationEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  /** All distinction families for §08; disability-type coverage is edited in §09. */
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
  const set = (patch: Partial<ObjectWorkspaceDistinctionItem>) =>
    setDraft((current) => ({ ...current, ...patch }));

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
  const valueChoices = currentScheme
    ? availableValueOptions(currentScheme, existingItems, originalValueCode)
    : [];
  const hasValueChoice = (currentScheme?.valueOptions.length ?? 0) > 1;

  // Grouped choices follow the model. Already-held single labels stay out of the add choices.
  const referentialOptions = schemes
    .filter((scheme) => !isSchemeFullyUsed(scheme, existingItems))
    .map((scheme) => ({
      ...scheme,
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
  // Block validity-before-acquisition client-side: the DB chk_label_dates CHECK would
  // otherwise reject the save with an opaque error mid-batch (§71 E review). ISO date
  // strings (YYYY-MM-DD) compare lexically = chronologically.
  const datesOutOfOrder = Boolean(draft.awardedAt && draft.validUntil && draft.validUntil < draft.awardedAt);
  const saveDisabled =
    !draft.schemeCode || !draft.valueCode || (awardedRequired && !draft.awardedAt) || datesOutOfOrder;
  const missing =
    Number(!draft.schemeCode || !draft.valueCode) +
    Number(awardedRequired && !draft.awardedAt) +
    Number(datesOutOfOrder);

  return (
    <EditorModal
      open={open}
      title={mode === 'edit' ? 'Modifier le classement ou le label' : 'Ajouter un classement ou un label'}
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveLabel={mode === 'edit' ? 'Appliquer' : 'Ajouter'}
      saveDisabled={saveDisabled}
      footerNote={
        missing ? `${missing} point${missing > 1 ? 's' : ''} à compléter` : 'Prêt à appliquer au brouillon'
      }
    >
      <section className="ed-catalog-section" aria-label="Référentiel">
        <h3>Lequel ?</h3>
        {mode === 'edit' ? (
          <Readout value={draft.schemeLabel} />
        ) : (
          Array.from(new Set(referentialOptions.map((scheme) => scheme.group))).map((group) => (
            <div key={group} className="ed-catalog-group">
              <p>{group}</p>
              <ChipSet>
                {referentialOptions
                  .filter((scheme) => scheme.group === group)
                  .map((scheme) => (
                    <Chip
                      key={scheme.code}
                      label={scheme.label}
                      on={draft.schemeCode === scheme.code}
                      onClick={() => selectScheme(scheme.code)}
                    />
                  ))}
              </ChipSet>
            </div>
          ))
        )}

        {currentScheme && (
          <div
            className="ed-catalog-group"
            role="group"
            aria-label={hasValueChoice ? 'Valeur attribuée' : undefined}
          >
            <p>Valeur attribuée</p>
            {hasValueChoice ? (
              <ChipSet>
                {valueChoices.map((option) => (
                  <Chip
                    key={option.code}
                    label={option.label}
                    on={draft.valueCode === option.code}
                    onClick={() =>
                      set({ valueId: option.id ?? '', valueCode: option.code, valueLabel: option.label })
                    }
                  />
                ))}
              </ChipSet>
            ) : (
              <Readout
                value={draft.valueLabel || currentScheme.valueOptions[0]?.label || 'Marque accordée'}
              />
            )}
            {currentScheme.displayGroup === 'accessibility_labels' && (
              <p className="muted" style={{ marginTop: 6 }}>
                La couverture par type de handicap (moteur, auditif, visuel, mental) se gère dans la section
                {EDITOR_SECTION_REFERENCES.accessibility.label} (§{EDITOR_SECTION_REFERENCES.accessibility.num}).
              </p>
            )}
          </div>
        )}
      </section>

      <section className="ed-catalog-section">
        <h3>Où en est-il ?</h3>
        <div className="ed-modal__segmented" role="group" aria-label="Statut">
          {CLASSIFICATION_STATUS_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.v}
              aria-pressed={(draft.status || 'granted') === option.v}
              onClick={() => set({ status: option.v })}
            >
              {STATUS_LABELS[option.v] || option.l}
            </button>
          ))}
        </div>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <Field label="Obtenu le" required={awardedRequired}>
            <Input
              type="date"
              aria-label="Obtenu le"
              value={draft.awardedAt}
              onChange={(awardedAt) => set({ awardedAt })}
            />
          </Field>
          <Field label="Valable jusqu'au">
            <Input
              type="date"
              aria-label="Valable jusqu'au"
              value={draft.validUntil}
              onChange={(validUntil) => set({ validUntil })}
            />
            {datesOutOfOrder && (
              <p className="muted" role="alert" style={{ marginTop: 6, color: 'var(--red, #93392a)' }}>
                La date de validité doit être postérieure à la date d&apos;acquisition.
              </p>
            )}
          </Field>
        </div>
      </section>

      {/* Justificatif (ref_document) — optional. Shows the attached document with a remove
          action, or the upload field once an access token is resolved. §71 C. */}
      <details className="ed-catalog-details" open={Boolean(draft.documentUrl)}>
        <summary>Joindre le justificatif (arrêté, attestation)</summary>
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
                set({
                  documentId: document.documentId,
                  documentUrl: document.url,
                  documentTitle: document.title,
                })
              }
            />
          )
        )}
      </details>
      <div className="ed-catalog-summary">
        <small>Sur la fiche : </small>
        <strong>
          {draft.schemeLabel ? `${draft.schemeLabel}${hasValueChoice ? ` · ${draft.valueLabel}` : ''}` : '—'}
        </strong>
      </div>
    </EditorModal>
  );
}
