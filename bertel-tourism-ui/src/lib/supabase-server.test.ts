/** @jest-environment node */
import { __resetServerSupabaseClientForTests, getServerSupabaseClient } from './supabase-server';

describe('getServerSupabaseClient', () => {
  beforeEach(() => {
    __resetServerSupabaseClientForTests();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it('returns null when service-role key is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    expect(getServerSupabaseClient()).toBeNull();
  });

  it('returns null when supabase url is missing', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv-key';
    expect(getServerSupabaseClient()).toBeNull();
  });

  it('returns a singleton client when both env are set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv-key';
    const a = getServerSupabaseClient();
    const b = getServerSupabaseClient();
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
});
