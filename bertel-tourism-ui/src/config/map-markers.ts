import type { BackendObjectTypeCode, ObjectTypeCode } from '../types/domain';
import { EXPLORER_TYPE_CODE_FAMILIES, normalizeExplorerObjectType } from '../utils/facets';

export type MarkerIconKey =
  | 'bed'
  | 'utensils'
  | 'spark'
  | 'route'
  | 'calendar'
  | 'building'
  | 'camera'
  | 'leaf'
  | 'activity'
  | 'mountain'
  | 'store';

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

export const objectTypeOptions: Array<{ code: ObjectTypeCode; label: string; backendTypes: BackendObjectTypeCode[] }> = [
  { code: 'HOT', label: 'Hebergement', backendTypes: EXPLORER_TYPE_CODE_FAMILIES.HOT },
  { code: 'RES', label: 'Restaurant', backendTypes: EXPLORER_TYPE_CODE_FAMILIES.RES },
  { code: 'ACT', label: 'Activite', backendTypes: EXPLORER_TYPE_CODE_FAMILIES.ACT },
  { code: 'ITI', label: 'Itineraire', backendTypes: EXPLORER_TYPE_CODE_FAMILIES.ITI },
  { code: 'EVT', label: 'Evenement', backendTypes: EXPLORER_TYPE_CODE_FAMILIES.EVT },
  { code: 'VIS', label: 'Visite', backendTypes: EXPLORER_TYPE_CODE_FAMILIES.VIS },
  { code: 'SRV', label: 'Service', backendTypes: EXPLORER_TYPE_CODE_FAMILIES.SRV },
];

/**
 * Catalogue d'icônes des marqueurs — glyphes SVG (stroke, viewBox 24×24) dérivés
 * de `lucide-react` (ISC), le même jeu que celui de l'UI. Source UNIQUE consommée
 * par : MapLegend (légende carte), ResultCardView (picto de type), SettingsPage
 * (aperçus marqueur) et `scripts/generate-marker-pngs.ts` (PNG des pins — gardez
 * les deux copies synchrones). Les anciens glyphes dessinés à la main étaient
 * jugés trop ternes ; on revient au tracé lucide d'origine de la légende, étendu
 * aux pins pour que tout reste aligné (cf. décision §123).
 */
export const markerIconCatalog: Record<MarkerIconKey, MarkerIconDefinition> = {
  bed: {
    label: 'Lit',
    glyph: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  },
  utensils: {
    label: 'Couverts',
    glyph: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  },
  spark: {
    label: 'Etoile',
    glyph: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  },
  route: {
    label: 'Trace',
    glyph: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  },
  calendar: {
    label: 'Calendrier',
    glyph: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  },
  building: {
    label: 'Batiment',
    glyph: '<path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M12 6h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/><path d="M8 6h.01"/><path d="M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><rect x="4" y="2" width="16" height="20" rx="2"/>',
  },
  camera: {
    label: 'Camera',
    glyph: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
  },
  leaf: {
    label: 'Nature',
    glyph: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  },
  activity: {
    label: 'Activite',
    glyph: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  },
  mountain: {
    label: 'Montagne',
    glyph: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  },
  store: {
    label: 'Boutique',
    glyph: '<path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"/><path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"/><path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"/>',
  },
};

export const markerIconChoicesByType: Record<ObjectTypeCode, MarkerIconKey[]> = {
  HOT: ['bed', 'building', 'leaf'],
  RES: ['utensils', 'building', 'leaf'],
  ACT: ['activity', 'spark', 'leaf'],
  ITI: ['route', 'leaf', 'spark'],
  EVT: ['calendar', 'spark', 'camera'],
  VIS: ['mountain', 'camera', 'leaf'],
  SRV: ['store', 'building', 'leaf'],
};

export const defaultMarkerStyles: Record<ObjectTypeCode, MarkerStyle> = {
  HOT: { color: '#E27B55', icon: 'bed', mode: 'preset', customSvg: null },
  RES: { color: '#CF9440', icon: 'utensils', mode: 'preset', customSvg: null },
  ACT: { color: '#1E7F78', icon: 'activity', mode: 'preset', customSvg: null },
  ITI: { color: '#327090', icon: 'route', mode: 'preset', customSvg: null },
  EVT: { color: '#C75E48', icon: 'calendar', mode: 'preset', customSvg: null },
  VIS: { color: '#7E6FB7', icon: 'mountain', mode: 'preset', customSvg: null },
  SRV: { color: '#587C62', icon: 'store', mode: 'preset', customSvg: null },
};

export function getMarkerImageId(type: string): string {
  return `marker-${normalizeExplorerObjectType(type)}`;
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
  const color = sanitizeMarkerColor(style.color, '#327090');
  const icon = markerIconCatalog[normalizeMarkerIcon(style.icon, 'spark')];
  const customGlyph = style.mode === 'custom' && style.customSvg ? buildCustomMarkerGlyph(style.customSvg) : null;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="0 0 64 80" fill="none">
      <path d="M32 4C19.297 4 9 14.297 9 27c0 16.76 18.92 34.4 22.034 37.204a1.5 1.5 0 0 0 1.932 0C36.08 61.4 55 43.76 55 27 55 14.297 44.703 4 32 4Z" fill="${color}"/>
      <circle cx="32" cy="27" r="16" fill="#FFFCF7"/>
      ${customGlyph ?? `<g transform="translate(20 15)" stroke="#18313B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">${icon.glyph}</g>`}
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
