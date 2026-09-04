/**
 * Les PARCOURS de la fiche — l'état est PRODUIT, jamais posé à la main.
 *
 * La revue a montré la limite des suites par composant : une assertion qui reçoit
 * `approved`, `discardedRubrics` ou un `formCache` en prop ne prouve rien du câblage. Quatre
 * sabotages du câblage passaient au vert. Ces tests-là partent donc des SERVICES
 * (`listMySubmissions`, `localStorage`) et vont jusqu'à ce que le partenaire voit.
 *
 * Ils traversent `PortalFichePage` → `PortalFicheEditor` → `PortalFicheHub` → l'écran de
 * rubrique, avec les vraies requêtes React Query et le vrai état d'édition.
 */
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortalFichePage } from './PortalFichePage';
import { portalDraftKey, portalFormKey, writePortalDraft, writePortalSent } from './usePortalDraft';
import { actorPortalPermissions, KIND_OPTIONS, portalModules } from './__fixtures__/portal-fixtures';
import { PORTAL_RUBRICS } from './portal-rubrics';
import { MODULE_KEY_MAP } from '../object-editor/editor-state';
import type { ObjectWorkspacePermissions } from '../../services/object-workspace';
import * as portal from '../../services/portal';
import * as explorerQueries from '../../hooks/useExplorerQueries';
import { useSessionStore } from '../../store/session-store';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

jest.mock('../../services/portal');
jest.mock('../../hooks/useExplorerQueries');

/**
 * Un routeur qui change VRAIMENT la query et provoque un rendu, comme l'App Router. Sans
 * lui, la seconde rubrique n'est jamais « ouverte depuis une rubrique » : le cas de
 * l'historique ne se produit pas et le test le manque.
 */
let applyQuery: (query: string) => void = () => {};
const queryOf = (href: string) => href.split('?')[1] ?? '';
/** La pile d'historique, pour de vrai : `back()` retombe sur l'entrée précédente, pas sur
 *  le hub par convention — sans quoi une entrée de trop resterait invisible. */
let historyStack: string[] = [''];
const routerPush = jest.fn((href: string) => {
  historyStack.push(queryOf(href));
  applyQuery(queryOf(href));
});
const routerReplace = jest.fn((href: string) => {
  historyStack[historyStack.length - 1] = queryOf(href);
  applyQuery(queryOf(href));
});
const routerBack = jest.fn(() => {
  historyStack.pop();
  applyQuery(historyStack[historyStack.length - 1] ?? '');
});
let searchParams = new URLSearchParams('');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace, back: routerBack }),
  useSearchParams: () => searchParams,
}));

const mockedPortal = portal as jest.Mocked<typeof portal>;
const mockedQueries = explorerQueries as jest.Mocked<typeof explorerQueries>;

const OBJ = 'HOTRUN0001';
const USER = 'u1';
const FLOOR = ['legal', 'publication', 'media', 'provider', 'relationships', 'places'];

/** Une fiche d'hébergement avec le catalogue des genres de contact (sans lui, écrire est refusé). */
function fixture(over: Record<string, unknown> = {}): ObjectWorkspaceModules {
  return portalModules({
    contacts: { objectItems: [], webItems: [], kindOptions: KIND_OPTIONS, roleOptions: [] },
    ...over,
  });
}

const submission = (over: Partial<portal.MySubmission> = {}): portal.MySubmission => ({
  id: 's1',
  objectId: OBJ,
  objectName: 'Villa Vanille',
  note: null,
  status: 'approved',
  submittedAt: '2026-09-01T08:00:00.000Z',
  resolvedAt: '2026-09-02T08:00:00.000Z',
  changes: [],
  ...over,
});

const fiche = (over: Partial<portal.PortalFiche> = {}): portal.PortalFiche => ({
  id: OBJ,
  name: 'Villa Vanille',
  objectType: 'HOT',
  status: 'published',
  updatedAt: null,
  openSubmission: null,
  lastResolved: { status: 'approved', resolvedAt: '2026-09-02T08:00:00.000Z' },
  officeEmail: null,
  officePhone: null,
  ...over,
});

function primeServices(
  modules: ObjectWorkspaceModules = fixture(),
  // `{}` n'est PAS l'objet d'un partenaire : `accessReason` y rend `null` partout, et la
  // suite ne voit alors jamais le refus de droits que le serveur oppose à TOUT compte
  // portail. Les parcours qui veulent l'état réel passent `actorPortalPermissions()`.
  permissions: ObjectWorkspacePermissions = {} as never,
) {
  mockedQueries.loadObjectWorkspace.mockResolvedValue({
    id: OBJ,
    name: 'Villa Vanille',
    type: 'HOT',
    detail: {} as never,
    modules,
    permissions,
  });
  mockedPortal.getPortalSectionVisibility.mockResolvedValue({ floorModules: FLOOR, maskedModules: [] });
  mockedPortal.listMySubmissions.mockResolvedValue([]);
  mockedPortal.listMyPortalFiches.mockResolvedValue([fiche()]);
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <PortalFichePage objectId={OBJ} />
    </QueryClientProvider>,
  );
  return view;
}

/** La même page, mais la query vit dans un état React : la navigation re-rend pour de vrai. */
function Harness({ initial }: { initial: string }) {
  const [query, setQuery] = useState(initial);
  applyQuery = setQuery;
  searchParams = new URLSearchParams(query);
  return <PortalFichePage objectId={OBJ} />;
}

function renderRouted(initial = '') {
  historyStack = initial ? [initial] : [''];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  searchParams = new URLSearchParams('');
  historyStack = [''];
  useSessionStore.setState({ userId: USER, role: 'actor', demoMode: false } as never);
});

describe('parcours — les DROITS d’un compte portail (D7)', () => {
  it('les trois sondes serveur refusent tout, et le partenaire garde quand même un chemin d’entrée', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════
    // LE test que les sept suites du portail ne pouvaient pas faire : elles passaient
    // `permissions: {} as never`, un objet VIDE pour lequel `accessReason` rend `null`
    // partout — donc l'exact contraire de ce que vit un partenaire.
    // ═══════════════════════════════════════════════════════════════════════════════
    const permissions = await actorPortalPermissions();

    // PRÉMISSE, pas la preuve : on vérifie qu'on est bien dans le cas fautif. CHAQUE
    // module du portail porte un refus d'écriture canonique DIRECTE — c'est D7 qui
    // fonctionne, pas une rubrique indisponible. Sans cette boucle, un objet devenu
    // permissif un jour rendrait le parcours ci-dessous vert pour la mauvaise raison.
    const access = permissions as unknown as Record<string, { disabledReason: string | null }>;
    for (const rubric of PORTAL_RUBRICS) {
      expect(access[MODULE_KEY_MAP[rubric.module]]?.disabledReason).toEqual(expect.any(String));
    }

    primeServices(fixture(), permissions);
    renderRouted('');

    const list = await screen.findByRole('list', { name: 'Les rubriques de votre fiche' });
    // Aucune rubrique fermée, et le compteur ne dit pas « 0 sur 0 ».
    expect(within(list).queryAllByText('Indisponible pour le moment')).toHaveLength(0);
    expect(screen.queryByText(/sur 0 renseignée/)).not.toBeInTheDocument();

    // Et le chemin va jusqu'au bout : ouvrir, saisir, valider, envoyer. Avec la jambe
    // `readDisabledReason`, la ligne est un `<span>` inerte : rien de tout ceci n'existe.
    await userEvent.click(within(list).getByText('Vos coordonnées'));
    await userEvent.type(await screen.findByLabelText('Téléphone'), '0692 45 12 30');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    expect(await screen.findByRole('button', { name: 'Envoyer à l’office' })).toBeInTheDocument();
  });
});

describe('parcours — la saisie en cours survit à un RECHARGEMENT', () => {
  it('ce qui a été tapé sans « Valider » est retrouvé après un démontage complet', async () => {
    // Le scénario le plus probable sur un téléphone : un appel entrant, ou l'onglet tué
    // par le système, au milieu d'un formulaire. Le brouillon n'est écrit que depuis
    // `dirtySections`, qui ne bouge qu'au clic sur « Valider » : entre les deux, tout ce
    // qui a été tapé disparaissait sans un mot.
    jest.useFakeTimers({ advanceTimers: true });
    primeServices();
    searchParams = new URLSearchParams('rubrique=contacts');
    const first = renderPage();

    await userEvent.type(await screen.findByLabelText('Téléphone'), '0692 45 12 30');
    await waitFor(() => expect(window.localStorage.getItem(portalFormKey(USER, OBJ))).not.toBeNull());
    // Rien n'a été validé : le brouillon des modules, lui, reste vide.
    expect(window.localStorage.getItem(portalDraftKey(USER, OBJ))).toBeNull();

    first.unmount();
    jest.useRealTimers();
    primeServices();
    renderPage();

    expect(await screen.findByLabelText('Téléphone')).toHaveValue('0692 45 12 30');
  });

  it('« Quitter sans garder » l’oublie pour de bon, jusque dans le stockage', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    primeServices();
    searchParams = new URLSearchParams('rubrique=contacts');
    const first = renderPage();

    await userEvent.type(await screen.findByLabelText('Téléphone'), '0692');
    await userEvent.click(screen.getByRole('button', { name: 'Retour sans changer' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Quitter sans garder' }));
    await waitFor(() => {
      const raw = window.localStorage.getItem(portalFormKey(USER, OBJ));
      expect(raw === null || !raw.includes('0692')).toBe(true);
    });

    first.unmount();
    jest.useRealTimers();
    primeServices();
    renderPage();

    expect(await screen.findByLabelText('Téléphone')).toHaveValue('');
  });

  it('INTERROMPU dans la fenêtre de temporisation : la saisie est quand même écrite', async () => {
    // LE test qui prouve la fermeture. Tous les autres attendent l'écriture AVANT de
    // démonter — ils prouvent donc l'inverse. Ici : aucune pause, aucun timer avancé, et
    // le débounce se réarme à chaque frappe. C'est l'exact scénario « appel entrant ».
    primeServices();
    searchParams = new URLSearchParams('rubrique=contacts');
    const first = renderPage();

    await userEvent.type(await screen.findByLabelText('Téléphone'), '0692 45 12 30');
    // La temporisation de 800 ms N’EST PAS écoulée : rien n’a encore été écrit.
    expect(window.localStorage.getItem(portalFormKey(USER, OBJ))).toBeNull();

    first.unmount();

    expect(window.localStorage.getItem(portalFormKey(USER, OBJ))).not.toBeNull();
    primeServices();
    renderPage();
    expect(await screen.findByLabelText('Téléphone')).toHaveValue('0692 45 12 30');
  });

  it('la page qui se CACHE (appel entrant, onglet en arrière-plan) écrit sur-le-champ', async () => {
    // `pagehide` et `visibilitychange -> hidden` sont les seuls signaux fiables sur mobile ;
    // `beforeunload` n'y est ni garanti ni souhaitable (il empêche la mise en bfcache).
    primeServices();
    searchParams = new URLSearchParams('rubrique=contacts');
    renderPage();
    await userEvent.type(await screen.findByLabelText('Téléphone'), '0692');
    expect(window.localStorage.getItem(portalFormKey(USER, OBJ))).toBeNull();

    window.dispatchEvent(new Event('pagehide'));

    expect(window.localStorage.getItem(portalFormKey(USER, OBJ))).toContain('0692');
  });

  it('mémoire pleine : on le DIT au lieu de laisser la saisie redevenir volatile', async () => {
    primeServices();
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    searchParams = new URLSearchParams('rubrique=contacts');
    renderPage();

    await userEvent.type(await screen.findByLabelText('Téléphone'), '0692');
    window.dispatchEvent(new Event('pagehide'));

    expect(
      await screen.findByText(/Nous ne pouvons plus garder vos modifications sur cet appareil/),
    ).toBeInTheDocument();
    setItem.mockRestore();
  });
  it('« Annuler mes modifications » efface AUSSI la saisie non validée', async () => {
    // La saisie en cours et le brouillon sont deux clés : abandonner tout doit emporter
    // les deux, sinon la rubrique se rouvre avec un texte que le partenaire croit effacé.
    jest.useFakeTimers({ advanceTimers: true });
    primeServices();
    searchParams = new URLSearchParams('rubrique=contacts');
    renderPage();

    await userEvent.type(await screen.findByLabelText('Téléphone'), '0692 45 12 30');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Annuler mes modifications' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Effacer' }));

    await waitFor(() => expect(window.localStorage.getItem(portalFormKey(USER, OBJ))).toBeNull());
    expect(window.localStorage.getItem(portalDraftKey(USER, OBJ))).toBeNull();
    jest.useRealTimers();
  });
  it('l’office a retouché la rubrique entre-temps : la saisie n’est PAS rejouée', async () => {
    // Rejouer un formulaire pris sur l'ancienne valeur ferait renvoyer une donnée périmée
    // sans que le partenaire le sache.
    jest.useFakeTimers({ advanceTimers: true });
    primeServices();
    searchParams = new URLSearchParams('rubrique=contacts');
    const first = renderPage();
    await userEvent.type(await screen.findByLabelText('Téléphone'), '0692');
    await waitFor(() => expect(window.localStorage.getItem(portalFormKey(USER, OBJ))).not.toBeNull());
    first.unmount();
    jest.useRealTimers();

    primeServices(
      fixture({
        contacts: {
          objectItems: [
            { id: 'c9', kindId: 'k-phone', kindCode: 'phone', kindLabel: 'Téléphone', value: '0262 11 11 11', isPublic: true, isPrimary: true },
          ],
          webItems: [],
          kindOptions: KIND_OPTIONS,
          roleOptions: [],
        },
      }),
    );
    renderPage();

    expect(await screen.findByLabelText('Téléphone')).toHaveValue('0262 11 11 11');
  });
});

describe('parcours — ce que l’office a fait (IMPORTANT 7)', () => {
  function primeApproved() {
    primeServices();
    mockedPortal.listMySubmissions.mockResolvedValue([
      submission({
        changes: [
          { id: 'c1', section: 'pricing', field: 'Vos tarifs', status: 'approved', reviewNote: null, reviewerLabel: null },
        ],
      }),
    ]);
  }

  it('une soumission résolue `approved` PRODUIT le badge « Accepté — en cours de report »', async () => {
    primeApproved();

    renderPage();

    const list = await screen.findByRole('list', { name: 'Les rubriques de votre fiche' });
    const pricing = within(list).getByText('Vos tarifs').closest('a');
    expect(pricing).toHaveTextContent('Accepté — en cours de report');
  });

  it('`applied` ne produit RIEN : la machine a déjà réécrit la fiche', async () => {
    primeServices();
    mockedPortal.listMySubmissions.mockResolvedValue([
      submission({
        changes: [
          { id: 'c1', section: 'pricing', field: 'Vos tarifs', status: 'applied', reviewNote: null, reviewerLabel: null },
        ],
      }),
    ]);

    renderPage();

    const list = await screen.findByRole('list', { name: 'Les rubriques de votre fiche' });
    expect(within(list).getByText('Vos tarifs').closest('a')).not.toHaveTextContent('Accepté');
  });

  it('la NOTICE de la rubrique acceptée montre ce qui avait été envoyé', async () => {
    // Sans l'instantané, la notice s'afficherait sans date ni contenu — c'est-à-dire sans
    // ce qui empêche justement la ressaisie.
    writePortalSent(USER, OBJ, {
      submittedAt: '2026-09-01T08:00:00.000Z',
      lines: { pricing: ['À partir de 90 € par nuit'] },
    });
    primeApproved();
    searchParams = new URLSearchParams('rubrique=pricing');

    renderPage();

    expect(await screen.findByText(/L’office a accepté cette modification le 1 septembre/)).toBeInTheDocument();
    expect(screen.getByText('À partir de 90 € par nuit')).toBeInTheDocument();
  });

  it('l’instantané SURVIT tant qu’un report manuel est attendu, et part quand tout est appliqué', async () => {
    writePortalSent(USER, OBJ, {
      submittedAt: '2026-09-01T08:00:00.000Z',
      lines: { pricing: ['À partir de 90 € par nuit'] },
    });
    primeApproved();
    const view = renderPage();
    await screen.findByRole('list', { name: 'Les rubriques de votre fiche' });
    // Un report est en attente : l'instantané reste, la notice en a besoin.
    expect(window.localStorage.getItem(`portal-sent:${USER}:${OBJ}`)).not.toBeNull();
    view.unmount();

    primeServices();
    mockedPortal.listMySubmissions.mockResolvedValue([
      submission({
        changes: [
          { id: 'c1', section: 'pricing', field: 'Vos tarifs', status: 'applied', reviewNote: null, reviewerLabel: null },
        ],
      }),
    ]);
    renderPage();

    await screen.findByRole('list', { name: 'Les rubriques de votre fiche' });
    await waitFor(() => expect(window.localStorage.getItem(`portal-sent:${USER}:${OBJ}`)).toBeNull());
  });
});

describe('parcours — un brouillon écarté nomme ce qu’il a perdu (IMPORTANT 8)', () => {
  it('les rubriques non reprises sont NOMMÉES depuis le brouillon réellement stocké', async () => {
    const taken = fixture();
    writePortalDraft(
      USER,
      OBJ,
      taken,
      { pricing: { prices: [{ indicationCode: 'principal', amount: '90' }] } },
      'ma piscine est en travaux',
    );
    // L'office a retouché LA tranche que le brouillon portait.
    primeServices(
      fixture({
        pricing: {
          prices: [{ indicationCode: 'principal', kindCode: 'adulte', amount: '120', amountMax: '', unitCode: '' }],
          priceKindOptions: [],
          priceUnitOptions: [],
          priceTypeOptions: [],
          discounts: [],
          promotions: [],
          unavailableReason: null,
        },
      }),
    );

    renderPage();

    const notice = await screen.findByRole('status', { name: 'Modifications non reprises' });
    expect(notice).toHaveTextContent('Vos tarifs');
    // …et le message, lui, n'écrase rien : il survit.
    expect(notice).toHaveTextContent('Votre message à l’office a été gardé');
  });
});

describe('parcours — l’historique tient au plus UNE entrée de rubrique', () => {
  async function openFromList(label: string) {
    const lists = await screen.findAllByRole('list', { name: 'Les rubriques de votre fiche' });
    await userEvent.click(within(lists[0]).getByText(label));
  }

  it('hub → rubrique POUSSE, rubrique → rubrique REMPLACE', async () => {
    primeServices();
    renderRouted('');

    await openFromList('Vos coordonnées');
    expect(routerPush).toHaveBeenCalledWith(`/espace/fiches/${OBJ}?rubrique=contacts`, { scroll: false });
    expect(routerReplace).not.toHaveBeenCalled();

    // La liste reste cliquable pendant la saisie (deux colonnes ≥ 1024 px). Enchaîner deux
    // rubriques ne doit PAS empiler une seconde entrée : « Retour à la fiche » ramènerait
    // sinon sur la rubrique précédente, et il faudrait appuyer deux fois.
    await openFromList('Vos tarifs');
    expect(routerReplace).toHaveBeenCalledWith(`/espace/fiches/${OBJ}?rubrique=pricing`, { scroll: false });
    expect(routerPush).toHaveBeenCalledTimes(1);
  });

  it('« Retour à la fiche » revient en UN seul geste après deux rubriques enchaînées', async () => {
    primeServices();
    renderRouted('');

    await openFromList('Vos coordonnées');
    await openFromList('Vos tarifs');
    routerBack.mockClear();
    routerPush.mockClear();

    await userEvent.click(screen.getByRole('link', { name: /Retour à la fiche/ }));

    // UN seul geste, et on est SUR LA FICHE — pas sur la rubrique précédente.
    expect(routerBack).toHaveBeenCalledTimes(1);
    expect(routerPush).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.querySelector('.portal-fiche-page')).toHaveAttribute('data-view', 'hub'),
    );
    expect(screen.queryByRole('heading', { level: 2, name: 'Vos coordonnées' })).not.toBeInTheDocument();
  });

  it('arrivé directement sur ?rubrique= (lien partagé), le retour POUSSE au lieu de sortir du site', async () => {
    primeServices();
    renderRouted('rubrique=contacts');

    await userEvent.click(await screen.findByRole('link', { name: /Retour à la fiche/ }));

    // Aucune entrée n'a été poussée par cette page : `back()` ferait SORTIR du site.
    expect(routerBack).not.toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith(`/espace/fiches/${OBJ}`, { scroll: false });
  });
});

describe('parcours — la rubrique retenue pendant une vérification (IMPORTANT 6)', () => {
  it('remodifier une rubrique en vérification l’écrit sur la ligne ET dans la barre', async () => {
    primeServices();
    mockedPortal.listMyPortalFiches.mockResolvedValue([
      fiche({ openSubmission: { id: 's9', submittedAt: '2026-09-02T08:00:00.000Z' }, lastResolved: null }),
    ]);
    mockedPortal.listMySubmissions.mockResolvedValue([
      submission({
        id: 's9',
        status: 'pending',
        resolvedAt: null,
        changes: [
          { id: 'c1', section: 'contacts', field: 'Vos coordonnées', status: 'pending', reviewNote: null, reviewerLabel: null },
        ],
      }),
    ]);
    searchParams = new URLSearchParams('rubrique=contacts');

    renderPage();

    await userEvent.type(await screen.findByLabelText('Téléphone'), '0692 45 12 30');
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    const list = await screen.findByRole('list', { name: 'Les rubriques de votre fiche' });
    expect(within(list).getByText('Vos nouveaux changements sont gardés ici.')).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 rubrique modifiée · gardée sur cet appareil, à envoyer quand l’office aura terminé sa vérification.',
      ),
    ).toBeInTheDocument();
  });
});
