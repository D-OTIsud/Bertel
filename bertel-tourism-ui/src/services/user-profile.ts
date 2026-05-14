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

