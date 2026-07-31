import { chunkIds, EXPORT_BATCH_SIZE, fetchResourceBatches } from './export-fetch';
import { getObjectResourcesBatch } from '../rpc';
import type { ParsedObjectDetail } from '../object-detail-parser';

jest.mock('../rpc', () => ({ getObjectResourcesBatch: jest.fn() }));
const mockBatch = getObjectResourcesBatch as jest.Mock;

const fakeDetail = (id: string) => ({ id, name: `Fiche ${id}`, raw: { id, name: `Fiche ${id}`, type: 'HOT', status: 'published' } });

describe('chunkIds', () => {
  it('découpe par 50, dédoublonne et écarte les ids vides/null (jamais de NULL dans p_ids)', () => {
    const ids = ['a', 'b', 'a', ' ', '', 'c'];
    expect(chunkIds(ids, 2)).toEqual([['a', 'b'], ['c']]);
  });
  it('taille par défaut = 50 (mesuré : 1,37 s / lot, marge ×5,8 sous le timeout 8 s)', () => {
    expect(EXPORT_BATCH_SIZE).toBe(50);
    const many = Array.from({ length: 120 }, (_, i) => `id-${i}`);
    expect(chunkIds(many).map((c) => c.length)).toEqual([50, 50, 20]);
  });
});

describe('fetchResourceBatches (R1 : streaming + concurrence 2 + fusion par object_id)', () => {
  beforeEach(() => mockBatch.mockReset());

  it('streame chaque lot à onBatch, saute les null, rapporte la progression', async () => {
    mockBatch.mockImplementation(async (ids: string[]) => ids.map((id) => (id === 'absent' ? null : fakeDetail(id))));
    const seen: Array<[number, number]> = [];
    const collected = new Map<string, ParsedObjectDetail>();
    await fetchResourceBatches(['x', 'absent', 'y'], ['fr'], {
      onBatch: (entries) => entries.forEach(([id, d]) => collected.set(id, d)),
      onProgress: (done, total) => seen.push([done, total]),
    });
    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect([...collected.keys()]).toEqual(['x', 'y']);
    expect(collected.get('x')?.identity.name).toBe('Fiche x');
    expect(seen.at(-1)).toEqual([3, 3]);
  });

  it("fusionne par object_id : si le payload porte un id différent de la position, payload.id fait foi", async () => {
    mockBatch.mockImplementation(async () => [fakeDetail('reel-1')]); // le serveur rend un id ≠ position
    const collected = new Map<string, ParsedObjectDetail>();
    await fetchResourceBatches(['demande-1'], ['fr'], { onBatch: (e) => e.forEach(([id, d]) => collected.set(id, d)) });
    expect([...collected.keys()]).toEqual(['reel-1']);
  });

  it('concurrence bornée à 2 : jamais plus de 2 lots en vol', async () => {
    let inFlight = 0; let peak = 0;
    mockBatch.mockImplementation(async (ids: string[]) => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return ids.map(fakeDetail);
    });
    const many = Array.from({ length: 250 }, (_, i) => `id-${i}`); // 5 lots de 50
    await fetchResourceBatches(many, ['fr'], { onBatch: () => {} });
    expect(mockBatch).toHaveBeenCalledTimes(5);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(1); // la concurrence existe vraiment
  });

  it('transmet fields au batch (projection R1) et le signal', async () => {
    mockBatch.mockResolvedValue([fakeDetail('x')]);
    await fetchResourceBatches(['x'], ['fr'], { fields: ['contacts', 'address'], onBatch: () => {} });
    expect(mockBatch).toHaveBeenCalledWith(['x'], ['fr'], expect.objectContaining({ fields: ['contacts', 'address'] }));
  });

  it("s'arrête net quand le signal est déjà annulé (aucun appel réseau)", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(fetchResourceBatches(['x'], ['fr'], { onBatch: () => {}, signal: controller.signal })).rejects.toThrow(/annul/i);
    expect(mockBatch).not.toHaveBeenCalled();
  });
});
