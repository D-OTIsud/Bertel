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
  //
  // La forme N'EST PAS libre : `api.export_actor_contacts.p_export_run_id` est de type **uuid**,
  // donc une chaîne non-UUID est rejetée en 22P02 dès la PLANIFICATION et fait échouer l'export
  // ENTIER — pas seulement son journal. Asserter « une chaîne non vide » ne garde donc RIEN :
  // c'est la regex UUID v4 (version `4`, variante `8|9|a|b`) qui est la vraie garde.
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  // Neutralise les sources d'aléa nommées, joue l'export, rend le run id transmis au RPC.
  const runIdWithout = async (...missing: ('randomUUID' | 'getRandomValues')[]) => {
    const saved = missing.map((name) => [name, globalThis.crypto[name]] as const);
    missing.forEach((name) => Object.defineProperty(globalThis.crypto, name, { value: undefined, configurable: true }));
    try {
      mockRpc.mockResolvedValue({ log_id: 'j1', export_run_id: 'run', authorized_object_ids: ['a'], denied_object_ids: [], rows: [] });
      const result = await exportActorContacts(['a'], 'Campagne 2026', {});
      // Le run id RENDU et celui ENVOYÉ au RPC sont la même valeur : c'est ce qui recolle
      // le résultat client aux lignes de journal serveur.
      // `.at(-1)` et non `[0]` : l'appelant peut boucler, et le mock n'est réinitialisé qu'entre TESTS.
      expect(mockRpc.mock.calls.at(-1)?.[2].exportRunId).toBe(result.exportRunId);
      return result.exportRunId;
    } finally {
      saved.forEach(([name, value]) => Object.defineProperty(globalThis.crypto, name, { value, configurable: true }));
    }
  };

  it("sans crypto.randomUUID (contexte non sécurisé), le run id reste un UUID v4 valide", async () => {
    expect(await runIdWithout('randomUUID')).toMatch(UUID_V4);
  });

  it("sans getRandomValues non plus, le repli Math.random rend TOUJOURS un UUID v4 valide", async () => {
    // Dernier étage du repli : on accepte un aléa faible, jamais un format que PostgreSQL refuse.
    // Plusieurs tirages, car les octets 6 et 8 (version/variante) doivent être forcés à CHAQUE fois.
    for (let i = 0; i < 20; i += 1) {
      expect(await runIdWithout('randomUUID', 'getRandomValues')).toMatch(UUID_V4);
    }
  });

  it('refuse une finalité vide ou trop courte AVANT tout appel réseau (le serveur revalide)', async () => {
    await expect(exportActorContacts(['a'], '   ', {})).rejects.toThrow(/finalité/i);
    await expect(exportActorContacts(['a'], 'abc', {})).rejects.toThrow(/finalité/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
