import { useEffect, useState } from 'react';
import { Chip, ChipSet, Disclosure, EditorModal, Field, Input, Select, Textarea } from '../primitives';
import { DocumentUploadField } from './DocumentUploadField';
import { getSupabaseClient } from '../../../lib/supabase';
import {
  LEGAL_DOCUMENT_STATUS_OPTIONS,
  LEGAL_VALIDITY_OPTIONS,
  buildReferenceValueJson,
  computeLegalExpiryFlag,
  formatLegalValidity,
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
 * Le sélecteur de type affiche sous lui la `description` du type — dans quelle situation la pièce
 * est demandée (§209). C'est ce qui permet à l'agent de choisir entre KBIS, extrait INPI, avis
 * SIRENE et statuts d'association sans connaître le droit des sociétés.
 *
 * Il n'y a PLUS de case « Obligatoire » : depuis §209 aucun document n'est `is_required` (l'obligation
 * dépend de la situation de l'exploitant — meublé ≠ association ≠ restaurant), la case était donc un
 * contrôle désactivé bloqué sur « Non ». Le signal survit là où il compte : la pastille « Obligatoire »
 * de la liste §18 ne se rend que si `record.isRequired`, donc un futur type marqué obligatoire en base
 * reste visible sans rien recâbler.
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

  // « Quand demander cette pièce » — vide pour un code hérité absent du catalogue (le Field masque
  // alors son hint plutôt que d'afficher une ligne vide).
  const selectedTypeDescription =
    typeOptions.find((option) => option.code === draft.typeCode)?.description ?? '';
  const expiry = computeLegalExpiryFlag(draft, new Date().toISOString().slice(0, 10));

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
      className="ed-record-modal--legal"
      open={open}
      title={mode === 'edit' ? 'Modifier le document' : 'Ajouter un document'}
      eyebrow="Dossier administratif"
      onClose={onClose}
      onSave={() => onSave(draft)}
      saveDisabled={saveDisabled}
      saveLabel={mode === 'add' ? 'Ajouter' : 'Appliquer'}
      size="lg"
      footerNote={saveDisabled ? 'Document à compléter' : 'Prêt à appliquer au brouillon'}
      aside={<>
        <h3>Dossier administratif</h3>
        <div className="ed-record-modal__preview">
          <strong>{draft.typeLabel || 'Nouveau document'}</strong>
          {readLegalReference(draft) && <p>{readLegalReference(draft)}</p>}
          <p>{formatLegalValidity(draft)}</p>
          <p><span className={`pill ${expiry.tone === 'expired' ? 'bad' : expiry.tone === 'warn' ? 'warn' : 'ok'}`}>{expiry.label}</span></p>
        </div>
        <h3>Avant d’appliquer</h3>
        <ul className="ed-record-modal__checks">
          <li data-complete={Boolean(draft.typeCode)}>{draft.typeCode ? '✓' : '○'} Type de document</li>
          <li data-complete={!saveDisabled}>{saveDisabled ? '○' : '✓'} Validité</li>
          <li data-complete={Boolean(draft.documentId)}>{draft.documentId ? '✓' : '!'} Justificatif · recommandé</li>
        </ul>
      </>}
    >
      <Field label="Type de document" required hint={selectedTypeDescription || undefined}>
        <ChipSet>
          {typeOptions.slice(0, 8).map((option) => <Chip key={option.id} label={option.label} on={draft.typeCode === option.code} onClick={() => selectType(option.code)} />)}
        </ChipSet>
        <Disclosure title="Autre document…" defaultOpen={!typeOptions.slice(0, 8).some((option) => option.code === draft.typeCode)}>
        <Select
          aria-label="Type de document"
          value={draft.typeCode}
          options={typeSelectOptions}
          onChange={selectType}
        />
        </Disclosure>
      </Field>

      <Field label="N° / référence">
        <Input
          value={readLegalReference(draft)}
          placeholder="N° de police, référence d'attestation…"
          aria-label="Référence du document"
          onChange={(value) => set({ valueJson: buildReferenceValueJson(value) })}
        />
      </Field>

      <Field label="Validité">
        <div className="ed-modal__segmented" role="group" aria-label="Mode de validité">
          {LEGAL_VALIDITY_OPTIONS.map((option) => <button key={option.v} type="button" aria-pressed={(isForever ? 'forever' : 'fixed_end_date') === option.v}
            onClick={() => set({ validityMode: option.v, validTo: option.v === 'forever' ? '' : draft.validTo })}>{option.l}</button>)}
        </div>
      </Field>

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

      <Disclosure title="Ajouter une note interne" defaultOpen={Boolean(draft.note)}>
      <Field label="Note">
        <Textarea
          value={draft.note}
          placeholder="Précisions internes (assureur, conditions, rappel de renouvellement…)"
          aria-label="Note"
          rows={2}
          onChange={(note) => set({ note })}
        />
      </Field>
      </Disclosure>

      <Disclosure title="Statut administratif" defaultOpen={Boolean(draft.status && draft.status !== 'active')}>
        <Field label="Statut">
          <Select aria-label="Statut du document" value={draft.status || 'active'} options={statusOptions.map((option) => ({ v: option.v, l: option.l }))} onChange={(status) => set({ status })} />
        </Field>
      </Disclosure>

    </EditorModal>
  );
}
