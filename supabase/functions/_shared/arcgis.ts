// arcgis.ts — client ArcGIS REST partagé (metadata / objectIds / features par lots).
// Réutilisable pour la couche 1 (aires d'accueil, phase 12) sans duplication — design §19.
//
// Stratégie déterministe (design §7) : metadata -> objectIds (triés) -> lots ordonnés par id ->
// re-lecture du watermark. La pagination offset reste un fallback non implémenté ici (maxRecordCount
// de la couche 5 = 2000, largement suffisant pour ~375 features ; le batching par objectIds suffit
// et tolère ×10 sans changement, design §25).

export interface ArcGisSource {
  baseUrl: string; // ex. https://services1.arcgis.com/<org>/arcgis/rest/services/<service>/FeatureServer
  layerId: number;
}

export class ArcGisFetchError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ArcGisFetchError';
    this.cause = cause;
  }
}

export class WatermarkChangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WatermarkChangedError';
  }
}

export interface FetchOptions {
  retries?: number;
  timeoutMs?: number;
  backoffMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULTS: Required<Pick<FetchOptions, 'retries' | 'timeoutMs' | 'backoffMs'>> = {
  retries: 3,
  timeoutMs: 15000,
  backoffMs: 500,
};

/**
 * GET JSON avec timeout (AbortController) + retries exponentiels. Détecte aussi les erreurs
 * "molles" ArcGIS (HTTP 200 avec un corps {error:{...}}) — l'API ArcGIS ne renvoie pas toujours un
 * statut HTTP non-200 pour signaler une erreur de requête.
 */
export async function fetchJsonWithRetry(url: string, opts: FetchOptions = {}): Promise<unknown> {
  const retries = opts.retries ?? DEFAULTS.retries;
  const timeoutMs = opts.timeoutMs ?? DEFAULTS.timeoutMs;
  const backoffMs = opts.backoffMs ?? DEFAULTS.backoffMs;
  const fetchImpl = opts.fetchImpl ?? fetch;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        throw new ArcGisFetchError(`ArcGIS HTTP ${res.status} pour ${url}`);
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch (parseErr) {
        throw new ArcGisFetchError(`ArcGIS réponse non-JSON pour ${url}`, parseErr);
      }
      if (body && typeof body === 'object' && 'error' in (body as Record<string, unknown>)) {
        throw new ArcGisFetchError(`ArcGIS erreur API: ${JSON.stringify((body as Record<string, unknown>).error)} pour ${url}`);
      }
      return body;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * 2 ** attempt));
        continue;
      }
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new ArcGisFetchError(`ArcGIS fetch échoué après ${retries + 1} tentative(s) pour ${url}: ${message}`, lastErr);
}

export interface LayerMetadata {
  lastEditDate: number; // epoch millis, editingInfo.lastEditDate
  maxRecordCount: number;
}

export async function fetchLayerMetadata(source: ArcGisSource, opts: FetchOptions = {}): Promise<LayerMetadata> {
  const url = `${source.baseUrl}/${source.layerId}?f=json`;
  const body = await fetchJsonWithRetry(url, opts) as Record<string, unknown>;
  const editingInfo = body.editingInfo as Record<string, unknown> | undefined;
  const lastEditDate = editingInfo?.lastEditDate;
  if (typeof lastEditDate !== 'number') {
    throw new ArcGisFetchError('ArcGIS metadata: editingInfo.lastEditDate manquant ou invalide');
  }
  const maxRecordCount = typeof body.maxRecordCount === 'number' ? body.maxRecordCount : 1000;
  return { lastEditDate, maxRecordCount };
}

/** OBJECTID triés par ordre croissant — le service ne les renvoie PAS triés (vérifié live). */
export async function fetchObjectIds(source: ArcGisSource, opts: FetchOptions = {}): Promise<number[]> {
  const url = `${source.baseUrl}/${source.layerId}/query?where=1%3D1&returnIdsOnly=true&f=json`;
  const body = await fetchJsonWithRetry(url, opts) as Record<string, unknown>;
  const ids = body.objectIds;
  if (!Array.isArray(ids)) {
    throw new ArcGisFetchError('ArcGIS objectIds: réponse sans tableau objectIds');
  }
  return [...(ids as number[])].sort((a, b) => a - b);
}

export interface ArcGisFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

/** Un seul lot d'identifiants (outSR=4326 forcé — le SR natif 2975 n'est jamais stocké, §7). */
export async function fetchFeatureBatch(
  source: ArcGisSource,
  ids: number[],
  opts: FetchOptions = {},
): Promise<ArcGisFeature[]> {
  if (ids.length === 0) return [];
  const url = `${source.baseUrl}/${source.layerId}/query?objectIds=${ids.join(',')}&outFields=*&outSR=4326&f=geojson`;
  const body = await fetchJsonWithRetry(url, opts) as Record<string, unknown>;
  const features = body.features;
  if (!Array.isArray(features)) {
    throw new ArcGisFetchError('ArcGIS query: réponse sans tableau features');
  }
  return features as ArcGisFeature[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Récupère TOUTES les features par lots ordonnés d'OBJECTID (déjà triés par fetchObjectIds).
 * batchSize par défaut = 500, sous le maxRecordCount=2000 de la couche par marge de sécurité. */
export async function fetchAllFeatures(
  source: ArcGisSource,
  ids: number[],
  batchSize = 500,
  opts: FetchOptions = {},
): Promise<ArcGisFeature[]> {
  const batches = chunk(ids, batchSize);
  const all: ArcGisFeature[] = [];
  for (const batch of batches) {
    const feats = await fetchFeatureBatch(source, batch, opts);
    all.push(...feats);
  }
  return all;
}

export interface FullSnapshot {
  features: ArcGisFeature[];
  layerLastEditDateBefore: number;
  layerLastEditDateAfter: number;
}

/**
 * Assemble le snapshot COMPLET de la source avant tout appel à trail_sync_apply_service (§8.1 —
 * un payload partiel serait interprété comme le snapshot complet et marquerait "missing" tout ce
 * qui manque). Re-lit le watermark après le fetch ; si la couche a changé pendant la collecte,
 * lève WatermarkChangedError SANS retourner de features partielles — l'appelant doit alors
 * finaliser le run en échec sans jamais appeler trail_sync_apply_service.
 */
export async function fetchFullSnapshot(source: ArcGisSource, opts: FetchOptions = {}): Promise<FullSnapshot> {
  const before = await fetchLayerMetadata(source, opts);
  const ids = await fetchObjectIds(source, opts);
  const features = await fetchAllFeatures(source, ids, 500, opts);
  const after = await fetchLayerMetadata(source, opts);
  if (after.lastEditDate !== before.lastEditDate) {
    throw new WatermarkChangedError(
      `la couche a changé pendant la collecte (lastEditDate ${before.lastEditDate} -> ${after.lastEditDate})`,
    );
  }
  return { features, layerLastEditDateBefore: before.lastEditDate, layerLastEditDateAfter: after.lastEditDate };
}
