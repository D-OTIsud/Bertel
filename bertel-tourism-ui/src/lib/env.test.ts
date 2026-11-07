import { createEnv, readEnv } from './env';

describe('createEnv', () => {
  it('throws when demo mode is disabled and Supabase config is missing', () => {
    expect(() =>
      createEnv({
        runtime: {
          NEXT_PUBLIC_ENABLE_DEMO_MODE: 'false',
        },
        build: {},
      }),
    ).toThrow(/Supabase doit etre configure/);
  });

  it('accepts demo mode without Supabase config', () => {
    const env = createEnv({
      runtime: {
        NEXT_PUBLIC_ENABLE_DEMO_MODE: 'true',
      },
      build: {},
    });

    expect(env.demoMode).toBe(true);
    expect(env.mapStyles.classic).toContain('demotiles');
  });

  it('accepts production config when Supabase credentials are present', () => {
    const env = createEnv({
      runtime: {
        NEXT_PUBLIC_ENABLE_DEMO_MODE: 'false',
        NEXT_PUBLIC_SUPABASE_URL: 'https://demo.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      },
      build: {},
    });

    expect(env.demoMode).toBe(false);
    expect(env.supabaseUrl).toBe('https://demo.supabase.co');
  });

  it('falls back to a non-throwing runtime-safe env shape when config is incomplete', () => {
    const env = readEnv({
      runtime: {
        NEXT_PUBLIC_ENABLE_DEMO_MODE: 'false',
      },
      build: {},
    });

    expect(env.demoMode).toBe(false);
    expect(env.supabaseUrl).toBeUndefined();
    expect(env.mapStyles.satellite).toContain('openfreemap');
  });
});
