import { coerceMarkerStyles, type MarkerStyle } from '../config/map-markers';
import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { coerceThemeSettings, type ThemeSettings } from '../lib/theme';
import { useSessionStore } from '../store/session-store';
import type { ObjectTypeCode } from '../types/domain';

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

function readBackendErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

function readBackendErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function isBrandingPermissionError(error: unknown): boolean {
  const code = readBackendErrorCode(error);
  const message = readBackendErrorMessage(error);
  return code === '42501' || /Only platform admins|permission denied|row-level security/i.test(message);
}

// Le logo passe par la route service-role /api/branding/logo/upload (autorisée
// EN TANT QUE l'appelant via api.is_platform_admin, resize + strip EXIF, écriture
// service-role) — JAMAIS d'upload direct depuis le client : le bucket branding-assets
// interdit toute écriture anon/authenticated (RESTRICTIVE), même invariant single-writer
// que media/avatars (CLAUDE.md §59).
async function uploadBrandLogo(file: File, client: NonNullable<ReturnType<typeof getSupabaseClient>>) {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Session expiree — reconnectez-vous pour modifier le branding.');
  }

  const body = new FormData();
  body.append('file', file);
  const res = await fetch('/api/branding/logo/upload', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body,
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    if (res.status === 415) {
      throw new Error('Format de logo non supporte (JPEG, PNG ou WebP, ≤ 5 Mo).');
    }
    if (res.status === 403) {
      throw new Error('Seuls les super-admins peuvent modifier le branding.');
    }
    throw new Error(`Upload du logo impossible: ${payload.detail || payload.error || `HTTP ${res.status}`}`);
  }

  const uploaded = (await res.json()) as {
    logoStoragePath?: string;
    logoPublicUrl?: string;
    logoMimeType?: string | null;
  };
  if (!uploaded.logoPublicUrl || !uploaded.logoStoragePath) {
    throw new Error('Reponse invalide du serveur de branding.');
  }
  return {
    logoStoragePath: uploaded.logoStoragePath,
    logoPublicUrl: uploaded.logoPublicUrl,
    logoMimeType: uploaded.logoMimeType ?? file.type ?? null,
  };
}

export async function getPublicBranding(): Promise<BrandingSnapshot | null> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return null;
  }

  const client = getApiClient();
  if (!client) {
    return null;
  }

  try {
    const { data, error } = await client.schema('api').rpc('get_public_branding');
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

  const client = getApiClient();
  if (!client) {
    return null;
  }

  try {
    const { data, error } = await client.schema('api').rpc('get_app_branding');
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

  const dbClient = getSupabaseClient();
  if (!dbClient) {
    throw new Error('Supabase non configure pour enregistrer le branding.');
  }

  let logoStoragePath: string | null | undefined;
  let logoPublicUrl: string | null | undefined;
  let logoMimeType: string | null | undefined;

  if (input.logoFile) {
    const uploaded = await uploadBrandLogo(input.logoFile, dbClient);
    logoStoragePath = uploaded.logoStoragePath;
    logoPublicUrl = uploaded.logoPublicUrl;
    logoMimeType = uploaded.logoMimeType;
  }

  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error('Supabase non configure pour enregistrer le branding.');
  }

  try {
    const { data, error } = await apiClient.schema('api').rpc('upsert_app_branding', {
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
    if (isBrandingPermissionError(error)) {
      throw new Error('La base refuse cette modification de branding. Reappliquez la migration branding_admin_profile_role_patch.sql pour reconnaitre les super-admins declares dans app_user_profile.');
    }
    throw error;
  }
}
