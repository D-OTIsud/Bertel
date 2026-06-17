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
  normalizeInseeDigits,
  readLegalRecordScalarValue,
  type ObjectWorkspaceLegalModule,
  type ObjectWorkspaceLegalRecord,
  type ObjectWorkspaceLegalTypeOption,
} from '../../../services/object-workspace-parser';

/** SIRET = SIREN (9) + NIC (5); the SIREN is the SIRET's first 9 digits. */
export const SIREN_LENGTH = 9;
export const SIRET_LENGTH = 14;

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

/**
 * Set the SIRET scalar and auto-derive the SIREN from it in ONE module update (composed on the
 * evolving module, never two separate replaceModule calls — those would clobber each other).
 *
 * The SIREN is, by definition, the SIRET's first 9 digits, so deriving keeps the two consistent.
 * A SIRET shorter than 9 digits leaves the SIREN untouched — clearing the SIRET does not wipe a
 * standalone SIREN, and a SIREN-only entry (no SIRET) still works. A SIREN row is only written
 * when 'siren' exists in the catalog (`upsertLegalScalar` never fabricates a type).
 */
export function upsertSiretWithDerivedSiren(
  module: ObjectWorkspaceLegalModule,
  rawSiret: string,
): ObjectWorkspaceLegalModule {
  const siret = normalizeInseeDigits(rawSiret).slice(0, SIRET_LENGTH);
  const next = upsertLegalScalar(module, 'siret', siret);
  if (siret.length < SIREN_LENGTH) {
    return next;
  }
  return upsertLegalScalar(next, 'siren', siret.slice(0, SIREN_LENGTH));
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
    documentUrl: '',
    documentTitle: '',
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

/**
 * Document status options surfaced in the §18 modal. The DB CHECK allows
 * active/expired/suspended/revoked/requested; the editor authors the two everyday
 * states — the rest are preserved (never silently dropped) when an imported row
 * carries them. See object_legal.status (schema_unified.sql).
 */
export const LEGAL_DOCUMENT_STATUS_OPTIONS: readonly { v: string; l: string }[] = [
  { v: 'active', l: 'En vigueur' },
  { v: 'expired', l: 'Expiré' },
];

/** Validity-mode choices: a non-expiring document vs one bounded by an end date. */
export const LEGAL_VALIDITY_OPTIONS: readonly { v: string; l: string }[] = [
  { v: 'forever', l: 'Sans expiration' },
  { v: 'fixed_end_date', l: 'Date de fin' },
];

/** Whether a record is non-expiring (validity_mode anything but the fixed-end-date bound). */
export function isLegalRecordForever(record: ObjectWorkspaceLegalRecord): boolean {
  return (record.validityMode || 'forever') !== 'fixed_end_date';
}

/** The document's reference number (object_legal.value → `{ value }`), empty when none. */
export function readLegalReference(record: ObjectWorkspaceLegalRecord): string {
  return readLegalRecordScalarValue(record);
}

/** Canonical JSONB string for a reference value; empty string clears the value to `{}` shape. */
export function buildReferenceValueJson(value: string): string {
  return value.trim() ? JSON.stringify({ value: value.trim() }) : '';
}

export type LegalExpiryTone = 'ok' | 'warn' | 'expired';

export interface LegalExpiryFlag {
  tone: LegalExpiryTone;
  label: string;
}

/** Threshold (days) under which a dated document is flagged "expiring soon". */
export const LEGAL_EXPIRY_WARN_DAYS = 30;

/**
 * Whole days from `today` until `record.validTo` (negative once past), or null when the
 * record has no end date. Computed from the dates (not the stored days_until_expiry) so the
 * flag stays correct after an in-modal edit. ISO dates compared in UTC to avoid TZ drift.
 */
export function computeLegalDaysUntilExpiry(record: ObjectWorkspaceLegalRecord, today: string): number | null {
  if (!record.validTo.trim()) {
    return null;
  }
  const end = Date.parse(`${record.validTo.trim()}T00:00:00Z`);
  const now = Date.parse(`${today.trim()}T00:00:00Z`);
  if (Number.isNaN(end) || Number.isNaN(now)) {
    return null;
  }
  return Math.round((end - now) / 86_400_000);
}

/**
 * The status/expiry badge for a document row. Explicit lifecycle statuses win; otherwise the
 * end date drives it: past → expired, within {@link LEGAL_EXPIRY_WARN_DAYS} → warn, else ok.
 * A non-expiring active document is simply "En vigueur".
 */
export function computeLegalExpiryFlag(record: ObjectWorkspaceLegalRecord, today: string): LegalExpiryFlag {
  const status = (record.status || 'active').trim().toLowerCase();
  if (status === 'revoked') {
    return { tone: 'expired', label: 'Révoqué' };
  }
  if (status === 'suspended') {
    return { tone: 'warn', label: 'Suspendu' };
  }
  if (status === 'expired') {
    return { tone: 'expired', label: 'Expiré' };
  }
  const days = computeLegalDaysUntilExpiry(record, today);
  if (days === null) {
    return { tone: 'ok', label: 'En vigueur' };
  }
  if (days < 0) {
    return { tone: 'expired', label: 'Expiré' };
  }
  if (days <= LEGAL_EXPIRY_WARN_DAYS) {
    return { tone: 'warn', label: days === 0 ? "Expire aujourd'hui" : `Expire dans ${days} j` };
  }
  return { tone: 'ok', label: 'En vigueur' };
}

/** True when a MANDATORY document (required type) is past its end date — the emphasized flag case. */
export function isRequiredDocumentExpired(record: ObjectWorkspaceLegalRecord, today: string): boolean {
  return record.isRequired && computeLegalExpiryFlag(record, today).tone === 'expired';
}

/** True when a MANDATORY document is valid but expiring within the warn window. */
export function isRequiredDocumentExpiringSoon(record: ObjectWorkspaceLegalRecord, today: string): boolean {
  return record.isRequired && computeLegalExpiryFlag(record, today).tone === 'warn';
}

/** Any mandatory document past its end date among `records`. Drives the §18 alert pill. */
export function hasExpiredRequiredDocument(records: ObjectWorkspaceLegalRecord[], today: string): boolean {
  return records.some((record) => isRequiredDocumentExpired(record, today));
}

/** Any mandatory document expiring within the warn window among `records`. */
export function hasExpiringRequiredDocument(records: ObjectWorkspaceLegalRecord[], today: string): boolean {
  return records.some((record) => isRequiredDocumentExpiringSoon(record, today));
}

/** Human-readable validity summary for a document display row. */
export function formatLegalValidity(record: ObjectWorkspaceLegalRecord): string {
  if (isLegalRecordForever(record)) {
    return 'Sans expiration';
  }
  if (record.validFrom && record.validTo) {
    return `du ${record.validFrom} au ${record.validTo}`;
  }
  if (record.validTo) {
    return `jusqu'au ${record.validTo}`;
  }
  if (record.validFrom) {
    return `à partir du ${record.validFrom}`;
  }
  return '—';
}
