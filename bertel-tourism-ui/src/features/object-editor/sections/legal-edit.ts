/**
 * Pure helpers for §18 "Juridique" — editing the writable `legal` module (object_legal rows).
 *
 * The section surfaces two families of object_legal rows:
 *  - IDENTITY scalars (SIRET, SIREN, raison sociale, n° TVA): one row per type, a single text value,
 *    no expiry (validity_mode = 'forever'). Edited as flat fields.
 *  - DOCUMENTS (licences, assurances, certificats…): everything else — a repeater with validity dates,
 *    a status lifecycle and an optional reference. Persisted by {@link saveObjectWorkspaceLegal}.
 *
 * Forme juridique / code NAF are deliberately NOT surfaced here: they have no `ref_legal_type` code,
 * so an editable field for them would be a write-trap. Add the ref code first if they become needed.
 */

import {
  readLegalRecordScalarValue,
  type ObjectWorkspaceLegalModule,
  type ObjectWorkspaceLegalRecord,
  type ObjectWorkspaceLegalTypeOption,
} from '../../../services/object-workspace-parser';

/** `ref_legal_type` codes rendered as flat identity fields (rest are "documents"). */
export const LEGAL_IDENTITY_TYPE_CODES = ['siret', 'siren', 'raison_sociale', 'vat_number'] as const;

const IDENTITY_SET = new Set<string>(LEGAL_IDENTITY_TYPE_CODES);

export function isIdentityLegalType(typeCode: string): boolean {
  return IDENTITY_SET.has(typeCode.trim().toLowerCase());
}

/** Read the single text value of the object_legal row for `typeCode` (empty when absent). */
export function readLegalScalar(records: ObjectWorkspaceLegalRecord[], typeCode: string): string {
  const target = typeCode.trim().toLowerCase();
  const found = records.find((record) => record.typeCode.trim().toLowerCase() === target);
  return found ? readLegalRecordScalarValue(found) : '';
}

/** Canonical JSONB shape written back for a scalar legal value — `readLegalScalar` reads it via `map.value`. */
function buildScalarValueJson(scalar: string): string {
  return JSON.stringify({ value: scalar });
}

/**
 * Set (create / update / remove) the scalar object_legal row for `typeCode`, returning a NEW module
 * (never mutates `module`). Clearing to blank removes the row. A new row is only created when the
 * type exists in the catalog (`typeOptions`) — never fabricated — and is created as a non-expiring
 * ('forever') row so the §18 saver's fixed-end-date validity guard does not require a `valid_to`.
 */
export function upsertLegalScalar(
  module: ObjectWorkspaceLegalModule,
  typeCode: string,
  scalar: string,
): ObjectWorkspaceLegalModule {
  const target = typeCode.trim().toLowerCase();
  const trimmed = scalar.trim();
  const index = module.records.findIndex((record) => record.typeCode.trim().toLowerCase() === target);

  if (trimmed === '') {
    if (index === -1) {
      return module;
    }
    return { ...module, records: module.records.filter((_, position) => position !== index) };
  }

  const valueJson = buildScalarValueJson(trimmed);

  if (index !== -1) {
    const records = module.records.map((record, position) =>
      position === index ? { ...record, valueJson } : record,
    );
    return { ...module, records };
  }

  const option = module.typeOptions.find((item) => item.code.trim().toLowerCase() === target);
  if (!option) {
    return module;
  }

  const created = buildNewDocumentRecord(option);
  return { ...module, records: [...module.records, { ...created, valueJson }] };
}

/** Partition records into the identity scalars (rendered as fields) and the document rows (repeater). */
export function splitLegalRecords(records: ObjectWorkspaceLegalRecord[]): {
  identity: ObjectWorkspaceLegalRecord[];
  documents: ObjectWorkspaceLegalRecord[];
} {
  const identity: ObjectWorkspaceLegalRecord[] = [];
  const documents: ObjectWorkspaceLegalRecord[] = [];
  for (const record of records) {
    (isIdentityLegalType(record.typeCode) ? identity : documents).push(record);
  }
  return { identity, documents };
}

/** Build a fresh, empty, non-expiring object_legal record carrying a type option's metadata. */
export function buildNewDocumentRecord(option: ObjectWorkspaceLegalTypeOption): ObjectWorkspaceLegalRecord {
  return {
    recordId: null,
    typeId: option.id,
    typeCode: option.code,
    typeLabel: option.label,
    category: option.category,
    isPublic: option.isPublic,
    isRequired: option.isRequired,
    valueJson: '',
    documentId: '',
    validFrom: '',
    validTo: '',
    validityMode: 'forever',
    status: 'active',
    documentRequestedAt: '',
    documentDeliveredAt: '',
    note: '',
    daysUntilExpiry: '',
  };
}
