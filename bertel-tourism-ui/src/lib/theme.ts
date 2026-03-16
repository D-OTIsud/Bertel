export interface ThemeSettings {
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  backgroundColor: string;
  surfaceColor: string;
}

export const defaultThemeSettings: ThemeSettings = {
  brandName: 'Bertel Tourism',
  logoUrl: null,
  primaryColor: '#176B6A',
  accentColor: '#F28B54',
  textColor: '#18313B',
  backgroundColor: '#F4EEE5',
  surfaceColor: '#FFFDF8',
};

function clamp(value: number, min = 0, max = 255): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeLogoUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return /^(data:image\/|blob:|https?:\/\/|\/)/i.test(normalized) ? normalized : null;
}

export function sanitizeHexColor(value: string, fallback: string): string {
  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : fallback.toUpperCase();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = sanitizeHexColor(hex, '#000000').slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((channel) => clamp(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function mixColors(base: string, target: string, weight: number): string {
  const a = hexToRgb(base);
  const b = hexToRgb(target);
  return rgbToHex(
    Math.round(a.r + (b.r - a.r) * weight),
    Math.round(a.g + (b.g - a.g) * weight),
    Math.round(a.b + (b.b - a.b) * weight),
  );
}

export function rgbChannels(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channels = [r, g, b].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastText(background: string): string {
  return luminance(background) > 0.52 ? '#18313B' : '#FFFDF8';
}

function dominantColorsFromPixels(pixels: Uint8ClampedArray): string[] {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

  for (let index = 0; index < pixels.length; index += 16) {
    const alpha = pixels[index + 3] ?? 0;
    if (alpha < 128) {
      continue;
    }

    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const key = `${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`;
    const current = buckets.get(key);

    if (current) {
      current.count += 1;
      current.r += r;
      current.g += g;
      current.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }

  return [...buckets.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, 4)
    .map((entry) => rgbToHex(Math.round(entry.r / entry.count), Math.round(entry.g / entry.count), Math.round(entry.b / entry.count)));
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Lecture du logo impossible.'));
    reader.readAsDataURL(file);
  });
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Chargement du logo impossible.'));
    image.src = dataUrl;
  });
}

export async function extractThemeFromLogoDataUrl(dataUrl: string): Promise<Partial<ThemeSettings>> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas indisponible pour extraire la palette du logo.');
  }

  const width = 96;
  const height = Math.max(24, Math.round((image.naturalHeight / Math.max(image.naturalWidth, 1)) * width));
  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  const pixels = context.getImageData(0, 0, width, height).data;
  const palette = dominantColorsFromPixels(pixels);
  const primaryColor = palette[0] ?? defaultThemeSettings.primaryColor;
  const accentColor = palette[1] ?? mixColors(primaryColor, '#FFF6EE', 0.46);
  const backgroundColor = mixColors(primaryColor, '#FFF8F1', 0.9);
  const surfaceColor = mixColors(primaryColor, '#FFFFFF', 0.96);

  return {
    logoUrl: dataUrl,
    primaryColor,
    accentColor,
    backgroundColor,
    surfaceColor,
    textColor: contrastText(backgroundColor),
  };
}

export function applyThemeToDocument(theme: ThemeSettings): void {
  const root = document.documentElement;
  const primary = sanitizeHexColor(theme.primaryColor, defaultThemeSettings.primaryColor);
  const accent = sanitizeHexColor(theme.accentColor, defaultThemeSettings.accentColor);
  const text = sanitizeHexColor(theme.textColor, defaultThemeSettings.textColor);
  const background = sanitizeHexColor(theme.backgroundColor, defaultThemeSettings.backgroundColor);
  const surface = sanitizeHexColor(theme.surfaceColor, defaultThemeSettings.surfaceColor);
  const bgStrong = mixColors(background, primary, 0.08);
  const panel = mixColors(surface, background, 0.18);
  const surfaceSoft = mixColors(surface, primary, 0.06);
  const line = mixColors(text, background, 0.82);
  const accentSoft = mixColors(accent, surface, 0.86);
  const accentStrong = mixColors(accent, text, 0.18);
  const muted = mixColors(text, background, 0.54);
  const primaryForeground = contrastText(primary);
  const shadowColor = rgbChannels(mixColors(text, '#000000', 0.12)).replace(/ /g, ', ');

  const variables: Record<string, string> = {
    '--theme-primary': primary,
    '--theme-primary-rgb': rgbChannels(primary),
    '--theme-accent': accent,
    '--theme-accent-rgb': rgbChannels(accent),
    '--theme-text': text,
    '--theme-text-rgb': rgbChannels(text),
    '--theme-bg': background,
    '--theme-bg-rgb': rgbChannels(background),
    '--theme-surface': surface,
    '--theme-surface-rgb': rgbChannels(surface),
    '--bg': background,
    '--bg-strong': bgStrong,
    '--panel': panel,
    '--panel-strong': surface,
    '--surface-soft': surfaceSoft,
    '--line': line,
    '--text': text,
    '--text-muted': muted,
    '--accent-soft': accentSoft,
    '--accent-brand': accent,
    '--accent-brand-strong': accentStrong,
    '--teal': primary,
    '--warning': '#D6933A',
    '--shadow-soft': `0 18px 48px rgba(${shadowColor}, 0.08)`,
    '--shadow': `0 30px 80px rgba(${shadowColor}, 0.14)`,
    '--background': background,
    '--foreground': text,
    '--card': surface,
    '--card-foreground': text,
    '--popover': surface,
    '--popover-foreground': text,
    '--primary': primary,
    '--primary-foreground': primaryForeground,
    '--secondary': surfaceSoft,
    '--secondary-foreground': text,
    '--muted': surfaceSoft,
    '--muted-foreground': muted,
    '--accent': accentSoft,
    '--accent-foreground': text,
    '--border': line,
    '--input': line,
    '--ring': primary,
    '--radius': '1rem',
    '--radius-xl': '32px',
    '--radius-lg': '24px',
    '--radius-md': '18px',
    '--radius-sm': '14px',
  };

  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  root.style.colorScheme = 'light';
}

export function coerceThemeSettings(value: unknown): ThemeSettings {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    brandName: String(raw.brandName ?? defaultThemeSettings.brandName).trim() || defaultThemeSettings.brandName,
    logoUrl: sanitizeLogoUrl(raw.logoUrl ?? raw.logoDataUrl),
    primaryColor: sanitizeHexColor(String(raw.primaryColor ?? ''), defaultThemeSettings.primaryColor),
    accentColor: sanitizeHexColor(String(raw.accentColor ?? ''), defaultThemeSettings.accentColor),
    textColor: sanitizeHexColor(String(raw.textColor ?? ''), defaultThemeSettings.textColor),
    backgroundColor: sanitizeHexColor(String(raw.backgroundColor ?? ''), defaultThemeSettings.backgroundColor),
    surfaceColor: sanitizeHexColor(String(raw.surfaceColor ?? ''), defaultThemeSettings.surfaceColor),
  };
}
