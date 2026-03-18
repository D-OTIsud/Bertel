import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Self-contained generator: avoids importing app TS modules under ts-node/ESM resolution quirks.
// Generates preset marker icons using the same SVG structure/glyphs as `src/config/map-markers.ts`.

type ObjectTypeCode = 'HOT' | 'RES' | 'ACT' | 'ITI' | 'EVT' | 'VIS' | 'SRV';

type MarkerIconKey = 'bed' | 'utensils' | 'spark' | 'route' | 'calendar' | 'building' | 'camera' | 'leaf';

type MarkerStyle = {
  color: string;
  icon: MarkerIconKey;
};

const objectTypeOptions: Array<{ code: ObjectTypeCode }> = [{ code: 'HOT' }, { code: 'RES' }, { code: 'ACT' }, { code: 'ITI' }, { code: 'EVT' }, { code: 'VIS' }, { code: 'SRV' }];

const markerIconCatalog: Record<MarkerIconKey, { label: string; glyph: string }> = {
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

const defaultMarkerStyles: Record<ObjectTypeCode, MarkerStyle> = {
  HOT: { color: '#E27B55', icon: 'bed' },
  RES: { color: '#CF9440', icon: 'utensils' },
  ACT: { color: '#1E7F78', icon: 'spark' },
  ITI: { color: '#327090', icon: 'route' },
  EVT: { color: '#C75E48', icon: 'calendar' },
  VIS: { color: '#7E6FB7', icon: 'camera' },
  SRV: { color: '#587C62', icon: 'building' },
};

function sanitizeMarkerColor(value: string, fallback: string): string {
  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback;
}

function normalizeMarkerIcon(value: string, fallback: MarkerIconKey): MarkerIconKey {
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

function buildMarkerSvg(style: MarkerStyle): string {
  const color = sanitizeMarkerColor(style.color, '#327090');
  const icon = markerIconCatalog[normalizeMarkerIcon(style.icon, 'spark')];

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="0 0 64 80" fill="none">
      <path d="M32 4C19.297 4 9 14.297 9 27c0 16.76 18.92 34.4 22.034 37.204a1.5 1.5 0 0 0 1.932 0C36.08 61.4 55 43.76 55 27 55 14.297 44.703 4 32 4Z" fill="${color}"/>
      <circle cx="32" cy="27" r="16" fill="#FFFCF7"/>
      <g transform="translate(20 15)" stroke="#18313B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">${icon.glyph}</g>
      <title>${escapeXml(icon.label)}</title>
    </svg>
  `.trim();
}

const outputDir = path.join(process.cwd(), 'public', 'markers');
fs.mkdirSync(outputDir, { recursive: true });

const PNG_WIDTH = 64;
const PNG_HEIGHT = 80;

async function renderToPng(svg: string) {
  // sharp can render SVG to raster PNGs on the Node side.
  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .resize(PNG_WIDTH, PNG_HEIGHT, { fit: 'fill' })
    .toBuffer();
}

async function main() {
  // Generate preset marker icons based on the defaultMarkerStyles.
  const codes = objectTypeOptions.map((o) => o.code);
  for (const code of codes) {
    const style = defaultMarkerStyles[code];
    const svg = buildMarkerSvg(style);
    const pngBytes = await renderToPng(svg);

    const outFile = path.join(outputDir, `marker-${code}.png`);
    fs.writeFileSync(outFile, pngBytes);
    // eslint-disable-next-line no-console
    console.log(`Generated ${path.relative(process.cwd(), outFile)}`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

