import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Self-contained generator: avoids importing app TS modules under ts-node/ESM resolution quirks.
// Generates preset marker icons using the same SVG structure/glyphs as `src/config/map-markers.ts`.

type ObjectTypeCode = 'HOT' | 'RES' | 'ACT' | 'ITI' | 'EVT' | 'VIS' | 'SRV';

type MarkerIconKey = 'bed' | 'utensils' | 'spark' | 'route' | 'calendar' | 'building' | 'camera' | 'leaf' | 'activity' | 'mountain' | 'store';

type MarkerStyle = {
  color: string;
  icon: MarkerIconKey;
};

const objectTypeOptions: Array<{ code: ObjectTypeCode }> = [{ code: 'HOT' }, { code: 'RES' }, { code: 'ACT' }, { code: 'ITI' }, { code: 'EVT' }, { code: 'VIS' }, { code: 'SRV' }];

// Glyphes lucide (ISC) — DOIVENT rester synchrones avec `src/config/map-markers.ts`
// (même catalogue, même défauts). Cf. décision §123.
const markerIconCatalog: Record<MarkerIconKey, { label: string; glyph: string }> = {
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

const defaultMarkerStyles: Record<ObjectTypeCode, MarkerStyle> = {
  HOT: { color: '#E27B55', icon: 'bed' },
  RES: { color: '#CF9440', icon: 'utensils' },
  ACT: { color: '#1E7F78', icon: 'activity' },
  ITI: { color: '#327090', icon: 'route' },
  EVT: { color: '#C75E48', icon: 'calendar' },
  VIS: { color: '#7E6FB7', icon: 'mountain' },
  SRV: { color: '#587C62', icon: 'store' },
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

