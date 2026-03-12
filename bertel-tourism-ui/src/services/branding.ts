import { coerceMarkerStyles, type MarkerStyle } from '../config/map-markers';
import { getSupabaseClient } from '../lib/supabase';
import { coerceThemeSettings, type ThemeSettings } from '../lib/theme';
import { useSessionStore } from '../store/session-store';
import type { ObjectTypeCode } from '../types/domain';

const BRANDING_BUCKET = 'branding-assets';

interface BrandingRpcPayload {
  brandName?: unknown;
  logoPublicUrl?: unknown;
  logoStoragePath?: unknown;
  logoMimeType?: unknown;
  primaryColor?: unknown;
  accentColor?: unknown;
  textColor?: unknown;
  backgroundColor?: unknown;
  surfaceColor?: unknown;
  markerStyles?: unknown;
}

export interface BrandingSnapshot {
  theme: ThemeSettings;
  markerStyles: Record<ObjectTypeCode, MarkerStyle>;
  logoStoragePath: string | null;
  logoMimeType: string | null;
}

export interface SaveBrandingInput {
  theme: ThemeSettings;
  markerStyles: Record<ObjectTypeCode, MarkerStyle>;
  logoFile?: File | null;
  clearLogo?: boolean;
}

function assertBrandingPayload(data: unknown): BrandingRpcPayload {
  if (!data || typeof data !== 'object') {
    throw new Error('Payload branding invalide recu depuis le backend.');
  }

  return data as BrandingRpcPayload;
}

function normalizeBrandingSnapshot(data: unknown): BrandingSnapshot {
  const payload = assertBrandingPayload(data);

  return {
    theme: coerceThemeSettings({
      brandName: payload.brandName,
      logoUrl: payload.logoPublicUrl,
      primaryColor: payload.primaryColor,
      accentColor: payload.accentColor,
      textColor: payload.textColor,
      backgroundColor: payload.backgroundColor,
      surfaceColor: payload.surfaceColor,
    }),
    markerStyles: coerceMarkerStyles(payload.markerStyles),
    logoStoragePath: typeof payload.logoStoragePath === 'string' && payload.logoStoragePath.trim() ? payload.logoStoragePath.trim() : null,
    logoMimeType: typeof payload.logoMimeType === 'string' && payload.logoMimeType.trim() ? payload.logoMimeType.trim() : null,
  };
}

function isMissingBrandingBackend(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /get_public_branding|get_app_branding|upsert_app_branding|42883|could not find the function/i.test(message);
}

async function uploadBrandLogo(file: File, client: NonNullable<ReturnType<typeof getSupabaseClient>>) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const path = `global/${timestamp}-${safeName}`;

  const { error: uploadError } = await client.storage.from(BRANDING_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || undefined,
  });

  if (uploadError) {
    throw new Error(`Upload du logo impossible: ${uploadError.message}`);
  }

  const { data } = client.storage.from(BRANDING_BUCKET).getPublicUrl(path);
  return {
    logoStoragePath: path,
    logoPublicUrl: data.publicUrl,
    logoMimeType: file.type || null,
  };
}

export async function getPublicBranding(): Promise<BrandingSnapshot | null> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return null;
  }

  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  try {
    const { data, error } = await client.rpc('get_public_branding');
    if (error) {
      throw error;
    }
    return normalizeBrandingSnapshot(data);
  } catch (error) {
    if (isMissingBrandingBackend(error)) {
      console.warn('Branding public non disponible: appliquez ui_whitelabel_branding.sql pour activer le theme distant.');
      return null;
    }
    throw error;
  }
}

export async function getAppBranding(): Promise<BrandingSnapshot | null> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return null;
  }

  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  try {
    const { data, error } = await client.rpc('get_app_branding');
    if (error) {
      throw error;
    }
    return normalizeBrandingSnapshot(data);
  } catch (error) {
    if (isMissingBrandingBackend(error)) {
      console.warn('Branding authentifie non disponible: appliquez ui_whitelabel_branding.sql pour activer le theme distant.');
      return await getPublicBranding();
    }
    throw error;
  }
}

export async function saveBrandingSettings(input: SaveBrandingInput): Promise<BrandingSnapshot> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return {
      theme: coerceThemeSettings(input.theme),
      markerStyles: coerceMarkerStyles(input.markerStyles),
      logoStoragePath: null,
      logoMimeType: input.logoFile?.type ?? null,
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase non configure pour enregistrer le branding.');
  }

  let logoStoragePath: string | null | undefined;
  let logoPublicUrl: string | null | undefined;
  let logoMimeType: string | null | undefined;

  if (input.logoFile) {
    const uploaded = await uploadBrandLogo(input.logoFile, client);
    logoStoragePath = uploaded.logoStoragePath;
    logoPublicUrl = uploaded.logoPublicUrl;
    logoMimeType = uploaded.logoMimeType;
  }

  try {
    const { data, error } = await client.rpc('upsert_app_branding', {
      p_brand_name: input.theme.brandName,
      p_logo_storage_path: logoStoragePath ?? null,
      p_logo_public_url: logoPublicUrl ?? null,
      p_logo_mime_type: logoMimeType ?? null,
      p_primary_color: input.theme.primaryColor,
      p_accent_color: input.theme.accentColor,
      p_text_color: input.theme.textColor,
      p_background_color: input.theme.backgroundColor,
      p_surface_color: input.theme.surfaceColor,
      p_marker_styles: input.markerStyles,
      p_extra: {},
      p_clear_logo: input.clearLogo ?? false,
    });

    if (error) {
      throw error;
    }

    return normalizeBrandingSnapshot(data);
  } catch (error) {
    if (isMissingBrandingBackend(error)) {
      throw new Error('La migration SQL ui_whitelabel_branding.sql n est pas encore appliquee sur la base principale.');
    }
    throw error;
  }
}
