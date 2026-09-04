/**
 * La fiche : une LISTE DE RUBRIQUES, et un seul geste d'envoi.
 *
 * Ce que ces tests tiennent :
 *  - chaque état est un MOT (« À faire », « Envoyé — en vérification »…), jamais une couleur ;
 *  - un SEUL arbre React pour les deux tailles d'écran : la liste ET le panneau sont rendus
 *    dans les deux vues, seul `data-view` change. Un `useMediaQuery` casserait l'hydratation
 *    et perdrait le focus au franchissement du seuil ;
 *  - une vérification en cours n'interdit pas d'ouvrir une rubrique : elle interdit d'envoyer,
 *    et le dit ;
 *  - un type non pris en charge n'ouvre AUCUNE rubrique (allowlist fail-closed).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortalFicheHub, type PortalFicheHubProps } from './PortalFicheHub';
import { PortalFichePage } from './PortalFichePage';
import { buildPortalRubrics, type BuiltPortalRubric } from './portal-rubrics';
import type { ObjectEditorState } from '../object-editor/useObjectEditorState';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import * as portal from '../../services/portal';
import * as explorerQueries from '../../hooks/useExplorerQueries';
import { useSessionStore } from '../../store/session-store';

jest.mock('../../services/portal');
jest.mock('../../hooks/useExplorerQueries');
const routerPush = jest.fn();
let searchParams = new URLSearchParams('');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => searchParams,
}));

const mockedPortal = portal as jest.Mocked<typeof portal>;
const mockedQueries = explorerQueries as jest.Mocked<typeof explorerQueries>;

const OBJ = 'HOTRUN0001';

const modules = (over: Record<string, unknown> = {}) =>
  ({
    // Le catalogue des genres DOIT être là : sans lui `upsertPublicContact` refuse d'écrire
    // (et la rubrique le dit, plutôt que de laisser un bouton sans effet).
    contacts: {
      objectItems: [],
      webItems: [],
      kindOptions: [{ id: 'k-phone', code: 'phone', label: 'Téléphone' }],
      roleOptions: [],
    },
    descriptions: { object: { chapo: { baseValue: '', values: {} }, description: { baseValue: '', values: {} } } },
    openings: { periods: [], periodTypeOptions: [], unavailableReason: null },
    characteristics: { selectedAmenityCodes: [], selectedPaymentCodes: [], amenityGroups: [], paymentOptions: [], unavailableReason: null },
    capacityPolicies: {
      capacityItems: [],
      metricOptions: [{ id: 'm1', code: 'max_capacity', label: 'Capacité max.' }],
      petPolicy: { accepted: null, conditions: '' },
      groupPolicy: {},
      stayPolicy: {},
      unavailableReason: null,
    },
    pricing: { prices: [], priceKindOptions: [], priceUnitOptions: [], priceTypeOptions: [], discounts: [], promotions: [], unavailableReason: null },
    activity: { durationMin: '', minParticipants: '', maxParticipants: '', minAge: '', unavailableReason: null },
    media: { objectItems: [], placeItems: [], typeOptions: [], tagOptions: [], unavailableReason: null, placeScopeUnavailableReason: null },
    location: { main: { city: 'Petite-Île', address1: '3 chemin des Vanilliers', postcode: '97429' } },
    generalInfo: { commercialVisibility: 'public', status: 'published' },
    publication: { status: 'published' },
    ...over,
  }) as unknown as ObjectWorkspaceModules;

function fakeEditor(draft = modules(), dirty: Record<string, boolean> = {}): ObjectEditorState {
  return {
    objectId: OBJ,
    draft,
    baseline: draft,
    dirtySections: dirty,
    isDirty: Object.values(dirty).some(Boolean),
    patchModule: jest.fn(),
    replaceModule: jest.fn(),
    resetModule: jest.fn(),
    commitModules: jest.fn(),
    setSavedStatus: jest.fn(),
  } as unknown as ObjectEditorState;
}

const floor = ['legal', 'publication', 'media', 'provider', 'relationships', 'places'];

function hubProps(over: Record<string, unknown> = {}): PortalFicheHubProps {
  const draft = (over.draft as ObjectWorkspaceModules) ?? modules();
  const dirty = (over.dirty as Record<string, boolean>) ?? {};
  const rubrics: BuiltPortalRubric[] =
    (over.rubrics as BuiltPortalRubric[]) ??
    buildPortalRubrics({
      archetype: 'HEB',
      draft,
      dirty,
      masked: [],
      floor,
      pendingModules: (over.pendingModules as Set<never>) ?? new Set(),
      rejectedModules: (over.rejectedModules as Set<never>) ?? new Set(),
    });

  return {
    fiche: {
      id: OBJ,
      name: 'Villa Vanille',
      typeLabel: 'Meublé de tourisme',
      locality: 'Petite-Île',
      address: '3 chemin des Vanilliers, 97429 Petite-Île',
      publicPhone: '',
      officeEmail: 'contact@oti.re',
      officePhone: '0262 00 00 00',
      count: 2,
      openSubmission: null as { id: string; submittedAt: string } | null,
    },
    archetype: 'HEB' as const,
    rubrics,
    activeRubricId: null as string | null,
    editor: fakeEditor(draft, dirty),
    rejections: [] as { module: string; title: string; note: string | null; rubricId: string | null }[],
    approvedModules: new Set<string>(),
    discardedRubrics: [] as string[],
    refreshFailed: false,
    formCache: new Map<string, unknown>(),
    media: draft.media,
    note: '',
    onNoteChange: jest.fn(),
    savedAt: null as string | null,
    draftDiscarded: false,
    sentSnapshot: null,
    justSent: false,
    onSend: jest.fn(),
    onDiscard: jest.fn(),
    onBackToHub: jest.fn(),
    onNavigate: jest.fn(),
    ...over,
  } as unknown as PortalFicheHubProps;
}

function renderHub(over: Record<string, unknown> = {}) {
  const props = hubProps(over);
  render(<PortalFicheHub {...props} />);
  return props;
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  searchParams = new URLSearchParams('');
});

describe('PortalFicheHub — la liste des rubriques', () => {
  it('rend une ligne par rubrique de l’archétype, avec un état EN MOTS', () => {
    renderHub();

    const list = screen.getByRole('list', { name: 'Les rubriques de votre fiche' });
    const links = within(list).getAllByRole('link');
    // HEB : coordonnées, présentation, ouverture/fermetures, équipements, accueil, tarifs.
    expect(links).toHaveLength(6);
    expect(within(list).getAllByText('À faire').length).toBeGreaterThan(0);
    expect(within(list).getByText('Vos coordonnées')).toBeInTheDocument();
    // Le huitième écran des hébergements, jamais les horaires d'un restaurant.
    expect(within(list).getByText('Ouverture et fermetures')).toBeInTheDocument();
    expect(within(list).queryByText('Vos horaires')).not.toBeInTheDocument();
  });

  it('« Pour compléter votre fiche » ne liste que les rubriques À faire, plus les photos sous l’objectif', () => {
    renderHub();

    const todo = screen.getByRole('region', { name: 'Pour compléter votre fiche' });
    expect(within(todo).getByText('Ajoutez des photos (0 sur 4)')).toBeInTheDocument();
    expect(within(todo).getByText('Indiquez vos coordonnées')).toBeInTheDocument();
  });

  it('la barre d’envoi n’apparaît QU’AVEC une rubrique modifiée, et compte les rubriques', () => {
    renderHub();
    expect(screen.queryByRole('button', { name: 'Envoyer à l’office' })).not.toBeInTheDocument();

    const draft = modules({ contacts: { objectItems: [], webItems: [], kindOptions: [], roleOptions: [], touched: true } });
    renderHub({ draft, dirty: { contacts: true, pricing: true }, savedAt: '2026-09-03T10:00:00.000Z' });

    expect(screen.getByRole('button', { name: 'Envoyer à l’office' })).toBeInTheDocument();
    expect(screen.getByText('2 rubriques modifiées · enregistrées sur cet appareil')).toBeInTheDocument();
  });

  it('envoi en cours : bouton aria-disabled + phrase visible, et les rubriques restent OUVRABLES', () => {
    renderHub({
      dirty: { contacts: true },
      fiche: { ...hubProps().fiche, openSubmission: { id: 's1', submittedAt: '2026-09-02T08:00:00.000Z' } },
    });

    const send = screen.getByRole('button', { name: 'Envoyer à l’office' });
    // `aria-disabled`, pas `disabled` : le bouton reste atteignable au clavier, donc sa
    // raison reste lisible (motif D10).
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).not.toBeDisabled();
    expect(
      screen.getByText('Vérification en cours — vous pourrez envoyer vos nouveaux changements quand l’office aura terminé.'),
    ).toBeInTheDocument();
    // Préparer d'autres changements reste possible : c'est écrit, ça doit être vrai.
    const list = screen.getByRole('list', { name: 'Les rubriques de votre fiche' });
    expect(within(list).getAllByRole('link').length).toBe(6);
  });

  it('retours de l’office : une ligne par changement refusé, avec la note et un lien Corriger vers ?rubrique=', () => {
    renderHub({
      rejections: [
        { module: 'pricing', rubricId: 'pricing', title: 'Vos tarifs', note: 'Le prix indiqué est par personne, pas par repas ?' },
      ],
    });

    const panel = screen.getByRole('region', { name: 'Retours de l’office' });
    expect(within(panel).getByText(/Le prix indiqué est par personne/)).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /Corriger/ })).toHaveAttribute('href', expect.stringContaining('rubrique=pricing'));
  });

  it('même arbre dans les DEUX vues : liste ET panneau rendus, seul data-view change, l’ouverte porte aria-current="step"', () => {
    const { container } = render(<PortalFicheHub {...hubProps()} />);
    const hub = container.querySelector('.portal-fiche-page');
    expect(hub).toHaveAttribute('data-view', 'hub');
    expect(container.querySelector('.portal-hub-list')).toBeInTheDocument();
    expect(container.querySelector('.portal-panel')).toBeInTheDocument();

    const opened = render(<PortalFicheHub {...hubProps({ activeRubricId: 'contacts' })} />);
    const page = opened.container.querySelector('.portal-fiche-page');
    expect(page).toHaveAttribute('data-view', 'rubric');
    // Les DEUX enfants restent rendus : ≥ 1024 px la liste est à gauche, en dessous c'est
    // la CSS qui la masque. Aucun rendu conditionnel par taille.
    expect(opened.container.querySelector('.portal-hub-list')).toBeInTheDocument();
    expect(opened.container.querySelector('.portal-panel')).toBeInTheDocument();
    // …et la liste est COMPLÈTE : à partir de 1024 px elle reste sous les yeux pendant
    // la saisie. Une liste vidée en vue rubrique serait un second chemin à tester.
    expect(opened.container.querySelectorAll('.portal-hub-list .portal-task__link')).toHaveLength(6);
    const current = opened.container.querySelector('[aria-current="step"]');
    expect(current).toHaveTextContent('Vos coordonnées');
  });

  it('quitter une rubrique modifiée : la sortie SÛRE est le cancel (« Rester »), la perte est le confirm', async () => {
    // `ConfirmDialog` mappe Échap ET le clic hors fenêtre sur `onCancel`. Mettre « Ne pas
    // garder » en annulation jetterait la saisie sur une touche Échap malheureuse.
    const props = hubProps({ activeRubricId: 'contacts' });
    render(<PortalFicheHub {...props} />);

    await userEvent.type(screen.getByLabelText('Téléphone'), '0692');
    await userEvent.click(screen.getByRole('button', { name: 'Retour sans changer' }));

    const dialog = await screen.findByRole('dialog', { name: 'Quitter sans valider ?' });
    const buttons = within(dialog).getAllByRole('button').map((button) => button.textContent);
    expect(buttons).toContain('Rester');
    expect(buttons).toContain('Quitter sans garder');
    // La fenêtre du portail relève ses tailles : elle vit hors de `.portal-shell`
    // (createPortal vers document.body), d'où la classe qui porte le contrat.
    expect(dialog).toHaveClass('portal-modal');
    expect(within(dialog).getByRole('button', { name: 'Quitter sans garder' })).toHaveClass('primary-button--danger');
    expect(props.onBackToHub).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Rester' }));
    expect(props.onBackToHub).not.toHaveBeenCalled();
  });

  it('cliquer une AUTRE rubrique dans la liste, formulaire en cours, demande avant de sortir', async () => {
    // Sur ordinateur la liste reste collée à gauche et cliquable pendant toute la saisie :
    // c'est la sortie la plus naturelle, et c'était la seule non gardée.
    renderHub({ activeRubricId: 'contacts' });
    await userEvent.type(screen.getByLabelText('Téléphone'), '0692');

    const list = screen.getByRole('list', { name: 'Les rubriques de votre fiche' });
    await userEvent.click(within(list).getByText('Vos tarifs'));

    expect(await screen.findByRole('dialog', { name: 'Quitter sans valider ?' })).toBeInTheDocument();
  });

  it('les liens « Corriger » et « Pour compléter » sont gardés eux aussi', async () => {
    renderHub({
      activeRubricId: 'contacts',
      rejections: [{ module: 'pricing', rubricId: 'pricing', title: 'Vos tarifs', note: 'Par personne ?' }],
    });
    await userEvent.type(screen.getByLabelText('Téléphone'), '0692');

    await userEvent.click(screen.getByRole('link', { name: /Corriger/ }));

    expect(await screen.findByRole('dialog', { name: 'Quitter sans valider ?' })).toBeInTheDocument();
  });

  it('sans saisie en cours, la liste navigue sans rien demander', async () => {
    renderHub({ activeRubricId: 'contacts' });

    const list = screen.getByRole('list', { name: 'Les rubriques de votre fiche' });
    await userEvent.click(within(list).getByText('Vos tarifs'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rubrique en vérification MAIS remodifiée : la barre existe et dit où sont les changements', () => {
    // « Valider » n'avait aucun effet visible : le badge restait « Envoyé — en vérification »,
    // aucune barre n'apparaissait, et la phrase prévue pour ce cas était inatteignable.
    const draft = modules();
    renderHub({
      draft,
      dirty: { contacts: true },
      pendingModules: new Set(['contacts']),
      fiche: { ...hubProps().fiche, openSubmission: { id: 's1', submittedAt: '2026-09-02T08:00:00.000Z' } },
    });

    expect(screen.getByRole('button', { name: 'Envoyer à l’office' })).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 rubrique modifiée · gardée sur cet appareil, à envoyer quand l’office aura terminé sa vérification.',
      ),
    ).toBeInTheDocument();
  });

  it('modification ACCEPTÉE non encore reportée : la ligne le dit, au lieu de « Rempli »', () => {
    // `approved` est le cas DOMINANT. Sans ce libellé, le partenaire rouvre la rubrique,
    // y retrouve son ANCIENNE valeur avec « Rempli », et ressaisit.
    renderHub({ approvedModules: new Set(['pricing']) });

    const list = screen.getByRole('list', { name: 'Les rubriques de votre fiche' });
    const pricing = within(list).getByText('Vos tarifs').closest('a');
    expect(pricing).toHaveTextContent('Accepté — en cours de report');
  });

  it('rafraîchissement en échec avec une fiche en cache : on montre la fiche et on le dit', () => {
    renderHub({ refreshFailed: true });

    expect(screen.getByRole('list', { name: 'Les rubriques de votre fiche' })).toBeInTheDocument();
    expect(screen.getByText(/Voici votre fiche telle qu’elle était enregistrée sur cet appareil/)).toBeInTheDocument();
  });

  it('brouillon écarté : on NOMME les rubriques perdues et on garde le message à l’office', () => {
    renderHub({ draftDiscarded: true, discardedRubrics: ['Vos tarifs', 'Vos horaires'] });

    const notice = screen.getByRole('status', { name: 'Modifications non reprises' });
    expect(notice).toHaveTextContent('Vos tarifs');
    expect(notice).toHaveTextContent('Vos horaires');
    expect(notice).toHaveTextContent('Votre message à l’office a été gardé');
  });

  it('après un envoi réussi : une carte « Merci ! » qui prend le focus, et aucun toast', () => {
    renderHub({ justSent: true });

    const card = screen.getByRole('status');
    expect(card).toHaveTextContent('Merci ! Vos modifications ont été envoyées à l’office.');
    expect(card).toHaveTextContent('en général sous une semaine');
    expect(card).toHaveFocus();
  });
});

describe('PortalFichePage — la garde de type', () => {
  function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PortalFichePage objectId={OBJ} />
      </QueryClientProvider>,
    );
    return client;
  }

  it('type non pris en charge (itinéraire, manifestation, organisation) : « gérée par l’office », AUCUNE rubrique', async () => {
    mockedQueries.loadObjectWorkspace.mockResolvedValue({
      id: OBJ,
      name: 'Sentier du Piton',
      type: 'ITI',
      detail: {} as never,
      modules: modules(),
      permissions: {} as never,
    });
    mockedPortal.getPortalSectionVisibility.mockResolvedValue({ floorModules: floor, maskedModules: [] });
    mockedPortal.listMySubmissions.mockResolvedValue([]);
    mockedPortal.listMyPortalFiches.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('Cette fiche est gérée par l’office.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Les rubriques de votre fiche' })).not.toBeInTheDocument();
  });

  it('hors ligne avec la fiche EN CACHE : on rend la fiche, jamais l’écran d’erreur', async () => {
    // Le cache React Query est persisté dans localStorage (24 h). Un rafraîchissement
    // d'arrière-plan qui échoue met `isError` à vrai ALORS QUE `data` est là : remplacer la
    // fiche par « Nous n'avons pas pu ouvrir votre fiche » cache au partenaire sa fiche ET
    // son brouillon, tous deux présents sur l'appareil.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['object-workspace', OBJ, ['fr']], {
      id: OBJ,
      name: 'Villa Vanille',
      type: 'HOT',
      detail: {} as never,
      modules: modules(),
      permissions: {} as never,
    });
    // Périmée : au montage, React Query tente un rafraîchissement — c'est LUI qui échoue,
    // pendant que la donnée reste disponible. Sans cette invalidation, la requête est
    // fraîche, aucun appel n'est fait, et le cas testé ne se produit pas.
    await client.invalidateQueries({ queryKey: ['object-workspace'] });
    mockedQueries.loadObjectWorkspace.mockRejectedValue(new Error('Réseau indisponible.'));
    mockedPortal.getPortalSectionVisibility.mockResolvedValue({ floorModules: floor, maskedModules: [] });
    mockedPortal.listMySubmissions.mockResolvedValue([]);
    mockedPortal.listMyPortalFiches.mockResolvedValue([]);

    render(
      <QueryClientProvider client={client}>
        <PortalFichePage objectId={OBJ} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('list', { name: 'Les rubriques de votre fiche' })).toBeInTheDocument();
    expect(screen.queryByText('Nous n’avons pas pu ouvrir votre fiche.')).not.toBeInTheDocument();
    // …et on le DIT, au lieu de laisser croire que tout est à jour.
    await waitFor(() =>
      expect(screen.getByText(/Voici votre fiche telle qu’elle était enregistrée sur cet appareil/)).toBeInTheDocument(),
    );
  });

  it('sans fiche en cache ET sans réseau : l’écran d’erreur, avec un bouton Réessayer', async () => {
    mockedQueries.loadObjectWorkspace.mockRejectedValue(new Error('Réseau indisponible.'));
    mockedPortal.getPortalSectionVisibility.mockResolvedValue({ floorModules: floor, maskedModules: [] });
    mockedPortal.listMySubmissions.mockResolvedValue([]);
    mockedPortal.listMyPortalFiches.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('Nous n’avons pas pu ouvrir votre fiche.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('une correction RENVOYÉE lit « Envoyé — en vérification », jamais « À reprendre »', async () => {
    // Le module appartient aux DEUX ensembles : refusé par la dernière vérification résolue,
    // en attente dans la nouvelle. « À reprendre » inviterait à renvoyer — geste que le
    // verrou « une seule vérification ouverte par fiche » refuse en PT409, et le partenaire
    // croirait avoir perdu sa correction.
    mockedQueries.loadObjectWorkspace.mockResolvedValue({
      id: OBJ,
      name: 'Villa Vanille',
      type: 'HOT',
      detail: {} as never,
      modules: modules(),
      permissions: {} as never,
    });
    mockedPortal.getPortalSectionVisibility.mockResolvedValue({ floorModules: floor, maskedModules: [] });
    mockedPortal.listMyPortalFiches.mockResolvedValue([]);
    mockedPortal.listMySubmissions.mockResolvedValue([
      {
        id: 's2',
        objectId: OBJ,
        objectName: 'Villa Vanille',
        note: null,
        status: 'pending',
        submittedAt: '2026-09-03T08:00:00.000Z',
        resolvedAt: null,
        changes: [
          { id: 'c2', section: 'pricing', field: 'Vos tarifs', status: 'pending', reviewNote: null, reviewerLabel: null },
        ],
      },
      {
        id: 's1',
        objectId: OBJ,
        objectName: 'Villa Vanille',
        note: null,
        status: 'rejected',
        submittedAt: '2026-09-01T08:00:00.000Z',
        resolvedAt: '2026-09-02T08:00:00.000Z',
        changes: [
          { id: 'c1', section: 'pricing', field: 'Vos tarifs', status: 'rejected', reviewNote: 'Par personne ?', reviewerLabel: null },
        ],
      },
    ]);

    renderPage();

    const list = await screen.findByRole('list', { name: 'Les rubriques de votre fiche' });
    const pricing = within(list).getByText('Vos tarifs').closest('a');
    expect(pricing).toHaveTextContent('Envoyé — en vérification');
    expect(pricing).not.toHaveTextContent('À reprendre');
    // …et le retour de l'office DISPARAÎT de la liste des retours : son lien « Corriger »
    // enverrait refaire un geste que PT409 refuse.
    expect(screen.queryByRole('region', { name: 'Retours de l’office' })).not.toBeInTheDocument();
  });

  it('purge l’instantané envoyé une fois l’office passé : sinon « Vous aviez indiqué » ment', async () => {
    // `clearPortalSent` existait sans aucun appelant : la notice pouvait afficher une date
    // et un contenu périmés comme s'ils étaient ceux de la vérification en cours.
    useSessionStore.setState({ userId: 'u1' } as never);
    window.localStorage.setItem(
      'portal-sent:u1:HOTRUN0001',
      JSON.stringify({ submittedAt: '2026-09-01T08:00:00.000Z', lines: { contacts: ['Téléphone : 0000'] } }),
    );
    mockedQueries.loadObjectWorkspace.mockResolvedValue({
      id: OBJ,
      name: 'Villa Vanille',
      type: 'HOT',
      detail: {} as never,
      modules: modules(),
      permissions: {} as never,
    });
    mockedPortal.getPortalSectionVisibility.mockResolvedValue({ floorModules: floor, maskedModules: [] });
    mockedPortal.listMySubmissions.mockResolvedValue([]);
    mockedPortal.listMyPortalFiches.mockResolvedValue([
      {
        id: OBJ,
        name: 'Villa Vanille',
        objectType: 'HOT',
        status: 'published',
        updatedAt: null,
        openSubmission: null,
        lastResolved: { status: 'approved', resolvedAt: '2026-09-02T08:00:00.000Z' },
        officeEmail: null,
        officePhone: null,
      },
    ]);

    renderPage();

    await screen.findByRole('list', { name: 'Les rubriques de votre fiche' });
    await waitFor(() => expect(window.localStorage.getItem('portal-sent:u1:HOTRUN0001')).toBeNull());
  });

  it('envoyer DEPUIS une rubrique ramène à la fiche — sinon « Merci ! » reste masqué sur téléphone', async () => {
    // Sous 1024 px l'en-tête de fiche est en `display:none` en vue rubrique : la carte
    // « Merci ! » y est invisible et `focus()` échoue EN SILENCE sur un élément masqué. Le
    // geste le plus important de l'application se terminait sans accusé de réception.
    useSessionStore.setState({ userId: 'u1' } as never);
    searchParams = new URLSearchParams('rubrique=contacts');
    mockedQueries.loadObjectWorkspace.mockResolvedValue({
      id: OBJ,
      name: 'Villa Vanille',
      type: 'HOT',
      detail: {} as never,
      modules: modules(),
      permissions: {} as never,
    });
    mockedPortal.getPortalSectionVisibility.mockResolvedValue({ floorModules: floor, maskedModules: [] });
    mockedPortal.listMySubmissions.mockResolvedValue([]);
    mockedPortal.listMyPortalFiches.mockResolvedValue([]);
    mockedPortal.submitActorFiche.mockResolvedValue({
      submissionId: 'sub-1',
      taskId: 't-1',
      changeCount: 1,
      assigneeCount: 1,
    });

    renderPage();

    await userEvent.type(await screen.findByLabelText('Téléphone'), '0692 45 12 30');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer à l’office' }));
    // « Valider » a déjà ramené au hub une fois : on ne compte que ce qui suit l'ENVOI.
    routerPush.mockClear();
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer' }));

    await waitFor(() => expect(mockedPortal.submitActorFiche).toHaveBeenCalledTimes(1));
    expect(routerPush).toHaveBeenCalledWith(`/espace/fiches/${OBJ}`, { scroll: false });
  });

  it('la vérification en cours est demandée POUR CETTE FICHE — la clé de cache porte son id', async () => {
    mockedQueries.loadObjectWorkspace.mockResolvedValue({
      id: OBJ,
      name: 'Villa Vanille',
      type: 'HOT',
      detail: {} as never,
      modules: modules(),
      permissions: {} as never,
    });
    mockedPortal.getPortalSectionVisibility.mockResolvedValue({ floorModules: floor, maskedModules: [] });
    mockedPortal.listMySubmissions.mockResolvedValue([]);
    mockedPortal.listMyPortalFiches.mockResolvedValue([]);

    const client = renderPage();

    await screen.findByRole('list', { name: 'Les rubriques de votre fiche' });
    // Sans l'id, la soumission ouverte de CETTE fiche peut sortir des 20 dernières lignes
    // d'un partenaire multi-fiches : les rubriques resteraient muettes, sans erreur.
    expect(mockedPortal.listMySubmissions).toHaveBeenCalledWith(20, OBJ);
    // …et sans l'id dans la CLÉ, une fiche rendrait l'historique d'une autre.
    const keys = client
      .getQueryCache()
      .findAll()
      .map((query) => query.queryKey)
      .filter((key) => key[0] === 'portal-submissions');
    expect(keys).toEqual([['portal-submissions', OBJ]]);
  });
});
