import { getSupabaseClient } from '../lib/supabase';

export interface AiTranslationInput {
  objectId: string;
  sourceLanguage: string;
  targetLanguage: string;
  fields: Record<string, string>;
}

/** The browser sends a draft and the user's token; provider credentials stay on the server. */
export async function translateWithAi(
  input: AiTranslationInput,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, string>> {
  const client = getSupabaseClient();
  const session = client ? await client.auth.getSession() : null;
  const token = session?.data.session?.access_token;
  if (session?.error || !token) throw new Error('Reconnectez-vous pour traduire ce texte.');
  if (signal?.aborted) throw new DOMException('Traduction annulée', 'AbortError');

  let response: Response;
  try {
    response = await fetchImpl('/api/ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('La traduction est indisponible. Vérifiez votre connexion et réessayez.');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Reconnectez-vous pour traduire ce texte.',
      403: 'Vos droits ne permettent pas de traduire cette fiche.',
      413: 'Le texte est trop long. Réduisez-le avant de réessayer.',
      429: 'Trop de traductions sont en cours. Réessayez dans un instant.',
      503: 'La traduction IA n’est pas configurée. Contactez votre administrateur.',
    };
    throw new Error(messages[response.status] ?? 'La traduction a échoué. Réessayez dans un instant.');
  }

  const translations = payload && typeof payload === 'object' && 'translations' in payload
    ? payload.translations : null;
  const keys = Object.keys(input.fields);
  if (!translations || typeof translations !== 'object' || Array.isArray(translations)
    || Object.keys(translations).length !== keys.length
    || keys.some((key) => !Object.hasOwn(translations, key)
      || typeof (translations as Record<string, unknown>)[key] !== 'string'
      || !(translations as Record<string, string>)[key].trim())) {
    throw new Error('La traduction reçue est incomplète. Réessayez.');
  }
  return translations as Record<string, string>;
}
