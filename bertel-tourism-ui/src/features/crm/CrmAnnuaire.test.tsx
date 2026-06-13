import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmAnnuaire } from './CrmAnnuaire';
import * as crm from '../../services/crm';
import { mockCrmDirectory } from '../../data/mock';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

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
  // Suggestions de contacts (PO point 2) — vide par défaut (les tests dédiés surchargent).
  crmMock.listObjectContactSuggestions.mockResolvedValue([]);
  crmMock.uploadActorPhoto.mockResolvedValue('https://cdn/actors/new-actor/x.jpg');
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

  // Rectif PO v5 point 1 : chaque chip de sujet porte une classe de teinte stable (topic--N).
  it('les chips de sujet (top_topics) portent une classe de teinte topic--N', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    const chip = screen
      .getAllByText('Demande de visite')
      .find((el) => el.classList.contains('topic-chip')) as HTMLElement;
    expect(chip).toHaveClass('topic-pill');
    expect(Array.from(chip.classList).some((c) => /^topic--\d+$/.test(c))).toBe(true);
  });

  it('filtre par recherche sur le nom de l acteur ET le nom d établissement', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.change(screen.getByPlaceholderText(/filtrer/i), { target: { value: 'comptoir' } });
    expect(screen.getByText('Mme Marie Hoarau')).toBeInTheDocument();
    expect(screen.queryByText('M. Paul Técher')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/filtrer/i), { target: { value: 'Técher' } });
    expect(screen.getByText('M. Paul Técher')).toBeInTheDocument();
    expect(screen.queryByText('Mme Marie Hoarau')).not.toBeInTheDocument();
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
    await waitFor(() => expect(within(followedCard).getByText('1 / 3')).toBeInTheDocument());
    expect(within(followedCard).getByText('pour le filtre sélectionné')).toBeInTheDocument();
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

  it('état vide quand aucun acteur ne correspond aux filtres', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.change(screen.getByPlaceholderText(/filtrer/i), { target: { value: 'zzzz-aucun' } });
    expect(screen.getByText(/aucun acteur ne correspond/i)).toBeInTheDocument();
  });

  it('échec de chargement → erreur visible (pas d écran vide silencieux)', async () => {
    crmMock.listCrmDirectory.mockRejectedValue(new Error('refus RLS'));
    renderAnnuaire();
    expect(await screen.findByText(/refus RLS/)).toBeInTheDocument();
  });

  // Rectif PO point 5 : création d'un acteur depuis l'annuaire (modal), avec établissement
  // de rattachement REQUIS (il met l'acteur dans le périmètre) + canaux optionnels.
  it('Nouvel acteur : saveCrmActor (object_id résolu) + canal email (repeater) puis ouverture de la fiche', async () => {
    crmMock.saveCrmActor.mockResolvedValue('new-actor');
    crmMock.saveActorChannel.mockResolvedValue('new-channel');
    const onOpenActor = renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getByRole('button', { name: /nouvel acteur/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    fireEvent.change(within(dialog).getByLabelText('Nom affiché'), { target: { value: 'M. Test Nouveau' } });
    fireEvent.change(within(dialog).getByLabelText('Établissement de rattachement'), {
      target: { value: 'Hotel Basalte & Lagon' },
    });
    // Repeater (PO point 3) : la 1re ligne par défaut est un e-mail (PO point 1 : requis).
    fireEvent.change(within(dialog).getByLabelText('Valeur du canal 1'), { target: { value: 'test@nouveau.re' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(crmMock.saveCrmActor).toHaveBeenCalledWith({ displayName: 'M. Test Nouveau', objectId: 'obj-1' }),
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

  it('Nouvel acteur : Créer bloqué tant que nom affiché + établissement résolu manquent', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getByRole('button', { name: /nouvel acteur/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    fireEvent.change(within(dialog).getByLabelText('Nom affiché'), { target: { value: 'M. Test' } });
    fireEvent.change(within(dialog).getByLabelText('Établissement de rattachement'), { target: { value: 'Inconnu' } });
    expect(within(dialog).getByRole('button', { name: 'Créer' })).toBeDisabled();
    expect(within(dialog).getByText(/introuvable dans l.annuaire/i)).toBeInTheDocument();
  });

  // PO point 1 : l'e-mail est OBLIGATOIRE — Créer bloqué + raison visible tant qu'aucune
  // ligne e-mail non vide n'existe, même si nom + établissement sont remplis.
  it('Nouvel acteur : e-mail obligatoire (Créer bloqué + raison) tant qu aucun e-mail saisi', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getByRole('button', { name: /nouvel acteur/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    fireEvent.change(within(dialog).getByLabelText('Nom affiché'), { target: { value: 'M. Test' } });
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
    fireEvent.click(screen.getByRole('button', { name: /nouvel acteur/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    fireEvent.change(within(dialog).getByLabelText('Nom affiché'), { target: { value: 'M. Deux Tels' } });
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
    fireEvent.click(screen.getByRole('button', { name: /nouvel acteur/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    fireEvent.change(within(dialog).getByLabelText('Nom affiché'), { target: { value: 'M. Suggéré' } });
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
    fireEvent.click(screen.getByRole('button', { name: /nouvel acteur/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel acteur' });
    fireEvent.change(within(dialog).getByLabelText('Nom affiché'), { target: { value: 'M. Photo' } });
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
    const button = screen.getByRole('button', { name: /nouvel acteur/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringMatching(/lecture seule/i));
  });
});
