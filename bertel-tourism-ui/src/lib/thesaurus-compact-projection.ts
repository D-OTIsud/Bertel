/**
 * Pure projections for the `view=compact` HTTP representation.
 * Inputs are already localized by the full public projection; outputs keep only the whitelisted keys.
 */
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function compactDomain(value: unknown): JsonObject {
  const domain = object(value);
  if (!domain || typeof domain.domain !== 'string') throw new Error('invalid_snapshot');
  return {
    domain: domain.domain,
    name: typeof domain.name === 'string' ? domain.name : null,
    effective_lang: typeof domain.effective_lang === 'string' ? domain.effective_lang : null,
  };
}

function compactReleaseSummary(value: unknown): JsonObject {
  const release = object(value);
  if (!release) throw new Error('invalid_snapshot');
  return {
    release_id: release.release_id ?? null,
    previous_release_id: release.previous_release_id ?? null,
    as_of: release.as_of ?? null,
  };
}

/**
 * Compact manifest data: licence, attribution, domain names and, for discovery only, a flat release history.
 * Nested manifests, counters, editorial rules and metadata checksums stay in the full representation.
 */
export function compactManifestData(source: JsonObject, includeReleases: boolean): JsonObject {
  const result: JsonObject = { license: source.license ?? null, attribution: source.attribution ?? null };
  if (source.domains !== undefined) {
    if (!Array.isArray(source.domains)) throw new Error('invalid_snapshot');
    result.domains = source.domains.map(compactDomain);
  }
  if (includeReleases && source.releases !== undefined) {
    if (!Array.isArray(source.releases)) throw new Error('invalid_snapshot');
    result.releases = source.releases.map(compactReleaseSummary);
  }
  return result;
}

function hasItems(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Compact concept row. `name`/`effective_lang` become explicit nulls when no label exists;
 * optional fields appear only when they carry information, so absence means "not provided".
 */
export function compactConcept(concept: JsonObject): JsonObject {
  if (typeof concept.concept_id !== 'string' || typeof concept.domain !== 'string'
    || typeof concept.code !== 'string' || typeof concept.lifecycle !== 'string'
    || typeof concept.assignable !== 'boolean') {
    throw new Error('invalid_snapshot');
  }
  const row: JsonObject = {
    concept_id: concept.concept_id,
    domain: concept.domain,
    code: concept.code,
    name: typeof concept.name === 'string' ? concept.name : null,
    effective_lang: typeof concept.effective_lang === 'string' ? concept.effective_lang : null,
    lifecycle: concept.lifecycle,
    assignable: concept.assignable,
  };
  if (typeof concept.context_key === 'string' && concept.context_key.length > 0) row.context_key = concept.context_key;
  if (typeof concept.description === 'string' && concept.description.trim()) {
    row.description = concept.description;
    row.definition_lang = typeof concept.definition_lang === 'string' ? concept.definition_lang : null;
  }
  for (const key of ['valid_from', 'valid_to'] as const) {
    if (concept[key] !== undefined && concept[key] !== null) row[key] = concept[key];
  }
  for (const key of ['broader', 'member_of', 'replaced_by'] as const) {
    if (hasItems(concept[key])) row[key] = concept[key];
  }
  return row;
}
