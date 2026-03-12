import type { ObjectTypeCode } from '../types/domain';

export type MarkerIconKey =
  | 'bed'
  | 'utensils'
  | 'spark'
  | 'route'
  | 'calendar'
  | 'building'
  | 'camera'
  | 'leaf';

export type MarkerIconMode = 'preset' | 'custom';

export interface MarkerStyle {
  color: string;
  icon: MarkerIconKey;
  mode: MarkerIconMode;
  customSvg: string | null;
}

interface MarkerIconDefinition {
  label: string;
  glyph: string;
}

interface SanitizedSvgDefinition {
  viewBox: string;
  inner: string;
}

export const objectTypeOptions: Array<{ code: ObjectTypeCode; label: string }> = [
  { code: 'HOT', label: 'Hotel' },
  { code: 'RES', label: 'Restaurant' },
  { code: 'ACT', label: 'Activite' },
  { code: 'ITI', label: 'Itineraire' },
  { code: 'EVT', label: 'Evenement' },
];

export const markerIconCatalog: Record<MarkerIconKey, MarkerIconDefinition> = {
  bed: {
    label: 'Lit',
    glyph: '<path d="M4 12V9a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v3"/><path d="M2.5 12h19"/><path d="M3.5 16v-4h17v4"/><path d="M5 16v2"/><path d="M19 16v2"/>',
  },
  utensils: {
    label: 'Couverts',
    glyph: '<path d="M6 3v8"/><path d="M4 3v4"/><path d="M8 3v4"/><path d="M4 7h4"/><path d="M15 3v18"/><path d="M19 3v7a2 2 0 0 1-4 0V3"/>',
  },
  spark: {
    label: 'Etoile',
    glyph: '<path d="M12 3.5l1.9 4.6 4.9.4-3.7 3.2 1.1 4.8L12 14l-4.2 2.5 1.1-4.8-3.7-3.2 4.9-.4L12 3.5Z"/>',
  },
  route: {
    label: 'Trace',
    glyph: '<circle cx="6" cy="17" r="2"/><circle cx="18" cy="7" r="2"/><path d="M7.8 15.7c1.9-3.8 5.1-3.5 7.8-7.4"/><path d="M9.5 6.5c1.2 0 2.2 1 2.2 2.2S10.7 11 9.5 11 7.3 10 7.3 8.7 8.3 6.5 9.5 6.5Z"/>',
  },
  calendar: {
    label: 'Calendrier',
    glyph: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M4 9.5h16"/><path d="M8 13h3"/><path d="M13 13h3"/><path d="M8 17h3"/>',
  },
  building: {
    label: 'Batiment',
    glyph: '<path d="M5 20V6.5L12 3l7 3.5V20"/><path d="M9 9h2"/><path d="M13 9h2"/><path d="M9 13h2"/><path d="M13 13h2"/><path d="M11 20v-4h2v4"/>',
  },
  camera: {
    label: 'Camera',
    glyph: '<path d="M4 8h4l1.4-2h5.2L16 8h4v10H4Z"/><circle cx="12" cy="13" r="3.2"/>',
  },
  leaf: {
    label: 'Nature',
    glyph: '<path d="M19 4c-6 .5-10 3.8-10.8 9.1-.2 1.3-.1 2.6.2 3.9C14.2 16 18.3 11.8 19 4Z"/><path d="M5 20c2.7-4 6.2-6.7 10.5-8.3"/>',
  },
};

export const markerIconChoicesByType: Record<ObjectTypeCode, MarkerIconKey[]> = {
  HOT: ['bed', 'building', 'leaf'],
  RES: ['utensils', 'building', 'leaf'],
  ACT: ['spark', 'camera', 'leaf'],
  ITI: ['route', 'leaf', 'spark'],
  EVT: ['calendar', 'spark', 'camera'],
};

export const defaultMarkerStyles: Record<ObjectTypeCode, MarkerStyle> = {
  HOT: { color: '#ef7a49', icon: 'bed', mode: 'preset', customSvg: null },
  RES: { color: '#0d9488', icon: 'utensils', mode: 'preset', customSvg: null },
  ACT: { color: '#8b5cf6', icon: 'spark', mode: 'preset', customSvg: null },
  ITI: { color: '#3b82f6', icon: 'route', mode: 'preset', customSvg: null },
  EVT: { color: '#475569', icon: 'calendar', mode: 'preset', customSvg: null },
};

export function getMarkerImageId(type: string): string {
  return `marker-${String(type || 'default').toUpperCase()}`;
}

export function sanitizeMarkerColor(value: string, fallback: string): string {
  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback;
}

export function normalizeMarkerIcon(value: string, fallback: MarkerIconKey): MarkerIconKey {
  return value in markerIconCatalog ? (value as MarkerIconKey) : fallback;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractSanitizedSvgDefinition(svg: string): SanitizedSvgDefinition | null {
  const match = svg.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (!match) {
    return null;
  }

  const attrs = match[1] ?? '';
  const inner = (match[2] ?? '').trim();
  if (!inner) {
    return null;
  }

  const viewBox = attrs.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1] ?? '0 0 24 24';
  return {
    viewBox,
    inner,
  };
}

export function sanitizeCustomMarkerSvg(rawSvg: string): string | null {
  const trimmed = rawSvg.trim();
  if (!trimmed) {
    return null;
  }

  const cleaned = trimmed
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  if (!/<svg\b/i.test(cleaned)) {
    return null;
  }

  if (/<\s*(script|foreignObject|iframe|object|embed|image)\b/i.test(cleaned)) {
    return null;
  }

  if (/\son[a-z-]+\s*=/i.test(cleaned)) {
    return null;
  }

  if (/\s(?:href|xlink:href)\s*=\s*["'](?!#)[^"']*["']/i.test(cleaned)) {
    return null;
  }

  const withoutStyles = cleaned
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\sstyle\s*=\s*["'][^"']*["']/gi, '');

  const definition = extractSanitizedSvgDefinition(withoutStyles);
  if (!definition) {
    return null;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeXml(definition.viewBox)}">${definition.inner}</svg>`;
}

function buildCustomMarkerGlyph(customSvg: string): string | null {
  const sanitized = sanitizeCustomMarkerSvg(customSvg);
  if (!sanitized) {
    return null;
  }

  const definition = extractSanitizedSvgDefinition(sanitized);
  if (!definition) {
    return null;
  }

  return `<svg x="20" y="15" width="24" height="24" viewBox="${escapeXml(definition.viewBox)}" preserveAspectRatio="xMidYMid meet">${definition.inner}</svg>`;
}

export function buildMarkerSvg(style: MarkerStyle): string {
  const color = sanitizeMarkerColor(style.color, '#475569');
  const icon = markerIconCatalog[normalizeMarkerIcon(style.icon, 'spark')];
  const customGlyph = style.mode === 'custom' && style.customSvg ? buildCustomMarkerGlyph(style.customSvg) : null;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="0 0 64 80" fill="none">
      <path d="M32 4C19.297 4 9 14.297 9 27c0 16.76 18.92 34.4 22.034 37.204a1.5 1.5 0 0 0 1.932 0C36.08 61.4 55 43.76 55 27 55 14.297 44.703 4 32 4Z" fill="${color}"/>
      <circle cx="32" cy="27" r="16" fill="#FFF7ED"/>
      ${customGlyph ?? `<g transform="translate(20 15)" stroke="#2B1F18" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">${icon.glyph}</g>`}
      <title>${escapeXml(customGlyph ? 'SVG personnalise' : icon.label)}</title>
    </svg>
  `.trim();
}

export function buildMarkerDataUri(style: MarkerStyle): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildMarkerSvg(style))}`;
}

export function coerceMarkerStyles(value: unknown): Record<ObjectTypeCode, MarkerStyle> {
  const next = { ...defaultMarkerStyles };

  if (!value || typeof value !== 'object') {
    return next;
  }

  for (const { code } of objectTypeOptions) {
    const raw = (value as Record<string, unknown>)[code];
    if (!raw || typeof raw !== 'object') {
      continue;
    }

    const rawRecord = raw as Record<string, unknown>;
    const customSvg = sanitizeCustomMarkerSvg(String(rawRecord.customSvg ?? ''));
    const mode = rawRecord.mode === 'custom' && customSvg ? 'custom' : 'preset';

    next[code] = {
      color: sanitizeMarkerColor(String(rawRecord.color ?? ''), defaultMarkerStyles[code].color),
      icon: normalizeMarkerIcon(String(rawRecord.icon ?? ''), defaultMarkerStyles[code].icon),
      mode,
      customSvg,
    };
  }

  return next;
}
