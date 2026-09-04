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
  mock.approveFicheSubmission.mockResolvedValue(undefined);
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

    fireEvent.click(screen.getByRole('button', { name: /Tout approuver/ }));
    const dialog = await screen.findByRole('dialog', { name: /Approuver l’envoi/ });
    // Le groupe porte une rubrique auto ET une manuelle : sans la case, seule l'auto part —
    // et la modale doit le DIRE, sinon « tout approuver » ment sur ce qu'il fait.
    expect(dialog).toHaveTextContent(/restera.{0,20}en attente/i);
    fireEvent.click(within(dialog).getByRole('button', { name: /^Approuver$/ }));
    await waitFor(() => expect(mock.approveFicheSubmission).toHaveBeenCalledWith('sub-1', null, false));
  });

  it('D9 : inclure les rubriques manuelles EXIGE de cocher l’attestation groupée', async () => {
    mock.listPendingChanges.mockResolvedValue(SUB_ITEMS);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Tout approuver/ }));
    const dialog = await screen.findByRole('dialog', { name: /Approuver l’envoi/ });
    const attestation = within(dialog).getByRole('checkbox', { name: /j.ai reporté ces modifications/i });
    expect(attestation).not.toBeChecked();

    fireEvent.click(attestation);
    fireEvent.click(within(dialog).getByRole('button', { name: /^Approuver$/ }));
    await waitFor(() => expect(mock.approveFicheSubmission).toHaveBeenCalledWith('sub-1', null, true));
  });

  // Piège du RPC : si TOUTES les lignes sont manuelles et que l'attestation n'est pas signée,
  // approve_fiche_submission saute tout et rend un succès à 0 ligne. L'agent lirait « approuvé »
  // sur un envoi où rien n'a bougé. La confirmation reste donc BLOQUÉE.
  it('D9 : un envoi 100 % manuel ne s’approuve pas « à vide »', async () => {
    mock.listPendingChanges.mockResolvedValue([SUB_ITEMS[0]]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Tout approuver/ }));
    const dialog = await screen.findByRole('dialog', { name: /Approuver l’envoi/ });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Approuver$/ }));
    await waitFor(() => expect(within(dialog).getByText(/rien ne serait validé/i)).toBeInTheDocument());
    expect(mock.approveFicheSubmission).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /j.ai reporté ces modifications/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /^Approuver$/ }));
    await waitFor(() => expect(mock.approveFicheSubmission).toHaveBeenCalledWith('sub-1', null, true));
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

    // Le geste réflexe — cliquer le bouton de confirmation — ne doit RIEN valider.
    fireEvent.click(within(dialog).getByRole('button', { name: /Certifier et valider/ }));
    await waitFor(() => expect(within(dialog).getByText(/sans ce report/i)).toBeInTheDocument());
    expect(mock.approvePendingChange).not.toHaveBeenCalled();

    // Geste conscient : on coche, puis on valide.
    fireEvent.click(attestation);
    fireEvent.click(within(dialog).getByRole('button', { name: /Certifier et valider/ }));
    await waitFor(() => expect(mock.approvePendingChange).toHaveBeenCalledWith('pc-a', null, true));
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
    fireEvent.click(within(dialog).getByRole('button', { name: /Certifier et valider/ }));
    await waitFor(() => expect(within(dialog).getByText(/sans ce report/i)).toBeInTheDocument());
    expect(mock.approvePendingChange).not.toHaveBeenCalled();
  });

  it('D9 : une ligne sans envoi garde l’affichage plat (aucun geste groupé)', async () => {
    renderPage();
    await screen.findByText('Bras-Long');
    expect(screen.queryByRole('button', { name: /Tout approuver/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tout rejeter/ })).not.toBeInTheDocument();
  });
});
