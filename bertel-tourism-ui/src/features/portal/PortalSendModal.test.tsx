/**
 * « Envoyer à l'office » — le seul geste qui fait partir quelque chose.
 *
 * Trois invariants s'y jouent, et chacun a coûté une revue :
 *
 *  1. D12 — le portail surcharge UNIQUEMENT `metadata.field/before/after` par une projection
 *     lisible. `section`, `rpc`, `manual_apply` et `payload` restent BYTE-IDENTIQUES à ce que
 *     `buildContributorSubmission` produit : ce sont les seules clés que le serveur valide et
 *     rejoue à l'approbation. Une projection qui déborderait sur `payload` ferait approuver un
 *     contenu que personne n'a construit.
 *
 *  2. Une rubrique en mode dégradé (`unavailable`) n'est JAMAIS envoyée. `buildContributorSubmission`
 *     n'a aucune garde de ce genre : elle est ici, et nulle part ailleurs côté front.
 *
 *  3. UN SEUL appel : le RPC est transactionnel, un échec ne laisse rien passer.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalSendModal } from './PortalSendModal';
import { buildContributorSubmission } from '../object-editor/contributor-proposal';
import { buildPortalRubrics, type BuiltPortalRubric } from './portal-rubrics';
import { portalDraftKey } from './usePortalDraft';
import * as portalService from '../../services/portal';
import type { ObjectEditorState } from '../object-editor/useObjectEditorState';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

jest.mock('../../services/portal');
const mockedPortal = portalService as jest.Mocked<typeof portalService>;

const OBJ = 'RESRUN0001';
const USER = 'u1';

const modules = (over: Record<string, unknown> = {}) =>
  ({
    contacts: { objectItems: [], webItems: [], kindOptions: [], roleOptions: [] },
    descriptions: { object: { chapo: { baseValue: '', values: {} }, description: { baseValue: '', values: {} } } },
    openings: { periods: [], periodTypeOptions: [], unavailableReason: null },
    characteristics: {
      selectedAmenityCodes: [],
      selectedPaymentCodes: [],
      amenityGroups: [],
      paymentOptions: [],
      unavailableReason: null,
    },
    capacityPolicies: {
      capacityItems: [],
      metricOptions: [],
      petPolicy: { accepted: null, conditions: '' },
      groupPolicy: {},
      stayPolicy: {},
      unavailableReason: null,
    },
    pricing: { prices: [], priceKindOptions: [], priceUnitOptions: [], priceTypeOptions: [], discounts: [], promotions: [], unavailableReason: null },
    activity: { durationMin: '', minParticipants: '', maxParticipants: '', minAge: '', unavailableReason: null },
    ...over,
  }) as unknown as ObjectWorkspaceModules;

const baseline = modules();
const draft = modules({
  contacts: {
    objectItems: [
      { id: 'c1', kindCode: 'phone', kindLabel: 'Téléphone', value: '0692 45 12 30', isPublic: true, isPrimary: true },
    ],
    webItems: [],
    kindOptions: [],
    roleOptions: [],
  },
  openings: {
    periods: [
      {
        recordId: 'p1',
        label: 'Horaires habituels',
        isClosure: false,
        recurrence: 'always',
        startDate: '',
        endDate: '',
        allYears: true,
        closedDays: [],
        order: '1',
        seasonTypeCode: '',
        weekdays: [{ code: 'monday', label: 'lundi', slots: [{ start: '11:30', end: '14:30' }] }],
      },
    ],
    periodTypeOptions: [],
    unavailableReason: null,
  },
});

function fakeEditor(): ObjectEditorState {
  return {
    objectId: OBJ,
    draft,
    baseline,
    dirtySections: { contacts: true, openings: true },
    isDirty: true,
    patchModule: jest.fn(),
    replaceModule: jest.fn(),
    resetModule: jest.fn(),
    commitModules: jest.fn(),
    setSavedStatus: jest.fn(),
  } as unknown as ObjectEditorState;
}

const floor = ['legal', 'publication', 'media', 'provider'];

function rubrics(over: Partial<Parameters<typeof buildPortalRubrics>[0]> = {}): BuiltPortalRubric[] {
  return buildPortalRubrics({
    archetype: 'RES',
    draft,
    dirty: { contacts: true, openings: true },
    masked: [],
    floor,
    pendingModules: new Set(),
    rejectedModules: new Set(),
    ...over,
  });
}

function setup(over: { rubrics?: BuiltPortalRubric[]; onSent?: jest.Mock } = {}) {
  const editor = fakeEditor();
  const onSent = over.onSent ?? jest.fn();
  const onNoteChange = jest.fn();
  render(
    <PortalSendModal
      open
      onOpenChange={jest.fn()}
      objectId={OBJ}
      userId={USER}
      archetype="RES"
      editor={editor}
      rubrics={over.rubrics ?? rubrics()}
      note=""
      onNoteChange={onNoteChange}
      onSent={onSent}
    />,
  );
  return { editor, onSent, onNoteChange };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockedPortal.submitActorFiche.mockResolvedValue({
    submissionId: 'sub-1',
    taskId: 't-1',
    changeCount: 2,
    assigneeCount: 1,
  });
});

describe('PortalSendModal', () => {
  it('liste les rubriques modifiées avec leur régime, en mots', () => {
    setup();

    expect(screen.getByText('Vos coordonnées')).toBeInTheDocument();
    expect(screen.getByText('Vos horaires')).toBeInTheDocument();
    // `openings` est auto-dispatch, `contacts` non : le partenaire lit ce que l'office fera.
    expect(screen.getByText('appliqués dès validation')).toBeInTheDocument();
    expect(screen.getByText('l’office la reportera')).toBeInTheDocument();
  });

  it('Envoyer construit UNE enveloppe par module modifié, surcharge SEULEMENT field/before/after (D12) et appelle submitActorFiche UNE fois', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    await waitFor(() => expect(mockedPortal.submitActorFiche).toHaveBeenCalledTimes(1));
    const [objectId, envelopes] = mockedPortal.submitActorFiche.mock.calls[0];
    expect(objectId).toBe(OBJ);
    expect(envelopes).toHaveLength(2);

    for (const module of ['contacts', 'openings'] as const) {
      const expected = buildContributorSubmission(OBJ, module, baseline, draft);
      const actual = envelopes.find((entry) => (entry.metadata as { section: string }).section === module);
      expect(actual).toBeDefined();
      // Byte-identiques : c'est ce que le serveur valide et rejoue.
      expect(actual?.payload).toEqual(expected.payload);
      expect(actual?.targetTable).toBe(expected.targetTable);
      expect(actual?.action).toBe(expected.action);
      const metadata = actual?.metadata as Record<string, unknown>;
      const source = expected.metadata as Record<string, unknown>;
      expect(metadata.rpc).toEqual(source.rpc);
      expect(metadata.section).toEqual(source.section);
      expect(metadata.manual_apply).toEqual(source.manual_apply);
      // …et SEULES ces trois clés-là changent.
      expect(Object.keys(metadata).sort()).toEqual(Object.keys(source).sort());
      expect(metadata.field).not.toEqual(source.field);
      expect(String(metadata.after)).not.toContain('{');
    }
  });

  it('une rubrique INDISPONIBLE mais modifiée n’est JAMAIS envoyée', async () => {
    // `buildContributorSubmission` n'a aucune garde `unavailableReason` : elle est ici.
    const degraded = rubrics({
      draft: modules({
        contacts: { objectItems: [], webItems: [], kindOptions: [], roleOptions: [] },
        openings: { periods: [], periodTypeOptions: [], unavailableReason: 'Chargement des horaires en échec.' },
      }),
    });
    setup({ rubrics: degraded });

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    await waitFor(() => expect(mockedPortal.submitActorFiche).toHaveBeenCalledTimes(1));
    const [, envelopes] = mockedPortal.submitActorFiche.mock.calls[0];
    expect(envelopes.map((entry) => (entry.metadata as { section: string }).section)).toEqual(['contacts']);
  });

  it('« déjà en cours » (PT409) → phrase dédiée DANS la fenêtre, et le brouillon reste intact', async () => {
    const already = Object.assign(new Error('Une vérification est déjà en cours.'), { code: 'PT409' });
    mockedPortal.submitActorFiche.mockRejectedValue(already);
    window.localStorage.setItem(portalDraftKey(USER, OBJ), '{"version":1}');
    const { editor, onSent } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(
      await screen.findByText(
        'L’office est déjà en train de vérifier cette fiche. Vous pourrez envoyer ces changements quand la vérification sera terminée.',
      ),
    ).toBeInTheDocument();
    expect(onSent).not.toHaveBeenCalled();
    expect(editor.commitModules).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(portalDraftKey(USER, OBJ))).toBe('{"version":1}');
  });

  it('« rubrique fermée » (22023) → dit quoi FAIRE : la retirer de l’envoi', async () => {
    mockedPortal.submitActorFiche.mockRejectedValue(Object.assign(new Error('refus'), { code: '22023' }));
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(
      await screen.findByText(
        'Une rubrique n’est plus modifiable depuis ici (l’office l’a fermée). Retirez-la de l’envoi, puis réessayez.',
      ),
    ).toBeInTheDocument();
  });

  it('une panne quelconque dit quoi faire — jamais « rien n’est perdu » sans suite', async () => {
    mockedPortal.submitActorFiche.mockRejectedValue(new Error('Réseau indisponible.'));
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Vérifiez votre connexion, puis réessayez');
    expect(alert).toHaveTextContent('Rien n’est perdu');
  });

  it('succès : les modules envoyés sont commités, l’instantané est écrit, le brouillon est purgé', async () => {
    window.localStorage.setItem(portalDraftKey(USER, OBJ), '{"version":1}');
    const { editor, onSent } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(editor.commitModules).toHaveBeenCalledWith(expect.arrayContaining(['contacts', 'openings']));
    // Sans instantané, un rechargement remet les valeurs PUBLIÉES dans les champs et le
    // partenaire croit son envoi perdu.
    const sent = JSON.parse(window.localStorage.getItem(`portal-sent:${USER}:${OBJ}`) ?? '{}');
    expect(sent.lines.contacts[0]).toContain('0692 45 12 30');
    expect(window.localStorage.getItem(portalDraftKey(USER, OBJ))).toBeNull();
  });

  it('« Retirer de l’envoi » remet la rubrique à ce qu’elle était, sans rien envoyer', async () => {
    const { editor } = setup();

    await userEvent.click(screen.getAllByRole('button', { name: 'Retirer de l’envoi' })[0]);

    expect(editor.resetModule).toHaveBeenCalledWith('contacts');
    expect(mockedPortal.submitActorFiche).not.toHaveBeenCalled();
  });
});
