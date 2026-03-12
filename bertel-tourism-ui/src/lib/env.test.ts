import { describe, expect, it } from 'vitest';
import { createEnv } from './env';

describe('createEnv', () => {
  it('throws when demo mode is disabled and Supabase config is missing', () => {
    expect(() =>
      createEnv({
        runtime: {
          VITE_ENABLE_DEMO_MODE: 'false',
        },
        build: {},
      }),
    ).toThrow(/Supabase doit etre configure/);
  });

  it('accepts demo mode without Supabase config', () => {
    const env = createEnv({
      runtime: {
        VITE_ENABLE_DEMO_MODE: 'true',
      },
      build: {},
    });

    expect(env.demoMode).toBe(true);
    expect(env.mapStyles.classic).toContain('demotiles');
  });

  it('accepts production config when Supabase credentials are present', () => {
    const env = createEnv({
      runtime: {
        VITE_ENABLE_DEMO_MODE: 'false',
        VITE_SUPABASE_URL: 'https://demo.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'anon-key',
      },
      build: {},
    });

    expect(env.demoMode).toBe(false);
    expect(env.supabaseUrl).toBe('https://demo.supabase.co');
  });
});