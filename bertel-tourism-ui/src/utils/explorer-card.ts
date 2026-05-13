import type { LocationSummary, ObjectCard } from '../types/domain';

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
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

function dedupeLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const label of labels.map(cleanText).filter(Boolean)) {
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
  return [
    ...readBadgesByKind(card, (kind) => kind.includes('classification') || kind.includes('ranking')),
    ...readLabels(card.taxonomy),
  ];
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

export function normalizeExplorerCard(card: ObjectCard): ObjectCard {
  const labels = dedupeLabels([
    ...readClassificationLabels(card),
    ...readLabels(card.labels),
    ...readBadgeLabels(card),
    ...readLabels(card.tags),
    ...readLabels(card.environment_tags),
    ...(hasPetFriendlySignal(card) ? ['Animaux acceptes'] : []),
    ...(hasAccessibilitySignal(card) ? ['Accessibilite'] : []),
  ]);
  const formattedAddress = formatExplorerCardAddress(card.location);

  return {
    ...card,
    labels,
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
