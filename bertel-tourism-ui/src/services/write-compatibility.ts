/** Stable write protocol version shared by the UI bundle and the app-version endpoint. */
export const WRITE_CONTRACT_VERSION = 1;
export const MINIMUM_CLIENT_VERSION = 1;

export interface WriteCompatibility {
  compatible: boolean;
  clientVersion: number;
  minimumClientVersion: number;
  serverWriteContractVersion: number;
  reason?: string;
}

export type CompatibilityFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function readWriteCompatibility(fetcher?: CompatibilityFetch): Promise<WriteCompatibility> {
  const unavailable = (reason: string): WriteCompatibility => ({
    compatible: false,
    clientVersion: WRITE_CONTRACT_VERSION,
    minimumClientVersion: Number.NaN,
    serverWriteContractVersion: Number.NaN,
    reason,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = fetcher ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
    if (!request) return unavailable('Vérification de compatibilité impossible. Vérifiez votre connexion avant de réessayer.');
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 5000);
    const response = await request('/api/app-version', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return unavailable(`Version serveur indisponible (${response.status}).`);
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return unavailable('Réponse de version invalide.');
    const record = body as Record<string, unknown>;
    const minimumClientVersion = record.minimumClientVersion;
    const serverWriteContractVersion = record.writeContractVersion;
    if (!Number.isInteger(minimumClientVersion) || !Number.isInteger(serverWriteContractVersion)
      || (minimumClientVersion as number) < 1 || (serverWriteContractVersion as number) < (minimumClientVersion as number)) {
      return unavailable('Réponse de version invalide.');
    }
    const minimum = minimumClientVersion as number;
    const server = serverWriteContractVersion as number;
    const compatible = minimum <= WRITE_CONTRACT_VERSION && WRITE_CONTRACT_VERSION <= server;
    return {
      compatible,
      clientVersion: WRITE_CONTRACT_VERSION,
      minimumClientVersion: minimum,
      serverWriteContractVersion: server,
      ...(!compatible ? { reason: 'Cette version de l’application ne peut pas écrire sur le serveur actuel.' } : {}),
    };
  } catch {
    return unavailable('Vérification de compatibilité impossible. Vérifiez votre connexion avant de réessayer.');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function assertWriteCompatible(compatibility: WriteCompatibility): void {
  const validRange = Number.isInteger(compatibility.clientVersion)
    && Number.isInteger(compatibility.minimumClientVersion)
    && Number.isInteger(compatibility.serverWriteContractVersion)
    && compatibility.minimumClientVersion >= 1
    && compatibility.serverWriteContractVersion >= compatibility.minimumClientVersion
    && compatibility.minimumClientVersion <= compatibility.clientVersion
    && compatibility.clientVersion <= compatibility.serverWriteContractVersion;
  if (!compatibility.compatible || !validRange) {
    throw new Error(compatibility.reason ?? 'Écriture bloquée : versions incompatibles.');
  }
}
