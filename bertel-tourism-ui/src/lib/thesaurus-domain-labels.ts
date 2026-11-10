import domainLabels from './thesaurus-domain-labels.fr.json';

/** French business names, reviewed against the source fields and their actual use. */
export const THESAURUS_DOMAIN_LABELS: Readonly<Record<string, string>> = Object.freeze(domainLabels);

const ADAPTER_DOMAINS: Readonly<Record<string, string>> = {
  ref_amenity: 'amenity',
  ref_classification_scheme: 'classification_scheme',
  ref_classification_value: 'classification_value',
  ref_language: 'language',
  ref_commune: 'commune',
  ref_sustainability_action: 'sustainability_action',
  ref_sustainability_action_category: 'sustainability_category',
};

function readableFallback(code: string, name?: string | null): string | null {
  const label = name?.trim();
  if (!label || label.toLowerCase() === code.toLowerCase()
    || /taxonomy|taxonomie|\bref_code\b|^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/i.test(label)) return null;
  return label;
}

/** Identifiers remain untouched in filters and write payloads; only their names are presented. */
export function getThesaurusDomainLabel(domain: string, storedName?: string | null): string {
  const code = domain.trim().replace(/^ref_code:/, '');
  const reviewedName = Object.hasOwn(THESAURUS_DOMAIN_LABELS, code) ? THESAURUS_DOMAIN_LABELS[code] : undefined;
  return reviewedName ?? readableFallback(code, storedName) ?? 'Domaine non nommé';
}

export function getReferenceCatalogLabel(catalogKey: string, storedLabel?: string | null): string {
  if (catalogKey.startsWith('ref_code:')) return getThesaurusDomainLabel(catalogKey, storedLabel);
  const domain = Object.hasOwn(ADAPTER_DOMAINS, catalogKey) ? ADAPTER_DOMAINS[catalogKey] : undefined;
  return domain ? getThesaurusDomainLabel(domain, storedLabel)
    : readableFallback(catalogKey, storedLabel) ?? 'Catalogue de référence';
}
