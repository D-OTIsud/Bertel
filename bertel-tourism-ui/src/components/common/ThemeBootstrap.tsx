import { useEffect, useRef } from 'react';
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
  const lastThemeRef = useRef<string | null>(null);
  const lastMarkerStylesRef = useRef<string | null>(null);

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

    const nextThemeKey = JSON.stringify(snapshot.theme);
    const nextMarkerStylesKey = JSON.stringify(snapshot.markerStyles);
    if (lastThemeRef.current !== nextThemeKey) {
      lastThemeRef.current = nextThemeKey;
      setTheme(snapshot.theme);
    }
    if (lastMarkerStylesRef.current !== nextMarkerStylesKey) {
      lastMarkerStylesRef.current = nextMarkerStylesKey;
      setMarkerStyles(snapshot.markerStyles);
    }
  }, [brandingQuery.data, setMarkerStyles, setTheme]);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  return null;
}
