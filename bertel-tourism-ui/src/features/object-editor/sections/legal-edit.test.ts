import {
  LEGAL_IDENTITY_TYPE_CODES,
  buildNewDocumentRecord,
  buildReferenceValueJson,
  computeLegalDaysUntilExpiry,
  computeLegalExpiryFlag,
  formatLegalValidity,
  hasExpiredRequiredDocument,
  hasExpiringRequiredDocument,
  isIdentityLegalType,
  readLegalReference,
  readLegalScalar,
  splitLegalRecords,
  upsertLegalScalar,
} from './legal-edit';
import type {
  ObjectWorkspaceLegalModule,
  ObjectWorkspaceLegalRecord,
  ObjectWorkspaceLegalTypeOption,
} from '../../../services/object-workspace-parser';

function record(partial: Partial<ObjectWorkspaceLegalRecord>): ObjectWorkspaceLegalRecord {
  return {
    recordId: null,
    typeId: '',
    typeCode: '',
    typeLabel: '',
    category: '',
    isPublic: false,
    isRequired: false,
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
    ...partial,
  };
}

function option(partial: Partial<ObjectWorkspaceLegalTypeOption> & { code: string }): ObjectWorkspaceLegalTypeOption {
  return {
    id: `id-${partial.code}`,
    label: partial.code,
    category: 'business',
    isPublic: false,
    isRequired: false,
    ...partial,
  };
}

function module(partial: Partial<ObjectWorkspaceLegalModule> = {}): ObjectWorkspaceLegalModule {
  return {
    typeOptions: [
      option({ code: 'siret', label: 'SIRET', isRequired: true }),
      option({ code: 'siren', label: 'SIREN' }),
      option({ code: 'raison_sociale', label: 'Raison sociale' }),
      option({ code: 'vat_number', label: 'Numéro TVA' }),
      option({ code: 'liability_insurance', label: 'Assurance RC', category: 'insurance' }),
    ],
    records: [],
    compliance: { complianceStatus: 'unknown', requiredCount: 0, validCount: 0, expiringCount: 0, missingCount: 0, compliancePercentage: 0, details: [] },
    unavailableReason: null,
    ...partial,
  };
}

describe('isIdentityLegalType', () => {
  test('siret/siren/raison_sociale/vat_number are identity types', () => {
    for (const code of LEGAL_IDENTITY_TYPE_CODES) {
      expect(isIdentityLegalType(code)).toBe(true);
    }
  });

  test('document/insurance types are not identity types', () => {
    expect(isIdentityLegalType('liability_insurance')).toBe(false);
    expect(isIdentityLegalType('business_license')).toBe(false);
  });

  test('is case-insensitive', () => {
    expect(isIdentityLegalType('SIRET')).toBe(true);
  });
});

describe('readLegalScalar', () => {
  test('reads a value-wrapped scalar', () => {
    const records = [record({ typeCode: 'siret', valueJson: JSON.stringify({ value: '12345678900012' }) })];
    expect(readLegalScalar(records, 'siret')).toBe('12345678900012');
  });

  test('reads a typed-key scalar (legacy {siret} shape)', () => {
    const records = [record({ typeCode: 'siret', valueJson: JSON.stringify({ siret: '98765432100019' }) })];
    expect(readLegalScalar(records, 'siret')).toBe('98765432100019');
  });

  test('reads a bare JSON string scalar', () => {
    const records = [record({ typeCode: 'raison_sociale', valueJson: JSON.stringify('Ti Kaz SARL') })];
    expect(readLegalScalar(records, 'raison_sociale')).toBe('Ti Kaz SARL');
  });

  test('returns empty string when the type is absent', () => {
    expect(readLegalScalar([], 'siret')).toBe('');
  });
});

describe('upsertLegalScalar', () => {
  test('updates the value of an existing record without changing its id', () => {
    const base = module({
      records: [record({ recordId: 'r1', typeId: 'id-siret', typeCode: 'siret', valueJson: JSON.stringify({ value: '111' }) })],
    });

    const next = upsertLegalScalar(base, 'siret', '12345678900012');

    expect(next.records).toHaveLength(1);
    expect(next.records[0].recordId).toBe('r1');
    expect(readLegalScalar(next.records, 'siret')).toBe('12345678900012');
  });

  test('creates a new "forever" record from the type catalog when absent', () => {
    const next = upsertLegalScalar(module(), 'siren', '123456789');

    expect(next.records).toHaveLength(1);
    const created = next.records[0];
    expect(created.recordId).toBeNull();
    expect(created.typeCode).toBe('siren');
    expect(created.typeId).toBe('id-siren');
    expect(created.validityMode).toBe('forever');
    expect(readLegalScalar(next.records, 'siren')).toBe('123456789');
  });

  test('removes an existing record when cleared to empty', () => {
    const base = module({
      records: [record({ recordId: 'r1', typeCode: 'siret', valueJson: JSON.stringify({ value: '111' }) })],
    });

    const next = upsertLegalScalar(base, 'siret', '   ');

    expect(next.records).toHaveLength(0);
  });

  test('is a no-op when clearing an absent type', () => {
    const base = module();
    const next = upsertLegalScalar(base, 'siret', '');
    expect(next.records).toHaveLength(0);
  });

  test('does not fabricate a record for a type missing from the catalog', () => {
    const base = module({ typeOptions: [] });
    const next = upsertLegalScalar(base, 'siret', '12345678900012');
    expect(next.records).toHaveLength(0);
  });

  test('does not mutate the input module', () => {
    const base = module();
    const before = JSON.stringify(base);
    upsertLegalScalar(base, 'siret', '12345678900012');
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe('splitLegalRecords', () => {
  test('separates identity scalars from document records', () => {
    const records = [
      record({ typeCode: 'siret', valueJson: JSON.stringify({ value: '111' }) }),
      record({ typeCode: 'raison_sociale', valueJson: JSON.stringify('Ti Kaz') }),
      record({ typeCode: 'liability_insurance', category: 'insurance' }),
    ];

    const { identity, documents } = splitLegalRecords(records);

    expect(identity.map((item) => item.typeCode)).toEqual(['siret', 'raison_sociale']);
    expect(documents.map((item) => item.typeCode)).toEqual(['liability_insurance']);
  });
});

describe('buildNewDocumentRecord', () => {
  test('builds an empty "forever" record carrying the option metadata', () => {
    const created = buildNewDocumentRecord(option({ code: 'liability_insurance', label: 'Assurance RC', category: 'insurance', isRequired: true }));

    expect(created.recordId).toBeNull();
    expect(created.typeCode).toBe('liability_insurance');
    expect(created.typeId).toBe('id-liability_insurance');
    expect(created.category).toBe('insurance');
    expect(created.isRequired).toBe(true);
    expect(created.validityMode).toBe('forever');
    expect(created.valueJson).toBe('');
    expect(created.status).toBe('active');
    expect(created.documentId).toBe('');
    expect(created.documentUrl).toBe('');
    expect(created.documentTitle).toBe('');
  });
});

describe('readLegalReference / buildReferenceValueJson', () => {
  test('reads the value-wrapped reference', () => {
    expect(readLegalReference(record({ valueJson: JSON.stringify({ value: 'POL-2026-001' }) }))).toBe('POL-2026-001');
  });

  test('builds the canonical { value } shape, trimming', () => {
    expect(buildReferenceValueJson('  POL-2026-001  ')).toBe(JSON.stringify({ value: 'POL-2026-001' }));
  });

  test('clears to empty string for a blank reference', () => {
    expect(buildReferenceValueJson('   ')).toBe('');
  });
});

describe('computeLegalDaysUntilExpiry', () => {
  test('returns null for a record with no end date', () => {
    expect(computeLegalDaysUntilExpiry(record({ validTo: '' }), '2026-06-17')).toBeNull();
  });

  test('counts whole days to a future end date', () => {
    expect(computeLegalDaysUntilExpiry(record({ validTo: '2026-06-27' }), '2026-06-17')).toBe(10);
  });

  test('is negative once past the end date', () => {
    expect(computeLegalDaysUntilExpiry(record({ validTo: '2026-06-10' }), '2026-06-17')).toBe(-7);
  });

  test('is computed from the dates, not the stored days_until_expiry (stays correct after an edit)', () => {
    expect(computeLegalDaysUntilExpiry(record({ validTo: '2026-06-27', daysUntilExpiry: '999' }), '2026-06-17')).toBe(10);
  });
});

describe('computeLegalExpiryFlag', () => {
  test('non-expiring active document is "En vigueur" (ok)', () => {
    expect(computeLegalExpiryFlag(record({ validityMode: 'forever', validTo: '' }), '2026-06-17')).toEqual({
      tone: 'ok',
      label: 'En vigueur',
    });
  });

  test('past end date is "Expiré" (expired)', () => {
    expect(computeLegalExpiryFlag(record({ validityMode: 'fixed_end_date', validTo: '2026-06-10' }), '2026-06-17')).toEqual({
      tone: 'expired',
      label: 'Expiré',
    });
  });

  test('within the warn window is "Expire dans N j" (warn)', () => {
    expect(computeLegalExpiryFlag(record({ validityMode: 'fixed_end_date', validTo: '2026-06-27' }), '2026-06-17')).toEqual({
      tone: 'warn',
      label: 'Expire dans 10 j',
    });
  });

  test('far-future end date is "En vigueur" (ok)', () => {
    expect(computeLegalExpiryFlag(record({ validityMode: 'fixed_end_date', validTo: '2030-01-01' }), '2026-06-17').tone).toBe('ok');
  });

  test('explicit expired status wins regardless of dates', () => {
    expect(computeLegalExpiryFlag(record({ status: 'expired', validityMode: 'forever', validTo: '' }), '2026-06-17')).toEqual({
      tone: 'expired',
      label: 'Expiré',
    });
  });
});

describe('hasExpiredRequiredDocument / hasExpiringRequiredDocument', () => {
  test('flags a mandatory document past its end date', () => {
    const records = [
      record({ typeCode: 'liability_insurance', isRequired: true, validityMode: 'fixed_end_date', validTo: '2026-06-10' }),
    ];
    expect(hasExpiredRequiredDocument(records, '2026-06-17')).toBe(true);
    expect(hasExpiringRequiredDocument(records, '2026-06-17')).toBe(false);
  });

  test('an expired but NON-mandatory document does not raise the required flag', () => {
    const records = [
      record({ typeCode: 'cyber_insurance', isRequired: false, validityMode: 'fixed_end_date', validTo: '2026-06-10' }),
    ];
    expect(hasExpiredRequiredDocument(records, '2026-06-17')).toBe(false);
  });

  test('flags a mandatory document expiring within the warn window', () => {
    const records = [
      record({ typeCode: 'liability_insurance', isRequired: true, validityMode: 'fixed_end_date', validTo: '2026-06-27' }),
    ];
    expect(hasExpiringRequiredDocument(records, '2026-06-17')).toBe(true);
    expect(hasExpiredRequiredDocument(records, '2026-06-17')).toBe(false);
  });
});

describe('formatLegalValidity', () => {
  test('non-expiring records read "Sans expiration"', () => {
    expect(formatLegalValidity(record({ validityMode: 'forever' }))).toBe('Sans expiration');
  });

  test('a bounded record reads "du X au Y"', () => {
    expect(
      formatLegalValidity(record({ validityMode: 'fixed_end_date', validFrom: '2026-01-01', validTo: '2026-12-31' })),
    ).toBe('du 2026-01-01 au 2026-12-31');
  });

  test('an end date alone reads "jusqu\'au Y"', () => {
    expect(formatLegalValidity(record({ validityMode: 'fixed_end_date', validTo: '2026-12-31' }))).toBe("jusqu'au 2026-12-31");
  });
});
