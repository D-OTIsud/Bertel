import { Field, Fs, Input, Readout, Repeater, Select } from '../primitives';
import type { SectionProps } from './section-types';
import {
  normalizeInseeDigits,
  readLegalRecordScalarValue,
  type ObjectWorkspaceLegalRecord,
} from '../../../services/object-workspace-parser';
import {
  buildNewDocumentRecord,
  isIdentityLegalType,
  readLegalScalar,
  upsertLegalScalar,
} from './legal-edit';

/**
 * Section 18 — "Juridique" (renommée depuis « Fournisseur / Prestataire »).
 *
 * Édite l'identité juridique de l'OBJET via le module `legal` (object_legal), désormais ENREGISTRABLE
 * (`saveObjectWorkspaceLegal` réconcilie les lignes sous la policy `owner_write_legal`). Plus aucun
 * contenu « prestataire » ici : les prestataires rattachés vivent en §19 (Suivi prestataire). Deux
 * familles de lignes :
 *  - Identité (SIRET, SIREN, raison sociale, n° TVA) : champs plats, valeur scalaire, sans expiration.
 *  - Documents légaux (licences, assurances, certificats…) : répéteur avec validité + statut.
 *
 * Forme juridique / code NAF NE sont PAS surfacés : aucun `ref_legal_type` ne les porte (un champ
 * éditable serait un write-trap). L'upload de FICHIER reste différé (§59, upload par section) — on
 * capture ici la référence + la validité, pas le binaire.
 */

const STATUS_OPTIONS = [
  { v: 'active', l: 'En vigueur' },
  { v: 'expired', l: 'Expiré' },
];

const VALIDITY_OPTIONS = [
  { v: 'forever', l: 'Sans expiration' },
  { v: 'fixed_end_date', l: 'Date de fin' },
];

function recordReference(record: ObjectWorkspaceLegalRecord): string {
  return readLegalRecordScalarValue(record);
}

function buildReferenceValueJson(value: string): string {
  return value.trim() ? JSON.stringify({ value: value.trim() }) : '';
}

export function SectionLegal({ editor, permissions, folded }: SectionProps) {
  const legal = editor.draft.legal;
  const access = permissions.legal;
  const canWrite = Boolean(access?.canDirectWrite) && !legal.unavailableReason;

  const siret = readLegalScalar(legal.records, 'siret');
  const documentEntries = legal.records
    .map((record, index) => ({ record, index }))
    .filter((entry) => !isIdentityLegalType(entry.record.typeCode));
  const documentTypeOptions = legal.typeOptions.filter((option) => !isIdentityLegalType(option.code));

  function setScalar(typeCode: string, value: string) {
    editor.replaceModule('legal', upsertLegalScalar(legal, typeCode, value));
  }

  function updateRecordAt(index: number, patch: Partial<ObjectWorkspaceLegalRecord>) {
    editor.replaceModule('legal', {
      ...legal,
      records: legal.records.map((record, position) => (position === index ? { ...record, ...patch } : record)),
    });
  }

  function removeRecordAt(index: number) {
    editor.replaceModule('legal', {
      ...legal,
      records: legal.records.filter((_, position) => position !== index),
    });
  }

  function addDocument() {
    const used = new Set(legal.records.map((record) => record.typeCode.toLowerCase()));
    const option = documentTypeOptions.find((item) => !used.has(item.code.toLowerCase())) ?? documentTypeOptions[0];
    if (!option) return;
    editor.replaceModule('legal', { ...legal, records: [...legal.records, buildNewDocumentRecord(option)] });
  }

  const pill = siret
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
            <Field label="SIRET" hint="14 chiffres = SIREN (9) + NIC (5).">
              <Input
                value={siret}
                placeholder="12345678900012"
                mono
                aria-label="SIRET"
                onChange={(value) => setScalar('siret', normalizeInseeDigits(value).slice(0, 14))}
              />
            </Field>
            <Field label="SIREN" hint="9 chiffres (dérivable du SIRET).">
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
        Licences, assurances, certificats… On enregistre le type, la référence et la validité. Le dépôt du
        fichier lui-même sera ajouté ultérieurement (upload par section).
      </p>

      {canWrite ? (
        documentTypeOptions.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>
            Catalogue des types juridiques indisponible — l&apos;ajout de documents est désactivé.
          </p>
        ) : (
          <Repeater
            items={documentEntries}
            getKey={(entry) => `${entry.record.recordId ?? 'new'}-${entry.index}`}
            columns="1.4fr 1fr 140px 130px 130px 130px auto"
            addLabel="Ajouter un document"
            onAdd={addDocument}
            renderRow={(entry) => {
              const { record, index } = entry;
              const isForever = (record.validityMode || 'forever') !== 'fixed_end_date';
              const statusOptions = STATUS_OPTIONS.some((option) => option.v === record.status)
                ? STATUS_OPTIONS
                : [{ v: record.status, l: record.status }, ...STATUS_OPTIONS];
              return (
                <>
                  <Select
                    value={record.typeCode}
                    aria-label="Type de document"
                    options={[
                      ...(documentTypeOptions.some((option) => option.code === record.typeCode)
                        ? []
                        : [{ v: record.typeCode, l: record.typeLabel || record.typeCode }]),
                      ...documentTypeOptions.map((option) => ({ v: option.code, l: option.label })),
                    ]}
                    onChange={(typeCode) => {
                      const option = documentTypeOptions.find((item) => item.code === typeCode);
                      updateRecordAt(index, {
                        typeCode,
                        typeId: option?.id ?? record.typeId,
                        typeLabel: option?.label ?? typeCode,
                        category: option?.category ?? record.category,
                        isPublic: option?.isPublic ?? record.isPublic,
                        isRequired: option?.isRequired ?? record.isRequired,
                      });
                    }}
                  />
                  <Input
                    value={recordReference(record)}
                    placeholder="N° / référence"
                    aria-label="Référence du document"
                    onChange={(value) => updateRecordAt(index, { valueJson: buildReferenceValueJson(value) })}
                  />
                  <Select
                    value={isForever ? 'forever' : 'fixed_end_date'}
                    aria-label="Mode de validité"
                    options={VALIDITY_OPTIONS}
                    onChange={(mode) =>
                      updateRecordAt(index, {
                        validityMode: mode,
                        validTo: mode === 'forever' ? '' : record.validTo,
                      })
                    }
                  />
                  <Input
                    type="date"
                    value={record.validFrom}
                    aria-label="Valide à partir du"
                    onChange={(validFrom) => updateRecordAt(index, { validFrom })}
                  />
                  {isForever ? (
                    <Input value="" placeholder="—" readOnly aria-label="Sans date de fin" onChange={() => undefined} />
                  ) : (
                    <Input
                      type="date"
                      value={record.validTo}
                      aria-label="Valide jusqu'au"
                      onChange={(validTo) => updateRecordAt(index, { validTo })}
                    />
                  )}
                  <Select
                    value={record.status || 'active'}
                    aria-label="Statut du document"
                    options={statusOptions}
                    onChange={(status) => updateRecordAt(index, { status })}
                  />
                  <button
                    type="button"
                    className="del"
                    aria-label={`Supprimer le document ${record.typeLabel || record.typeCode}`}
                    onClick={() => removeRecordAt(index)}
                  >
                    Supprimer
                  </button>
                </>
              );
            }}
          />
        )
      ) : documentEntries.length > 0 ? (
        documentEntries.map((entry) => (
          <Field key={`${entry.record.recordId ?? 'doc'}-${entry.index}`} label={entry.record.typeLabel || entry.record.typeCode}>
            <Readout
              value={[recordReference(entry.record), entry.record.validTo ? `→ ${entry.record.validTo}` : '']
                .filter(Boolean)
                .join(' ')}
              placeholder="—"
            />
          </Field>
        ))
      ) : (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>Aucun document légal enregistré.</p>
      )}
    </Fs>
  );
}
