import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { coerceThemeSettings, defaultThemeSettings, type ThemeSettings } from '../lib/theme';

interface ThemeState {
  theme: ThemeSettings;
  setTheme: (nextTheme: Partial<ThemeSettings>) => void;
  resetTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: defaultThemeSettings,
      setTheme: (nextTheme) =>
        set((state) => ({
          theme: coerceThemeSettings({
            ...state.theme,
            ...nextTheme,
          }),
        })),
      resetTheme: () => set({ theme: defaultThemeSettings }),
    }),
    {
      name: 'bertel-theme-store-v2',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const persistedState = (persisted as Partial<ThemeState> | undefined) ?? {};
        return {
          ...current,
          ...persistedState,
          theme: coerceThemeSettings(persistedState.theme),
        };
      },
    },
  ),
);
