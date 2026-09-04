// Tests du service Modération (P2.1, §119) — RPC-only via api.* DEFINER.
// La table pending_change n'est PAS lisible en PostgREST direct : aucun client.from('pending_change') ici.
jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: { getState: jest.fn(() => ({ demoMode: false })) },
}));

import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import {
  parsePendingChange,
  listPendingChanges,
  submitPendingChange,
  approvePendingChange,
  rejectPendingChange,
  approveFicheSubmission,
  rejectFicheSubmission,
} from './moderation';

const mockGetApiClient = getApiClient as jest.Mock;
const mockGetState = useSessionStore.getState as jest.Mock;

const RPC_ROW = {
  id: 'pc-1',
  object_id: 'HOTRUN0000000001',
  object_name: 'Hôtel Basalte',
  target_table: 'object',
  target_pk: 'HOTRUN0000000001',
  action: 'update',
  status: 'pending',
  field_label: 'lieu_dit',
  before_value: 'Bras-Long',
  after_value: 'Bras Long',
  submitted_by: '00000000-0000-4000-a000-000000000001',
  submitter_label: 'Jean Martin',
  submitted_at: '2026-03-12T14:30:00Z',
  reviewed_by: null,
  reviewer_label: null,
  reviewed_at: null,
  review_note: null,
  applied_at: null,
  // 18a/D9 — colonnes ajoutées par la §7.3 de migration_actor_portal.sql.
  submission_id: null,
  submission_note: null,
  actor_label: null,
  manual_apply: false,
};

describe('parsePendingChange', () => {
  it('maps RPC columns to the PendingChangeItem domain shape', () => {
    const item = parsePendingChange(RPC_ROW);
    expect(item).toMatchObject({
      id: 'pc-1',
      objectId: 'HOTRUN0000000001',
      objectName: 'Hôtel Basalte',
      author: 'Jean Martin',
      field: 'lieu_dit',
      before: 'Bras-Long',
      after: 'Bras Long',
      status: 'pending',
      targetTable: 'object',
      action: 'update',
    });
  });

  // 18a/D9 : ces QUATRE colonnes portent la vue groupée ET l'attestation. `manual_apply` est
  // la seule qui décide d'une ÉCRITURE (p_applied_manually) — si elle se perdait au mapping,
  // l'écran approuverait en un clic une rubrique que personne n'a reportée.
  it('18a/D9 — mappe les quatre colonnes de soumission (dont manual_apply)', () => {
    const item = parsePendingChange({
      ...RPC_ROW,
      submission_id: 'sub-1',
      submission_note: 'Tarifs à jour',
      actor_label: 'Marie Payet',
      manual_apply: true,
    });
    expect(item.submissionId).toBe('sub-1');
    expect(item.submissionNote).toBe('Tarifs à jour');
    expect(item.actorLabel).toBe('Marie Payet');
    expect(item.manualApply).toBe(true);
  });

  // FAIL-CLOSED. La valeur risquée est `false` : elle signifie « la machine applique », donc
  // approbation en un clic. Une colonne ABSENTE (fixtures démo, serveur d'avant la §7) ne doit
  // donc pas se lire `false` mais « inconnu » — l'écran exigera alors l'attestation.
  it('18a/D9 — manual_apply absent reste INDÉTERMINÉ, jamais false', () => {
    const { manual_apply: _ignored, ...withoutColumn } = RPC_ROW;
    expect(parsePendingChange(withoutColumn).manualApply).toBeUndefined();
    expect(parsePendingChange({ ...RPC_ROW, manual_apply: null }).manualApply).toBeUndefined();
  });
});

describe('listPendingChanges', () => {
  const rpc = jest.fn();
  beforeEach(() => {
    rpc.mockReset();
    mockGetState.mockReturnValue({ demoMode: false });
    mockGetApiClient.mockReset();
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  });

  it('calls list_pending_changes with status/object filters and parses rows', async () => {
    rpc.mockResolvedValue({ data: [RPC_ROW], error: null });
    const rows = await listPendingChanges('pending', 'HOTRUN0000000001');
    expect(rpc).toHaveBeenCalledWith('list_pending_changes', {
      p_status: 'pending',
      p_object_id: 'HOTRUN0000000001',
      p_limit: 50,
      p_offset: 0,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('pc-1');
  });

  it('defaults to the pending status and no object filter', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await listPendingChanges();
    expect(rpc).toHaveBeenCalledWith('list_pending_changes', {
      p_status: 'pending',
      p_object_id: null,
      p_limit: 50,
      p_offset: 0,
    });
  });

  it('returns mock data in demo mode without hitting the backend', async () => {
    mockGetState.mockReturnValue({ demoMode: true });
    const rows = await listPendingChanges();
    expect(rpc).not.toHaveBeenCalled();
    expect(rows.length).toBeGreaterThan(0);
  });

  // Task 19 enverra l'agent sur /moderation?object=<id>. En démo, la branche mock court-circuite
  // le serveur : sans ce filtre, la page annoncerait « la file de cette fiche » en affichant
  // celle de TOUTE l'organisation — et l'agent trancherait la ligne d'un autre partenaire.
  it('18a/D9 — le mode démo honore AUSSI le filtre par objet', async () => {
    mockGetState.mockReturnValue({ demoMode: true });
    const all = await listPendingChanges('pending', null);
    const scoped = await listPendingChanges('pending', 'HOTRUN0000000001');
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.length).toBeLessThan(all.length);
    expect(scoped.every((row) => row.objectId === 'HOTRUN0000000001')).toBe(true);
  });

  it('surfaces backend errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(listPendingChanges()).rejects.toThrow(/boom|modération/i);
  });
});

describe('submitPendingChange', () => {
  const rpc = jest.fn();
  beforeEach(() => {
    rpc.mockReset();
    mockGetState.mockReturnValue({ demoMode: false });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  });

  it('calls submit_pending_change with the full envelope and returns the new id', async () => {
    rpc.mockResolvedValue({ data: 'pc-new', error: null });
    const id = await submitPendingChange({
      objectId: 'HOTRUN0000000001',
      targetTable: 'object',
      targetPk: 'HOTRUN0000000001',
      action: 'update',
      payload: { payment_methods: [] },
      metadata: { rpc: 'save_object_commercial', field: 'payment_methods' },
    });
    expect(id).toBe('pc-new');
    expect(rpc).toHaveBeenCalledWith('submit_pending_change', {
      p_object_id: 'HOTRUN0000000001',
      p_target_table: 'object',
      p_target_pk: 'HOTRUN0000000001',
      p_action: 'update',
      p_payload: { payment_methods: [] },
      p_metadata: { rpc: 'save_object_commercial', field: 'payment_methods' },
    });
  });
});

describe('approvePendingChange / rejectPendingChange', () => {
  const rpc = jest.fn();
  beforeEach(() => {
    rpc.mockReset();
    mockGetState.mockReturnValue({ demoMode: false });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  });

  it('approve calls approve_pending_change with id + note', async () => {
    rpc.mockResolvedValue({ data: { success: true, status: 'applied' }, error: null });
    await approvePendingChange('pc-1', 'OK terrain');
    expect(rpc).toHaveBeenCalledWith('approve_pending_change', {
      p_id: 'pc-1',
      p_review_note: 'OK terrain',
      // Jamais omis : un `undefined` sérialisé par PostgREST laisserait le DÉFAUT SQL décider
      // à notre place. L'attestation doit être une valeur que le front a explicitement choisie.
      p_applied_manually: false,
    });
  });

  // 18a/D9 — le 3e argument est l'ATTESTATION nominative (metadata.attested_by côté serveur).
  it('18a/D9 — approve transmet l’attestation quand elle est signée', async () => {
    rpc.mockResolvedValue({ data: { success: true, status: 'approved' }, error: null });
    await approvePendingChange('pc-1', null, true);
    expect(rpc).toHaveBeenCalledWith('approve_pending_change', {
      p_id: 'pc-1',
      p_review_note: null,
      p_applied_manually: true,
    });
  });

  // Chantier 2026-08-28 n°4 — le mock portait un message SANS `code`, ce que PostgREST ne produit
  // jamais. Avec le code réel du `RAISE` SQL, le message métier français passe désormais tel quel :
  // c'est le contrat (nos RAISE sont rédigés pour l'utilisateur).
  it('approve remonte le message métier du RPC quand il en porte un', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Droits de modération insuffisants' } });
    await expect(approvePendingChange('pc-1')).rejects.toThrow(/Droits de modération insuffisants/);
  });

  // Et l'inverse, qui est le vrai apport du lot A : une erreur technique SANS message
  // exploitable ne remonte plus le brut anglais, mais le repli FRANÇAIS du site d'appel.
  it('approve replie sur le message français quand l’erreur est technique', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'internal error: relation does not exist' } });
    const promise = approvePendingChange('pc-1');
    await expect(promise).rejects.toThrow('Approbation impossible.');
    await expect(promise).rejects.not.toThrow(/relation does not exist/);
  });

  it('reject requires a non-empty note client-side (never calls the RPC empty)', async () => {
    await expect(rejectPendingChange('pc-1', '   ')).rejects.toThrow(/motif|note/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reject calls reject_pending_change with id + note', async () => {
    rpc.mockResolvedValue({ data: { success: true, status: 'rejected' }, error: null });
    await rejectPendingChange('pc-1', 'Donnée erronée');
    expect(rpc).toHaveBeenCalledWith('reject_pending_change', { p_id: 'pc-1', p_review_note: 'Donnée erronée' });
  });
});

// 18a/D9 — geste GROUPÉ sur une soumission entière du portail acteur.
describe('approveFicheSubmission / rejectFicheSubmission', () => {
  const rpc = jest.fn();
  beforeEach(() => {
    rpc.mockReset();
    mockGetState.mockReturnValue({ demoMode: false });
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  });

  it('approuve la soumission sans inclure les reports manuels par défaut', async () => {
    rpc.mockResolvedValue({ data: { applied_count: 2 }, error: null });
    await approveFicheSubmission('sub-1');
    expect(rpc).toHaveBeenCalledWith('approve_fiche_submission', {
      p_submission_id: 'sub-1',
      p_review_note: null,
      p_include_manual: false,
    });
  });

  it('propage l’attestation groupée quand l’office la signe', async () => {
    rpc.mockResolvedValue({ data: { approved_manual_count: 3 }, error: null });
    await approveFicheSubmission('sub-1', null, true);
    expect(rpc).toHaveBeenCalledWith('approve_fiche_submission', {
      p_submission_id: 'sub-1',
      p_review_note: null,
      p_include_manual: true,
    });
  });

  // Le motif est la SEULE chose que le prestataire recevra : un refus muet le laisse
  // re-soumettre à l'identique. Garde client en plus de celle du RPC (défense en profondeur).
  it('refuse un rejet groupé sans motif, sans jamais appeler le RPC', async () => {
    await expect(rejectFicheSubmission('sub-1', '   ')).rejects.toThrow(/motif/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejette la soumission avec son motif', async () => {
    rpc.mockResolvedValue({ data: { rejected_count: 2 }, error: null });
    await rejectFicheSubmission('sub-1', 'Tarifs incohérents');
    expect(rpc).toHaveBeenCalledWith('reject_fiche_submission', {
      p_submission_id: 'sub-1',
      p_review_note: 'Tarifs incohérents',
    });
  });
});
