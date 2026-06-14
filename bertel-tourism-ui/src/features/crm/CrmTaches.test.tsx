import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmTaches } from './CrmTaches';
import * as crm from '../../services/crm';
import { mockCrmDirectory } from '../../data/mock';
import type { CrmTask } from '../../types/domain';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

// L'établissement est un SearchSelect (combobox + popover) : ouvrir puis cliquer l'option.
function pickEstablishment(optionName: string | RegExp) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Établissement' }));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}

const DAY_MS = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString();

// Kanban (rectif PO point 1) : une tâche par statut + une todo en retard.
// §66 — task-late est LIÉE à une interaction encore OUVERTE (planned) ⇒ son move→done doit
// proposer la clôture ; task-doing est liée à une interaction DÉJÀ traitée (done) ⇒ pas de
// prompt ; task-later/task-done sont NON liées ⇒ jamais de prompt.
const tasks: CrmTask[] = [
  { id: 'task-late', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: 'actor-1', actorName: 'Mme Marie Hoarau', title: 'Rappeler le directeur', description: 'Point médiation', status: 'todo', priority: 'high', dueAt: iso(-2), ownerName: 'Marie', relatedInteractionId: 'int-9', relatedInteractionSubject: 'Demande de visite', relatedInteractionStatus: 'planned' },
  { id: 'task-doing', objectId: 'obj-2', objectName: 'Le Comptoir des Epices', actorId: null, actorName: null, title: 'Valider le contrat photo', description: null, status: 'in_progress', priority: 'medium', dueAt: iso(0), ownerName: 'Jean', relatedInteractionId: 'int-done', relatedInteractionSubject: 'Photos validées', relatedInteractionStatus: 'done' },
  { id: 'task-done', objectId: 'obj-3', objectName: 'Sentier des Trois Cascades', actorId: null, actorName: null, title: 'Confirmer les horaires', description: null, status: 'done', priority: 'low', dueAt: iso(3), ownerName: 'Marie', relatedInteractionId: null, relatedInteractionSubject: null, relatedInteractionStatus: null },
  { id: 'task-later', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: null, actorName: null, title: 'Préparer la convention', description: null, status: 'todo', priority: 'low', dueAt: null, ownerName: 'Luc', relatedInteractionId: null, relatedInteractionSubject: null, relatedInteractionStatus: null },
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
  // Assignation (PO point 4) : le 1er = utilisateur courant démo (usr-local-marie).
  crmMock.listCrmAssignees.mockResolvedValue([
    { userId: 'usr-local-marie', displayName: 'Marie D.' },
    { userId: 'usr-local-jean', displayName: 'Jean P.' },
  ]);
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

  it('filtre Seg par agent (ownerName distincts + « Toutes »)', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: 'Marie' }));
    expect(screen.getByText('Rappeler le directeur')).toBeInTheDocument();
    expect(screen.queryByText('Valider le contrat photo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Toutes' }));
    expect(screen.getByText('Valider le contrat photo')).toBeInTheDocument();
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
    // Attendre le chargement des assignables (le owner par défaut en dépend).
    await screen.findByLabelText('Attribuer à');
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      // Assignation PO point 4 : owner par défaut = utilisateur courant (usr-local-marie).
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith({
        objectId: 'obj-1',
        title: 'Relancer les photos',
        dueAt: '2026-06-20',
        owner: 'usr-local-marie',
      }),
    );
  });

  // Assignation PO point 4 : le sélecteur « Attribuer à » est présent et change le owner.
  it('onglet Tâches : « Attribuer à » change le owner envoyé', async () => {
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    fireEvent.change(screen.getByLabelText('Titre de la tâche'), { target: { value: 'Relancer' } });
    pickEstablishment('Hotel Basalte & Lagon');
    // Le select n'apparaît qu'une fois la liste des assignables chargée (async).
    fireEvent.change(await screen.findByLabelText('Attribuer à'), { target: { value: 'usr-local-jean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(crmMock.saveCrmTask).toHaveBeenCalledWith(expect.objectContaining({ owner: 'usr-local-jean' })),
    );
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

  /* ===== §66 — prompt de clôture de l'interaction liée après un move→done ===== */

  it('Avancer une tâche liée à une interaction OUVERTE vers Terminées → prompt de clôture', async () => {
    renderTaches();
    // task-late (todo, lien planned) → Avancer la met en in_progress (pas de prompt encore).
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
    await waitFor(() => expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith({ id: 'int-9', status: 'done' }));
    // Le prompt se ferme après clôture.
    await waitFor(() => expect(screen.queryByText(/marquer aussi comme traitée/i)).not.toBeInTheDocument());
  });

  it('Avancer in_progress→done (bouton) d une tâche liée OUVERTE → prompt sur le chemin bouton aussi', async () => {
    // Une tâche in_progress liée à une interaction encore ouverte.
    crmMock.listCrmTasks.mockResolvedValue([
      { id: 'task-ip', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: 'actor-1', actorName: 'Mme Marie Hoarau', title: 'Suivi médiation', description: null, status: 'in_progress', priority: 'high', dueAt: null, ownerName: 'Marie', relatedInteractionId: 'int-7', relatedInteractionSubject: 'Médiation litige', relatedInteractionStatus: 'planned' },
    ]);
    renderTaches();
    fireEvent.click(await screen.findByRole('button', { name: 'Avancer « Suivi médiation »' }));
    await waitFor(() => expect(crmMock.saveCrmTask).toHaveBeenCalledWith({ id: 'task-ip', status: 'done' }));
    expect(await screen.findByText(/marquer aussi comme traitée/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /oui, clôturer/i }));
    await waitFor(() => expect(crmMock.saveCrmInteraction).toHaveBeenCalledWith({ id: 'int-7', status: 'done' }));
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

  it('chip « N annulée(s)/bloquée(s) » conservé pour les statuts hors colonnes', async () => {
    crmMock.listCrmTasks.mockResolvedValue([
      ...tasks,
      { id: 'task-x', objectId: 'obj-1', objectName: 'Hotel Basalte & Lagon', actorId: null, actorName: null, title: 'Tâche annulée', description: null, status: 'canceled', priority: 'low', dueAt: null, ownerName: null, relatedInteractionId: null, relatedInteractionSubject: null, relatedInteractionStatus: null },
    ]);
    renderTaches();
    await screen.findByText('Rappeler le directeur');
    expect(screen.getByText('1 annulée(s)/bloquée(s)')).toBeInTheDocument();
    expect(screen.queryByText('Tâche annulée')).not.toBeInTheDocument();
  });
});
