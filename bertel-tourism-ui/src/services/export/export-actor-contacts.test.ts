import { exportActorContacts } from './export-actor-contacts';
import { callExportActorContactsRpc } from '../rpc';

jest.mock('../rpc', () => ({ callExportActorContactsRpc: jest.fn() }));
const mockRpc = callExportActorContactsRpc as jest.Mock;

describe('exportActorContacts (§208/R1)', () => {
  beforeEach(() => mockRpc.mockReset());

  it('découpe par 500, partage le MÊME export_run_id, fusionne lignes + logIds + autorisées/refusées', async () => {
    mockRpc.mockImplementation(async (ids: string[], _reason: string, meta: { exportRunId: string; batchIndex: number; batchCount: number }) => ({
      log_id: `journal-lot-${meta.batchIndex}`,
      export_run_id: meta.exportRunId,
      authorized_object_ids: ids.filter((id) => id !== 'refusee'),
      denied_object_ids: ids.filter((id) => id === 'refusee'),
      rows: ids.slice(0, 1).map((id) => ({
        object_id: id, display_name: 'Jean', role_name: 'Exploitant', is_primary: true, note: '',
        contacts: [{ kind_code: 'mobile', kind_name: 'Mobile', value: '0692', is_primary: true }],
      })),
    }));
    const ids = [...Array.from({ length: 500 }, (_, i) => `id-${i}`), 'refusee'];
    const result = await exportActorContacts(ids, 'Campagne 2026', {});
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls[0][0]).toHaveLength(500);
    // R1 : le run id est GÉNÉRÉ CLIENT et identique sur les deux lots (1/2 puis 2/2)
    const meta1 = mockRpc.mock.calls[0][2];
    const meta2 = mockRpc.mock.calls[1][2];
    expect(meta1.exportRunId).toBe(meta2.exportRunId);
    expect([meta1.batchIndex, meta1.batchCount]).toEqual([1, 2]);
    expect([meta2.batchIndex, meta2.batchCount]).toEqual([2, 2]);
    expect(result.exportRunId).toBe(meta1.exportRunId);
    expect(result.logIds).toEqual(['journal-lot-1', 'journal-lot-2']);
    expect(result.authorizedObjectIds).toHaveLength(500);
    expect(result.deniedObjectIds).toEqual(['refusee']);
    expect(result.rows.get('id-0')?.[0].contacts[0].kindCode).toBe('mobile');
  });

  it("R1 — échec du second lot ⇒ l'appel REJETTE (aucun fichier ne sera produit)", async () => {
    mockRpc
      .mockResolvedValueOnce({ log_id: 'j1', export_run_id: 'run', authorized_object_ids: [], denied_object_ids: [], rows: [] })
      .mockRejectedValueOnce(new Error('timeout'));
    const ids = Array.from({ length: 501 }, (_, i) => `id-${i}`);
    await expect(exportActorContacts(ids, 'Campagne 2026', {})).rejects.toThrow('timeout');
  });

  // `crypto.randomUUID` est réservé aux contextes SÉCURISÉS (et absent avant Safari 15.4) :
  // en HTTP simple il vaut `undefined` et l'export mourait sur un TypeError, sans fichier.
  // jest.setup.ts le polyfille — donc SEUL un test qui le retire peut voir ce chemin.
  it("génère un export_run_id même sans crypto.randomUUID (contexte non sécurisé)", async () => {
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      mockRpc.mockResolvedValue({ log_id: 'j1', export_run_id: 'run', authorized_object_ids: ['a'], denied_object_ids: [], rows: [] });
      const result = await exportActorContacts(['a'], 'Campagne 2026', {});
      expect(typeof result.exportRunId).toBe('string');
      expect(result.exportRunId.length).toBeGreaterThan(8);
      expect(mockRpc.mock.calls[0][2].exportRunId).toBe(result.exportRunId);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
    }
  });

  it('refuse une finalité vide ou trop courte AVANT tout appel réseau (le serveur revalide)', async () => {
    await expect(exportActorContacts(['a'], '   ', {})).rejects.toThrow(/finalité/i);
    await expect(exportActorContacts(['a'], 'abc', {})).rejects.toThrow(/finalité/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
