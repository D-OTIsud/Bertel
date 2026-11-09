import type { LegalItem } from './utils';

export interface LegalMention {
  label: string;
  isValid: boolean;
}

/**
 * Mentions publiques de la fiche. Le SIREN est une partie du SIRET : il n'apparaît
 * que si aucun SIRET public n'est affiché.
 */
export function buildLegalMentions(records: readonly LegalItem[]): LegalMention[] {
  const publicRecords = records.filter((record) => record.isPublic && record.label.trim() !== '');
  const hasSiret = publicRecords.some((record) => record.typeCode === 'siret');

  return publicRecords
    .filter((record) => !(hasSiret && record.typeCode === 'siren'))
    .map((record) => ({
      label: record.label,
      isValid: record.status.trim().toLowerCase() === 'active',
    }));
}
