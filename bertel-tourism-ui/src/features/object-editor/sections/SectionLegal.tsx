import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Chip, Field, Fs, Input, Readout } from '../primitives';
import { LegalDocumentEditModal } from '../widgets/LegalDocumentEditModal';
import type { SectionProps } from './section-types';
import {
  normalizeInseeDigits,
  type ObjectWorkspaceLegalRecord,
} from '../../../services/object-workspace-parser';
import {
  buildNewDocumentRecord,
  computeLegalExpiryFlag,
  formatLegalValidity,
  hasExpiredRequiredDocument,
  hasExpiringRequiredDocument,
  isIdentityLegalType,
  readLegalReference,
  readLegalScalar,
  upsertLegalScalar,
  upsertSiretWithDerivedSiren,
  type LegalExpiryTone,
} from './legal-edit';

/**
 * Section 18 — "Juridique" (renommée depuis « Fournisseur / Prestataire »).
 *
 * Édite l'identité juridique de l'OBJET via le module `legal` (object_legal), ENREGISTRABLE
 * (`saveObjectWorkspaceLegal` réconcilie les lignes sous la policy `owner_write_legal`). Deux
 * familles de lignes :
 *  - Identité (SIRET, SIREN, raison sociale, n° TVA) : champs plats, valeur scalaire, sans expiration.
 *  - Documents légaux (licences, assurances, certificats…) : affichage compact + modale d'édition
 *    (type, référence, validité, statut, note et un JUSTIFICATIF uploadé — `document_id` →
 *    ref_document via /api/document/upload, comme la §08). Un document OBLIGATOIRE (type
 *    `ref_legal_type.is_required`) expiré porte un drapeau rouge et bascule la pastille d'en-tête.
 *
 * Forme juridique / code NAF NE sont PAS surfacés : aucun `ref_legal_type` ne les porte (un champ
 * éditable serait un write-trap). « Obligatoire » est en lecture seule (dérivé du type, pas de
 * colonne par ligne) — décision PO 2026-06-17.
 */

const LEGAL_DOC_COLS = '1.5fr 1fr 1.3fr 130px auto';

/** Map an expiry flag tone to its `class-status` modifier (the design uses `--red` for expired). */
const FLAG_TONE_CLASS: Record<LegalExpiryTone, string> = { ok: 'ok', warn: 'warn', expired: 'red' };

function docListHeader(showActions: boolean) {
  const labels = ['Document', 'Référence', 'Validité', 'État', showActions ? '' : ''];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: LEGAL_DOC_COLS,
        gap: 8,
        padding: '6px 12px',
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--ink-4)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {labels.map((label, index) => (
        <span key={label || `col-${index}`}>{label}</span>
      ))}
    </div>
  );
}

export function SectionLegal({ editor, permissions, folded }: SectionProps) {
  const legal = editor.draft.legal;
  const access = permissions.legal;
  const canWrite = Boolean(access?.canDirectWrite) && !legal.unavailableReason;
  const today = new Date().toISOString().slice(0, 10);

  const siret = readLegalScalar(legal.records, 'siret');
  const documentEntries = legal.records
    .map((record, index) => ({ record, index }))
    .filter((entry) => !isIdentityLegalType(entry.record.typeCode));
  const documentTypeOptions = legal.typeOptions.filter((option) => !isIdentityLegalType(option.code));

  // 'add' opens a blank modal; a number opens the modal on legal.records[index].
  const [docModal, setDocModal] = useState<'add' | number | null>(null);

  function setScalar(typeCode: string, value: string) {
    editor.replaceModule('legal', upsertLegalScalar(legal, typeCode, value));
  }

  function commitRecordAt(index: number, record: ObjectWorkspaceLegalRecord) {
    editor.replaceModule('legal', {
      ...legal,
      records: legal.records.map((current, position) => (position === index ? record : current)),
    });
  }

  function removeRecordAt(index: number) {
    editor.replaceModule('legal', {
      ...legal,
      records: legal.records.filter((_, position) => position !== index),
    });
  }

  function addRecord(record: ObjectWorkspaceLegalRecord) {
    editor.replaceModule('legal', { ...legal, records: [...legal.records, record] });
  }

  /** Fresh draft for the "add" modal: pick the first unused document type (else the first one). */
  function buildAddDraft(): ObjectWorkspaceLegalRecord | null {
    const used = new Set(legal.records.map((record) => record.typeCode.toLowerCase()));
    const option = documentTypeOptions.find((item) => !used.has(item.code.toLowerCase())) ?? documentTypeOptions[0];
    return option ? buildNewDocumentRecord(option) : null;
  }

  const requiredExpired = hasExpiredRequiredDocument(legal.records, today);
  const requiredExpiring = hasExpiringRequiredDocument(legal.records, today);
  const pill = requiredExpired
    ? { tone: 'req' as const, label: 'Document obligatoire expiré' }
    : requiredExpiring
      ? { tone: 'warn' as const, label: 'Document obligatoire à renouveler' }
      : siret
        ? { tone: 'ok' as const, label: 'SIRET renseigné' }
        : { tone: 'warn' as const, label: 'SIRET manquant' };

  return (
    <Fs
      num="18"
      title="Juridique"
      sub="Identité juridique de l'établissement (SIRET/SIREN, raison sociale) et documents légaux"
      folded={folded}
      pill={pill}
    >
      {!canWrite && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-4)',
            margin: '0 0 12px',
            padding: '8px 12px',
            borderRadius: 'var(--r-md)',
            background: 'var(--bg-tint)',
            border: '1px solid var(--line-soft)',
          }}
        >
          <strong style={{ color: 'var(--ink-3)' }}>Lecture seule.</strong>{' '}
          {access?.disabledReason ?? legal.unavailableReason ?? "Vous n'avez pas le droit de modifier la conformité juridique."}
        </p>
      )}

      <div className="chip-group__label" style={{ marginTop: 0 }}>Identité de la personne morale</div>
      {canWrite ? (
        <>
          <div className="grid-2">
            <Field label="SIRET" hint="14 chiffres = SIREN (9) + NIC (5). Le SIREN se remplit automatiquement.">
              <Input
                value={siret}
                placeholder="12345678900012"
                mono
                aria-label="SIRET"
                onChange={(value) => editor.replaceModule('legal', upsertSiretWithDerivedSiren(legal, value))}
              />
            </Field>
            <Field label="SIREN" hint="9 chiffres — renseigné automatiquement depuis le SIRET, modifiable.">
              <Input
                value={readLegalScalar(legal.records, 'siren')}
                placeholder="123456789"
                mono
                aria-label="SIREN"
                onChange={(value) => setScalar('siren', normalizeInseeDigits(value).slice(0, 9))}
              />
            </Field>
          </div>
          <div className="grid-2" style={{ marginTop: 10 }}>
            <Field label="Raison sociale">
              <Input
                value={readLegalScalar(legal.records, 'raison_sociale')}
                placeholder="Dénomination de l'exploitant"
                aria-label="Raison sociale"
                onChange={(value) => setScalar('raison_sociale', value)}
              />
            </Field>
            <Field label="Numéro de TVA">
              <Input
                value={readLegalScalar(legal.records, 'vat_number')}
                placeholder="FR00123456789"
                mono
                aria-label="Numéro de TVA"
                onChange={(value) => setScalar('vat_number', value)}
              />
            </Field>
          </div>
        </>
      ) : (
        <div className="grid-2">
          <Field label="SIRET">
            <Readout value={siret} mono placeholder="—" />
          </Field>
          <Field label="SIREN">
            <Readout value={readLegalScalar(legal.records, 'siren')} mono placeholder="—" />
          </Field>
          <Field label="Raison sociale">
            <Readout value={readLegalScalar(legal.records, 'raison_sociale')} placeholder="—" />
          </Field>
          <Field label="Numéro de TVA">
            <Readout value={readLegalScalar(legal.records, 'vat_number')} mono placeholder="—" />
          </Field>
        </div>
      )}

      <div className="chip-group__label" style={{ marginTop: 16 }}>Documents légaux</div>
      <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 8px' }}>
        Licences, assurances, certificats… On enregistre le type, la référence, la validité et le justificatif
        (PDF ou image, 10 Mo max). Un document obligatoire expiré est signalé en rouge.
      </p>

      {documentEntries.length > 0 ? (
        <>
          {docListHeader(canWrite)}
          <div className="repeater">
            {documentEntries.map((entry) => {
              const { record, index } = entry;
              const flag = computeLegalExpiryFlag(record, today);
              return (
                <div
                  key={`${record.recordId ?? 'doc'}-${index}`}
                  className="rep-row"
                  style={{ gridTemplateColumns: LEGAL_DOC_COLS, alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{record.typeLabel || record.typeCode}</span>
                    {record.isRequired && <Chip label="Obligatoire" sm />}
                  </div>
                  <div>{readLegalReference(record) || '—'}</div>
                  <div style={{ fontSize: 12 }}>
                    <span className="mono">{formatLegalValidity(record)}</span>
                    {record.documentUrl && (
                      <a
                        href={record.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'block', color: 'var(--accent)', textDecoration: 'underline', marginTop: 2 }}
                      >
                        Voir le justificatif
                      </a>
                    )}
                  </div>
                  <div>
                    <span className={`class-status class-status--${FLAG_TONE_CLASS[flag.tone]}`}>{flag.label}</span>
                  </div>
                  <div className="rep-row__act">
                    {canWrite && (
                      <>
                        <button
                          type="button"
                          aria-label={`Modifier le document ${record.typeLabel || record.typeCode}`}
                          onClick={() => setDocModal(index)}
                          style={{ fontSize: 12, padding: '2px 6px', cursor: 'pointer' }}
                        >
                          <Pencil size={14} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="del"
                          aria-label={`Supprimer le document ${record.typeLabel || record.typeCode}`}
                          onClick={() => removeRecordAt(index)}
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>Aucun document légal enregistré.</p>
      )}

      {canWrite &&
        (documentTypeOptions.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>
            Catalogue des types juridiques indisponible — l&apos;ajout de documents est désactivé.
          </p>
        ) : (
          <button type="button" className="rep-add" onClick={() => setDocModal('add')}>
            + Ajouter un document
          </button>
        ))}

      {docModal === 'add' && (() => {
        const draft = buildAddDraft();
        if (!draft) return null;
        return (
          <LegalDocumentEditModal
            open
            mode="add"
            draft={draft}
            typeOptions={documentTypeOptions}
            objectId={editor.objectId}
            onClose={() => setDocModal(null)}
            onSave={(record) => {
              addRecord(record);
              setDocModal(null);
            }}
          />
        );
      })()}

      {typeof docModal === 'number' && legal.records[docModal] && (
        <LegalDocumentEditModal
          open
          mode="edit"
          draft={legal.records[docModal]}
          typeOptions={documentTypeOptions}
          objectId={editor.objectId}
          onClose={() => setDocModal(null)}
          onSave={(record) => {
            commitRecordAt(docModal, record);
            setDocModal(null);
          }}
        />
      )}
    </Fs>
  );
}
