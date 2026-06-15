import type { LocationSummary, ObjectCard, ObjectCardTagChip } from '../types/domain';

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function pluralizeFrenchUnit(count: string, singular: string, plural: string): string {
  return Number(count) > 1 ? plural : singular;
}

function normalizeForCompare(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeCode(value: string): string {
  return normalizeForCompare(value).replace(/\s+/g, '_');
}

function containsNormalized(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeForCompare(needle);
  return Boolean(normalizedNeedle) && normalizeForCompare(haystack).includes(normalizedNeedle);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readLabel(value: unknown): string {
  if (typeof value === 'string') {
    return cleanText(value);
  }
  if (!isRecord(value)) {
    return '';
  }
  return cleanText(value.label) || cleanText(value.name) || cleanText(value.slug) || cleanText(value.code);
}

function shortenDisplayLabel(label: string): string {
  const normalized = normalizeForCompare(label);
  if (!normalized.includes('classement') && !normalized.includes('meuble')) {
    return label;
  }

  const unitMatch = label.match(/(\d+)\s*(etoile|etoiles|étoile|étoiles|cle|cles|clé|clés|epi|epis|épi|épis)/i);
  if (!unitMatch) {
    return label;
  }

  const [, count, unit] = unitMatch;
  const normalizedUnit = normalizeForCompare(unit);
  if (normalizedUnit.startsWith('etoile')) {
    return `${count} ${pluralizeFrenchUnit(count, 'étoile', 'étoiles')}`;
  }
  if (normalizedUnit.startsWith('cle')) {
    return `${count} ${pluralizeFrenchUnit(count, 'clé', 'clés')}`;
  }
  if (normalizedUnit.startsWith('epi')) {
    return `${count} ${pluralizeFrenchUnit(count, 'épi', 'épis')}`;
  }

  return label;
}

function dedupeLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const label of labels.map(cleanText).map(shortenDisplayLabel).filter(Boolean)) {
    const key = normalizeForCompare(label);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(label);
  }

  return next;
}

function readLabels(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readLabel).filter(Boolean) : [];
}

function readObjectList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readBadgesByKind(card: ObjectCard, predicate: (kind: string) => boolean): string[] {
  return readObjectList(card.badges)
    .filter((badge) => predicate(normalizeCode(cleanText(badge.kind))))
    .map(readLabel)
    .filter(Boolean);
}

function readBadgeLabels(card: ObjectCard): string[] {
  return readBadgesByKind(
    card,
    (kind) => !kind.includes('classification') && !kind.includes('ranking') && kind !== 'accessibility_amenity',
  );
}

function readClassificationLabels(card: ObjectCard): string[] {
  // Taxonomy (the métier sub-category) is NOT a label — it shows on the card's metadata line
  // (type · city · taxonomy), so it is excluded here to avoid a duplicate neutral chip.
  return readBadgesByKind(card, (kind) => kind.includes('classification') || kind.includes('ranking'));
}

function readAmenityCodes(card: ObjectCard): string[] {
  return Array.isArray(card.amenity_codes) ? card.amenity_codes.map((code) => normalizeCode(code)).filter(Boolean) : [];
}

function hasPetFriendlySignal(card: ObjectCard): boolean {
  if (card.pet_accepted === true) {
    return true;
  }
  const amenityCodes = readAmenityCodes(card);
  return amenityCodes.some((code) => code === 'pet_friendly' || code.startsWith('pet_'));
}

function hasAccessibilitySignal(card: ObjectCard): boolean {
  const amenityCodes = readAmenityCodes(card);
  if (amenityCodes.some((code) => code.startsWith('acc_') || code === 'wheelchair_access')) {
    return true;
  }
  return readObjectList(card.badges).some((badge) => normalizeCode(cleanText(badge.kind)).includes('accessibility'));
}

function readLabelMatchLabel(card: ObjectCard): string {
  if (!card.label_match) {
    return '';
  }
  if (card.label_match.rank === 0) {
    return 'Label certifié';
  }
  if (card.label_match.source === 'accessibility_amenity') {
    return 'Équipements compatibles';
  }
  if (card.label_match.source === 'sustainability_action') {
    return 'Actions compatibles';
  }
  return 'Preuves compatibles';
}

function buildCityLine(location: LocationSummary): string {
  return [cleanText(location.postcode), cleanText(location.city)].filter(Boolean).join(' ');
}

export function formatExplorerCardAddress(location?: LocationSummary): string | null {
  if (!location) {
    return null;
  }

  const rawAddress = cleanText(location.address);
  const city = cleanText(location.city);
  const postcode = cleanText(location.postcode);
  const lieuDit = cleanText(location.lieu_dit);
  const cityLine = buildCityLine(location);

  if (!rawAddress) {
    return [lieuDit, cityLine].filter(Boolean).join(', ') || null;
  }

  const removableParts = new Set(
    [city, postcode, lieuDit, cityLine, [city, postcode].filter(Boolean).join(' ')].map(normalizeForCompare).filter(Boolean),
  );
  const parts = rawAddress.split(',').map(cleanText).filter(Boolean);

  while (parts.length > 1) {
    const lastKey = normalizeForCompare(parts[parts.length - 1]);
    if (!removableParts.has(lastKey)) {
      break;
    }
    parts.pop();
  }

  const trailingPart = parts[parts.length - 1] ?? '';
  const trailingLooksLikeStructuredLocation =
    parts.length > 1 &&
    Boolean(city || postcode) &&
    ((cityLine && containsNormalized(trailingPart, cityLine)) ||
      (Boolean(city) && containsNormalized(trailingPart, city) && Boolean(postcode) && containsNormalized(trailingPart, postcode)) ||
      (Boolean(lieuDit) && containsNormalized(trailingPart, lieuDit) && Boolean(postcode) && containsNormalized(trailingPart, postcode)));

  if (trailingLooksLikeStructuredLocation) {
    parts.pop();
  }

  const baseAddress = parts.join(', ');
  const extras: string[] = [];

  if (lieuDit && !containsNormalized(baseAddress, lieuDit)) {
    extras.push(lieuDit);
  }

  if (cityLine) {
    const alreadyHasCityLine = containsNormalized(baseAddress, cityLine);
    const alreadyHasCityAndPostcode =
      (!city || containsNormalized(baseAddress, city)) && (!postcode || containsNormalized(baseAddress, postcode));
    if (!alreadyHasCityLine && !alreadyHasCityAndPostcode) {
      extras.push(cityLine);
    }
  } else if (city && !containsNormalized(baseAddress, city)) {
    extras.push(city);
  }

  return [baseAddress, ...extras].filter(Boolean).join(', ') || null;
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/;
const DEFAULT_TAG_HEX = '#64748b';

function normalizeHexColor(value: unknown): string {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return HEX_COLOR_RE.test(v) ? v : DEFAULT_TAG_HEX;
}

/**
 * Inline style for a colored §09 tag chip: solid hex fill + a contrast-computed text color
 * (relative luminance) so any palette color stays legible. Shared by the card, map hover and the
 * §09 editor preview/swatches.
 */
export function tagChipStyle(hex: string): { backgroundColor: string; color: string } {
  const color = normalizeHexColor(hex);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return { backgroundColor: color, color: luminance > 0.6 ? '#1f2937' : '#ffffff' };
}

/**
 * Build the colored §09 tag chips: keep card.tags order (= tag_link.position from the RPC), dedup by
 * normalized label, and CROSS-DEDUPE against the neutral `labels` blend so the same concept never
 * shows as both a colored chip and a neutral label.
 */
function buildTagChips(tags: unknown, neutralLabels: string[]): ObjectCardTagChip[] {
  const taken = new Set(neutralLabels.map((label) => normalizeForCompare(label)));
  const chips: ObjectCardTagChip[] = [];
  for (const raw of readObjectList(tags)) {
    const label = shortenDisplayLabel(readLabel(raw));
    const key = normalizeForCompare(label);
    if (!label || !key || taken.has(key)) {
      continue;
    }
    taken.add(key);
    chips.push({ label, color: normalizeHexColor(raw.color), slug: cleanText(raw.slug) });
  }
  return chips;
}

export function normalizeExplorerCard(card: ObjectCard): ObjectCard {
  // §09 tags are the curated COLORED display layer — pulled OUT of the neutral `labels` blend (so a
  // tag never double-renders as a colored chip AND a neutral label / inflates +N) and emitted as a
  // separate colored, position-ordered group via buildTagChips.
  const labels = dedupeLabels([
    readLabelMatchLabel(card),
    ...readClassificationLabels(card),
    ...readLabels(card.labels),
    ...readBadgeLabels(card),
    ...readLabels(card.environment_tags),
    ...(hasPetFriendlySignal(card) ? ['Animaux acceptes'] : []),
    ...(hasAccessibilitySignal(card) ? ['Accessibilite'] : []),
  ]);
  // Tag chips still dedup against the taxonomy (shown on the metadata line) so a §09 tag never
  // duplicates it — even though taxonomy is no longer rendered as a neutral chip.
  const tagChips = buildTagChips(card.tags, [...labels, ...readLabels(card.taxonomy)]);
  const formattedAddress = formatExplorerCardAddress(card.location);

  return {
    ...card,
    labels,
    tagChips,
    location: card.location
      ? {
          ...card.location,
          address: formattedAddress ?? card.location.address ?? null,
        }
      : card.location,
  };
}

export function normalizeExplorerCards(cards: ObjectCard[]): ObjectCard[] {
  return cards.map(normalizeExplorerCard);
}
