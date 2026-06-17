import { useEffect, useState } from 'react';
import { EditorModal, Field, Input, Select, Textarea } from '../primitives';
import { DocumentUploadField } from './DocumentUploadField';
import { getSupabaseClient } from '../../../lib/supabase';
import {
  LEGAL_DOCUMENT_STATUS_OPTIONS,
  LEGAL_VALIDITY_OPTIONS,
  buildReferenceValueJson,
  isLegalRecordForever,
  readLegalReference,
} from '../sections/legal-edit';
import type {
  ObjectWorkspaceLegalRecord,
  ObjectWorkspaceLegalTypeOption,
} from '../../../services/object-workspace-parser';

interface LegalDocumentEditModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  draft: ObjectWorkspaceLegalRecord;
  /** Document type options (identity types already filtered out by the caller). */
  typeOptions: ObjectWorkspaceLegalTypeOption[];
  /** Canonical object id — needed by the justificatif upload route. */
  objectId: string;
  onClose: () => void;
  onSave: (record: ObjectWorkspaceLegalRecord) => void;
}

/**
 * Focused add/edit modal for one §18 legal document (object_legal row that is not an identity
 * scalar). Captures the type, reference, validity window, status, a free note and an optional
 * justificatif file (ref_document via /api/document/upload → document_id).
 *
 * "Obligatoire" is read-only: it reflects the document type's `ref_legal_type.is_required` and
 * has no per-row column to persist (decision 2026-06-17), so an editable toggle would be a
 * write-trap. It is shown as a disabled checkbox with a hint.
 */
export function LegalDocumentEditModal({
  open,
  mode,
  draft: initialDraft,
  typeOptions,
  objectId,
  onClose,
  onSave,
}: LegalDocumentEditModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  const set = (patch: Partial<ObjectWorkspaceLegalRecord>) => setDraft((current) => ({ ...current, ...patch }));

  // Resolve the Supabase access token so the justificatif upload can authenticate against
  // /api/document/upload (mirrors ClassificationEditModal). Null until resolved → the upload
  // field renders only once a token is available.
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    client.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
  }, []);

  const isForever = isLegalRecordForever(draft);
  // Block end-before-start client-side: the DB chk_valid_date_range CHECK would otherwise reject
  // the save with an opaque error mid-batch. ISO dates compare lexically = chronologically.
  const datesOutOfOrder = Boolean(draft.validFrom && draft.validTo && draft.validTo < draft.validFrom);
  // Mirror the saver guards (saveObjectWorkspaceLegal): a fixed-end-date row needs a valid_to.
  const saveDisabled = !draft.typeCode || (!isForever && !draft.validTo.trim()) || datesOutOfOrder;

  // Keep the current type selectable even if it is missing from the catalog (e.g. a legacy code).
  const typeSelectOptions = [
    ...(typeOptions.some((option) => option.code === draft.typeCode)
      ? []
      : [{ v: draft.typeCode, l: draft.typeLabel || draft.typeCode }]),
    ...typeOptions.map((option) => ({ v: option.code, l: option.label })),
  ];

  // Preserve an imported status the everyday set does not cover (suspended/revoked/requested).
  const statusOptions = LEGAL_DOCUMENT_STATUS_OPTIONS.some((option) => option.v === draft.status)
    ? LEGAL_DOCUMENT_STATUS_OPTIONS
    : [{ v: draft.status, l: draft.status }, ...LEGAL_DOCUMENT_STATUS_OPTIONS];

  function selectType(typeCode: string) {
    const option = typeOptions.find((item) => item.code === typeCode);
    set({
      typeCode,
      typeId: option?.id ?? draft.typeId,
      typeLabel: option?.label ?? typeCode,
      category: option?.category ?? draft.category,
      isPublic: option?.isPublic ?? draft.isPublic,
      isRequired: option?.isRequired ?? draft.isRequired,
    });
  }

  return (
    <EditorModal
      open={open}
      title={mode === 'edit' ? 'Modifier le document' : 'Ajouter un document'}
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={saveDisabled}
      size="lg"
    >
      <div className="grid-2">
        <Field label="Type de document" required>
          <Select
            aria-label="Type de document"
            value={draft.typeCode}
            options={typeSelectOptions}
            onChange={selectType}
          />
        </Field>
        <Field label="Obligatoire" hint="Défini par le type de document — non modifiable par document.">
          <label className="legal-required-flag">
            <input
              type="checkbox"
              checked={draft.isRequired}
              disabled
              aria-label="Document obligatoire (défini par le type)"
            />
            <span>{draft.isRequired ? 'Oui — document obligatoire' : 'Non — facultatif'}</span>
          </label>
        </Field>
      </div>

      <Field label="N° / référence">
        <Input
          value={readLegalReference(draft)}
          placeholder="N° de police, référence d'attestation…"
          aria-label="Référence du document"
          onChange={(value) => set({ valueJson: buildReferenceValueJson(value) })}
        />
      </Field>

      <div className="grid-2">
        <Field label="Validité">
          <Select
            aria-label="Mode de validité"
            value={isForever ? 'forever' : 'fixed_end_date'}
            options={LEGAL_VALIDITY_OPTIONS.map((option) => ({ v: option.v, l: option.l }))}
            onChange={(mode) => set({ validityMode: mode, validTo: mode === 'forever' ? '' : draft.validTo })}
          />
        </Field>
        <Field label="Statut">
          <Select
            aria-label="Statut du document"
            value={draft.status || 'active'}
            options={statusOptions.map((option) => ({ v: option.v, l: option.l }))}
            onChange={(status) => set({ status })}
          />
        </Field>
      </div>

      <div className="grid-2">
        <Field label="Valide à partir du">
          <Input
            type="date"
            aria-label="Valide à partir du"
            value={draft.validFrom}
            onChange={(validFrom) => set({ validFrom })}
          />
        </Field>
        <Field label="Valide jusqu'au" required={!isForever}>
          {isForever ? (
            <Input value="" placeholder="—" readOnly aria-label="Sans date de fin" onChange={() => undefined} />
          ) : (
            <Input
              type="date"
              aria-label="Valide jusqu'au"
              value={draft.validTo}
              onChange={(validTo) => set({ validTo })}
            />
          )}
        </Field>
      </div>
      {datesOutOfOrder && (
        <p className="muted" role="alert" style={{ marginTop: -4, color: 'var(--red, #93392a)' }}>
          La date de fin doit être postérieure à la date de début.
        </p>
      )}

      <Field label="Note">
        <Textarea
          value={draft.note}
          placeholder="Précisions internes (assureur, conditions, rappel de renouvellement…)"
          aria-label="Note"
          rows={2}
          onChange={(note) => set({ note })}
        />
      </Field>

      {/* Justificatif (ref_document) — optional. Shows the attached file with a remove action,
          or the upload field once an access token is resolved. Mirrors §08 classifications. */}
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
