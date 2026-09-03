// Tests du service du portail partenaire (18a) — RPC-only via api.* DEFINER.
// `fiche_submission`, `pending_change` et `org_actor_module_visibility` sont RLS
// service_role only : aucun `client.from(...)` n'est mockable ici parce qu'il ne doit
// EXISTER nulle part dans le service.
//
// Mock EXPLICITE (jamais l'automock) : `lib/supabase` construit un client au chargement
// du module ; l'automock l'importerait pour en dériver la forme, donc exécuterait ces
// effets de bord. C'est la convention de `moderation.test.ts`.
jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));

import { getApiClient } from '../lib/supabase';
import {
  listMyPortalFiches,
  listMySubmissions,
  getPortalSectionVisibility,
  submitActorFiche,
} from './portal';

const mockGetApiClient = getApiClient as jest.Mock;
const rpc = jest.fn();

beforeEach(() => {
  rpc.mockReset();
  mockGetApiClient.mockReset();
  mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
});

describe('listMyPortalFiches', () => {
  it('projette une ligne complète et IGNORE la ligne abîmée (parsing défensif)', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'HOT1',
          name: 'Villa',
          object_type: 'HOT',
          status: 'published',
          updated_at: '2026-09-01',
          open_submission: { id: 's1', submitted_at: '2026-08-28' },
          last_resolved: null,
          office_email: 'contact@oti.re',
          office_phone: '0262 00 00 00',
        },
        { pas_un_id: true },
      ],
      error: null,
    });

    const fiches = await listMyPortalFiches();

    // Une ligne sans id ne doit pas VIDER l'accueil : elle est écartée, pas fatale.
    expect(fiches).toHaveLength(1);
    expect(fiches[0]).toEqual({
      id: 'HOT1',
      name: 'Villa',
      objectType: 'HOT',
      status: 'published',
      updatedAt: '2026-09-01',
      openSubmission: { id: 's1', submittedAt: '2026-08-28' },
      lastResolved: null,
      officeEmail: 'contact@oti.re',
      officePhone: '0262 00 00 00',
    });
    expect(rpc).toHaveBeenCalledWith('list_my_portal_fiches', {});
  });

  it('lit office_phone DEPUIS office_phone — le téléphone est le second chemin, pas une copie de l’e-mail', async () => {
    // Un `mailto:` échoue EN SILENCE sur un téléphone sans application de courrier :
    // si le parseur oubliait `office_phone` (ou recopiait `office_email`), le repli
    // « appelez l'office » disparaîtrait sans le moindre signal. Les deux lignes ci-dessous
    // n'ont qu'UN canal chacune : un parseur qui confond les deux clés échoue ici.
    rpc.mockResolvedValue({
      data: [
        { id: 'HOT1', name: 'A', object_type: 'HOT', status: 'published', office_email: 'a@oti.re' },
        { id: 'HOT2', name: 'B', object_type: 'HOT', status: 'published', office_phone: '0262 11 11 11' },
      ],
      error: null,
    });

    const fiches = await listMyPortalFiches();

    expect(fiches[0]).toMatchObject({ officeEmail: 'a@oti.re', officePhone: null });
    expect(fiches[1]).toMatchObject({ officeEmail: null, officePhone: '0262 11 11 11' });
  });

  it('rend null des coordonnées d’office absentes (les 2 ORG de prod au 2026-09-02)', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'HOT1', name: 'Villa', object_type: 'HOT', status: 'published' }],
      error: null,
    });

    await expect(listMyPortalFiches()).resolves.toMatchObject([
      { officeEmail: null, officePhone: null, openSubmission: null, lastResolved: null, updatedAt: null },
    ]);
  });

  it('projette la dernière vérification résolue, resolved_at compris', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'HOT1',
          name: 'Villa',
          object_type: 'HOT',
          status: 'published',
          // `partial` est une valeur RÉELLE du CHECK de fiche_submission (18a §3.1) :
          // elle doit traverser telle quelle, sinon la fiche affiche un état vide.
          last_resolved: { status: 'partial', resolved_at: '2026-08-30' },
        },
      ],
      error: null,
    });

    const fiches = await listMyPortalFiches();
    expect(fiches[0].lastResolved).toEqual({ status: 'partial', resolvedAt: '2026-08-30' });
  });

  it('rend une liste vide quand le RPC ne rend pas un tableau', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(listMyPortalFiches()).resolves.toEqual([]);
  });

  it('lève un message FRANÇAIS et conserve le SQLSTATE en cas d’erreur', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
    // 42501 est traduit par SQLSTATE_LABELS : le brut anglais ne doit jamais atteindre l'écran.
    await expect(listMyPortalFiches()).rejects.toThrow(/droits actuels/);
  });
});

describe('listMySubmissions', () => {
  it('borne la lecture à la fiche ouverte (partenaire multi-fiches)', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await listMySubmissions(20, 'HOT1');
    // Sans p_object_id, la vérification en cours de CETTE fiche peut sortir des 20 lignes
    // d'un partenaire multi-fiches : les rubriques resteraient muettes, sans erreur.
    expect(rpc).toHaveBeenCalledWith('list_my_submissions', { p_limit: 20, p_object_id: 'HOT1' });
  });

  it('défauts : 20 lignes, aucun filtre de fiche', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await listMySubmissions();
    expect(rpc).toHaveBeenCalledWith('list_my_submissions', { p_limit: 20, p_object_id: null });
  });

  it('porte `section` par changement et DISTINGUE approved d’applied', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'sub-1',
          object_id: 'HOT1',
          object_name: 'Villa',
          note: 'Nouveaux horaires',
          // `partial` : une partie acceptée, une partie refusée.
          status: 'partial',
          submitted_at: '2026-09-01T08:00:00Z',
          resolved_at: '2026-09-02T09:00:00Z',
          changes: [
            { id: 'c1', section: 'descriptions', field: 'Descriptions', status: 'pending', review_note: null, reviewer_label: null },
            // `approved` = accepté puis reporté À LA MAIN par l'office (§7, branche attestée).
            // C'est la forme DOMINANTE (5 rubriques sur 7) : la confondre avec `applied` ou la
            // laisser tomber sur un repli afficherait un statut faux sur le cas le plus fréquent.
            { id: 'c2', section: 'contact', field: 'Contact', status: 'approved', review_note: 'Reporté', reviewer_label: 'Marie' },
            { id: 'c3', section: 'openings', field: 'Horaires', status: 'applied', review_note: null, reviewer_label: 'Marie' },
            { id: 'c4', section: 'media', field: 'Photos', status: 'rejected', review_note: 'Photo floue', reviewer_label: 'Marie' },
            // Changement abîmé (aucun id) : écarté sans faire tomber la soumission entière.
            { section: 'tags' },
          ],
        },
      ],
      error: null,
    });

    const submissions = await listMySubmissions(20, 'HOT1');

    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      id: 'sub-1',
      objectId: 'HOT1',
      objectName: 'Villa',
      note: 'Nouveaux horaires',
      status: 'partial',
      submittedAt: '2026-09-01T08:00:00Z',
      resolvedAt: '2026-09-02T09:00:00Z',
    });
    // Les QUATRE statuts traversent tels quels, dans l'ordre, sans repli ni collision.
    expect(submissions[0].changes.map((change) => change.status)).toEqual([
      'pending',
      'approved',
      'applied',
      'rejected',
    ]);
    // `section` (le module id) est la clé qui ANCRE l'état sur la bonne rubrique.
    expect(submissions[0].changes.map((change) => change.section)).toEqual([
      'descriptions',
      'contact',
      'openings',
      'media',
    ]);
    expect(submissions[0].changes[1]).toEqual({
      id: 'c2',
      section: 'contact',
      field: 'Contact',
      status: 'approved',
      reviewNote: 'Reporté',
      reviewerLabel: 'Marie',
    });
  });

  it('rend `changes` vide (jamais undefined) quand le RPC n’en émet pas', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'sub-1', object_id: 'HOT1', object_name: 'Villa', submitted_at: '2026-09-01' }],
      error: null,
    });
    const submissions = await listMySubmissions(20, 'HOT1');
    expect(submissions[0].changes).toEqual([]);
    expect(submissions[0].status).toBe('pending');
    expect(submissions[0].resolvedAt).toBeNull();
    expect(submissions[0].note).toBeNull();
  });

  it('écarte une soumission sans id', async () => {
    rpc.mockResolvedValue({ data: [{ object_id: 'HOT1' }, { id: 'sub-2', object_id: 'HOT1' }], error: null });
    const submissions = await listMySubmissions(20, 'HOT1');
    expect(submissions.map((s) => s.id)).toEqual(['sub-2']);
  });

  it('lève un message FRANÇAIS en cas d’erreur', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } });
    await expect(listMySubmissions(20, 'HOT1')).rejects.toThrow(/reconnectez-vous/i);
  });
});

describe('getPortalSectionVisibility', () => {
  it('normalise le plancher et les rubriques masquées', async () => {
    rpc.mockResolvedValue({ data: { floor_modules: ['legal'], masked_modules: ['descriptions'] }, error: null });
    await expect(getPortalSectionVisibility('HOT1')).resolves.toEqual({
      floorModules: ['legal'],
      maskedModules: ['descriptions'],
    });
    expect(rpc).toHaveBeenCalledWith('get_portal_section_visibility', { p_object_id: 'HOT1' });
  });

  it('écarte les entrées non textuelles et rend des tableaux vides sur une réponse vide', async () => {
    rpc.mockResolvedValue({ data: { floor_modules: ['legal', 42, null], masked_modules: 'pas-un-tableau' }, error: null });
    await expect(getPortalSectionVisibility('HOT1')).resolves.toEqual({
      floorModules: ['legal'],
      maskedModules: [],
    });
  });

  it('rend des tableaux vides quand data est null', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(getPortalSectionVisibility('HOT1')).resolves.toEqual({ floorModules: [], maskedModules: [] });
  });
});

describe('submitActorFiche', () => {
  const envelope = {
    objectId: 'HOT1',
    targetTable: 'object_description',
    targetPk: null,
    action: 'update' as const,
    payload: {},
    metadata: {
      rpc: null,
      section: 'descriptions',
      manual_apply: true,
      field: 'Descriptions',
      before: 'a',
      after: 'b',
    },
  };

  it('transporte l’enveloppe contributeur TELLE QUELLE (une seule traduction, metadata intacte)', async () => {
    rpc.mockResolvedValue({
      data: { submission_id: 's1', task_id: 't1', change_count: 1, assignee_count: 2 },
      error: null,
    });

    const result = await submitActorFiche('HOT1', [envelope], 'Bonjour');

    expect(result).toEqual({ submissionId: 's1', taskId: 't1', changeCount: 1, assigneeCount: 2 });
    // La traduction camelCase → snake_case a lieu ICI et NULLE PART AILLEURS. `metadata` est
    // DÉJÀ en snake_case (buildContributorSubmission) : la retraduire casserait `manual_apply`,
    // que le SQL relit mot pour mot. `objectId` de l'enveloppe n'est PAS repris — la fiche
    // cible est portée par `p_object_id`, une seule fois.
    expect(rpc).toHaveBeenCalledWith('submit_actor_fiche', {
      p_object_id: 'HOT1',
      p_changes: [
        {
          target_table: 'object_description',
          target_pk: null,
          action: 'update',
          payload: {},
          metadata: {
            rpc: null,
            section: 'descriptions',
            manual_apply: true,
            field: 'Descriptions',
            before: 'a',
            after: 'b',
          },
        },
      ],
      p_note: 'Bonjour',
    });
    const sent = rpc.mock.calls[0][1] as { p_changes: Record<string, unknown>[] };
    expect(Object.keys(sent.p_changes[0]).sort()).toEqual(['action', 'metadata', 'payload', 'target_pk', 'target_table']);
  });

  it('rattache le SQLSTATE à l’erreur levée — PT409 « une vérification est déjà en cours »', async () => {
    // `mapDatabaseError` JETTE `error.code` (api-error.ts:295, repli `new Error(fallback)`) :
    // sans ce rattachement, la fenêtre d'envoi ne pourrait PAS distinguer « déjà en cours »
    // d'une panne quelconque, et le partenaire lirait « réessayez » sur un état qui durera.
    // Même geste que `selection-emails.ts:97-99`.
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PT409', message: 'Une vérification est déjà en cours pour cette fiche' },
    });

    await expect(submitActorFiche('HOT1', [envelope], null)).rejects.toMatchObject({ code: 'PT409' });
  });

  it('rattache aussi 22023 (rubrique fermée par l’office) et rend le RAISE français', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'Rubrique non modifiable depuis le portail' },
    });

    await expect(submitActorFiche('HOT1', [envelope], null)).rejects.toMatchObject({
      code: '22023',
      message: 'Rubrique non modifiable depuis le portail',
    });
  });

  it('refuse une réponse sans submission_id', async () => {
    rpc.mockResolvedValue({ data: { task_id: 't1' }, error: null });
    await expect(submitActorFiche('HOT1', [envelope], null)).rejects.toThrow();
  });

  it('rend 0 pour des compteurs absents ou non numériques', async () => {
    rpc.mockResolvedValue({ data: { submission_id: 's1', change_count: '3' }, error: null });
    await expect(submitActorFiche('HOT1', [envelope], null)).resolves.toEqual({
      submissionId: 's1',
      taskId: '',
      changeCount: 0,
      assigneeCount: 0,
    });
  });

  it('normalise targetPk absent en null (le SQL lit target_pk mot pour mot)', async () => {
    rpc.mockResolvedValue({ data: { submission_id: 's1', task_id: 't1' }, error: null });
    await submitActorFiche(
      'HOT1',
      [{ objectId: 'HOT1', targetTable: 'object', action: 'update', payload: { a: 1 } }],
      null,
    );
    const sent = rpc.mock.calls[0][1] as { p_changes: Record<string, unknown>[] };
    expect(sent.p_changes[0]).toMatchObject({ target_pk: null, metadata: null });
  });
});

describe('client indisponible', () => {
  it('lève une erreur explicite quand Supabase n’est pas configuré', async () => {
    mockGetApiClient.mockReturnValue(null);
    await expect(listMyPortalFiches()).rejects.toThrow(/indisponible/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});
