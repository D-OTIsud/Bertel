import 'server-only';

// Server-only env. Reads process.env directly (never the runtime window config).
// The `server-only` import above makes this module a build-time error if it ends
// up in a client bundle, turning a silent runtime miss into a loud compile failure.
// Returns null if not set — callers must handle that case explicitly.
export function readServerEnv(): { supabaseServiceRoleKey: string | null } {
  if (typeof process === 'undefined' || !process.env) {
    return { supabaseServiceRoleKey: null };
  }
  const raw = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  return { supabaseServiceRoleKey: raw.length > 0 ? raw : null };
}
