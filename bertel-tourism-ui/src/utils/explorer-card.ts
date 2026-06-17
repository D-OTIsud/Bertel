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

// Label values that are a granted STATUS (binary "obtained") rather than a meaningful grade/type.
const STATUS_VALUE_WORDS = new Set(['obtenu', 'accorde', 'acquis', 'octroye', 'attribue']);

/**
 * Strip a trailing " · <value>" from a classification/label when the value is a binary granted
 * STATUS ("· Obtenu") or a "Titulaire …" repeat of the scheme name — so the pill shows only the
 * label name. Graded values ("4 étoiles", "Catégorie I", "Gastronomique", "1 cheminée") are kept.
 */
function stripRedundantValueSuffix(label: string): string {
  const idx = label.lastIndexOf(' · ');
  if (idx === -1) {
    return label;
  }
  const valueKey = normalizeForCompare(label.slice(idx + 3));
  if (STATUS_VALUE_WORDS.has(valueKey) || valueKey.startsWith('titulaire')) {
    return label.slice(0, idx).trimEnd();
  }
  return label;
}

function dedupeLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const label of labels.map(cleanText).map(shortenDisplayLabel).map(stripRedundantValueSuffix).filter(Boolean)) {
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

/**
 * Neutral pills = the object's CLASSIFICATIONS & LABELS only: every distinction badge the RPC emits
 * (kinds classification / ranking / sustainability_label / accessibility_label / custom display-group)
 * EXCEPT the two non-label families — `sustainability_action` (eco-practices) and
 * `accessibility_amenity` (equipment), which are filtered server-side via their own params and shown
 * elsewhere, not as label chips. Taxonomy (the métier sub-category) is excluded too — it shows on the
 * card's metadata line. Decision 2026-06-16: keep the card chip line to tags + classification + label.
 */
function readClassificationAndLabelBadges(card: ObjectCard): string[] {
  return readBadgesByKind(card, (kind) => kind !== 'sustainability_action' && kind !== 'accessibility_amenity');
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Convert a validated #rrggbb hex to HSL (h in [0,360), s & l in [0,1]). Pure helper. */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) {
    return { h: 0, s: 0, l };
  }
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) {
    h = ((g - b) / delta) % 6;
  } else if (max === g) {
    h = (b - r) / delta + 2;
  } else {
    h = (r - g) / delta + 4;
  }
  h *= 60;
  if (h < 0) {
    h += 360;
  }
  return { h, s, l };
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

const NEUTRAL_CHROMA_CUTOFF = 0.2; // below this a tag reads as a neutral gray (the slate default)

/**
 * Inline style for a colored §09 tag chip. We render the house "soft chip" treatment — a pale
 * same-hue tint background + a dark, readable same-hue text — mirroring the Explorer category chips
 * (bg-*-soft / text-*-2) and the --teal-soft / --teal-2 tokens, rather than a loud, fully-saturated
 * solid fill. Both colors are derived purely from the stored hex (kept as the hue anchor), so every
 * existing tag is calmed without a data migration and the swatches/previews stay WYSIWYG. Near-gray
 * inputs (the slate default) stay neutral instead of being pushed toward a color. Shared by the card,
 * map hover, the §09 editor preview and the filter chips.
 */
export function tagChipStyle(hex: string): { backgroundColor: string; color: string } {
  const { h, s } = hexToHsl(normalizeHexColor(hex));
  const isNeutral = s < NEUTRAL_CHROMA_CUTOFF;
  const bgSaturation = isNeutral ? clamp(s, 0, 0.1) : clamp(s * 0.55, 0.22, 0.5);
  const textSaturation = isNeutral ? clamp(s, 0.06, 0.16) : clamp(s * 0.85 + 0.1, 0.32, 0.62);
  const textLightness = isNeutral ? 0.34 : 0.3;
  return {
    backgroundColor: hsl(h, bgSaturation, 0.93),
    color: hsl(h, textSaturation, textLightness),
  };
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
  //
  // The neutral `labels` line is intentionally limited to the label-match feedback pill +
  // CLASSIFICATIONS & LABELS (+ the card.labels field). Environment/ambiance tags, sustainability
  // actions, accessibility amenities, pet-friendly and the accessibility signal are NOT surfaced here
  // — each has its own dedicated Explorer filter and (where editable) its own editor section.
  // Decision 2026-06-16.
  const labels = dedupeLabels([
    readLabelMatchLabel(card),
    ...readClassificationAndLabelBadges(card),
    ...readLabels(card.labels),
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
