import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModerationPage } from './ModerationPage';
import * as rpc from '../services/rpc';
import type { PendingChangeItem } from '../types/domain';

jest.mock('../services/rpc');
const mock = rpc as jest.Mocked<typeof rpc>;

// 18a/D9 — la page lit `?object=` (Task 19 y enverra l'agent depuis le kanban CRM).
let searchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

const ITEM: PendingChangeItem = {
  id: 'pc-1',
  objectId: 'HOTRUN0000000001',
  objectName: 'Hôtel Basalte',
  author: 'Jean Martin',
  field: 'lieu_dit',
  before: 'Bras-Long',
  after: 'Bras Long',
  submittedAt: '2026-03-12T14:30:00Z',
  status: 'pending',
  targetTable: 'object',
  action: 'update',
  // La file réelle émet TOUJOURS manual_apply (§7.3) : une ligne à report automatique le dit.
  manualApply: false,
};

// 18a/D9 — deux lignes du MÊME envoi partenaire : une à reporter à la main, une automatique.
const SUB_ITEMS: PendingChangeItem[] = [
  {
    ...ITEM,
    id: 'pc-a',
    submissionId: 'sub-1',
    submissionNote: 'Tarifs à jour',
    actorLabel: 'Marie Payet',
    manualApply: true,
    field: 'Contacts',
  },
  {
    ...ITEM,
    id: 'pc-b',
    submissionId: 'sub-1',
    submissionNote: 'Tarifs à jour',
    actorLabel: 'Marie Payet',
    manualApply: false,
    field: 'Horaires',
  },
];

// Un envoi 100 % AUTOMATIQUE : rien à certifier, donc aucune case — le seul cas où le geste
// groupé part avec `p_include_manual = false`.
const AUTO_ITEMS: PendingChangeItem[] = [
  { ...ITEM, id: 'pc-x', submissionId: 'sub-2', actorLabel: 'Luc Ah-Nieme', manualApply: false, field: 'Horaires' },
  { ...ITEM, id: 'pc-y', submissionId: 'sub-2', actorLabel: 'Luc Ah-Nieme', manualApply: false, field: 'Tarifs' },
];

const APPROVAL_OK = {
  appliedCount: 1,
  approvedManualCount: 1,
  skippedManualCount: 0,
  submissionStatus: 'approved',
};

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <ModerationPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  searchParams = new URLSearchParams();
  mock.listPendingChanges.mockResolvedValue([ITEM]);
  mock.approvePendingChange.mockResolvedValue(undefined);
  mock.rejectPendingChange.mockResolvedValue(undefined);
  mock.approveFicheSubmission.mockResolvedValue(APPROVAL_OK);
  mock.rejectFicheSubmission.mockResolvedValue(undefined);
});

describe('ModerationPage (P2.1)', () => {
  it('renders the pending suggestion (before / after / object / author)', async () => {
    renderPage();
    expect(await screen.findByText('Bras-Long')).toBeInTheDocument();
    expect(screen.getByText('Bras Long')).toBeInTheDocument();
    expect(screen.getByText(/Hôtel Basalte/)).toBeInTheDocument();
    expect(screen.getByText(/Jean Martin/)).toBeInTheDocument();
  });

  it('shows an honest empty state when there is nothing to moderate', async () => {
    mock.listPendingChanges.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Aucune suggestion à modérer')).toBeInTheDocument();
  });

  it('D6 : approuver passe par une confirmation nommant fiche + champ, puis applique', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /^Approuver$/i }));
    // Confirmation ouverte, RPC pas encore appelé (plus de fire-and-forget).
    const dialog = await screen.findByRole('dialog', { name: 'Approuver la suggestion' });
    expect(mock.approvePendingChange).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent(/Hôtel Basalte/);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Approuver' }));
    // 18a/D9 : le 3e argument est TOUJOURS transmis. `false` ici = « la machine applique,
    // personne n'atteste » — c'est un fait envoyé, pas un défaut subi.
    await waitFor(() => expect(mock.approvePendingChange).toHaveBeenCalledWith('pc-1', null, false));
  });

  it('rejecting requires a non-empty note (modal) before calling rejectPendingChange', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Rejeter/i }));
    // Modal open: confirm button present, but submitting empty must NOT call the RPC.
    const confirm = await screen.findByRole('button', { name: /Confirmer le refus|Rejeter la suggestion/i });
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/obligatoire/i));
    expect(mock.rejectPendingChange).not.toHaveBeenCalled();

    // With a note → calls the RPC.
    fireEvent.change(screen.getByLabelText(/Motif du refus/i), { target: { value: 'Donnée erronée' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mock.rejectPendingChange).toHaveBeenCalledWith('pc-1', 'Donnée erronée'));
  });

  it('changing the status filter re-queries with the new status', async () => {
    renderPage();
    await screen.findByText('Bras-Long');
    fireEvent.change(screen.getByLabelText(/Statut/i), { target: { value: 'applied' } });
    await waitFor(() => expect(mock.listPendingChanges).toHaveBeenCalledWith('applied', null));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18a/D9 — vue groupée par envoi + attestation du report manuel.
describe('ModerationPage — D9 : attestation du report manuel', () => {
  // FAIT VÉRIFIÉ n°1 : la §7 est le PREMIER producteur de pending_change.status='approved'
  // (aucun autre .sql ne l'écrit). Sans cette option, une ligne attestée quitte « En attente »
  // et n'apparaît sous AUCUN autre filtre — et approve/reject lèvent 22023 sur une ligne non
  // pending : plus aucun chemin de retour pour relire ce qu'on a signé.
  it('D9 : le statut « approved » est SÉLECTIONNABLE, sinon les lignes attestées disparaissent', async () => {
    renderPage();
    await screen.findByText('Bras-Long');
    const select = screen.getByLabelText(/Statut/i) as HTMLSelectElement;
    expect(within(select).getByRole('option', { name: /report manuel/i })).toHaveValue('approved');
    fireEvent.change(select, { target: { value: 'approved' } });
    await waitFor(() => expect(mock.listPendingChanges).toHaveBeenCalledWith('approved', null));
  });

  // Relisible ne suffit pas : le filtre n'a de sens que si la ligne dit QUI a signé et QUAND.
  // `reviewer_label` est déjà émis par le RPC — ne pas l'afficher, c'était laisser une
  // attestation nominative anonyme à l'écran, et un statut brut en anglais à traduire.
  it('D9 : une ligne attestée est IMPUTABLE (statut en français, signataire, date, motif)', async () => {
    mock.listPendingChanges.mockResolvedValue([
      {
        ...SUB_ITEMS[0],
        status: 'approved',
        reviewerLabel: 'Claire Robert',
        reviewedAt: '2026-03-13T09:00:00Z',
        reviewNote: 'Reporté dans la fiche',
      },
    ]);
    renderPage();
    expect(await screen.findByText(/Validée sur attestation \(report manuel\)/)).toBeInTheDocument();
    expect(screen.getByText(/Validée par Claire Robert le 2026-03-13/)).toBeInTheDocument();
    expect(screen.getByText(/Motif : Reporté dans la fiche/)).toBeInTheDocument();
    // Le statut brut du serveur ne doit plus atteindre l'écran.
    expect(screen.queryByText(/· approved/)).not.toBeInTheDocument();
  });

  // FAIT VÉRIFIÉ n°3 : sans `objectFilter` dans la queryKey, React Query re-sert le cache de
  // l'objet précédent — la navigation Next entre ?object=A et ?object=B ne remonte pas le
  // composant, et l'agent tranche la ligne d'un AUTRE partenaire en croyant traiter la sienne.
  it('D9 : ?object= filtre la file, et changer d’objet re-interroge (queryKey)', async () => {
    searchParams = new URLSearchParams('object=OBJ-A');
    // staleTime infini : si la queryKey ignorait l'objet, le cache serait re-servi tel quel
    // et le second rendu n'appellerait RIEN. C'est exactement la panne qu'on veut voir tomber.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const view = renderPage(client);
    await waitFor(() => expect(mock.listPendingChanges).toHaveBeenCalledWith('pending', 'OBJ-A'));

    searchParams = new URLSearchParams('object=OBJ-B');
    view.rerender(
      <QueryClientProvider client={client}>
        <ModerationPage />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mock.listPendingChanges).toHaveBeenCalledWith('pending', 'OBJ-B'));
  });

  it('D9 : une file filtrée sur une fiche le DIT (sinon elle se lit comme la file entière)', async () => {
    searchParams = new URLSearchParams('object=OBJ-A');
    renderPage();
    expect(await screen.findByRole('link', { name: /toute la file/i })).toBeInTheDocument();
  });

  it('D9 : groupe par envoi avec Tout approuver / Tout rejeter', async () => {
    mock.listPendingChanges.mockResolvedValue(SUB_ITEMS);
    renderPage();
    expect(await screen.findByText(/Marie Payet/)).toBeInTheDocument();
    expect(screen.getByText(/Tarifs à jour/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tout approuver/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tout rejeter/ })).toBeInTheDocument();
  });

  // L'ordre du serveur est `submitted_at DESC`. Rendre TOUS les envois puis TOUTES les lignes
  // isolées ferait passer une proposition interne du jour SOUS un envoi partenaire plus ancien :
  // la file affichée ne serait plus celle qui a été demandée.
  it('D9 : envois et propositions internes restent INTERCALÉS dans l’ordre du serveur', async () => {
    mock.listPendingChanges.mockResolvedValue([
      { ...ITEM, id: 'pc-i1', field: 'Interne récent' },
      { ...SUB_ITEMS[0], id: 'pc-s1', field: 'Envoi milieu' },
      { ...ITEM, id: 'pc-i2', field: 'Interne ancien' },
    ]);
    renderPage();
    await screen.findByText(/Interne récent/);
    const order = screen
      .getAllByText(/Interne récent|Envoi milieu|Interne ancien/)
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim());
    expect(order).toEqual([
      'Hôtel Basalte · Interne récent',
      'Hôtel Basalte · Envoi milieu',
      'Hôtel Basalte · Interne ancien',
    ]);
  });

  // Le SEUL cas où « Tout approuver » ne certifie rien : aucune rubrique manuelle, donc
  // aucune case — `p_include_manual` part à false parce qu'il n'y a rien à inclure.
  it('D9 : un envoi tout-automatique s’approuve sans certification', async () => {
    mock.listPendingChanges.mockResolvedValue(AUTO_ITEMS);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Tout approuver/ }));
    const dialog = await screen.findByRole('dialog', { name: /Approuver l’envoi/ });
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Approuver$/ }));
    await waitFor(() => expect(mock.approveFicheSubmission).toHaveBeenCalledWith('sub-2', null, false));
  });

  // Le geste groupé certifie N rubriques d'un clic : sa friction doit égaler celle de
  // l'unitaire. Tant que la case n'était obligatoire que sur un envoi 100 % manuel, un envoi
  // MIXTE se validait en deux clics — sous un message qui poussait justement à cocher.
  it('D9 : sur un envoi MIXTE, la certification groupée est obligatoire et NOMME les rubriques', async () => {
    mock.listPendingChanges.mockResolvedValue(SUB_ITEMS);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Tout approuver/ }));
    const dialog = await screen.findByRole('dialog', { name: /Approuver l’envoi/ });
    // On ne signe pas un compteur : la rubrique manuelle est nommée dans la case elle-même.
    const attestation = within(dialog).getByRole('checkbox', { name: /j.ai reporté ces modifications/i });
    expect(attestation).toHaveAccessibleName(/Contacts/);
    expect(attestation).not.toBeChecked();

    // Le geste réflexe ne passe pas, et l'écran RÉAGIT au clic refusé.
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Certifier et valider/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Cochez la certification/i);
    expect(mock.approveFicheSubmission).not.toHaveBeenCalled();

    fireEvent.click(attestation);
    fireEvent.click(within(dialog).getByRole('button', { name: /Certifier et valider/ }));
    await waitFor(() => expect(mock.approveFicheSubmission).toHaveBeenCalledWith('sub-1', null, true));
  });

  // Piège du RPC : si TOUTES les lignes sont manuelles et que l'attestation n'est pas signée,
  // approve_fiche_submission saute tout et rend un succès à 0 ligne. L'agent lirait « approuvé »
  // sur un envoi où rien n'a bougé.
  it('D9 : un envoi 100 % manuel ne s’approuve pas « à vide »', async () => {
    mock.listPendingChanges.mockResolvedValue([SUB_ITEMS[0]]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Tout approuver/ }));
    const dialog = await screen.findByRole('dialog', { name: /Approuver l’envoi/ });
    expect(within(dialog).getByText(/rien ne serait validé/i)).toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Certifier et valider/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Cochez la certification/i);
    expect(mock.approveFicheSubmission).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /j.ai reporté ces modifications/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Certifier et valider/ }));
    await waitFor(() => expect(mock.approveFicheSubmission).toHaveBeenCalledWith('sub-1', null, true));
  });

  // Le RPC ne traite pas forcément tout ce qu'on lui donne. Sans compte rendu, un « Tout
  // approuver » partiel est indiscernable d'un geste complet : le panneau rétrécit, point.
  it('D9 : après un geste groupé, l’écran DIT ce que le RPC a fait', async () => {
    mock.listPendingChanges.mockResolvedValue(SUB_ITEMS);
    mock.approveFicheSubmission.mockResolvedValue({
      appliedCount: 2,
      approvedManualCount: 4,
      skippedManualCount: 1,
      submissionStatus: 'partial',
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Tout approuver/ }));
    const dialog = await screen.findByRole('dialog', { name: /Approuver l’envoi/ });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /j.ai reporté ces modifications/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Certifier et valider/ }));

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(/2 modifications appliquées automatiquement/i);
    expect(notice).toHaveTextContent(/4 validées sur votre attestation/i);
    expect(notice).toHaveTextContent(/1 laissée en attente/i);
    expect(notice).toHaveTextContent(/L’envoi reste ouvert/i);
  });

  it('D9 : « Tout rejeter » exige un motif avant d’appeler le RPC groupé', async () => {
    mock.listPendingChanges.mockResolvedValue(SUB_ITEMS);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Tout rejeter/ }));
    const confirm = await screen.findByRole('button', { name: /Confirmer le refus/i });
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/obligatoire/i));
    expect(mock.rejectFicheSubmission).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Motif du refus/i), { target: { value: 'Tarifs incohérents' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mock.rejectFicheSubmission).toHaveBeenCalledWith('sub-1', 'Tarifs incohérents'));
  });

  // LE CŒUR DE D9. Le serveur ne peut PAS vérifier le report ; il ne peut que l'imputer
  // (attested_by/attested_at). L'écran est donc la seule vraie garde : l'attestation doit être
  // une DÉCLARATION cochée, jamais l'effet de bord d'un clic sur « Approuver ».
  it('D9 : approuver une rubrique manuelle exige l’attestation cochée', async () => {
    mock.listPendingChanges.mockResolvedValue([SUB_ITEMS[0]]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /^Approuver$/ }));
    const dialog = await screen.findByRole('dialog', { name: /Approuver la suggestion/ });
    // La modale reprend LE message que le serveur renverra si l'on s'y prend mal (22023).
    expect(dialog).toHaveTextContent(/reportée dans l.éditeur/i);

    const attestation = within(dialog).getByRole('checkbox', { name: /j.ai reporté ces modifications/i });
    expect(attestation).not.toBeChecked();

    // Le geste réflexe ne doit RIEN valider — et l'écran doit RÉAGIR au clic refusé. Le hint,
    // lui, est affiché depuis l'ouverture : le constater ne prouverait aucune réaction.
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Certifier et valider/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Cochez la certification/i);
    expect(mock.approvePendingChange).not.toHaveBeenCalled();

    // Geste conscient : on coche, puis on valide.
    fireEvent.click(attestation);
    fireEvent.click(within(dialog).getByRole('button', { name: /Certifier et valider/ }));
    await waitFor(() => expect(mock.approvePendingChange).toHaveBeenCalledWith('pc-a', null, true));
  });

  // Une attestation qui SURVIT à sa ligne signe la suivante sans qu'on y pense : l'agent
  // rouvre, voit la case déjà cochée, valide. Le geste conscient a disparu, et « validée »
  // recommence à ne rien vouloir dire. Elle repart donc décochée à chaque ouverture.
  it('D9 : l’attestation ne se reporte JAMAIS d’une ligne à la suivante', async () => {
    const second: PendingChangeItem = { ...SUB_ITEMS[0], id: 'pc-c', field: 'Tarifs' };
    mock.listPendingChanges.mockResolvedValue([SUB_ITEMS[0], second]);
    renderPage();
    const approveButtons = await screen.findAllByRole('button', { name: /^Approuver$/ });

    fireEvent.click(approveButtons[0]);
    const first = await screen.findByRole('dialog', { name: /Approuver la suggestion/ });
    fireEvent.click(within(first).getByRole('checkbox', { name: /j.ai reporté ces modifications/i }));
    fireEvent.click(within(first).getByRole('button', { name: /Certifier et valider/ }));
    await waitFor(() => expect(mock.approvePendingChange).toHaveBeenCalledWith('pc-a', null, true));

    fireEvent.click(screen.getAllByRole('button', { name: /^Approuver$/ })[1]);
    const next = await screen.findByRole('dialog', { name: /Approuver la suggestion/ });
    expect(within(next).getByRole('checkbox', { name: /j.ai reporté ces modifications/i })).not.toBeChecked();
    fireEvent.click(within(next).getByRole('button', { name: /Certifier et valider/ }));
    // Sans un NOUVEAU geste, la seconde ligne ne part pas — et le refus se voit.
    expect(await within(next).findByRole('alert')).toHaveTextContent(/Cochez la certification/i);
    expect(mock.approvePendingChange).toHaveBeenCalledTimes(1);
  });

  // FAIL-CLOSED (fait vérifié n°2) : les fixtures démo n'expriment pas manual_apply. Un
  // `undefined` traité comme « automatique » rendrait l'approbation en un clic — exactement le
  // trou que D9 ferme. L'inconnu se traite donc comme du manuel.
  it('D9 : un report INCONNU (démo) ne s’approuve pas en un clic', async () => {
    const unknown: PendingChangeItem = { ...ITEM, id: 'pc-demo', manualApply: undefined };
    mock.listPendingChanges.mockResolvedValue([unknown]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /^Approuver$/ }));
    const dialog = await screen.findByRole('dialog', { name: /Approuver la suggestion/ });
    expect(within(dialog).getByRole('checkbox', { name: /j.ai reporté ces modifications/i })).not.toBeChecked();
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Certifier et valider/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Cochez la certification/i);
    expect(mock.approvePendingChange).not.toHaveBeenCalled();
  });

  it('D9 : une ligne sans envoi garde l’affichage plat (aucun geste groupé)', async () => {
    renderPage();
    await screen.findByText('Bras-Long');
    expect(screen.queryByRole('button', { name: /Tout approuver/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tout rejeter/ })).not.toBeInTheDocument();
  });
});
