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
  // Attribution institutionnelle : get_public_branding l'expose à plat (clés whitelistées),
  // get_app_branding la porte dans `extra`. On lit les deux formes (§171).
  operatorName?: unknown;
  territory?: unknown;
  islandTagline?: unknown;
  extra?: unknown;
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
  // extra n'est présent que dans get_app_branding (authentifié) ; get_public_branding
  // aplatit déjà les clés. On lit les deux formes pour une seule normalisation.
  const extra = payload.extra && typeof payload.extra === 'object' ? (payload.extra as Record<string, unknown>) : {};

  return {
    theme: coerceThemeSettings({
      brandName: payload.brandName,
      logoUrl: payload.logoPublicUrl,
      primaryColor: payload.primaryColor,
      accentColor: payload.accentColor,
      textColor: payload.textColor,
      backgroundColor: payload.backgroundColor,
      surfaceColor: payload.surfaceColor,
      operatorName: payload.operatorName ?? extra.operatorName,
      territory: payload.territory ?? extra.territory,
      islandTagline: payload.islandTagline ?? extra.islandTagline,
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
async function uploadBrandLogo(
  file: File,
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  orgObjectId?: string,
) {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Session expiree — reconnectez-vous pour modifier le branding.');
  }

  const body = new FormData();
  body.append('file', file);
  if (orgObjectId) {
    body.append('orgObjectId', orgObjectId);
  }
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
      // null = « ne touche pas à extra » (upsert fait COALESCE(p_extra, s.extra)). L'écran
      // Réglages ne gère pas `extra` (attribution institutionnelle §171) : envoyer {} l'écraserait.
      p_extra: null,
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

// --- Branding par organisation (get_org_branding / upsert_org_branding) ---
// Contrat full-state PUT : chaque upsert_org_branding remplace la ligne entiere
// (NULL = herite du theme plateforme). Ne pas confondre avec le branding
// plateforme ci-dessus (getPublicBranding/getAppBranding/saveBrandingSettings).

export interface OrgBrandingRaw {
  brandName: string | null;
  logoStoragePath: string | null;
  logoPublicUrl: string | null;
  logoMimeType: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  textColor: string | null;
  backgroundColor: string | null;
  surfaceColor: string | null;
}

export interface OrgBrandingSnapshot {
  orgObjectId: string;
  raw: OrgBrandingRaw;
  resolved: Record<string, string | null>;
}

function readNullableString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function normalizeOrgRaw(data: unknown): OrgBrandingRaw {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    brandName: readNullableString(raw.brandName),
    logoStoragePath: readNullableString(raw.logoStoragePath),
    logoPublicUrl: readNullableString(raw.logoPublicUrl),
    logoMimeType: readNullableString(raw.logoMimeType),
    primaryColor: readNullableString(raw.primaryColor),
    accentColor: readNullableString(raw.accentColor),
    textColor: readNullableString(raw.textColor),
    backgroundColor: readNullableString(raw.backgroundColor),
    surfaceColor: readNullableString(raw.surfaceColor),
  };
}

export async function getOrgBranding(orgObjectId: string): Promise<OrgBrandingSnapshot> {
  const client = getApiClient();
  if (!client) throw new Error('Supabase non configuré.');
  const { data, error } = await client.schema('api').rpc('get_org_branding', { p_org_object_id: orgObjectId });
  if (error) throw error;
  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    orgObjectId,
    raw: normalizeOrgRaw(payload.raw),
    resolved: (payload.resolved ?? {}) as Record<string, string | null>,
  };
}

export async function saveOrgBranding(
  orgObjectId: string,
  input: { raw: OrgBrandingRaw; logoFile?: File | null; clearLogo?: boolean; reset?: boolean },
): Promise<OrgBrandingSnapshot> {
  const client = getApiClient();
  const dbClient = getSupabaseClient();
  if (!client || !dbClient) throw new Error('Supabase non configuré.');
  let logo = {
    logoStoragePath: input.clearLogo ? null : input.raw.logoStoragePath,
    logoPublicUrl: input.clearLogo ? null : input.raw.logoPublicUrl,
    logoMimeType: input.clearLogo ? null : input.raw.logoMimeType,
  };
  if (!input.reset && input.logoFile) {
    const uploaded = await uploadBrandLogo(input.logoFile, dbClient, orgObjectId);
    logo = { logoStoragePath: uploaded.logoStoragePath, logoPublicUrl: uploaded.logoPublicUrl, logoMimeType: uploaded.logoMimeType };
  }
  const { data, error } = await client.schema('api').rpc('upsert_org_branding', {
    p_org_object_id: orgObjectId,
    p_brand_name: input.raw.brandName,
    p_logo_storage_path: logo.logoStoragePath,
    p_logo_public_url: logo.logoPublicUrl,
    p_logo_mime_type: logo.logoMimeType,
    p_primary_color: input.raw.primaryColor,
    p_accent_color: input.raw.accentColor,
    p_text_color: input.raw.textColor,
    p_background_color: input.raw.backgroundColor,
    p_surface_color: input.raw.surfaceColor,
    p_reset: input.reset === true,
  });
  if (error) throw error;
  const payload = (data ?? {}) as Record<string, unknown>;
  return { orgObjectId, raw: normalizeOrgRaw(payload.raw), resolved: (payload.resolved ?? {}) as Record<string, string | null> };
}
