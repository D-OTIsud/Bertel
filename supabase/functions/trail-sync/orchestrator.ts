// orchestrator.ts — logique PURE du cycle de vie de synchronisation (§181/§183 Phase 4), sans
// aucune dépendance Deno/réseau/Supabase directe. Toutes les I/O sont injectées (RpcClient,
// fetchSnapshot, normalize, verifyCallerIsSuperuser) — permet de tester begin/apply/finalize,
// l'autorisation, le garde-fou et le cas watermark-changé sans réseau ni base de données réelle.
// index.ts (le point d'entrée Deno.serve réel) est un câblage mince par-dessus ce module.

import type { ArcGisFeature, ArcGisSource } from '../_shared/arcgis.ts';
import { ArcGisFetchError, WatermarkChangedError } from '../_shared/arcgis.ts';
import type { NormalizedFeature } from '../_shared/normalize.ts';

export const SOURCE_CODE = 'onf_arcgis_reunion';
export const ARC_SOURCE: ArcGisSource = {
  baseUrl: 'https://services1.arcgis.com/Y4HgaQpzkE7kenlE/arcgis/rest/services/Sentiers_La_Reunion_public/FeatureServer',
  layerId: 5,
};
export const CRON_SECRET_HEADER = 'x-trail-sync-secret';

// ---------------------------------------------------------------------
// Autorisation
// ---------------------------------------------------------------------

export type AuthContext = { trigger: 'cron' | 'manual'; requestedBy: string | null };
export type AuthFailure = { error: string; status: number };

/** Constant-time-ish compare pour l'en-tête secret service-to-service (ponytail: défense légère,
 * pas une garantie cryptographique — la vraie frontière de sécurité est la longueur/l'entropie du
 * secret lui-même, stocké dans Vault côté déclenchement cron, Phase D). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface AuthDeps {
  cronSecretHeaderValue: string | null; // valeur attendue, ou null si le secret n'est pas configuré
  verifyCallerIsSuperuser: (authHeader: string) => Promise<{ ok: boolean; userId: string | null }>;
}

/**
 * Dérive trigger/requested_by depuis la requête authentifiée. Ne fait AUCUNE hypothèse sur le
 * corps JSON — uniquement les en-têtes. Ni `trigger` ni `requested_by` ne sont JAMAIS acceptés
 * depuis le corps client (§15 design — dérivés uniquement de l'authentification serveur).
 */
export async function deriveAuthContext(req: Request, deps: AuthDeps): Promise<AuthContext | AuthFailure> {
  const cronHeader = req.headers.get(CRON_SECRET_HEADER);
  if (deps.cronSecretHeaderValue && cronHeader && timingSafeEqualStr(cronHeader, deps.cronSecretHeaderValue)) {
    return { trigger: 'cron', requestedBy: null };
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'unauthorized: missing bearer token or valid service secret', status: 401 };
  }
  const { ok, userId } = await deps.verifyCallerIsSuperuser(authHeader);
  if (!ok) {
    return { error: 'forbidden: superuser required for manual sync', status: 403 };
  }
  return { trigger: 'manual', requestedBy: userId };
}

// ---------------------------------------------------------------------
// Cycle de vie de la synchronisation
// ---------------------------------------------------------------------

export interface RpcClient {
  begin(args: { p_source_code: string; p_trigger: string; p_dry_run: boolean; p_requested_by: string | null }): Promise<string>;
  applyService(args: { p_sync_run_id: string; p_features: NormalizedFeature[]; p_options: { dry_run: boolean } }): Promise<ApplyResult>;
  finalize(args: {
    p_sync_run_id: string;
    p_status: 'succeeded' | 'failed' | 'no_op';
    p_report?: unknown;
    p_http_status?: number;
    p_error?: string;
    p_layer_last_edit_date?: string;
  }): Promise<void>;
}

export interface ApplyResult {
  status: 'ok' | 'source_error';
  counts: Record<string, number>;
  anomalies: unknown[];
  dry_run: boolean;
}

export interface SyncDeps {
  rpc: RpcClient;
  fetchSnapshot: (source: ArcGisSource) => Promise<{ features: ArcGisFeature[]; layerLastEditDateAfter: number }>;
  normalize: (feature: ArcGisFeature) => Promise<NormalizedFeature>;
}

export interface SyncOutcome {
  runId: string | null;
  httpStatus: number;
  body: Record<string, unknown>;
}

/**
 * Exécute le cycle begin -> fetch -> apply -> finalize. GARANTIT qu'un run ouvert par `begin` est
 * TOUJOURS finalisé avant de retourner, quel que soit le point d'échec (watermark changé, erreur
 * ArcGIS, erreur SQL d'apply). Seul un échec de `begin` (ex. lease déjà prise, code Postgres 23505)
 * retourne sans finaliser — aucune ligne trail_sync_run n'existe alors à finaliser. La récupération
 * d'une lease périmée (heartbeat > 30 min) est entièrement gérée CÔTÉ SQL par api.trail_sync_begin
 * (§8.2) — invisible depuis ce module : soit begin réussit (lease libre ou récupérée), soit il
 * échoue avec un conflit (lease active récente).
 */
export async function runSync(auth: AuthContext, dryRun: boolean, deps: SyncDeps): Promise<SyncOutcome> {
  let runId: string;
  try {
    runId = await deps.rpc.begin({
      p_source_code: SOURCE_CODE,
      p_trigger: auth.trigger,
      p_dry_run: dryRun,
      p_requested_by: auth.requestedBy,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isLeaseConflict = /23505|already exists|duplicate key/i.test(message);
    return {
      runId: null,
      httpStatus: isLeaseConflict ? 409 : 500,
      body: { error: isLeaseConflict ? 'sync already running for this source' : message },
    };
  }

  try {
    const snapshot = await deps.fetchSnapshot(ARC_SOURCE);
    const features = await Promise.all(snapshot.features.map((f) => deps.normalize(f)));
    const applyResult = await deps.rpc.applyService({
      p_sync_run_id: runId,
      p_features: features,
      p_options: { dry_run: dryRun },
    });

    const finalStatus = applyResult.status === 'source_error' ? 'failed' : 'succeeded';
    const finalError = applyResult.status === 'source_error'
      ? `garde-fou déclenché: ${JSON.stringify(applyResult.anomalies)}`
      : undefined;
    await deps.rpc.finalize({
      p_sync_run_id: runId,
      p_status: finalStatus,
      p_report: applyResult,
      p_error: finalError,
      p_layer_last_edit_date: new Date(snapshot.layerLastEditDateAfter).toISOString(),
    });

    return { runId, httpStatus: 200, body: { run_id: runId, ...applyResult } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const httpStatusHint = err instanceof ArcGisFetchError ? 502 : err instanceof WatermarkChangedError ? 409 : undefined;
    try {
      await deps.rpc.finalize({
        p_sync_run_id: runId,
        p_status: 'failed',
        p_error: message,
        p_http_status: httpStatusHint,
      });
    } catch {
      // best-effort : si finalize échoue à son tour, on retourne quand même l'erreur d'origine au
      // client — un run resté 'running' au-delà de 30 min sera récupéré par le prochain
      // trail_sync_begin (lease périmée, §8.2).
    }
    return { runId, httpStatus: 500, body: { run_id: runId, error: message } };
  }
}
