import type { User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import type { UserRole } from '../types/domain';

export interface AppUserProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  locale: string | null;
  timezone: string | null;
  role: UserRole | null;
  lang_prefs: string[] | null;
  preferences: Record<string, unknown> | null;
}

interface CreateProfileInput {
  role: UserRole | null;
  displayName: string;
  langPrefs: string[];
}

function normalizeLangPrefs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function readLangPrefsFromAuth(user: User): string[] {
  const fromMetadata = user.user_metadata?.lang_prefs ?? user.user_metadata?.langPrefs;
  const normalized = normalizeLangPrefs(fromMetadata);
  return normalized.length > 0 ? normalized : ['fr', 'en'];
}

export async function getOrCreateUserProfile(
  user: User,
  input: CreateProfileInput,
): Promise<AppUserProfileRow | null> {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  const { data: existing, error: readError } = await client
    .from('app_user_profile')
    .select('id, display_name, avatar_url, locale, timezone, role, lang_prefs, preferences')
    .eq('id', user.id)
    .maybeSingle<AppUserProfileRow>();

  if (readError) {
    return null;
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: createError } = await client
    .from('app_user_profile')
    .insert({
      id: user.id,
      display_name: input.displayName,
      role: input.role,
      lang_prefs: input.langPrefs,
      preferences: {},
    })
    .select('id, display_name, avatar_url, locale, timezone, role, lang_prefs, preferences')
    .single<AppUserProfileRow>();

  if (createError) {
    return null;
  }

  return created;
}

export async function updateCurrentUserProfile(
  patch: Partial<Pick<AppUserProfileRow, 'display_name' | 'avatar_url' | 'lang_prefs' | 'locale' | 'timezone' | 'preferences'>>,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    return;
  }

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError || !user) {
    throw new Error('Session utilisateur introuvable.');
  }

  const { data, error } = await client.from('app_user_profile').update(patch).eq('id', user.id).select('id').maybeSingle();
  if (error) {
    throw new Error(`Impossible de mettre a jour le profil utilisateur: ${error.message}`);
  }

  if (!data) {
    throw new Error('Impossible de mettre a jour le profil utilisateur: profil applicatif introuvable.');
  }
}

/**
 * Envoie une nouvelle photo de profil via /api/avatar/upload (redimensionnée +
 * EXIF/GPS strippé serveur, écriture storage en service-role). La route persiste
 * elle-même `avatar_url` (self-update RLS). Retourne l'URL publique (avec ?v= de
 * cache-bust) à réappliquer sur la session.
 */
export async function uploadAvatar(file: File): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase non configuré.');
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Session expirée — reconnectez-vous.');

  const body = new FormData();
  body.append('file', file);
  const res = await fetch('/api/avatar/upload', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    if (res.status === 415) throw new Error("Format d'image non supporté (JPEG, PNG ou WebP, ≤ 5 Mo).");
    throw new Error(j.detail || j.error || "Échec de l'envoi de l'avatar.");
  }
  const j = (await res.json()) as { url?: string };
  if (!j.url) throw new Error("Réponse invalide du serveur d'avatar.");
  return j.url;
}

