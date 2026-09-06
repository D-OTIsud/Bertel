import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';

/** Access token de la session (pour les routes Next à Bearer). null = pas encore lu / invité. */
export function useSupabaseAccessToken(): string | null {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const client = getSupabaseClient();
    if (!client) return;
    void client.auth.getSession().then(({ data }) => {
      if (alive) setAccessToken(data.session?.access_token ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  return accessToken;
}
