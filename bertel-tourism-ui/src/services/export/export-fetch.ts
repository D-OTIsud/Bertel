import { getObjectResourcesBatch } from '../rpc';
import { parseObjectDetail, type ParsedObjectDetail } from '../object-detail-parser';

/** Taille de lot mesurée en prod : 50 fiches = 1,37 s (marge ×5,8 sous le timeout authenticated de 8 s). NE PAS monter à 100 (3,3 s, marge ×2,4 — trop mince à 220-310 ms d'AR Réunion↔Supabase). */
export const EXPORT_BATCH_SIZE = 50;

/** R1 — concurrence BORNÉE : 2 lots en vol maximum. Jamais illimitée (charge SQL sans réduction du travail total). Mesurer avant d'augmenter. */
export const EXPORT_BATCH_CONCURRENCY = 2;

/** Dédoublonne, écarte les ids vides (jamais de NULL dans p_ids — décalage des positions), découpe. */
export function chunkIds(ids: string[], size = EXPORT_BATCH_SIZE): string[][] {
  const clean = [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < clean.length; i += size) {
    chunks.push(clean.slice(i, i + size));
  }
  return chunks;
}

/**
 * R1 — charge la sélection par lots et STREAME chaque lot à `onBatch` : l'appelant
 * aplatit immédiatement en lignes d'export et laisse le JSON partir au GC — on
 * n'accumule jamais le corpus entier en mémoire (10,5 Mo réseau ≫ en objets JS).
 * Fusion par object_id : le payload porte son id ; s'il diffère de l'id positionnel
 * attendu, payload.id fait foi (ceinture sur le contrat positionnel du RPC).
 * Concurrence bornée à EXPORT_BATCH_CONCURRENCY. Un lot en échec ⇒ throw — l'appelant
 * ne produit AUCUN fichier (spec R1-3).
 */
export async function fetchResourceBatches(
  ids: string[],
  langPrefs: string[],
  opts: {
    fields?: string[];
    onBatch: (entries: Array<[string, ParsedObjectDetail]>) => void;
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const chunks = chunkIds(ids);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  let done = 0;
  let cursor = 0;

  const assertAlive = () => {
    if (opts.signal?.aborted) throw new Error('Export annulé.');
  };

  async function worker(): Promise<void> {
    for (;;) {
      assertAlive();
      const index = cursor;
      if (index >= chunks.length) return;
      cursor += 1;
      const chunk = chunks[index];
      const details = await getObjectResourcesBatch(chunk, langPrefs, {
        signal: opts.signal,
        fields: opts.fields,
      });
      assertAlive();
      const entries: Array<[string, ParsedObjectDetail]> = [];
      details.forEach((detail, i) => {
        if (!detail) return;
        const rawId = typeof detail.raw.id === 'string' && detail.raw.id.trim() !== '' ? detail.raw.id : chunk[i];
        entries.push([rawId, parseObjectDetail(detail.raw)]);
      });
      opts.onBatch(entries);
      done += chunk.length;
      opts.onProgress?.(done, total);
    }
  }

  assertAlive();
  const workers = Array.from({ length: Math.min(EXPORT_BATCH_CONCURRENCY, chunks.length) }, () => worker());
  await Promise.all(workers);
}
