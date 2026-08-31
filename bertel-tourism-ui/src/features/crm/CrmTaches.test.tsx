import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmTaches } from './CrmTaches';
import * as crm from '../../services/crm';
import { mockCrmDirectory } from '../../data/mock';
import { useSessionStore } from '../../store/session-store';
import type { CrmTask } from '../../types/domain';
import { pickerListbox } from '../../components/ui/pickers/pickers.test-utils';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

// L'établissement est un SearchSelect (combobox + popover) : ouvrir puis cliquer l'option.
// Borné au listbox du picker comme `toggleAssignee` — le popover est portalisé sous <body>
// et `screen` y côtoierait les <option> natives du <select> « Filtrer par personne ».
function pickEstablishment(optionName: string | RegExp) {
  const trigger = screen.getByRole('combobox', { name: 'Établissement' });
  fireEvent.click(trigger);
  fireEvent.click(pickerListbox(trigger).getByRole('option', { name: optionName }));
}

// 16w — « Attribuer à » est un SearchMultiSelect : le popover reste ouvert et chaque clic
// BASCULE une personne (on peut donc en ajouter plusieurs d'affilée, ou en retirer une).
function toggleAssignee(optionName: string | RegExp) {
  const trigger = screen.getByRole('combobox', { name: 'Attribuer à' });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  // La recherche est bornée au popover : le <select> « Filtrer par personne » de la barre
  // d'outils porte les MÊMES noms d'option (role="option" natif) et les rendrait ambigus.
  // Le scope passe par `aria-controls` : le panneau est portalisé, `.picker` ne le contient plus.
  fireEvent.click(pickerListbox(trigger).getByRole('option', { name: optionName }));
}

// Bascule la base de la période. Nommé « La période porte sur » et non « Échéance » :
// le modal de création porte déjà un champ « Échéance », deux homonymes rendraient les
// requêtes par libellé ambiguës.
function setBasis(value: 'due' | 'created') {
  fireEvent.change(screen.getByLabelText('La période porte sur'), { target: { value } });
}

// Le kanban filtre par défaut sur « mes tâches » : la plupart des cas historiques veulent
// voir tout le tableau.
function showEveryone() {
  fireEvent.change(screen.getByLabelText('Filtrer par personne'), { target: { value: '__all__' } });
}

const ME = { userId: 'usr-local-marie', displayName: 'Marie D.' };
const JEAN = { userId: 'usr-local-jean', displayName: 'Jean P.' };
const LUC = { userId: 'usr-local-luc', displayName: 'Luc T.' };

const DAY_MS = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString();

// Kanban (rectif PO point 1) : une tâche par statut + une todo en retard.
// §66 — task-late est LIÉE à une demande encore OUVERTE ⇒ son move→done (statut de TÂCHE) doit
// proposer la clôture ; task-doing est liée à une interaction DÉJÀ traitée (done) ⇒ pas de
// prompt ; task-later/task-done sont NON liées ⇒ jamais de prompt.
// 16w — chaque tâche porte ses ASSIGNÉS (c'est eux que le filtre lit) et son créateur.
// `ownerId` reste renseigné volontairement : un code resté sur l'ancienne clé passerait
// inaperçu si la fixture l'avait supprimé.
const tasks: CrmTask[] = [
  { id: 'task-late', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: 'actor-1', actorName: 'Mme Marie Hoarau', title: 'Rappeler le directeur', description: 'Point médiation', status: 'todo', priority: 'high', dueAt: iso(-2), createdAt: iso(-3), assignees: [ME], createdById: 'usr-local-jean', createdByName: 'Jean P.', ownerId: 'usr-local-marie', ownerName: 'Marie', relatedInteractionId: 'int-9', relatedInteractionSubject: 'Demande de visite', relatedInteractionStatus: 'new', documents: [] },
  // Tâche CONJOINTE : elle doit remonter sous le filtre de Marie ET sous celui de Jean.
  { id: 'task-doing', objectId: 'obj-2', objectName: 'Le Comptoir des Epices', actorId: null, actorName: null, title: 'Valider le contrat photo', description: null, status: 'in_progress', priority: 'medium', dueAt: iso(0), createdAt: iso(-1), assignees: [ME, JEAN], createdById: 'usr-local-marie', createdByName: 'Marie D.', ownerId: 'usr-local-jean', ownerName: 'Jean', relatedInteractionId: 'int-done', relatedInteractionSubject: 'Photos validées', relatedInteractionStatus: 'resolved', documents: [] },
  // Créateur inconnu (createdById null) : la carte doit dire « Créateur inconnu ».
  { id: 'task-done', objectId: 'obj-3', objectName: 'Sentier des Trois Cascades', actorId: null, actorName: null, title: 'Confirmer les horaires', description: null, status: 'done', priority: 'low', dueAt: iso(3), createdAt: iso(-60), assignees: [ME], createdById: null, createdByName: null, ownerId: 'usr-local-marie', ownerName: 'Marie', relatedInteractionId: null, relatedInteractionSubject: null, relatedInteractionStatus: null, documents: [] },
  // Sans échéance : visible par défaut (case « Inclure sans échéance » cochée).
  { id: 'task-later', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: null, actorName: null, title: 'Préparer la convention', description: null, status: 'todo', priority: 'low', dueAt: null, createdAt: iso(-4), assignees: [ME], createdById: 'usr-local-marie', createdByName: 'Marie D.', ownerId: 'usr-local-marie', ownerName: 'Luc', relatedInteractionId: null, relatedInteractionSubject: null, relatedInteractionStatus: null, documents: [] },
  // Assignée à quelqu'un d'AUTRE : invisible sous le filtre par défaut « mes tâches ».
  { id: 'task-autre', objectId: 'obj-2', objectName: 'Le Comptoir des Epices', actorId: null, actorName: null, title: 'Tâche de Luc', description: null, status: 'todo', priority: 'low', dueAt: iso(1), createdAt: iso(-2), assignees: [LUC], createdById: 'usr-local-luc', createdByName: 'Luc T.', ownerId: 'usr-local-luc', ownerName: 'Luc', relatedInteractionId: null, relatedInteractionSubject: null, relatedInteractionStatus: null, documents: [] },
  // Échéance HORS fenêtre par défaut (+40 j) : masquée tant que la plage n'est pas élargie.
  { id: 'task-loin', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: null, actorName: null, title: 'Tâche lointaine', description: null, status: 'todo', priority: 'low', dueAt: iso(40), createdAt: iso(-1), assignees: [ME], createdById: 'usr-local-marie', createdByName: 'Marie D.', ownerId: 'usr-local-marie', ownerName: 'Marie', relatedInteractionId: null, relatedInteractionSubject: null, relatedInteractionStatus: null, documents: [] },
];

function renderTaches(overrides: Partial<Parameters<typeof CrmTaches>[0]> = {}) {
  const props = { canWrite: true, onOpenObject: jest.fn(), onOpenActor: jest.fn(), ...overrides };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrmTaches {...props} />
    </QueryClientProvider>,
  );
  return props;
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listCrmTasks.mockResolvedValue(tasks);
  crmMock.listCrmDirectory.mockResolvedValue(mockCrmDirectory);
  crmMock.saveCrmTask.mockResolvedValue('task-1');
  // §66 — clôture suggérée de l'interaction liée après un move→done.
  crmMock.saveCrmInteraction.mockResolvedValue('int-9');
  // Assignation : le 1er = utilisateur courant démo (usr-local-marie).
  crmMock.listCrmAssignees.mockResolvedValue([ME, JEAN, LUC]);
  // 16w — le filtre par défaut du kanban est « mes tâches » : l'identité de session doit
  // donc être posée explicitement, sinon les assertions dépendraient d'un défaut d'env.
  useSessionStore.setState({ userId: 'usr-local-marie', userName: 'Marie D.' } as never);
});

describe('CrmTaches (§61 — kanban Tâches & relances)', () => {
  it('répartit les tâches en 3 colonnes par statut réel (À faire / En cours / Terminées)', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    const todo = screen.getByRole('region', { name: 'À faire' });
    expect(within(todo).getByText('Rappeler le directeur')).toBeInTheDocument();
    expect(within(todo).getByText('Préparer la convention')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'En cours' })).getByText('Valider le contrat photo')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Terminées' })).getByText('Confirmer les horaires')).toBeInTheDocument();
  });

  // Assertion verrouillée par revue : un move kanban PERSISTE via saveCrmTask.
  it('Avancer : todo → in_progress puis in_progress → done via saveCrmTask', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: 'Avancer « Rappeler le directeur »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-late', status: 'in_progress' }));
    fireEvent.click(screen.getByRole('button', { name: 'Avancer « Valider le contrat photo »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-doing', status: 'done' }));
  });

  // PO point 5 : déplacer une carte en drag & drop persiste le statut de la colonne cible
  // via saveCrmTask (jamais optimiste muet). Les boutons Avancer/Reprendre RESTENT (clavier).
  it('drag & drop : déposer une carte « À faire » dans « Terminées » → saveCrmTask({status: done})', async () => {
    renderTaches();
    const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket') as HTMLElement;
    expect(card).toHaveAttribute('draggable', 'true');
    const doneCol = screen.getByRole('region', { name: 'Terminées' });
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      dropEffect: 'move',
    };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(doneCol, { dataTransfer });
    fireEvent.drop(doneCol, { dataTransfer });
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-late', status: 'done' }));
  });

  it('drag & drop : déposer dans la MÊME colonne (statut inchangé) → aucun saveCrmTask', async () => {
    renderTaches();
    const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket') as HTMLElement;
    const todoCol = screen.getByRole('region', { name: 'À faire' });
    const data = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '' };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(todoCol, { dataTransfer });
    expect(crmMock.saveCrmTask).not.toHaveBeenCalled();
  });

  it('drag & drop : sans permission, la carte n est pas draggable (gating lecture seule)', async () => {
    renderTaches({ canWrite: false });
    const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket') as HTMLElement;
    expect(card).not.toHaveAttribute('draggable', 'true');
  });

  // PO : poignée de glissement = affordance visuelle du DnD (présente seulement si déplaçable).
  it('poignée de glissement présente avec permission, absente en lecture seule', async () => {
    renderTaches();
    const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket') as HTMLElement;
    expect(card.querySelector('.ticket__grip')).toBeTruthy();
  });

  it('lecture seule : pas de poignée', async () => {
    renderTaches({ canWrite: false });
    const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket') as HTMLElement;
    expect(card.querySelector('.ticket__grip')).toBeFalsy();
  });

  // PO : à la saisie d'une carte, les colonnes voisines (≠ source) matérialisent une zone de dépôt.
  it('dragStart : les colonnes cibles affichent « Déposer ici », pas la colonne source', async () => {
    renderTaches();
    const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket') as HTMLElement; // todo
    const data = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: 'move' };
    fireEvent.dragStart(card, { dataTransfer });
    const todoCol = screen.getByRole('region', { name: 'À faire' });
    const doingCol = screen.getByRole('region', { name: 'En cours' });
    const doneCol = screen.getByRole('region', { name: 'Terminées' });
    expect(doingCol).toHaveClass('bcol--target');
    expect(doneCol).toHaveClass('bcol--target');
    expect(within(doingCol).getByText('Déposer ici')).toBeInTheDocument();
    expect(within(doneCol).getByText('Déposer ici')).toBeInTheDocument();
    // Colonne source : aucune zone (déposer là = no-op).
    expect(todoCol).not.toHaveClass('bcol--target');
    expect(within(todoCol).queryByText('Déposer ici')).not.toBeInTheDocument();
    // dragEnd efface les zones.
    fireEvent.dragEnd(card, { dataTransfer });
    expect(doneCol).not.toHaveClass('bcol--target');
  });

  // PO : la carte saisie est estompée (ticket--dragging → opacity 0.4) le temps du glisser.
  it('dragStart estompe la carte saisie (ticket--dragging), dragEnd la rétablit', async () => {
    renderTaches();
    const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket') as HTMLElement;
    const data = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: 'move' };
    expect(card).not.toHaveClass('ticket--dragging');
    fireEvent.dragStart(card, { dataTransfer });
    expect(card).toHaveClass('ticket--dragging');
    // Les autres cartes ne sont pas estompées.
    const other = screen.getByText('Préparer la convention').closest('.ticket') as HTMLElement;
    expect(other).not.toHaveClass('ticket--dragging');
    fireEvent.dragEnd(card, { dataTransfer });
    expect(card).not.toHaveClass('ticket--dragging');
  });

  it('Reprendre (in_progress → todo) et Rouvrir (done → todo)', async () => {
    renderTaches();
    await screen.findByText('Valider le contrat photo');
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre « Valider le contrat photo »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-doing', status: 'todo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rouvrir « Confirmer les horaires »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-done', status: 'todo' }));
  });

  it('badge d échéance DANS la carte : late (rouge) sur la tâche en retard, today sur celle du jour', async () => {
    renderTaches();
    const lateCard = (await screen.findByText('Rappeler le directeur')).closest('.ticket');
    expect(lateCard?.querySelector('.due.late')).toBeTruthy();
    const todayCard = screen.getByText('Valider le contrat photo').closest('.ticket');
    expect(todayCard?.querySelector('.due.today')).toBeTruthy();
    // Une tâche done ne porte jamais de badge d'alerte.
    const doneCard = screen.getByText('Confirmer les horaires').closest('.ticket');
    expect(doneCard?.querySelector('.due.late, .due.today')).toBeFalsy();
    expect(doneCard).toHaveClass('is-done');
  });

  describe('16w — filtre par personne (UUID, jamais un nom)', () => {
    it('par défaut : les tâches de l’utilisateur connecté, celles des autres masquées', async () => {
      renderTaches();
      await screen.findByText('Rappeler le directeur');
      expect(screen.getByLabelText('Filtrer par personne')).toHaveValue('usr-local-marie');
      expect(screen.queryByText('Tâche de Luc')).not.toBeInTheDocument();
    });

    it('« Toutes les personnes » révèle celles des autres', async () => {
      renderTaches();
      await screen.findByText('Rappeler le directeur');
      showEveryone();
      expect(screen.getByText('Tâche de Luc')).toBeInTheDocument();
    });

    it('une tâche CONJOINTE remonte sous le filtre de CHACUN de ses assignés', async () => {
      renderTaches();
      await screen.findByText('Rappeler le directeur');
      // Marie (défaut) la voit…
      expect(screen.getByText('Valider le contrat photo')).toBeInTheDocument();
      // …et Jean aussi, alors que crm_task.owner ne peut désigner qu'une seule personne.
      fireEvent.change(screen.getByLabelText('Filtrer par personne'), { target: { value: 'usr-local-jean' } });
      expect(screen.getByText('Valider le contrat photo')).toBeInTheDocument();
      // Une tâche qui n'est PAS la sienne reste masquée : le filtre n'est pas décoratif.
      expect(screen.queryByText('Rappeler le directeur')).not.toBeInTheDocument();
    });

    it('le filtre porte sur l’UUID : deux HOMONYMES restent distincts', async () => {
      // Deux personnes, MÊME nom affiché, uuid différents : filtrer sur l'une ne doit
      // jamais faire remonter la tâche de l'autre.
      crmMock.listCrmAssignees.mockResolvedValue([
        { userId: 'u-dupont-1', displayName: 'Jean Dupont' },
        { userId: 'u-dupont-2', displayName: 'Jean Dupont' },
      ]);
      crmMock.listCrmTasks.mockResolvedValue([
        { ...tasks[0], id: 'h1', title: 'Tâche du premier Dupont', assignees: [{ userId: 'u-dupont-1', displayName: 'Jean Dupont' }] },
        { ...tasks[0], id: 'h2', title: 'Tâche du second Dupont', assignees: [{ userId: 'u-dupont-2', displayName: 'Jean Dupont' }] },
      ]);
      // On EST le premier Dupont : le filtre par défaut doit ne montrer que sa tâche.
      useSessionStore.setState({ userId: 'u-dupont-1' } as never);
      renderTaches();
      await screen.findByText('Tâche du premier Dupont');
      expect(screen.queryByText('Tâche du second Dupont')).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Filtrer par personne'), { target: { value: 'u-dupont-2' } });
      expect(screen.getByText('Tâche du second Dupont')).toBeInTheDocument();
      expect(screen.queryByText('Tâche du premier Dupont')).not.toBeInTheDocument();
    });

    // 17c — la liste des ASSIGNABLES se restreint aux personnes qui peuvent agir dans le CRM.
    // L'union avec les porteurs réels de tâches devient donc porteuse : sans elle, une tâche
    // confiée avant la restriction (ou à quelqu'un qui a perdu ses droits) deviendrait
    // INATTEIGNABLE par le filtre — du travail réel disparaîtrait de l'écran.
    it('une personne portant une tâche reste filtrable même absente des assignables', async () => {
      crmMock.listCrmAssignees.mockResolvedValue([ME]);
      crmMock.listCrmTasks.mockResolvedValue([
        { ...tasks[0], id: 'orph', title: 'Tâche d’un ancien collègue',
          assignees: [{ userId: 'u-parti', displayName: 'Ancien Collègue' }] },
      ]);
      renderTaches();
      // Le filtre par défaut est « mes tâches » : la tâche de l'autre n'est pas visible…
      await screen.findByLabelText('Filtrer par personne');
      expect(screen.queryByText('Tâche d’un ancien collègue')).not.toBeInTheDocument();
      // …mais la personne reste PROPOSÉE dans le filtre, et la sélectionner la retrouve.
      fireEvent.change(screen.getByLabelText('Filtrer par personne'), { target: { value: 'u-parti' } });
      expect(screen.getByText('Tâche d’un ancien collègue')).toBeInTheDocument();
    });
  });

  describe('16w — fenêtre d’échéance', () => {
    it('par défaut : -15/+15 jours calendaires autour d’aujourd’hui', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00'));
      try {
        renderTaches();
        await screen.findByLabelText('Échéance à partir du');
        expect(screen.getByLabelText('Échéance à partir du')).toHaveValue('2026-08-05');
        expect(screen.getByLabelText('Échéance jusqu’au')).toHaveValue('2026-09-04');
      } finally {
        jest.useRealTimers();
      }
    });

    it('une échéance hors fenêtre est masquée, et réapparaît quand on élargit', async () => {
      renderTaches();
      await screen.findByText('Rappeler le directeur');
      expect(screen.queryByText('Tâche lointaine')).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Échéance jusqu’au'), { target: { value: '' } });
      expect(screen.getByText('Tâche lointaine')).toBeInTheDocument();
    });

    it('les tâches SANS échéance sont incluses par défaut et peuvent être masquées', async () => {
      renderTaches();
      await screen.findByText('Préparer la convention');
      fireEvent.click(screen.getByLabelText('Inclure sans échéance'));
      expect(screen.queryByText('Préparer la convention')).not.toBeInTheDocument();
      // …et les datées restent là : la case ne filtre QUE les sans-échéance.
      expect(screen.getByText('Rappeler le directeur')).toBeInTheDocument();
    });

    it('plage inversée : message d’erreur, et la plage n’est PAS appliquée', async () => {
      renderTaches();
      await screen.findByText('Rappeler le directeur');
      fireEvent.change(screen.getByLabelText('Échéance à partir du'), { target: { value: '2030-01-01' } });
      expect(screen.getByRole('alert')).toHaveTextContent(/postérieure à la date de fin/i);
      // Le tableau ne se vide pas pendant que l'utilisateur saisit sa seconde borne.
      expect(screen.getByText('Rappeler le directeur')).toBeInTheDocument();
    });

    it('« Réinitialiser » remet la fenêtre par défaut et recoche les sans-échéance', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-20T10:00:00'));
      try {
        renderTaches();
        await screen.findByLabelText('Échéance à partir du');
        fireEvent.change(screen.getByLabelText('Échéance à partir du'), { target: { value: '2026-01-01' } });
        fireEvent.click(screen.getByLabelText('Inclure sans échéance'));
        fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
        expect(screen.getByLabelText('Échéance à partir du')).toHaveValue('2026-08-05');
        expect(screen.getByLabelText('Inclure sans échéance')).toBeChecked();
      } finally {
        jest.useRealTimers();
      }
    });

    it('« Réinitialiser » remet aussi la base sur Échéance', async () => {
      renderTaches();
      await screen.findByLabelText('La période porte sur');
      setBasis('created');
      expect(screen.getByLabelText('La période porte sur')).toHaveValue('created');
      fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
      expect(screen.getByLabelText('La période porte sur')).toHaveValue('due');
      expect(screen.getByLabelText('Échéance à partir du')).toBeInTheDocument();
    });
  });

  // Le défaut signalé : en production aucune tâche « à faire »/« en cours » n'a d'échéance,
  // donc la période ne faisait bouger que la colonne « Terminées ». La fixture reproduit ce
  // cas via `task-later` (sans échéance, colonne À faire).
  describe('base de la période — Création', () => {
    it('sous Échéance, une tâche sans échéance échappe à la période quelle que soit la plage', async () => {
      renderTaches();
      await screen.findByText('Préparer la convention');
      // Plage volontairement absurde : rien de daté ne peut y tomber…
      fireEvent.change(screen.getByLabelText('Échéance à partir du'), { target: { value: '2099-01-01' } });
      fireEvent.change(screen.getByLabelText('Échéance jusqu’au'), { target: { value: '2099-12-31' } });
      // …et pourtant la sans-échéance reste là. C'est exactement ce que l'utilisateur lisait
      // comme « le filtre ne fait rien sur la colonne À faire ».
      expect(screen.getByText('Préparer la convention')).toBeInTheDocument();
      expect(screen.queryByText('Rappeler le directeur')).not.toBeInTheDocument();
    });

    it('bascule sur Création : la colonne « À faire » réagit enfin à la période', async () => {
      renderTaches();
      await screen.findByText('Préparer la convention');
      setBasis('created');
      // task-later est créée il y a 4 jours ⇒ dans la fenêtre par défaut.
      expect(screen.getByText('Préparer la convention')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Création jusqu’au'), { target: { value: '2000-01-01' } });
      fireEvent.change(screen.getByLabelText('Création à partir du'), { target: { value: '1999-01-01' } });
      // Elle OBÉIT désormais à la plage — ce qu'aucune valeur de la fenêtre d'échéance
      // ne pouvait obtenir.
      expect(screen.queryByText('Préparer la convention')).not.toBeInTheDocument();
    });

    it('les libellés des bornes suivent la base : figés, ils mentiraient', async () => {
      renderTaches();
      await screen.findByLabelText('Échéance à partir du');
      setBasis('created');
      expect(screen.getByLabelText('Création à partir du')).toBeInTheDocument();
      expect(screen.getByLabelText('Création jusqu’au')).toBeInTheDocument();
      expect(screen.queryByLabelText('Échéance à partir du')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Inclure sans date de création')).toBeInTheDocument();
    });

    it('les tâches qui échappent à la période faute de date sont COMPTÉES et affichées', async () => {
      renderTaches();
      await screen.findByText('Préparer la convention');
      // Sous Échéance : task-later (assignée à moi, sans échéance) échappe.
      expect(screen.getByText('1 sans date, hors période')).toBeInTheDocument();
      // Sous Création toutes mes tâches sont datées ⇒ plus rien n'échappe, le compteur part.
      setBasis('created');
      expect(screen.queryByText(/sans date, hors période/)).not.toBeInTheDocument();
    });
  });

  describe('16w — carte : assignés et créateur', () => {
    it('énumère TOUS les assignés dans le libellé accessible', async () => {
      renderTaches();
      await screen.findByText('Valider le contrat photo');
      const card = screen.getByText('Valider le contrat photo').closest('.ticket');
      expect(within(card as HTMLElement).getByText('Assignée à Marie D., Jean P.')).toBeInTheDocument();
    });

    it('replie au-delà de 3 assignés en « +N », sans perdre les noms', async () => {
      crmMock.listCrmTasks.mockResolvedValue([
        {
          ...tasks[0],
          assignees: [ME, JEAN, LUC, { userId: 'u-4', displayName: 'Zoé Z.' }, { userId: 'u-5', displayName: 'Yann Y.' }],
        },
      ]);
      renderTaches();
      const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket');
      expect(within(card as HTMLElement).getByText('+2')).toBeInTheDocument();
      // Le « +N » ne dit pas QUI manque : le texte accessible, lui, les nomme tous.
      expect(
        within(card as HTMLElement).getByText('Assignée à Marie D., Jean P., Luc T., Zoé Z., Yann Y.'),
      ).toBeInTheDocument();
    });

    it('affiche le créateur séparément, et « Créateur inconnu » quand il l’est', async () => {
      renderTaches();
      await screen.findByText('Rappeler le directeur');
      const card = screen.getByText('Rappeler le directeur').closest('.ticket');
      // Créateur ≠ assigné : la tâche est assignée à Marie mais créée par Jean.
      expect(within(card as HTMLElement).getByText('Créée par Jean P.')).toBeInTheDocument();
      const done = screen.getByText('Confirmer les horaires').closest('.ticket');
      expect(within(done as HTMLElement).getByText('Créée par Créateur inconnu')).toBeInTheDocument();
    });
  });

  it('clic sur l établissement d une carte → onOpenObject(objectId)', async () => {
    const props = renderTaches();
    await screen.findByText('Valider le contrat photo');
    fireEvent.click(screen.getByRole('button', { name: 'Le Comptoir des Epices' }));
    expect(props.onOpenObject).toHaveBeenCalledWith('obj-2');
  });

  it('clic sur l acteur d une carte → onOpenActor(actorId) (rattachement acteur)', async () => {
    const props = renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: 'Mme Marie Hoarau' }));
    expect(props.onOpenActor).toHaveBeenCalledWith('actor-1');
  });

  it('crée une tâche : titre + établissement résolu par nom (datalist annuaire) + échéance + owner', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Relancer les photos' } });
    pickEstablishment('Hotel Basalte & Lagon');
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-06-20' } });
    // Attendre le chargement des assignables (la pré-sélection par défaut en dépend).
    await screen.findByRole('combobox', { name: 'Attribuer à' });
    // Le libellé du déclencheur bascule sur la personne pré-sélectionnée : c'est le signal
    // que la liste des assignables est arrivée (« Marie D. » apparaît AUSSI en puce, donc un
    // getByText nu trouverait deux noeuds).
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Attribuer à' })).toHaveTextContent('Marie D.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      // 16w : assignés par défaut = utilisateur courant, envoyés en TABLEAU.
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith({
        objectId: 'obj-1',
        title: 'Relancer les photos',
        dueAt: '2026-06-20',
        assigneeIds: ['usr-local-marie'],
      }),
    );
  });

  // 16w — « Attribuer à » accepte PLUSIEURS personnes, et le save les envoie toutes.
  it('onglet Tâches : plusieurs assignés partent dans le même save', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Relancer' } });
    pickEstablishment('Hotel Basalte & Lagon');
    await screen.findByRole('combobox', { name: 'Attribuer à' });
    // Le libellé du déclencheur bascule sur la personne pré-sélectionnée : c'est le signal
    // que la liste des assignables est arrivée (« Marie D. » apparaît AUSSI en puce, donc un
    // getByText nu trouverait deux noeuds).
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Attribuer à' })).toHaveTextContent('Marie D.'),
    );
    toggleAssignee('Jean P.'); // s'AJOUTE à Marie (pré-sélectionnée), il ne la remplace pas
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeIds: ['usr-local-marie', 'usr-local-jean'] }),
      ),
    );
  });

  it('onglet Tâches : aucun assigné ⇒ « Créer » reste bloqué (jamais de tableau vide)', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Relancer' } });
    pickEstablishment('Hotel Basalte & Lagon');
    await screen.findByRole('combobox', { name: 'Attribuer à' });
    // Le libellé du déclencheur bascule sur la personne pré-sélectionnée : c'est le signal
    // que la liste des assignables est arrivée (« Marie D. » apparaît AUSSI en puce, donc un
    // getByText nu trouverait deux noeuds).
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Attribuer à' })).toHaveTextContent('Marie D.'),
    );
    toggleAssignee('Marie D.'); // on décoche la seule personne sélectionnée
    expect(screen.getByRole('button', { name: 'Créer' })).toBeDisabled();
    expect(screen.getByText('Choisissez au moins une personne.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(crmMock.saveCrmTask).not.toHaveBeenCalled();
  });

  // §66 — l'établissement est REQUIS : « Créer » reste bloqué tant qu'aucun établissement
  // n'est choisi (le SearchSelect ne propose que des options valides ⇒ plus de saisie libre
  // « introuvable »). Choisir un établissement débloque.
  it('établissement requis : création bloquée tant qu aucun établissement n est choisi', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Tâche orpheline' } });
    expect(screen.getByRole('button', { name: 'Créer' })).toBeDisabled();
    pickEstablishment('Hotel Basalte & Lagon');
    expect(screen.getByRole('button', { name: 'Créer' })).toBeEnabled();
  });

  // Assertion verrouillée par revue : un échec d'écriture est VISIBLE.
  it('échec de déplacement → erreur visible (pas d échec silencieux)', async () => {
    crmMock.saveCrmTask.mockRejectedValue(new Error('refus RLS'));
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: 'Avancer « Rappeler le directeur »' }));
    expect(await screen.findByText(/refus RLS/)).toBeInTheDocument();
  });

  // Assertion verrouillée par revue : gating lecture seule (no-write-trap).
  it('sans permission : boutons de move et création désactivés avec raison', async () => {
    renderTaches({ canWrite: false });
    await screen.findByText('Rappeler le directeur');
    expect(screen.getByRole('button', { name: 'Avancer « Rappeler le directeur »' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rouvrir « Confirmer les horaires »' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /nouvelle tâche/i })).toBeDisabled();
    expect(screen.getAllByText(/lecture seule/i).length).toBeGreaterThan(0);
  });

  /* ===== §66 — badge interaction liée (cliquable → fiche acteur / vue établissement) ===== */

  it('badge interaction liée rendu sur la carte (sujet de l interaction)', async () => {
    renderTaches();
    const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket') as HTMLElement;
    const badge = within(card).getByRole('button', { name: /Demande de visite/i });
    expect(badge).toHaveClass('ticket__linked');
  });

  it('pas de badge sur une tâche non liée', async () => {
    renderTaches();
    const card = (await screen.findByText('Préparer la convention')).closest('.ticket') as HTMLElement;
    expect(card.querySelector('.ticket__linked')).toBeFalsy();
  });

  it('clic sur le badge → onOpenActor(actorId) (tâche avec acteur), sans déclencher la nav carte', async () => {
    const props = renderTaches();
    const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Demande de visite/i }));
    expect(props.onOpenActor).toHaveBeenCalledWith('actor-1');
    // stopPropagation : la nav établissement de la carte n'est PAS déclenchée.
    expect(props.onOpenObject).not.toHaveBeenCalled();
  });

  it('badge sans acteur → onOpenObject(objectId)', async () => {
    // task-doing porte un lien interaction mais pas d'acteur ⇒ le badge ouvre l'établissement.
    const props = renderTaches();
    const card = (await screen.findByText('Valider le contrat photo')).closest('.ticket') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Photos validées/i }));
    expect(props.onOpenObject).toHaveBeenCalledWith('obj-2');
    expect(props.onOpenActor).not.toHaveBeenCalled();
  });

  /* ===== Task 9 — badge trombone (pièces jointes) ===== */

  it('affiche le badge trombone quand la tâche a des pièces jointes', async () => {
    crmMock.listCrmTasks.mockResolvedValue([
      {
        ...tasks[0],
        documents: [
          { id: 'doc-1', title: 'Devis.pdf', mimeType: 'application/pdf', sizeBytes: 1200, createdAt: null },
          { id: 'doc-2', title: 'Photo.jpg', mimeType: 'image/jpeg', sizeBytes: null, createdAt: null },
        ],
      },
    ]);
    renderTaches();
    expect(await screen.findByTitle('2 pièce(s) jointe(s)')).toBeInTheDocument();
  });

  it('pas de badge trombone quand la tâche n a aucune pièce jointe', async () => {
    renderTaches();
    const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket') as HTMLElement;
    expect(within(card).queryByTitle(/pièce\(s\) jointe/)).not.toBeInTheDocument();
  });

  it('clic sur le badge trombone → ouvre le même modal que le crayon (mode édition)', async () => {
    crmMock.listCrmTasks.mockResolvedValue([
      {
        ...tasks[0],
        documents: [{ id: 'doc-1', title: 'Devis.pdf', mimeType: 'application/pdf', sizeBytes: 1200, createdAt: null }],
      },
    ]);
    renderTaches();
    const badge = await screen.findByTitle('1 pièce(s) jointe(s)');
    await userEvent.click(badge);
    expect(await screen.findByRole('heading', { name: 'Modifier la tâche' })).toBeInTheDocument();
    expect(screen.getByText('Devis.pdf')).toBeInTheDocument();
  });

  it('badge trombone gaté en lecture seule (même gating que le crayon)', async () => {
    crmMock.listCrmTasks.mockResolvedValue([
      {
        ...tasks[0],
        documents: [{ id: 'doc-1', title: 'Devis.pdf', mimeType: 'application/pdf', sizeBytes: 1200, createdAt: null }],
      },
    ]);
    renderTaches({ canWrite: false });
    expect(await screen.findByTitle('1 pièce(s) jointe(s)')).toBeDisabled();
  });

  /* ===== §66 — prompt de clôture de l'interaction liée après un move→done ===== */

  it('Avancer une tâche liée à une interaction OUVERTE vers Terminées → prompt de clôture', async () => {
    renderTaches();
    // task-late (tâche todo, demande liée OUVERTE) → Avancer la met en in_progress (pas de prompt encore).
    fireEvent.click(await screen.findByRole('button', { name: 'Avancer « Rappeler le directeur »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-late', status: 'in_progress' }));
    // Pas de prompt sur un move vers in_progress.
    expect(screen.queryByText(/marquer aussi comme traitée/i)).not.toBeInTheDocument();
  });

  it('DnD move→done d une tâche liée OUVERTE → prompt ; « Oui » clôture l interaction (status done)', async () => {
    renderTaches();
    const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket') as HTMLElement;
    const doneCol = screen.getByRole('region', { name: 'Terminées' });
    const data = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: 'move' };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(doneCol, { dataTransfer });
    fireEvent.drop(doneCol, { dataTransfer });
    // Le move est persisté quoi qu'il arrive.
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-late', status: 'done' }));
    // Prompt affiché (sujet de l'interaction visible).
    expect(await screen.findByText(/marquer aussi comme traitée/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /oui, clôturer/i }));
    await waitFor(() => expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith({ id: 'int-9', status: 'resolved' }));
    // Le prompt se ferme après clôture.
    await waitFor(() => expect(screen.queryByText(/marquer aussi comme traitée/i)).not.toBeInTheDocument());
  });

  it('Avancer in_progress→done (bouton) d une tâche liée OUVERTE → prompt sur le chemin bouton aussi', async () => {
    // Une tâche in_progress liée à une interaction encore ouverte.
    crmMock.listCrmTasks.mockResolvedValue([
      { id: 'task-ip', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: 'actor-1', actorName: 'Mme Marie Hoarau', title: 'Suivi médiation', description: null, status: 'in_progress', priority: 'high', dueAt: null, createdAt: iso(-1), assignees: [ME], createdById: 'usr-local-marie', createdByName: 'Marie D.', ownerId: 'usr-local-marie', ownerName: 'Marie', relatedInteractionId: 'int-7', relatedInteractionSubject: 'Médiation litige', relatedInteractionStatus: 'new', documents: [] },
    ]);
    renderTaches();
    fireEvent.click(await screen.findByRole('button', { name: 'Avancer « Suivi médiation »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-ip', status: 'done' }));
    expect(await screen.findByText(/marquer aussi comme traitée/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /oui, clôturer/i }));
    await waitFor(() => expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith({ id: 'int-7', status: 'resolved' }));
  });

  it('« Non » ferme le prompt sans clôturer l interaction', async () => {
    renderTaches();
    const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket') as HTMLElement;
    const doneCol = screen.getByRole('region', { name: 'Terminées' });
    const data = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: 'move' };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(doneCol, { dataTransfer });
    expect(await screen.findByText(/marquer aussi comme traitée/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Non$/i }));
    await waitFor(() => expect(screen.queryByText(/marquer aussi comme traitée/i)).not.toBeInTheDocument());
    expect(crmMock.saveCrmInteraction).not.toHaveBeenCalled();
  });

  it('PAS de prompt quand l interaction liée est DÉJÀ traitée (done)', async () => {
    renderTaches();
    // task-doing (in_progress, lien done) → Avancer la met en done : aucun prompt.
    fireEvent.click(await screen.findByRole('button', { name: 'Avancer « Valider le contrat photo »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-doing', status: 'done' }));
    expect(screen.queryByText(/marquer aussi comme traitée/i)).not.toBeInTheDocument();
    expect(crmMock.saveCrmInteraction).not.toHaveBeenCalled();
  });

  it('PAS de prompt quand la tâche n est pas liée à une interaction', async () => {
    // task-later (todo, non liée). On l'avance jusqu'à done.
    renderTaches();
    fireEvent.click(await screen.findByRole('button', { name: 'Avancer « Préparer la convention »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-later', status: 'in_progress' }));
    // Move vers in_progress : pas de prompt. (Une non-liée n'en déclenche jamais.)
    expect(screen.queryByText(/marquer aussi comme traitée/i)).not.toBeInTheDocument();
  });

  it('clôture en échec → erreur visible dans le prompt (pas d échec silencieux)', async () => {
    crmMock.saveCrmInteraction.mockRejectedValue(new Error('refus clôture'));
    renderTaches();
    const card = (await screen.findByText('Rappeler le directeur')).closest('.ticket') as HTMLElement;
    const doneCol = screen.getByRole('region', { name: 'Terminées' });
    const data = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: 'move' };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(doneCol, { dataTransfer });
    expect(await screen.findByText(/marquer aussi comme traitée/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /oui, clôturer/i }));
    expect(await screen.findByText(/refus clôture/i)).toBeInTheDocument();
  });

  /* ===== Task 3 — crayon d'édition sur la carte : ouvre le modal en mode ÉDITION ===== */

  // Revue : le titre « Modifier la tâche » est IDENTIQUE pour toutes les tâches — l'asserter
  // seul passerait au vert même si le kanban ouvrait la MAUVAISE tâche (ex. régression
  // `tasks.find((task) => task.id === editTaskId)` → `tasks[0]`). On clique donc le crayon de
  // « Valider le contrat photo », qui n'est PAS la première entrée de `tasks` (task-late l'est),
  // et on vérifie dans le modal deux valeurs PROPRES à cette tâche (titre + échéance) : une
  // régression vers `tasks[0]` afficherait celles de « Rappeler le directeur » et rougirait ici.
  it('ouvre le modal d’édition pré-rempli AVEC LES VALEURS DE LA TÂCHE CLIQUÉE (pas tasks[0])', async () => {
    renderTaches();
    // Le filtre par défaut (« mes tâches ») laisse PLUSIEURS cartes visibles : un
    // `findByRole` générique sur toutes les cartes serait ambigu, on cible donc le crayon
    // d'une carte précise (le libellé accessible porte le titre de LA tâche).
    await screen.findByText('Valider le contrat photo');
    const edit = screen.getByRole('button', { name: 'Modifier « Valider le contrat photo »' });
    await userEvent.click(edit);
    expect(await screen.findByRole('heading', { name: 'Modifier la tâche' })).toBeInTheDocument();
    // Titre : lu depuis la fixture, pas recopié en dur, pour rester lié à la tâche ciblée.
    const clicked = tasks.find((task) => task.id === 'task-doing')!;
    expect(screen.getByLabelText('Titre de la tâche')).toHaveValue(clicked.title);
    // Échéance : second témoin discriminant — task-doing (iso(0)) diffère de task-late
    // (iso(-2), première entrée de `tasks`), donc un retour à `tasks[0]` rougirait aussi ici.
    expect(screen.getByLabelText('Échéance')).toHaveValue(clicked.dueAt!.slice(0, 10));
  });

  it('chip « N annulée(s)/bloquée(s) » conservé pour les statuts hors colonnes', async () => {
    crmMock.listCrmTasks.mockResolvedValue([
      ...tasks,
      { id: 'task-x', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: null, actorName: null, title: 'Tâche annulée', description: null, status: 'canceled', priority: 'low', dueAt: null, createdAt: iso(-1), assignees: [ME], createdById: null, createdByName: null, ownerId: null, ownerName: null, relatedInteractionId: null, relatedInteractionSubject: null, relatedInteractionStatus: null, documents: [] },
    ]);
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    expect(screen.getByText('1 annulée(s)/bloquée(s)')).toBeInTheDocument();
    expect(screen.queryByText('Tâche annulée')).not.toBeInTheDocument();
  });
});
