import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmAnnuaire } from './CrmAnnuaire';
import * as crm from '../../services/crm';
import { mockCrmDirectory } from '../../data/mock';
import { useCrmSearchStore } from '../../store/crm-search-store';
import { topicTintOf } from './crm-view-utils';
import { useObjectSearch } from '../object-editor/useObjectSearch';

jest.mock('../../services/crm');
jest.mock('../object-editor/useObjectSearch', () => ({
  useObjectSearch: jest.fn(() => ({ results: [], loading: false, error: null })),
}));

const crmMock = crm as jest.Mocked<typeof crm>;
const objectSearchMock = useObjectSearch as jest.MockedFunction<typeof useObjectSearch>;
// L'automock remplace AUSSI les helpers purs (ils rendraient undefined) : on récupère la vraie
// implémentation pour faire jouer au mock de service le rôle du serveur.
const { matchesCrmDirectorySearch } = jest.requireActual<typeof crm>('../../services/crm');

function renderAnnuaire(onOpenActor = jest.fn(), canWrite = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrmAnnuaire canWrite={canWrite} onOpenActor={onOpenActor} />
    </QueryClientProvider>,
  );
  return onOpenActor;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Le store de recherche est GLOBAL au module : sans reset, un test qui laisse un terme
  // contamine tous les suivants (l'annuaire s'y rend filtré).
  useCrmSearchStore.setState({ search: '' });
  crmMock.listCrmDirectory.mockResolvedValue(mockCrmDirectory);
  crmMock.listDemandTopics.mockResolvedValue([
    { code: 'demande_de_visite', name: 'Demande de visite' },
    { code: 'modification_infos_bdd', name: 'Modification infos BDD' },
  ]);
  // Repeater de canaux (PO point 3) : vocabulaire contact_kind pour le <select> du modal.
  crmMock.listContactKinds.mockResolvedValue([
    { code: 'email', name: 'Email' },
    { code: 'phone', name: 'Téléphone' },
    { code: 'mobile', name: 'Mobile' },
  ]);
  crmMock.listActorRoles.mockResolvedValue([
    { code: 'operator', name: 'Exploitant', description: 'Gestionnaire opérationnel' },
    { code: 'guide', name: 'Guide', description: 'Guide ou accompagnateur' },
  ]);
  // Suggestions de contacts (PO point 2) — vide par défaut (les tests dédiés surchargent).
  crmMock.listObjectContactSuggestions.mockResolvedValue([]);
  crmMock.uploadActorPhoto.mockResolvedValue('https://cdn/actors/new-actor/x.jpg');
  objectSearchMock.mockReturnValue({ results: [], loading: false, error: null });
});

describe('CrmAnnuaire (§61 — annuaire des acteurs)', () => {
  it('rend les lignes acteurs : nom, premier établissement + rôle, pile +N, compteurs, sujets', async () => {
    renderAnnuaire();
    expect(await screen.findByText('Mme Marie Hoarau')).toBeInTheDocument();
    expect(screen.getByText('SARL Basalte & Lagon')).toBeInTheDocument();
    // Premier objet + rôle de l'acteur multi-établissements, et la pile « +N ».
    expect(screen.getAllByText('Hotel Basalte & Lagon').length).toBeGreaterThan(0);
    expect(screen.getByText('Gérante')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    // Compteur interactions : 12 mois + total.
    expect(screen.getByText('9 au total')).toBeInTheDocument();
    // Top sujets (max 2 chips) — « Demande de visite » existe AUSSI en option du select
    // Sujet : on cible la chip de ligne.
    expect(screen.getAllByText('Demande de visite').some((el) => el.classList.contains('topic-chip'))).toBe(true);
  });

  // PO point 7 : par défaut (Toutes + Tout) le KPI Interactions lit le total ALL-TIME
  // (interaction_count) sous le libellé « Interactions (toutes) » — fini la fenêtre 12 mois
  // qui faisait croire à « seulement 2 mois ».
  it('affiche les KPI réels : acteurs suivis, interactions (toutes), établissements liés', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    expect(screen.getByText('Acteurs suivis')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // 3 acteurs
    expect(screen.getByText('Interactions (toutes)')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument(); // interaction_count all-time : 9 + 3 + 1
    expect(screen.getByText('Établissements liés')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument(); // 2 + 1 + 1
  });

  // Rectif PO v5 point 1 + parité fiche : la chip affiche le NOM du sujet, et sa teinte est
  // dérivée du CODE (topicTintOf(code)) — pas du nom — pour que le même sujet ait la même
  // couleur ici et sur la fiche acteur (qui keye déjà par code).
  it('les chips de sujet (top_topics) affichent le nom et portent topic--{topicTintOf(code)}', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    const chip = screen
      .getAllByText('Demande de visite')
      .find((el) => el.classList.contains('topic-chip')) as HTMLElement;
    expect(chip).toHaveClass('topic-pill');
    // Teinte keyée par CODE ('demande_de_visite'), pas par libellé — c'est la parité avec la fiche.
    expect(chip).toHaveClass(`topic--${topicTintOf('demande_de_visite')}`);
  });

  // Le filtrage est SERVEUR depuis 2026-07-27 (le tamis client ne verrait ni les téléphones
  // ni les e-mails). Le mock se comporte donc comme le serveur, et l'assertion porte sur ce
  // qui reste vrai côté UI : l'annuaire rend le résultat filtré, nom d'acteur ET établissement.
  it('affiche le résultat filtré par le serveur (nom d acteur ET nom d établissement)', async () => {
    // Le mock se comporte comme le serveur. `keepPreviousData` garde la liste précédente
    // affichée pendant le fetch ⇒ on attend la convergence (waitFor) plutôt qu'un tick fixe.
    crmMock.listCrmDirectory.mockImplementation(async (filters) =>
      filters?.search
        ? mockCrmDirectory.filter((entry) => matchesCrmDirectorySearch(entry, filters.search as string))
        : mockCrmDirectory,
    );
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');

    act(() => useCrmSearchStore.getState().setSearch('comptoir'));
    await waitFor(() => expect(screen.queryByText('M. Paul Técher')).not.toBeInTheDocument());
    expect(screen.getByText('Mme Marie Hoarau')).toBeInTheDocument();

    act(() => useCrmSearchStore.getState().setSearch('Técher'));
    await waitFor(() => expect(screen.queryByText('Mme Marie Hoarau')).not.toBeInTheDocument());
    expect(screen.getByText('M. Paul Técher')).toBeInTheDocument();
  });

  // Rectif PO point 6 : les chips de type d'objet (jugées inutiles) sont supprimées.
  it('ne rend plus les chips de type d objet', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    expect(screen.queryByRole('button', { name: 'ITI' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'HOT' })).not.toBeInTheDocument();
  });

  // Rectif PO point 7 : sujet / statut / période pilotent le RPC (filtrage SERVEUR) et
  // les KPI se recalculent depuis le résultat filtré.
  it('le filtre sujet relance listCrmDirectory avec topicCode (vocabulaire complet)', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    expect(crmMock.listCrmDirectory).toHaveBeenCalledWith(undefined);
    fireEvent.change(screen.getByLabelText('Sujet'), { target: { value: 'demande_de_visite' } });
    await waitFor(() => expect(crmMock.listCrmDirectory).toHaveBeenCalledWith({ topicCode: 'demande_de_visite' }));
  });

  it('le seg statut Actives → status active ; Traitées → done ; Toutes → sans filtre', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getByRole('button', { name: 'Actives' }));
    await waitFor(() => expect(crmMock.listCrmDirectory).toHaveBeenCalledWith({ status: 'active' }));
    fireEvent.click(screen.getByRole('button', { name: 'Traitées' }));
    await waitFor(() => expect(crmMock.listCrmDirectory).toHaveBeenCalledWith({ status: 'done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toutes' }));
    await waitFor(() => expect(crmMock.listCrmDirectory).toHaveBeenLastCalledWith(undefined));
  });

  it('le seg période borne from (ISO) et bascule le libellé KPI sur « Interactions (période) »', async () => {
    // Le serveur renvoie un agrégat filtré → le KPI doit refléter interaction_count (2), pas
    // la somme 12 mois de l'annuaire complet.
    crmMock.listCrmDirectory.mockImplementation(async (filters) =>
      filters ? [{ ...mockCrmDirectory[0], interactionCount: 2, interactions12m: 99 }] : mockCrmDirectory,
    );
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    expect(screen.getByText('Interactions (toutes)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '30 j' }));
    await waitFor(() =>
      expect(crmMock.listCrmDirectory).toHaveBeenLastCalledWith({ from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }),
    );
    const kpiLabel = await screen.findByText('Interactions (période)');
    const kpiCard = kpiLabel.closest('.crm-kpi') as HTMLElement;
    // interaction_count filtré (2), PAS la fenêtre 12 mois (99) ni la somme de l'annuaire complet.
    await waitFor(() => expect(within(kpiCard).getByText('2')).toBeInTheDocument());
    expect(screen.getByText(/filtres appliqués aux compteurs/i)).toBeInTheDocument();
    // Rectif PO v5 point 2 : « Acteurs suivis » devient « filtré / global » (1 entrée filtrée / 3).
    const followedCard = screen.getByText('Acteurs suivis').closest('.crm-kpi') as HTMLElement;
    // La fraction « 1 / 3 » porte à elle seule l'info filtré/global (légendes KPI retirées — rectif PO).
    await waitFor(() => expect(within(followedCard).getByText('1 / 3')).toBeInTheDocument());
  });

  // Rectif PO v5 point 2 : sans filtre, pas de fraction redondante — juste le global.
  it('« Acteurs suivis » sans filtre = juste le total global (pas de Y / Y)', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    const followedCard = screen.getByText('Acteurs suivis').closest('.crm-kpi') as HTMLElement;
    expect(within(followedCard).getByText('3')).toBeInTheDocument();
    expect(within(followedCard).queryByText('3 / 3')).not.toBeInTheDocument();
  });

  it('clic sur une ligne → onOpenActor(actorId)', async () => {
    const onOpenActor = renderAnnuaire();
    fireEvent.click(await screen.findByText('M. Paul Técher'));
    expect(onOpenActor).toHaveBeenCalledWith('actor-3');
  });

  // Phase 5.2 — l'état vide « aucune donnée » (annuaire vide, sans filtre) ENSEIGNE le motif
  // et offre un CTA « Ajouter un acteur » (distinct de l'état filtré). Cf. maquette p5-02.
  it('état vide « aucune donnée » : enseigne + CTA « Ajouter un acteur » (ouvre le modal)', async () => {
    crmMock.listCrmDirectory.mockResolvedValue([]);
    renderAnnuaire();
    const cta = await screen.findByRole('button', { name: /ajouter un acteur/i });
    fireEvent.click(cta);
    expect(await screen.findByRole('dialog', { name: 'Nouvel acteur' })).toBeInTheDocument();
  });

  it('état vide « aucune donnée » sans permission : pas de CTA (no-write-trap)', async () => {
    crmMock.listCrmDirectory.mockResolvedValue([]);
    renderAnnuaire(jest.fn(), false);
    await screen.findByText(/aucun acteur/i);
    expect(screen.queryByRole('button', { name: /ajouter un acteur/i })).not.toBeInTheDocument();
  });

  it('état vide quand aucun acteur ne correspond aux filtres', async () => {
    // Filtre d'INTERACTIONS (sujet) — l'état vide de la RECHERCHE a son propre test, avec un
    // libellé distinct qui nomme le terme cherché.
    crmMock.listCrmDirectory.mockImplementation(async (filters) => (filters?.topicCode ? [] : mockCrmDirectory));
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.change(screen.getByLabelText('Sujet'), { target: { value: 'demande_de_visite' } });
    expect(await screen.findByText(/aucun acteur ne correspond/i)).toBeInTheDocument();
  });

  it('échec de chargement → erreur visible (pas d écran vide silencieux)', async () => {
    crmMock.listCrmDirectory.mockRejectedValue(new Error('refus RLS'));
    renderAnnuaire();
    expect(await screen.findByText(/refus RLS/)).toBeInTheDocument();
  });

  // Rectif PO point 5 : création d'un acteur depuis l'annuaire (modal), avec établissement
  // de rattachement REQUIS (il met l'acteur dans le périmètre) + canaux optionnels.
  it('Nouvel acteur : saveCrmActor (nom composé + object_id résolu) + canal email (repeater) puis ouverture de la fiche', async () => {
    crmMock.saveCrmActor.mockResolvedValue('new-actor');
    crmMock.saveActorChannel.mockResolvedValue('new-channel');
    const onOpenActor = renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getAllByRole('button', { name: /nouvel acteur/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    // §66 — le nom affiché n'est PAS éditable : il est composé depuis civilité + prénom + nom.
    expect(within(dialog).queryByLabelText('Nom affiché')).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Civilité'), { target: { value: 'M.' } });
    fireEvent.change(within(dialog).getByLabelText('Prénom'), { target: { value: 'Test' } });
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Nouveau' } });
    // Aperçu composé en lecture seule.
    expect(within(dialog).getByText('M. Test Nouveau')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Établissement de rattachement'), {
      target: { value: 'Hotel Basalte & Lagon' },
    });
    // Repeater (PO point 3) : la 1re ligne par défaut est un e-mail (PO point 1 : requis).
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 1'), { target: { value: 'test@nouveau.re' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(crmMock.saveCrmActor).toHaveBeenCalledWith({
        displayName: 'M. Test Nouveau',
        gender: 'M.',
        firstName: 'Test',
        lastName: 'Nouveau',
        objectId: 'obj-1',
        roleCode: 'operator',
      }),
    );
    expect(crmMock.saveActorChannel).toHaveBeenCalledWith({
      actorId: 'new-actor',
      kindCode: 'email',
      value: 'test@nouveau.re',
      isPrimary: true,
    });
    // Pas de photo choisie → uploadActorPhoto n'est PAS appelé.
    expect(crmMock.uploadActorPhoto).not.toHaveBeenCalled();
    // La fiche du nouvel acteur s'ouvre après refresh.
    await waitFor(() => expect(onOpenActor).toHaveBeenCalledWith('new-actor'));
  });

  // §66 — le nom affiché composé se met à jour en direct quand on tape prénom/nom, sans aucun
  // champ « Nom affiché » éditable (preview en lecture seule, placeholder si vide).
  it('Nouvel acteur : nom affiché composé en lecture seule, mis à jour en direct (aucun champ éditable)', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getAllByRole('button', { name: /nouvel acteur/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    // Aucun champ « Nom affiché » éditable.
    expect(within(dialog).queryByLabelText('Nom affiché')).not.toBeInTheDocument();
    // Vide → placeholder muet.
    expect(within(dialog).getByText(/renseignez prénom\/nom/i)).toBeInTheDocument();
    // Civilité + prénom + nom → composition en direct.
    fireEvent.change(within(dialog).getByLabelText('Civilité'), { target: { value: 'Mme' } });
    fireEvent.change(within(dialog).getByLabelText('Prénom'), { target: { value: 'Jocelyne' } });
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Lebon' } });
    expect(within(dialog).getByText('Mme Jocelyne Lebon')).toBeInTheDocument();
  });

  it('Nouvel acteur : une saisie établissement non résolue bloque, mais le champ vide est accepté', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getAllByRole('button', { name: /nouvel acteur/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    // §66 — on renseigne le NOM (compose le nom affiché) mais l'établissement reste introuvable.
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Test' } });
    fireEvent.change(within(dialog).getByLabelText('Établissement de rattachement'), { target: { value: 'Inconnu' } });
    expect(within(dialog).getByRole('button', { name: 'Créer' })).toBeDisabled();
    expect(within(dialog).getByText(/établissement introuvable/i)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Établissement de rattachement'), { target: { value: '' } });
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 1'), { target: { value: 'projet@example.re' } });
    expect(within(dialog).getByRole('button', { name: 'Créer' })).toBeEnabled();
  });

  it('Nouvel acteur en projet : crée sans établissement avec le rôle sélectionné', async () => {
    crmMock.saveCrmActor.mockResolvedValue('prospect-actor');
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getAllByRole('button', { name: /nouvel acteur/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Projet Lagon' } });
    fireEvent.change(within(dialog).getByLabelText("Rôle de l'acteur"), { target: { value: 'guide' } });
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 1'), { target: { value: 'projet@lagon.re' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(crmMock.saveCrmActor).toHaveBeenCalledWith({
      displayName: 'Projet Lagon',
      lastName: 'Projet Lagon',
      roleCode: 'guide',
    }));
  });

  it('Nouvel acteur : recherche et sélectionne un établissement sans acteur existant', async () => {
    crmMock.saveCrmActor.mockResolvedValue('new-actor');
    objectSearchMock.mockImplementation((query) => ({
      results: query.toLowerCase().includes('orphelin')
        ? [{
            id: 'obj-without-actor',
            name: 'Gîte Orphelin',
            type: 'HOT',
            status: 'published',
            city: 'Saint-Paul',
            code: 'obj-without-actor',
            card: { id: 'obj-without-actor', name: 'Gîte Orphelin', type: 'HOT' },
          }]
        : [],
      loading: false,
      error: null,
    }));

    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getAllByRole('button', { name: /nouvel acteur/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });

    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Durand' } });
    fireEvent.change(within(dialog).getByLabelText('Établissement de rattachement'), {
      target: { value: 'orphelin' },
    });
    expect(dialog.querySelector('option[value="Gîte Orphelin"]')).not.toBeNull();

    fireEvent.change(within(dialog).getByLabelText('Établissement de rattachement'), {
      target: { value: 'Gîte Orphelin' },
    });
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 1'), {
      target: { value: 'durand@example.re' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));

    await waitFor(() => expect(crmMock.saveCrmActor).toHaveBeenCalledWith(expect.objectContaining({
      displayName: 'Durand',
      objectId: 'obj-without-actor',
    })));
  });

  // PO point 1 : l'e-mail est OBLIGATOIRE — Créer bloqué + raison visible tant qu'aucune
  // ligne e-mail non vide n'existe, même si nom + établissement sont remplis.
  it('Nouvel acteur : e-mail obligatoire (Créer bloqué + raison) tant qu aucun e-mail saisi', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getAllByRole('button', { name: /nouvel acteur/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    // §66 — nom (compose le nom affiché).
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Test' } });
    fireEvent.change(within(dialog).getByLabelText('Établissement de rattachement'), {
      target: { value: 'Hotel Basalte & Lagon' },
    });
    // E-mail (ligne 1) encore vide → bloqué + raison.
    expect(within(dialog).getByRole('button', { name: 'Créer' })).toBeDisabled();
    expect(within(dialog).getByText(/un e-mail est obligatoire/i)).toBeInTheDocument();
    // Saisie de l'e-mail → débloqué.
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 1'), { target: { value: 'test@nouveau.re' } });
    expect(within(dialog).getByRole('button', { name: 'Créer' })).toBeEnabled();
  });

  // PO point 3 : « + Ajouter un contact » ajoute une ligne canal (deux téléphones par ex.).
  it('Nouvel acteur : « + Ajouter un contact » ajoute une ligne et les deux canaux partent', async () => {
    crmMock.saveCrmActor.mockResolvedValue('new-actor');
    crmMock.saveActorChannel.mockResolvedValue('new-channel');
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getAllByRole('button', { name: /nouvel acteur/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Deux Tels' } });
    fireEvent.change(within(dialog).getByLabelText('Établissement de rattachement'), {
      target: { value: 'Hotel Basalte & Lagon' },
    });
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 1'), { target: { value: 'deux@tels.re' } });
    // Ajoute une 2e ligne, kind = phone, valeur = un numéro.
    fireEvent.click(within(dialog).getByRole('button', { name: /ajouter un contact/i }));
    fireEvent.change(within(dialog).getByLabelText('Type du canal 2'), { target: { value: 'phone' } });
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 2'), { target: { value: '0692 11 22 33' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(crmMock.saveActorChannel).toHaveBeenCalledTimes(2));
    expect(crmMock.saveActorChannel).toHaveBeenCalledWith({ actorId: 'new-actor', kindCode: 'email', value: 'deux@tels.re', isPrimary: true });
    expect(crmMock.saveActorChannel).toHaveBeenCalledWith({ actorId: 'new-actor', kindCode: 'phone', value: '0692 11 22 33', isPrimary: false });
  });

  // PO point 2 : une fois l'établissement résolu, ses contacts connus sont proposés en un
  // clic ; le clic ajoute une ligne pré-remplie, dédupliquée contre les lignes existantes.
  it('Nouvel acteur : suggestion établissement → clic ajoute une ligne dédupliquée', async () => {
    crmMock.saveCrmActor.mockResolvedValue('new-actor');
    crmMock.saveActorChannel.mockResolvedValue('new-channel');
    crmMock.listObjectContactSuggestions.mockResolvedValue([
      { kindCode: 'phone', kindName: 'Téléphone', value: '0262 99 88 77', isPrimary: true, source: 'établissement' },
    ]);
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getAllByRole('button', { name: /nouvel acteur/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Suggéré' } });
    fireEvent.change(within(dialog).getByLabelText('Établissement de rattachement'), {
      target: { value: 'Hotel Basalte & Lagon' },
    });
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 1'), { target: { value: 'sugg@ere.re' } });
    // Le bloc « Contacts de l'établissement » apparaît avec la suggestion cliquable.
    const suggBtn = await within(dialog).findByRole('button', { name: /0262 99 88 77/i });
    expect(suggBtn).toBeInTheDocument();
    fireEvent.click(suggBtn);
    // Un 2e canal (téléphone pré-rempli) a été ajouté.
    expect(within(dialog).getByLabelText('Valeur du canal 2')).toHaveValue('0262 99 88 77');
    // Re-cliquer ne duplique pas (déjà présent) — toujours 2 lignes.
    fireEvent.click(suggBtn);
    expect(within(dialog).queryByLabelText('Valeur du canal 3')).not.toBeInTheDocument();
  });

  // PO point 4 : champ de portrait + upload après création (ref-guarded), n'empêche pas
  // la création de l'acteur si l'upload échoue.
  it('Nouvel acteur : photo choisie → uploadActorPhoto(actorId, file) après création', async () => {
    crmMock.saveCrmActor.mockResolvedValue('new-actor');
    crmMock.saveActorChannel.mockResolvedValue('new-channel');
    const onOpenActor = renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getAllByRole('button', { name: /nouvel acteur/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Photo' } });
    fireEvent.change(within(dialog).getByLabelText('Établissement de rattachement'), {
      target: { value: 'Hotel Basalte & Lagon' },
    });
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 1'), { target: { value: 'photo@acteur.re' } });
    const file = new File([new Uint8Array([1, 2, 3])], 'portrait.jpg', { type: 'image/jpeg' });
    fireEvent.change(within(dialog).getByLabelText(/portrait/i), { target: { files: [file] } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(crmMock.uploadActorPhoto).toHaveBeenCalledWith('new-actor', file));
    await waitFor(() => expect(onOpenActor).toHaveBeenCalledWith('new-actor'));
  });

  it('sans permission : Nouvel acteur désactivé avec raison (no-write-trap)', async () => {
    renderAnnuaire(jest.fn(), false);
    await screen.findByText('Mme Marie Hoarau');
    const button = screen.getAllByRole('button', { name: /nouvel acteur/i })[0];
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringMatching(/lecture seule/i));
  });

  // Rectif PO : bouton flottant « Nouvel acteur » proéminent — présent avec permission (ouvre le
  // modal), absent en lecture seule (le bouton toolbar reste, désactivé-avec-raison).
  it('bouton flottant « Nouvel acteur » : présent + ouvre le modal avec permission', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    const fab = document.querySelector('.crm-fab') as HTMLElement;
    expect(fab).not.toBeNull();
    fireEvent.click(fab);
    expect(await screen.findByRole('dialog', { name: 'Nouvel acteur' })).toBeInTheDocument();
  });

  it('bouton flottant absent en lecture seule', async () => {
    renderAnnuaire(jest.fn(), false);
    await screen.findByText('Mme Marie Hoarau');
    expect(document.querySelector('.crm-fab')).toBeNull();
  });
});

// Recherche acteurs (PO 2026-07-27) — elle vient du champ de la TopBar (crm-search-store) et
// part au SERVEUR (p_search) : téléphone et e-mail ne sont pas dans le payload de l'annuaire.
describe('CrmAnnuaire — recherche depuis le header', () => {
  beforeEach(() => useCrmSearchStore.setState({ search: '' }));

  it('n’a plus de champ de recherche local (une seule surface possède la recherche)', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    expect(document.querySelector('.crm-search')).toBeNull();
    expect(screen.queryByPlaceholderText(/filtrer par nom/i)).toBeNull();
  });

  it('envoie le terme du store en p_search après le debounce', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    act(() => useCrmSearchStore.getState().setSearch('hoareau'));

    await waitFor(() =>
      expect(crmMock.listCrmDirectory).toHaveBeenCalledWith(expect.objectContaining({ search: 'hoareau' })),
    );
  });

  it('n’envoie AUCUNE recherche sous 2 caractères (pas d’aller-retour inutile)', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    crmMock.listCrmDirectory.mockClear();
    act(() => useCrmSearchStore.getState().setSearch('h'));
    // On laisse largement passer le debounce : l'absence d'appel doit être STABLE, pas
    // simplement pas-encore-arrivée.
    await new Promise((resolve) => setTimeout(resolve, 400));

    for (const call of crmMock.listCrmDirectory.mock.calls) {
      expect(call[0] ?? {}).not.toHaveProperty('search');
    }
  });

  // Le cœur de la séparation des états : une recherche restreint les ACTEURS, elle ne filtre
  // pas leurs INTERACTIONS. Afficher « sur la sélection » / « acteurs masqués » mentirait.
  it('sous simple recherche : ni « sur la sélection », ni la note « acteurs masqués »', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    act(() => useCrmSearchStore.getState().setSearch('hoarau'));

    expect(await screen.findByText(/Recherche « hoarau »/)).toBeInTheDocument();
    expect(screen.queryByText(/sur la sélection/i)).toBeNull();
    expect(screen.queryByText(/acteurs sans interaction correspondante sont masqués/i)).toBeNull();
  });

  it('état vide de recherche : nomme le terme cherché et ne propose pas de créer un acteur', async () => {
    crmMock.listCrmDirectory.mockImplementation(async (filters) => (filters?.search ? [] : mockCrmDirectory));
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    act(() => useCrmSearchStore.getState().setSearch('zzzintrouvable'));

    expect(await screen.findByText(/Aucun acteur pour « zzzintrouvable »/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter un acteur' })).toBeNull();
  });
});
