import { z } from 'zod';

declare global {
  interface Window {
    __APP_CONFIG__?: Record<string, string | undefined>;
  }
}

interface EnvSources {
  runtime?: Record<string, string | undefined>;
  build?: Record<string, string | boolean | undefined>;
}

const DEFAULT_MAP_STYLES = {
  classic: 'https://demotiles.maplibre.org/style.json',
  satellite: 'https://tiles.openfreemap.org/styles/liberty',
  topo: 'https://tiles.openfreemap.org/styles/bright',
} as const;

const envSchema = z
  .object({
    supabaseUrl: z.string().trim().optional(),
    supabaseAnonKey: z.string().trim().optional(),
    demoMode: z.boolean(),
    mapStyles: z.object({
      classic: z.string().trim().min(1),
      satellite: z.string().trim().min(1),
      topo: z.string().trim().min(1),
    }),
  })
  .superRefine((value, ctx) => {
    const hasSupabaseConfig = Boolean(value.supabaseUrl && value.supabaseAnonKey);
    if (!value.demoMode && !hasSupabaseConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Supabase doit etre configure quand le mode demo est desactive.',
        path: ['supabaseUrl'],
      });
    }
  });

function getRuntimeConfig(): Record<string, string | undefined> {
  return typeof window === 'undefined' ? {} : (window.__APP_CONFIG__ ?? {});
}

function getBuildConfig(): Record<string, string | boolean | undefined> {
  return import.meta.env as Record<string, string | boolean | undefined>;
}

function readConfigValue(
  key: string,
  sources: EnvSources,
): string {
  const runtimeValue = sources.runtime?.[key];
  const buildValue = sources.build?.[key];
  return String(runtimeValue ?? buildValue ?? '').trim();
}

function readBoolean(value: string, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  return value.toLowerCase() === 'true';
}

export function createEnv(sources: EnvSources = {}) {
  const mergedSources: EnvSources = {
    runtime: sources.runtime ?? getRuntimeConfig(),
    build: sources.build ?? getBuildConfig(),
  };

  return envSchema.parse({
    supabaseUrl: readConfigValue('VITE_SUPABASE_URL', mergedSources) || undefined,
    supabaseAnonKey: readConfigValue('VITE_SUPABASE_ANON_KEY', mergedSources) || undefined,
    demoMode: readBoolean(readConfigValue('VITE_ENABLE_DEMO_MODE', mergedSources), false),
    mapStyles: {
      classic: readConfigValue('VITE_MAP_STYLE_CLASSIC', mergedSources) || DEFAULT_MAP_STYLES.classic,
      satellite: readConfigValue('VITE_MAP_STYLE_SATELLITE', mergedSources) || DEFAULT_MAP_STYLES.satellite,
      topo: readConfigValue('VITE_MAP_STYLE_TOPO', mergedSources) || DEFAULT_MAP_STYLES.topo,
    },
  });
}

export const env = createEnv();
export const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabaseAnonKey);