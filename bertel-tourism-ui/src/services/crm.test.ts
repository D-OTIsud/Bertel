import {
  listActorCrm,
  listCrmDirectory,
  listDemandTopics,
  parseActorCrmSnapshot,
  parseCrmDirectoryEntry,
  parseCrmInteraction,
  parseCrmTask,
  parseCrmTimelinePage,
  parseObjectCrmSnapshot,
} from './crm';
import { mockCrmDirectory } from '../data/mock';
import { useSessionStore } from '../store/session-store';

describe('crm parsers', () => {
  it('parse une tâche RPC en CrmTask (snake_case → camelCase, enums DB)', () => {
    const task = parseCrmTask({
      id: 't1', object_id: 'HOT123', object_name: 'Hôtel Test', title: 'Rappeler',
      description: null, status: 'in_progress', priority: 'urgent',
      due_at: '2026-06-12T09:00:00Z', owner_name: 'Marie', related_interaction_subject: null,
    });
    expect(task).toEqual({
      id: 't1', objectId: 'HOT123', objectName: 'Hôtel Test', title: 'Rappeler',
      description: null, status: 'in_progress', priority: 'urgent',
      dueAt: '2026-06-12T09:00:00Z', ownerName: 'Marie', relatedInteractionSubject: null,
    });
  });

  it('borne un status inconnu sur todo (défense contre la dérive d enum)', () => {
    const task = parseCrmTask({ id: 't1', object_id: 'o', object_name: 'O', title: 'x', status: 'doing' });
    expect(task.status).toBe('todo');
  });

  it('parse une page timeline { items, has_more }', () => {
    const page = parseCrmTimelinePage({
      items: [{ id: 'i1', object_id: 'o1', object_name: 'Obj', interaction_type: 'note',
        direction: 'internal', status: 'done', subject: 'Note interne', body: 'corps',
        occurred_at: '2026-01-01T00:00:00Z', actor_name: 'A', topic_code: 'boutique',
        topic_name: 'Boutique', sentiment_code: 'positif', sentiment_name: 'Positif',
        owner_name: null, source: 'import_berta2_crm' }],
      has_more: true,
    });
    expect(page.hasMore).toBe(true);
    expect(page.items[0]).toMatchObject({ id: 'i1', objectId: 'o1', topicName: 'Boutique', sentimentCode: 'positif' });
  });

  it('rend une page vide sur payload nul/malformé', () => {
    expect(parseCrmTimelinePage(null)).toEqual({ items: [], hasMore: false });
  });

  // §19 — snapshot objet (list_object_crm) : la forme workspace consommée par
  // l'enrichissement object-workspace ET le refresh post-save de SectionCrm.
  it('parse le payload list_object_crm en snapshot workspace (interactions + topics)', () => {
    const snapshot = parseObjectCrmSnapshot({
      interactions: [{
        id: 'i1', interaction_type: 'call', direction: 'outbound', status: 'done',
        subject: 'Demande de visite', body: 'RDV fixé au 12.',
        occurred_at: '2026-06-01T08:00:00Z', created_at: '2026-06-01T08:05:00Z',
        actor_name: 'M. Payet', topic_code: 'demande_de_visite', topic_name: 'Demande de visite',
        sentiment_code: 'positif', sentiment_name: 'Positif', owner_name: 'Marie', source: 'bertel_ui',
      }],
      tasks: [{ id: 't1', title: 'Rappeler', status: 'todo', priority: 'medium', due_at: null }],
      topics: [{ code: 'demande_de_visite', name: 'Demande de visite', count: 2 }],
    });
    expect(snapshot.interactions).toHaveLength(1);
    expect(snapshot.interactions[0]).toEqual({
      id: 'i1', interactionType: 'call', subject: 'Demande de visite', body: 'RDV fixé au 12.',
      occurredAt: '2026-06-01T08:00:00Z', actorName: 'M. Payet',
      topicCode: 'demande_de_visite', topicName: 'Demande de visite',
      sentimentCode: 'positif', sentimentName: 'Positif', ownerName: 'Marie', source: 'bertel_ui',
    });
    expect(snapshot.topics).toEqual([{ code: 'demande_de_visite', name: 'Demande de visite', count: 2 }]);
  });

  // §61 — la vue établissement consomme les legs actors + tasks du même RPC.
  it('parse les acteurs liés et les tâches du payload list_object_crm', () => {
    const snapshot = parseObjectCrmSnapshot({
      interactions: [],
      topics: [],
      actors: [{
        actor_id: 'a1', display_name: 'Mme Jocelyne Lebon',
        role_code: 'operator', role_name: 'Exploitant', is_primary: true,
      }],
      tasks: [{ id: 't1', title: 'Rappeler', status: 'todo', priority: 'medium', due_at: '2026-06-15T00:00:00Z' }],
    });
    expect(snapshot.actors).toEqual([{
      actorId: 'a1', displayName: 'Mme Jocelyne Lebon',
      roleCode: 'operator', roleName: 'Exploitant', isPrimary: true,
    }]);
    expect(snapshot.tasks).toEqual([{
      id: 't1', title: 'Rappeler', status: 'todo', priority: 'medium', dueAt: '2026-06-15T00:00:00Z',
    }]);
  });

  it('rend un snapshot vide sur payload nul/malformé', () => {
    expect(parseObjectCrmSnapshot(null)).toEqual({ interactions: [], topics: [], actors: [], tasks: [] });
    expect(parseObjectCrmSnapshot({ interactions: 'oops', topics: 42 })).toEqual({ interactions: [], topics: [], actors: [], tasks: [] });
  });
});

// §61 — annuaire ACTEURS (api.list_crm_directory) : l'entité CRM principale.
describe('parseCrmDirectoryEntry', () => {
  it('parse une entrée annuaire (objets liés, compteurs, dernière interaction, top sujets)', () => {
    const entry = parseCrmDirectoryEntry({
      actor_id: 'a1', display_name: 'Mme Jocelyne Lebon',
      objects: [{ object_id: 'HLORUN00000000QB', object_name: 'Les Palmistes', object_type: 'HLO', role_name: 'Exploitant', is_primary: false }],
      object_count: 1, interaction_count: 10, interactions_12m: 2,
      last_interaction_at: '2026-04-16T00:00:00+00:00', last_interaction_type: 'note',
      last_interaction_subject: 'Note interne', last_interaction_object_name: 'Les Palmistes',
      top_topics: ['Accompagnement Taxe de séjour', 'Fermeture provisoire'],
    });
    expect(entry).toEqual({
      actorId: 'a1', displayName: 'Mme Jocelyne Lebon',
      objects: [{ objectId: 'HLORUN00000000QB', objectName: 'Les Palmistes', objectType: 'HLO', roleName: 'Exploitant', isPrimary: false }],
      objectCount: 1, interactionCount: 10, interactions12m: 2,
      lastInteractionAt: '2026-04-16T00:00:00+00:00', lastInteractionType: 'note',
      lastInteractionSubject: 'Note interne', lastInteractionObjectName: 'Les Palmistes',
      topTopics: ['Accompagnement Taxe de séjour', 'Fermeture provisoire'],
    });
  });

  it('borne les champs absents/malformés (objects/top_topics non-tableaux → [])', () => {
    const entry = parseCrmDirectoryEntry({ actor_id: 'a1', display_name: 'X', objects: 'oops', top_topics: null });
    expect(entry.objects).toEqual([]);
    expect(entry.topTopics).toEqual([]);
    expect(entry.objectCount).toBe(0);
    expect(entry.lastInteractionAt).toBeNull();
  });
});

// §61 — fiche acteur 360° (api.list_actor_crm) : interactions à contexte objet OPTIONNEL.
describe('parseActorCrmSnapshot', () => {
  it('parse acteur + objets (role_code) + interactions (objectId nullable) + topics', () => {
    const snapshot = parseActorCrmSnapshot({
      actor: { id: 'a1', display_name: 'Mme Jocelyne Lebon', first_name: 'Jocelyne', last_name: 'Lebon' },
      objects: [{ object_id: 'HLORUN00000000QB', object_name: 'Les Palmistes', object_type: 'HLO', role_code: 'operator', role_name: 'Exploitant', is_primary: true }],
      interactions: [
        { id: 'i1', interaction_type: 'note', direction: 'internal', status: 'planned',
          subject: 'Note interne', body: 'corps', occurred_at: '2026-04-16T00:00:00+00:00',
          created_at: '2026-05-01T09:24:21Z', object_id: 'HLORUN00000000QB', object_name: 'Les Palmistes',
          topic_code: 'accompagnement_taxe_sejour', topic_name: 'Accompagnement Taxe de séjour',
          sentiment_code: 'interrogatif', sentiment_name: 'Interrogatif', owner_name: null, source: 'import_berta2_crm' },
        { id: 'i2', interaction_type: 'call', direction: 'outbound', status: 'done',
          subject: 'Vœux annuels', body: null, occurred_at: '2026-01-08T00:00:00+00:00',
          object_id: null, object_name: null, topic_code: null, topic_name: null,
          sentiment_code: null, sentiment_name: null, owner_name: 'Florence', source: 'bertel_ui' },
      ],
      topics: [{ code: 'accompagnement_taxe_sejour', name: 'Accompagnement Taxe de séjour', count: 2 }],
    });
    expect(snapshot.actor).toEqual({ id: 'a1', displayName: 'Mme Jocelyne Lebon', firstName: 'Jocelyne', lastName: 'Lebon' });
    expect(snapshot.objects).toEqual([{
      objectId: 'HLORUN00000000QB', objectName: 'Les Palmistes', objectType: 'HLO',
      roleCode: 'operator', roleName: 'Exploitant', isPrimary: true,
    }]);
    // Contexte objet optionnel : l'interaction « générale » garde objectId/objectName null.
    expect(snapshot.interactions[0]).toMatchObject({ id: 'i1', objectId: 'HLORUN00000000QB', objectName: 'Les Palmistes' });
    expect(snapshot.interactions[1]).toMatchObject({ id: 'i2', objectId: null, objectName: null, ownerName: 'Florence' });
    expect(snapshot.topics).toEqual([{ code: 'accompagnement_taxe_sejour', name: 'Accompagnement Taxe de séjour', count: 2 }]);
  });

  it('rend un snapshot vide sur payload nul/malformé', () => {
    expect(parseActorCrmSnapshot(null)).toEqual({
      actor: { id: '', displayName: '', firstName: null, lastName: null },
      objects: [], interactions: [], topics: [],
    });
  });
});

describe('parseCrmInteraction — contexte objet nullable (§61)', () => {
  it('une interaction sans objet (générale) garde objectId/objectName null', () => {
    const interaction = parseCrmInteraction({
      id: 'i1', object_id: null, object_name: null, interaction_type: 'call',
      direction: 'outbound', status: 'done', subject: 'Vœux', body: null,
      occurred_at: '2026-01-08T00:00:00Z',
    });
    expect(interaction.objectId).toBeNull();
    expect(interaction.objectName).toBeNull();
  });
});

describe('listCrmDirectory / listActorCrm — chemins démo', () => {
  const initialDemoMode = useSessionStore.getState().demoMode;

  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
  });

  it('mode démo : listCrmDirectory renvoie les 3 acteurs mock', async () => {
    useSessionStore.setState({ demoMode: true });
    await expect(listCrmDirectory()).resolves.toEqual(mockCrmDirectory);
    expect(mockCrmDirectory).toHaveLength(3);
  });

  it('mode démo : listActorCrm renvoie un snapshot cohérent avec l annuaire mock', async () => {
    useSessionStore.setState({ demoMode: true });
    const snapshot = await listActorCrm(mockCrmDirectory[0].actorId);
    expect(snapshot.actor.id).toBe(mockCrmDirectory[0].actorId);
    expect(snapshot.actor.displayName).toBe(mockCrmDirectory[0].displayName);
    expect(snapshot.objects.map((o) => o.objectId)).toEqual(mockCrmDirectory[0].objects.map((o) => o.objectId));
  });
});

// Vocabulaire complet demand_topic (fix cold-start §19) — lecture PostgREST directe de
// ref_code (pub_ref_code_read), PAS une table crm_* : le pattern maison des vocabulaires ref.
describe('listDemandTopics', () => {
  const initialDemoMode = useSessionStore.getState().demoMode;

  afterEach(() => {
    useSessionStore.setState({ demoMode: initialDemoMode });
  });

  it('mode démo : renvoie le vocabulaire mock sans appel réseau', async () => {
    useSessionStore.setState({ demoMode: true });
    await expect(listDemandTopics()).resolves.toEqual([
      { code: 'demande_de_visite', name: 'Demande de visite' },
      { code: 'modification_infos_bdd', name: 'Modification infos BDD' },
    ]);
  });

  it('hors démo sans client Supabase configuré : renvoie [] (le select retombe sur la distribution objet)', async () => {
    useSessionStore.setState({ demoMode: false });
    await expect(listDemandTopics()).resolves.toEqual([]);
  });
});
