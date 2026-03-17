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

export type AppEnv = z.infer<typeof envSchema>;

function getRuntimeConfig(): Record<string, string | undefined> {
  return typeof window === 'undefined' ? {} : (window.__APP_CONFIG__ ?? {});
}

function getBuildConfig(): Record<string, string | boolean | undefined> {
  if (typeof process !== 'undefined' && process.env) {
    return {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_ENABLE_DEMO_MODE: process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE,
      NEXT_PUBLIC_MAP_STYLE_CLASSIC: process.env.NEXT_PUBLIC_MAP_STYLE_CLASSIC,
      NEXT_PUBLIC_MAP_STYLE_SATELLITE: process.env.NEXT_PUBLIC_MAP_STYLE_SATELLITE,
      NEXT_PUBLIC_MAP_STYLE_TOPO: process.env.NEXT_PUBLIC_MAP_STYLE_TOPO,
    } as Record<string, string | boolean | undefined>;
  }
  return {};
}

function resolveSources(sources: EnvSources = {}): EnvSources {
  return {
    runtime: sources.runtime ?? getRuntimeConfig(),
    build: sources.build ?? getBuildConfig(),
  };
}

function readConfigValue(key: string, sources: EnvSources): string {
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

function buildEnvPayload(sources: EnvSources): AppEnv {
  return {
    supabaseUrl: readConfigValue('NEXT_PUBLIC_SUPABASE_URL', sources) || undefined,
    supabaseAnonKey: readConfigValue('NEXT_PUBLIC_SUPABASE_ANON_KEY', sources) || undefined,
    demoMode: readBoolean(readConfigValue('NEXT_PUBLIC_ENABLE_DEMO_MODE', sources), false),
    mapStyles: {
      classic: readConfigValue('NEXT_PUBLIC_MAP_STYLE_CLASSIC', sources) || DEFAULT_MAP_STYLES.classic,
      satellite: readConfigValue('NEXT_PUBLIC_MAP_STYLE_SATELLITE', sources) || DEFAULT_MAP_STYLES.satellite,
      topo: readConfigValue('NEXT_PUBLIC_MAP_STYLE_TOPO', sources) || DEFAULT_MAP_STYLES.topo,
    },
  };
}

export function createEnv(sources: EnvSources = {}): AppEnv {
  return envSchema.parse(buildEnvPayload(resolveSources(sources)));
}

export function readEnv(sources: EnvSources = {}): AppEnv {
  const payload = buildEnvPayload(resolveSources(sources));
  const parsed = envSchema.safeParse(payload);
  return parsed.success ? parsed.data : payload;
}

export const env = readEnv();
export const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabaseAnonKey);
