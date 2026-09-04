/**
 * Brouillon local du portail partenaire (18a) — le STOCKAGE.
 *
 * Le schéma (forme persistée, empreinte, garde de version) est testé dans
 * `portal-draft-schema.test.ts`. Ici on teste ce que le schéma ne peut pas voir : la clé
 * par COMPTE, l'empreinte prise sur les modules SERVEUR, la purge, l'instantané envoyé,
 * et le fait qu'un message SEUL — sans aucune rubrique modifiée — survive à un rechargement.
 */
import { renderHook, act } from '@testing-library/react';
import {
  clearAllPortalDrafts,
  clearPortalDraft,
  hasPortalDraft,
  portalDraftKey,
  portalSentKey,
  readPortalDraft,
  readPortalSent,
  usePortalDraft,
  writePortalDraft,
  writePortalSent,
} from './usePortalDraft';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import type { WorkspaceModuleId } from '../../services/object-workspace';

const USER = 'u1';
const OBJ = 'RESRUN0001';

/** Les modules tels que le SERVEUR les rend — catalogues compris. */
const server = (over: Record<string, unknown> = {}) =>
  ({
    contacts: {
      objectItems: [{ id: 'c1', kindCode: 'phone', isPublic: true, value: '0262 00 00 00' }],
      kindOptions: [{ id: 'k1', code: 'phone', label: 'Téléphone' }],
    },
    descriptions: { object: { chapo: { baseValue: 'A', values: { fr: 'A' } } } },
    openings: { periods: [] },
    characteristics: {
      selectedAmenityCodes: ['wifi'],
      selectedPaymentCodes: [],
      amenityGroups: [{ familyCode: 'services', options: [{ code: 'wifi', label: 'Wi-Fi' }] }],
      paymentOptions: [{ id: 'p1', code: 'especes', label: 'Espèces' }],
    },
    capacityPolicies: { capacityItems: [], metricOptions: [{ id: 'm1', code: 'seats', label: 'Couverts' }] },
    pricing: { prices: [], priceKindOptions: [], priceUnitOptions: [] },
    activity: { durationMin: '' },
    ...over,
  }) as unknown as ObjectWorkspaceModules;

const dirty = (over: Partial<Record<WorkspaceModuleId, unknown>> = {}) =>
  ({
    contacts: {
      objectItems: [{ id: 'c1', kindCode: 'phone', isPublic: true, value: '0692 45 12 30' }],
      kindOptions: [{ id: 'k1', code: 'phone', label: 'Téléphone' }],
    },
    ...over,
  }) as Partial<Record<WorkspaceModuleId, unknown>>;

beforeEach(() => {
  window.localStorage.clear();
});

describe('writePortalDraft / readPortalDraft', () => {
  it('écrit puis relit les tranches modifiées et le message', () => {
    writePortalDraft(USER, OBJ, server(), dirty(), 'Nouveaux horaires d’été');

    const read = readPortalDraft(USER, OBJ, server());
    expect(read).not.toBeNull();
    expect(read?.note).toBe('Nouveaux horaires d’été');
    expect((read?.draft.contacts as { objectItems: { value: string }[] }).objectItems[0].value).toBe('0692 45 12 30');
    expect(read?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('ÉCARTE les tranches que l’office a modifiées depuis la prise', () => {
    writePortalDraft(USER, OBJ, server(), dirty(), 'un mot');

    // L'office a retouché LA tranche que le brouillon porte : la rejouer écraserait son
    // travail.
    const moved = server({
      contacts: {
        objectItems: [{ id: 'c1', kindCode: 'phone', isPublic: true, value: '0262 11 11 11' }],
        kindOptions: [{ id: 'k1', code: 'phone', label: 'Téléphone' }],
      },
    });
    const read = readPortalDraft(USER, OBJ, moved);
    expect(read?.draft).toEqual({});
    expect(read?.droppedModules).toEqual(['contacts']);
  });

  it('un message SEUL — aucune rubrique modifiée — survit à un rechargement', () => {
    // `submit_actor_fiche` refuse un envoi sans modification : ce texte ne peut donc pas
    // vivre dans un état d'écran, il serait perdu au premier rechargement.
    writePortalDraft(USER, OBJ, server(), {}, 'Erreur signalée : l’adresse est fausse.');

    const read = readPortalDraft(USER, OBJ, server());
    expect(read?.note).toBe('Erreur signalée : l’adresse est fausse.');
    expect(read?.draft).toEqual({});
    expect(hasPortalDraft(USER, OBJ)).toBe(true);
  });

  it('n’écrit AUCUN catalogue et les remet à la lecture depuis les modules serveur', () => {
    writePortalDraft(USER, OBJ, server(), dirty({ characteristics: server().characteristics }), '');

    // Le quota localStorage est partagé entre toutes les fiches : 29 tranches avec leurs
    // catalogues le saturent. Et un code ajouté au catalogue par l'office ne doit pas
    // faire perdre le brouillon.
    const raw = window.localStorage.getItem(portalDraftKey(USER, OBJ)) ?? '';
    expect(raw).not.toContain('Espèces');
    expect(raw).not.toContain('Wi-Fi');

    const read = readPortalDraft(USER, OBJ, server());
    const characteristics = read?.draft.characteristics as { paymentOptions: unknown[]; amenityGroups: unknown[] };
    expect(characteristics.paymentOptions).toHaveLength(1);
    expect(characteristics.amenityGroups).toHaveLength(1);
  });

  it('l’empreinte ignore les catalogues : un code ajouté par l’office ne perd pas le brouillon', () => {
    writePortalDraft(USER, OBJ, server(), dirty(), 'un mot');

    const enriched = server({
      characteristics: {
        selectedAmenityCodes: ['wifi'],
        selectedPaymentCodes: [],
        amenityGroups: [
          { familyCode: 'services', options: [{ code: 'wifi', label: 'Wi-Fi' }, { code: 'sauna', label: 'Sauna' }] },
        ],
        paymentOptions: [{ id: 'p1', code: 'especes', label: 'Espèces' }],
      },
    });
    expect(readPortalDraft(USER, OBJ, enriched)).not.toBeNull();
  });

  it('l’empreinte ne couvre QUE les tranches que le brouillon porte', () => {
    // Une correction de coquille de l'office dans la description ne doit pas faire perdre
    // un brouillon de tarifs sans le moindre rapport.
    writePortalDraft(USER, OBJ, server(), dirty(), 'un mot');

    const elsewhere = server({ descriptions: { object: { chapo: { baseValue: 'B', values: { fr: 'B' } } } } });
    expect(readPortalDraft(USER, OBJ, elsewhere)?.note).toBe('un mot');
    expect(readPortalDraft(USER, OBJ, elsewhere)?.draft.contacts).toBeDefined();
  });

  it('le MESSAGE survit même quand les tranches sont écartées, et les rubriques perdues sont NOMMÉES', () => {
    // La bannière disait « refaites vos changements » alors que le contenu venait d'être
    // supprimé, message à l'office compris. Un message libre n'écrase rien : il n'y a
    // aucune raison de le jeter.
    writePortalDraft(USER, OBJ, server(), dirty(), 'ma piscine est en travaux');

    const moved = server({
      contacts: {
        objectItems: [{ id: 'c1', kindCode: 'phone', isPublic: true, value: '0262 99 99 99' }],
        kindOptions: [{ id: 'k1', code: 'phone', label: 'Téléphone' }],
      },
    });
    const read = readPortalDraft(USER, OBJ, moved);
    expect(read?.note).toBe('ma piscine est en travaux');
    expect(read?.draft).toEqual({});
    expect(read?.droppedModules).toEqual(['contacts']);
  });

  it('une note SEULE n’est jamais écartée : elle ne peut écraser aucun travail de l’office', () => {
    writePortalDraft(USER, OBJ, server(), {}, 'un mot');

    const moved = server({ descriptions: { object: { chapo: { baseValue: 'Z', values: { fr: 'Z' } } } } });
    expect(readPortalDraft(USER, OBJ, moved)?.note).toBe('un mot');
  });

  it('ne rejoue JAMAIS le brouillon d’un autre compte sur un appareil partagé', () => {
    writePortalDraft(USER, OBJ, server(), dirty(), 'le mot de Marie');

    expect(readPortalDraft('u2', OBJ, server())).toBeNull();
    expect(hasPortalDraft('u2', OBJ)).toBe(false);
  });
});

describe('clearPortalDraft / clearAllPortalDrafts', () => {
  it('clearPortalDraft efface la fiche visée et rien d’autre', () => {
    writePortalDraft(USER, OBJ, server(), dirty(), 'a');
    writePortalDraft(USER, 'AUTRE', server(), dirty(), 'b');

    clearPortalDraft(USER, OBJ);

    expect(hasPortalDraft(USER, OBJ)).toBe(false);
    expect(hasPortalDraft(USER, 'AUTRE')).toBe(true);
  });

  it('clearAllPortalDrafts purge brouillons ET instantanés du compte, et seulement du compte', () => {
    writePortalDraft(USER, OBJ, server(), dirty(), 'a');
    writePortalSent(USER, OBJ, { submittedAt: '2026-09-03T10:00:00.000Z', lines: { contacts: ['Téléphone : 0692'] } });
    writePortalDraft('u2', OBJ, server(), dirty(), 'b');

    clearAllPortalDrafts(USER);

    expect(window.localStorage.getItem(portalDraftKey(USER, OBJ))).toBeNull();
    // L'instantané porte ce que le partenaire a ENVOYÉ : c'est une donnée personnelle,
    // elle part avec le reste à la déconnexion.
    expect(window.localStorage.getItem(portalSentKey(USER, OBJ))).toBeNull();
    expect(window.localStorage.getItem(portalDraftKey('u2', OBJ))).not.toBeNull();
  });
});

describe('instantané envoyé (portal-sent)', () => {
  it('écrit puis relit ce qui a été envoyé, par rubrique', () => {
    writePortalSent(USER, OBJ, {
      submittedAt: '2026-09-03T10:00:00.000Z',
      lines: { contacts: ['Téléphone : 0692 45 12 30'] },
    });

    const sent = readPortalSent(USER, OBJ);
    expect(sent?.submittedAt).toBe('2026-09-03T10:00:00.000Z');
    expect(sent?.lines.contacts).toEqual(['Téléphone : 0692 45 12 30']);
  });

  it('rend null quand l’instantané est illisible, jamais une valeur approximative', () => {
    window.localStorage.setItem(portalSentKey(USER, OBJ), '{ pas du json');
    expect(readPortalSent(USER, OBJ)).toBeNull();
  });
});

// ───────────────────────────── le hook ─────────────────────────────

interface FakeEditor {
  draft: ObjectWorkspaceModules;
  dirtySections: Partial<Record<WorkspaceModuleId, boolean>>;
  replaceModule: jest.Mock;
}

function fakeEditor(over: Partial<FakeEditor> = {}): FakeEditor {
  return {
    draft: server() as ObjectWorkspaceModules,
    dirtySections: {},
    replaceModule: jest.fn(),
    ...over,
  };
}

describe('usePortalDraft', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('restaure au montage les tranches et le message enregistrés sur l’appareil', () => {
    writePortalDraft(USER, OBJ, server(), dirty(), 'Nouveaux horaires');
    const editor = fakeEditor();

    const { result } = renderHook(() =>
      usePortalDraft({ userId: USER, objectId: OBJ, serverModules: server(), editor }),
    );

    expect(editor.replaceModule).toHaveBeenCalledWith('contacts', expect.objectContaining({ objectItems: expect.anything() }));
    expect(result.current.note).toBe('Nouveaux horaires');
    expect(result.current.discarded).toBe(false);
  });

  it('signale l’abandon quand l’office a retouché la MÊME tranche (et n’écrase rien)', () => {
    writePortalDraft(USER, OBJ, server(), dirty(), 'gardé quand même');
    const editor = fakeEditor();

    const moved = server({
      contacts: {
        objectItems: [{ id: 'c1', kindCode: 'phone', isPublic: true, value: '0262 11 11 11' }],
        kindOptions: [{ id: 'k1', code: 'phone', label: 'Téléphone' }],
      },
    });
    const { result } = renderHook(() => usePortalDraft({ userId: USER, objectId: OBJ, serverModules: moved, editor }));

    expect(result.current.discarded).toBe(true);
    expect(editor.replaceModule).not.toHaveBeenCalled();
    // Le message, lui, n'écrase rien : il survit à l'abandon des tranches.
    expect(result.current.note).toBe('gardé quand même');
  });

  it('enregistre le message seul après la temporisation, sans aucune rubrique modifiée', () => {
    const editor = fakeEditor();
    const { result } = renderHook(() =>
      usePortalDraft({ userId: USER, objectId: OBJ, serverModules: server(), editor }),
    );

    act(() => result.current.setNote('Erreur signalée : le nom est mal écrit.'));
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(readPortalDraft(USER, OBJ, server())?.note).toBe('Erreur signalée : le nom est mal écrit.');
  });

  it('SURVIT à commitModules : l’empreinte suit les modules SERVEUR, pas la baseline de l’éditeur', () => {
    // `commitModules` réécrit la baseline avec les valeurs ENVOYÉES, alors que la fiche
    // publiée ne change qu'à l'approbation. Une empreinte prise sur la baseline serait
    // introuvable au rechargement suivant, et le brouillon partirait avec la bannière
    // mensongère « l'office a modifié votre fiche ».
    // Le brouillon de l'éditeur PORTE la modification : une empreinte prise sur lui
    // (au lieu des modules serveur) serait donc DIFFÉRENTE, et introuvable au retour.
    const editor = fakeEditor({
      dirtySections: { contacts: true },
      draft: server({ contacts: dirty().contacts }),
    });
    const { result, rerender } = renderHook(
      (props: { editor: FakeEditor }) =>
        usePortalDraft({ userId: USER, objectId: OBJ, serverModules: server(), editor: props.editor }),
      { initialProps: { editor } },
    );
    act(() => result.current.setNote('avant envoi'));
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(hasPortalDraft(USER, OBJ)).toBe(true);

    // L'envoi a eu lieu : la baseline de l'éditeur vaut désormais le draft (plus rien
    // n'est « sale »), mais les modules SERVEUR n'ont pas bougé.
    const committed = fakeEditor({ dirtySections: {} });
    rerender({ editor: committed });

    expect(readPortalDraft(USER, OBJ, server())?.note).toBe('avant envoi');
  });

  it('un compte pas encore connu à la première frappe n’ANNULE PAS la restauration', () => {
    // La session arrive après le premier rendu. Marquer la restauration « faite » avant de
    // savoir s'il y a un compte armait un piège muet : le brouillon n'était jamais relu.
    writePortalDraft(USER, OBJ, server(), dirty(), 'retrouvé');
    const editor = fakeEditor();
    const { result, rerender } = renderHook(
      (props: { userId: string | null }) =>
        usePortalDraft({ userId: props.userId, objectId: OBJ, serverModules: server(), editor }),
      { initialProps: { userId: null as string | null } },
    );
    expect(result.current.note).toBe('');

    rerender({ userId: USER });

    expect(result.current.note).toBe('retrouvé');
    expect(editor.replaceModule).toHaveBeenCalledWith('contacts', expect.anything());
  });

  it('nomme les tranches écartées pour que l’écran puisse les dire', () => {
    writePortalDraft(USER, OBJ, server(), dirty(), 'gardé');
    const editor = fakeEditor();
    const moved = server({
      contacts: {
        objectItems: [{ id: 'c1', kindCode: 'phone', isPublic: true, value: '0000' }],
        kindOptions: [{ id: 'k1', code: 'phone', label: 'Téléphone' }],
      },
    });

    const { result } = renderHook(() => usePortalDraft({ userId: USER, objectId: OBJ, serverModules: moved, editor }));

    expect(result.current.discarded).toBe(true);
    expect(result.current.discardedModules).toEqual(['contacts']);
    // Le message, lui, n'écrase rien : il reste.
    expect(result.current.note).toBe('gardé');
  });

  it('clear() efface le brouillon ET le message', () => {
    const editor = fakeEditor();
    const { result } = renderHook(() =>
      usePortalDraft({ userId: USER, objectId: OBJ, serverModules: server(), editor }),
    );
    act(() => result.current.setNote('à jeter'));
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    act(() => result.current.clear());

    expect(hasPortalDraft(USER, OBJ)).toBe(false);
    expect(result.current.note).toBe('');
  });
});
