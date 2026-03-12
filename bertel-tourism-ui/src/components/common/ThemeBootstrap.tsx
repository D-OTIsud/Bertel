import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../../lib/supabase';
import { applyThemeToDocument } from '../../lib/theme';
import { getAppBranding, getPublicBranding } from '../../services/branding';
import { useSessionStore } from '../../store/session-store';
import { useThemeStore } from '../../store/theme-store';
import { useUiStore } from '../../store/ui-store';

export function ThemeBootstrap() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const setMarkerStyles = useUiStore((state) => state.setMarkerStyles);
  const demoMode = useSessionStore((state) => state.demoMode);
  const status = useSessionStore((state) => state.status);

  const brandingQuery = useQuery({
    queryKey: ['branding', status === 'ready' ? 'authenticated' : 'public'],
    queryFn: async () => (status === 'ready' ? getAppBranding() : getPublicBranding()),
    enabled: !demoMode && Boolean(getSupabaseClient()),
    staleTime: 300000,
    retry: 0,
  });

  useEffect(() => {
    const snapshot = brandingQuery.data;
    if (!snapshot) {
      return;
    }

    setTheme(snapshot.theme);
    setMarkerStyles(snapshot.markerStyles);
  }, [brandingQuery.data, setMarkerStyles, setTheme]);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  return null;
}
