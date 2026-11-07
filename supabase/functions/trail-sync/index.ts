// trail-sync/index.ts — point d'entrée Deno.serve. Câblage MINCE : toute la logique testable vit
// dans orchestrator.ts (aucune dépendance Deno/réseau) — voir ce fichier pour la documentation
// complète du cycle de vie, de l'autorisation et des invariants (§181/§183 Phase 4).
//
// verify_jwt DOIT être désactivé au déploiement (plateforme Supabase) : cette fonction implémente
// SA PROPRE authentification (secret service-to-service pour le cron OU JWT vérifié manuellement
// pour l'appel manuel, cf. deriveAuthContext dans orchestrator.ts) — le déclenchement cron n'envoie
// JAMAIS de JWT Supabase valide (juste l'en-tête x-trail-sync-secret), donc la vérification JWT au
// niveau plateforme bloquerait ce chemin avant même d'atteindre ce code.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fetchFullSnapshot } from '../_shared/arcgis.ts';
import { normalizeFeature } from '../_shared/normalize.ts';
import {
  deriveAuthContext,
  runSync,
  type RpcClient,
  type ApplyResult,
} from './orchestrator.ts';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function makeServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants');
  return createClient(url, key);
}

function makeRpcClient(client: SupabaseClient): RpcClient {
  return {
    async begin(args) {
      const { data, error } = await client.schema('api').rpc('trail_sync_begin', args);
      if (error) throw error;
      return data as string;
    },
    async applyService(args) {
      const { data, error } = await client.schema('api').rpc('trail_sync_apply_service', args);
      if (error) throw error;
      return data as ApplyResult;
    },
    async finalize(args) {
      const { error } = await client.schema('api').rpc('trail_sync_finalize', args);
      if (error) throw error;
    },
  };
}

async function verifyCallerIsSuperuserReal(authHeader: string): Promise<{ ok: boolean; userId: string | null }> {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) return { ok: false, userId: null };
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const jwt = authHeader.slice('Bearer '.length);
  const { data: userData, error: userErr } = await callerClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return { ok: false, userId: null };
  const { data: isSuper, error: superErr } = await callerClient.schema('api').rpc('is_platform_superuser');
  if (superErr || isSuper !== true) return { ok: false, userId: userData.user.id };
  return { ok: true, userId: userData.user.id };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed, use POST' }, 405);
  }

  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
  } catch {
    // corps vide/absent = dry_run false, toléré (le déclenchement cron n'envoie pas de corps).
  }

  const auth = await deriveAuthContext(req, {
    cronSecretHeaderValue: Deno.env.get('TRAIL_SYNC_CRON_SECRET') ?? null,
    verifyCallerIsSuperuser: verifyCallerIsSuperuserReal,
  });
  if ('error' in auth) {
    return jsonResponse({ error: auth.error }, auth.status);
  }

  const serviceClient = makeServiceClient();
  const outcome = await runSync(auth, dryRun, {
    rpc: makeRpcClient(serviceClient),
    fetchSnapshot: (source) => fetchFullSnapshot(source),
    normalize: (feature) => normalizeFeature(feature),
  });
  return jsonResponse(outcome.body, outcome.httpStatus);
});
